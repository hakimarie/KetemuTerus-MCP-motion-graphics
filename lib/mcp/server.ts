import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { KETEMUTERUS_BRAND } from "@/lib/brand";
import { createProject, getProject, listProjects, updateProject, createShots, listShots, updateShot } from "@/lib/projects";
import { getInteraction, getFileInfo, extractVideoOutput, downloadGeminiFile, startVideoInteraction } from "@/lib/gemini/omni";
import { getSupabase, VIDEO_BUCKET } from "@/lib/supabase";

function result(value: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }] };
}
function splitDuration(total: number): number[] {
  const count = Math.ceil(total / 10), base = Math.floor(total / count), remainder = total % count;
  return Array.from({ length: count }, (_, i) => base + (i < remainder ? 1 : 0));
}
function shotPrompt(brief: any, index: number, count: number, duration: number): string {
  const position = index === 0 ? "opening hook" : index === count - 1 ? "closing visual payoff and CTA" : "story beat " + (index + 1) + " of " + count;
  return [
    "Create shot " + (index + 1) + " of " + count + " for a continuous " + brief.aspectRatio + " social video. Duration exactly " + duration + " seconds.",
    "This is the " + position + ". Topic: " + brief.title + ". Objective: " + brief.objective + ".",
    brief.prompt,
    "Creative direction: " + (brief.tone || "cinematic premium motion graphics, coherent visual storytelling") + ".",
    "Maintain consistent characters, objects, lighting, visual language and color grade across shots. Avoid unnecessary title cards.",
    "KetemuTerus palette: blue #2563EB, midnight navy #0F172A, slate #94A3B8, ice #EFF6FF. Audio mood: " + (brief.musicMood || "subtle cinematic instrumental") + ". Avoid dialogue and baked-in narration.",
    index === count - 1 ? "End frame leaves clean space for KetemuTerus and exact tagline: \"" + KETEMUTERUS_BRAND.tagline + "\". Website: ketemuterus.biz.id." : "Do not display a logo or tagline in this shot.",
    "No fabricated phone numbers, addresses, statistics or claims. No subtitles or garbled text. Output a clean standalone clip for hard-cut editing."
  ].join("\n\n");
}
async function storeGeminiOutput(interaction: any, projectId: string, shotIndex: number): Promise<string> {
  const output = extractVideoOutput(interaction);
  let bytes: Buffer;
  if (output.data) bytes = Buffer.from(output.data, "base64");
  else if (output.uri) {
    const match = output.uri.match(/files\/([^/:?]+)/);
    if (!match) throw new Error("Gemini returned an unrecognized file URI.");
    const file = await getFileInfo("files/" + match[1]);
    if (file.state === "FAILED") throw new Error("Gemini video file processing failed.");
    if (file.state !== "ACTIVE") throw new Error("Gemini output file is not active yet.");
    bytes = await downloadGeminiFile("files/" + match[1]);
  } else throw new Error("Gemini completed without video output.");
  if (bytes.length < 50000) throw new Error("Generated clip payload is unexpectedly small.");
  const path = "projects/" + projectId + "/shots/shot-" + String(shotIndex + 1).padStart(2, "0") + ".mp4";
  const { error } = await getSupabase().storage.from(VIDEO_BUCKET).upload(path, bytes, { contentType: "video/mp4", upsert: true });
  if (error) throw new Error("Clip upload failed: " + error.message);
  return path;
}
export function buildServer() {
  const server = new McpServer(
    { name: "ketemuterus-motion-studio", version: "0.2.0" },
    { capabilities: { tools: {} }, instructions: "Create 15, 30, 45 or 60 second videos as multiple Gemini clips (up to 10 seconds each), then stitch with the separately deployed FFmpeg render worker. Workflow: create_motion_brief -> generate_motion_video -> check_video_status -> get_video_result. Default 9:16 portrait." }
  );
  server.tool("create_motion_brief", "Create a video brief. Final videos can be 15, 30, 45 or 60 seconds; the system splits the brief into short shots.", {
    title: z.string().min(3).max(120), objective: z.string().min(3).max(300), prompt: z.string().min(10).max(5000),
    targetDurationSec: z.union([z.literal(15), z.literal(30), z.literal(45), z.literal(60)]).default(30),
    aspectRatio: z.enum(["9:16", "16:9"]).default("9:16"), resolution: z.enum(["720p", "1080p"]).default("1080p"),
    tone: z.string().max(300).optional(), musicMood: z.string().max(300).optional()
  }, async (args) => {
    const project = await createProject(args), durations = splitDuration(args.targetDurationSec);
    return result({ projectId: project.id, status: project.status, finalDurationSec: args.targetDurationSec, shotDurationsSec: durations, shotCount: durations.length, brief: project.brief, next: "Call generate_motion_video with this projectId." });
  });
  server.tool("generate_motion_video", "Start all Gemini shot-generation jobs asynchronously. Each shot is at most 10 seconds; final assembly uses FFmpeg.", { projectId: z.string().uuid() }, async ({ projectId }) => {
    const project = await getProject(projectId);
    if (!project) throw new Error("Project not found.");
    const existing = await listShots(projectId);
    if (existing.length) return result({ projectId, status: project.status, shots: existing.map(s => ({ shot: s.shotIndex + 1, status: s.status, interactionId: s.interactionId })), note: "Shot records already exist; use check_video_status." });
    const durations = splitDuration(project.brief.targetDurationSec);
    const shots = await createShots(projectId, durations.map((durationSec, shotIndex) => ({ shotIndex, durationSec, prompt: shotPrompt(project.brief, shotIndex, durations.length, durationSec) })));
    await updateProject(projectId, { status: "generating", errorMessage: null });
    const started = await Promise.allSettled(shots.map(s => startVideoInteraction({ prompt: s.prompt, durationSec: s.durationSec, aspectRatio: project.brief.aspectRatio, resolution: project.brief.resolution })));
    const failures: string[] = [];
    for (let i = 0; i < started.length; i++) {
      const item = started[i];
      if (item.status === "fulfilled") await updateShot(shots[i].id, { status: "generating", interactionId: item.value.id });
      else {
        const message = item.reason instanceof Error ? item.reason.message : "Provider error";
        failures.push("Shot " + (i + 1) + ": " + message);
        await updateShot(shots[i].id, { status: "failed", errorMessage: message });
      }
    }
    if (failures.length) await updateProject(projectId, { status: "failed", errorMessage: failures.join("; ") });
    return result({ projectId, status: failures.length ? "partially_failed" : "generating", finalDurationSec: project.brief.targetDurationSec, shots: await listShots(projectId), note: "Poll check_video_status until every shot and final render are complete." });
  });
  server.tool("check_video_status", "Poll Gemini shots; when all clips are ready, stitch them with FFmpeg and store the final MP4.", { projectId: z.string().uuid() }, async ({ projectId }) => {
    const project = await getProject(projectId);
    if (!project) throw new Error("Project not found.");
    if (project.status === "completed") return result({ projectId, status: "completed", ready: true, next: "Call get_video_result." });
    const shots = await listShots(projectId);
    if (!shots.length) return result({ projectId, status: project.status, ready: false, note: "Call generate_motion_video first." });
    for (const shot of shots) {
      if (shot.status !== "generating" || !shot.interactionId) continue;
      try {
        const interaction = await getInteraction(shot.interactionId);
        if (interaction.status === "failed" || interaction.status === "cancelled") {
          await updateShot(shot.id, { status: "failed", errorMessage: interaction.error?.message || "Provider generation failed." });
          continue;
        }
        if (interaction.status !== "completed") continue;
        try {
          const clipPath = await storeGeminiOutput(interaction, projectId, shot.shotIndex);
          await updateShot(shot.id, { status: "completed", clipPath });
        } catch (error) {
          const message = error instanceof Error ? error.message : "Clip processing failed";
          if (message.includes("not active yet")) { await updateShot(shot.id, { status: "processing" }); continue; }
          await updateShot(shot.id, { status: "failed", errorMessage: message });
        }
      } catch (error) {
        await updateShot(shot.id, { status: "failed", errorMessage: error instanceof Error ? error.message : "Provider polling failed" });
      }
    }
    const current = await listShots(projectId), failed = current.filter(s => s.status === "failed");
    if (failed.length) {
      await updateProject(projectId, { status: "failed", errorMessage: failed.map(s => "Shot " + (s.shotIndex + 1) + ": " + s.errorMessage).join("; ") });
      return result({ projectId, status: "failed", shots: current });
    }
    if (current.some(s => s.status !== "completed")) {
      await updateProject(projectId, { status: "generating" });
      return result({ projectId, status: "generating", ready: false, shots: current.map(s => ({ shot: s.shotIndex + 1, status: s.status })), note: "Some clips are still generating or processing. Poll again shortly." });
    }
    const worker = process.env.RENDER_WORKER_URL, token = process.env.RENDER_WORKER_TOKEN;
    if (!worker || !token || token.length < 32) throw new Error("Set RENDER_WORKER_URL and RENDER_WORKER_TOKEN (at least 32 characters).");
    await updateProject(projectId, { status: "processing" });
    const urls = await Promise.all(current.map(async s => {
      if (!s.clipPath) throw new Error("Shot " + (s.shotIndex + 1) + " has no stored clip.");
      const { data, error } = await getSupabase().storage.from(VIDEO_BUCKET).createSignedUrl(s.clipPath, 3600);
      if (error) throw new Error("Could not sign shot " + (s.shotIndex + 1) + ": " + error.message);
      return data.signedUrl;
    }));
    const response = await fetch(worker.replace(/\/$/, "") + "/render", {
      method: "POST", headers: { authorization: "Bearer " + token, "content-type": "application/json" },
      body: JSON.stringify({ clips: urls, aspectRatio: project.brief.aspectRatio }), signal: AbortSignal.timeout(55000)
    });
    if (!response.ok) throw new Error("Render worker failed (" + response.status + "): " + (await response.text()).slice(0, 1000));
    const final = Buffer.from(await response.arrayBuffer());
    if (final.length < 100000) throw new Error("Final render payload is unexpectedly small.");
    const finalPath = "projects/" + projectId + "/final.mp4";
    const { error } = await getSupabase().storage.from(VIDEO_BUCKET).upload(finalPath, final, { contentType: "video/mp4", upsert: true });
    if (error) throw new Error("Final video upload failed: " + error.message);
    await updateProject(projectId, { status: "completed", finalVideoPath: finalPath, errorMessage: null });
    return result({ projectId, status: "completed", ready: true, finalDurationSec: project.brief.targetDurationSec, shotCount: current.length, fileSizeBytes: final.length, next: "Call get_video_result for the final MP4 link." });
  });
  server.tool("get_video_result", "Get a time-limited download link for the final MP4.", { projectId: z.string().uuid() }, async ({ projectId }) => {
    const project = await getProject(projectId);
    if (!project) throw new Error("Project not found.");
    if (project.status !== "completed" || !project.finalVideoPath) return result({ projectId, status: project.status, ready: false, error: project.errorMessage, note: "Final video is not ready. Call check_video_status." });
    const { data, error } = await getSupabase().storage.from(VIDEO_BUCKET).createSignedUrl(project.finalVideoPath, 86400);
    if (error) throw new Error("Could not create download link: " + error.message);
    return result({ projectId, ready: true, title: project.title, downloadUrl: data.signedUrl, expiresInHours: 24, aspectRatio: project.brief.aspectRatio, targetDurationSec: project.brief.targetDurationSec, resolution: project.brief.resolution });
  });
  server.tool("list_motion_projects", "List recent Motion Studio projects and statuses.", { limit: z.number().int().min(1).max(50).default(20) }, async ({ limit }) => {
    const projects = await listProjects(limit);
    return result(projects.map(p => ({ projectId: p.id, title: p.title, status: p.status, createdAt: p.createdAt, error: p.errorMessage })));
  });
  return server;
}