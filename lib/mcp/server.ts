import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { KETEMUTERUS_BRAND } from "@/lib/brand";
import { createProject, getProject, listProjects, updateProject } from "@/lib/projects";
import { getInteraction, getFileInfo, extractVideoOutput, downloadGeminiFile, startVideoInteraction } from "@/lib/gemini/omni";
import { getSupabase, VIDEO_BUCKET } from "@/lib/supabase";

function result(value: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }] };
}

function buildPrompt(brief: {
  title: string; objective: string; prompt: string; tone?: string; musicMood?: string;
  targetDurationSec: number; aspectRatio: string;
}) {
  return [
    `Create a polished ${brief.targetDurationSec}-second branded social video for KetemuTerus.`,
    `Topic: ${brief.title}. Objective: ${brief.objective}.`,
    brief.prompt,
    `Creative direction: ${brief.tone || "cinematic, premium motion graphics, clear visual storytelling"}.`,
    brief.musicMood ? `Audio direction: ${brief.musicMood}.` : "Generate suitable subtle background audio; avoid unintelligible speech.",
    `Use KetemuTerus brand palette: blue #2563EB, midnight navy #0F172A, slate #94A3B8, ice #EFF6FF.`,
    `Closing frame should reserve clean space for the brand name KetemuTerus and exact tagline: "${KETEMUTERUS_BRAND.tagline}". Website: ketemuterus.biz.id.`,
    `Output aspect ratio ${brief.aspectRatio}. Keep typography clean and legible. Avoid fabricated phone numbers, addresses, or claims.`
  ].join("\n\n");
}

export function buildServer() {
  const server = new McpServer(
    { name: "ketemuterus-motion-studio", version: "0.1.0" },
    {
      capabilities: { tools: {} },
      instructions:
        "KetemuTerus Motion Studio. Create branded social videos with Gemini Omni Flash. " +
        "Workflow: create_motion_brief -> generate_motion_video -> check_video_status -> get_video_result. " +
        "Default output is 9:16 portrait, 15 seconds, 1080p."
    }
  );

  server.tool(
    "create_motion_brief",
    "Create and save a video brief for a KetemuTerus or client social video. Returns a project ID.",
    {
      title: z.string().min(3).max(120),
      objective: z.string().min(3).max(300),
      prompt: z.string().min(10).max(5000),
      targetDurationSec: z.number().int().min(3).max(15).default(15),
      aspectRatio: z.enum(["9:16", "16:9"]).default("9:16"),
      resolution: z.enum(["720p", "1080p"]).default("1080p"),
      tone: z.string().max(300).optional(),
      musicMood: z.string().max(300).optional()
    },
    async (args) => {
      const project = await createProject(args);
      return result({
        projectId: project.id,
        status: project.status,
        brief: project.brief,
        next: "Call generate_motion_video with this projectId."
      });
    }
  );

  server.tool(
    "generate_motion_video",
    "Start an asynchronous Gemini Omni Flash video-generation job. Returns immediately with an interaction ID; it does not wait for rendering.",
    { projectId: z.string().uuid() },
    async ({ projectId }) => {
      const project = await getProject(projectId);
      if (!project) throw new Error("Project not found.");
      if (project.status === "generating" || project.status === "processing") {
        return result({ projectId, status: project.status, interactionId: project.providerInteractionId, note: "This project already has an active generation job." });
      }
      const started = await startVideoInteraction({
        prompt: buildPrompt(project.brief),
        durationSec: project.brief.targetDurationSec,
        aspectRatio: project.brief.aspectRatio,
        resolution: project.brief.resolution
      });
      await updateProject(projectId, {
        status: "generating",
        providerInteractionId: started.id,
        providerFileUri: started.outputVideoUri ?? null,
        errorMessage: null
      });
      return result({
        projectId,
        interactionId: started.id,
        status: started.status,
        model: process.env.GEMINI_VIDEO_MODEL || "gemini-omni-1.2-flash",
        next: "Poll check_video_status. Generation runs in the background."
      });
    }
  );

  server.tool(
    "check_video_status",
    "Check the Gemini background job. When video output is ready, save it to private Supabase Storage and mark the project completed.",
    { projectId: z.string().uuid() },
    async ({ projectId }) => {
      let project = await getProject(projectId);
      if (!project) throw new Error("Project not found.");
      if (project.status === "completed") return result({ projectId, status: project.status, ready: true, next: "Call get_video_result." });
      if (!project.providerInteractionId) return result({ projectId, status: project.status, ready: false, note: "Call generate_motion_video first." });

      const interaction = await getInteraction(project.providerInteractionId);
      if (interaction.status === "failed") {
        const message = interaction.error?.message || "Gemini generation failed.";
        await updateProject(projectId, { status: "failed", errorMessage: message });
        return result({ projectId, status: "failed", error: message });
      }
      if (interaction.status !== "completed") {
        await updateProject(projectId, { status: "generating" });
        return result({ projectId, status: interaction.status || "generating", ready: false, note: "Generation is still running. Check again shortly." });
      }

      const output = extractVideoOutput(interaction);
      let videoBuffer: Buffer;
      if (output.data) {
        videoBuffer = Buffer.from(output.data, "base64");
      } else if (output.uri) {
        const match = output.uri.match(/files\/([^/:?]+)/);
        if (!match) throw new Error("Gemini returned an unrecognized video file URI.");
        const file = await getFileInfo(`files/${match[1]}`);
        if (file.state === "FAILED") throw new Error("Gemini video file processing failed.");
        if (file.state !== "ACTIVE") {
          await updateProject(projectId, { status: "processing", providerFileUri: output.uri });
          return result({ projectId, status: "processing", ready: false, note: "Video file is being prepared by Google. Check again shortly." });
        }
        videoBuffer = await downloadGeminiFile(`files/${match[1]}`);
      } else {
        throw new Error("Gemini interaction completed but no video output was found.");
      }

      if (videoBuffer.length < 100_000) throw new Error("Generated video payload is unexpectedly small; refusing to publish it.");
      const path = `projects/${projectId}/final.mp4`;
      const { error } = await getSupabase().storage.from(VIDEO_BUCKET).upload(path, videoBuffer, {
        contentType: "video/mp4",
        upsert: true
      });
      if (error) throw new Error(`Supabase upload failed: ${error.message}`);
      await updateProject(projectId, { status: "completed", finalVideoPath: path, errorMessage: null });
      return result({ projectId, status: "completed", ready: true, fileSizeBytes: videoBuffer.length, next: "Call get_video_result for a signed MP4 link." });
    }
  );

  server.tool(
    "get_video_result",
    "Get a time-limited download link for the completed MP4 video.",
    { projectId: z.string().uuid() },
    async ({ projectId }) => {
      const project = await getProject(projectId);
      if (!project) throw new Error("Project not found.");
      if (project.status !== "completed" || !project.finalVideoPath) {
        return result({ projectId, status: project.status, ready: false, error: project.errorMessage, note: "The final video is not ready yet. Call check_video_status." });
      }
      const { data, error } = await getSupabase().storage.from(VIDEO_BUCKET).createSignedUrl(project.finalVideoPath, 60 * 60 * 24);
      if (error) throw new Error(`Could not create download link: ${error.message}`);
      return result({
        projectId,
        ready: true,
        title: project.title,
        downloadUrl: data.signedUrl,
        expiresInHours: 24,
        aspectRatio: project.brief.aspectRatio,
        targetDurationSec: project.brief.targetDurationSec,
        resolution: project.brief.resolution
      });
    }
  );

  server.tool(
    "list_motion_projects",
    "List the latest Motion Studio projects and their generation status.",
    { limit: z.number().int().min(1).max(50).default(20) },
    async ({ limit }) => {
      const projects = await listProjects(limit);
      return result(projects.map((project) => ({
        projectId: project.id,
        title: project.title,
        status: project.status,
        createdAt: project.createdAt,
        error: project.errorMessage
      })));
    }
  );

  return server;
}