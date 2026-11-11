import http from "node:http";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import { randomUUID, timingSafeEqual } from "node:crypto";
import { spawn } from "node:child_process";
const PORT = Number(process.env.PORT || 8080);
const TOKEN = process.env.RENDER_WORKER_TOKEN || "";
const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const BUCKET = "motion-studio";
function authorized(req) {
  const value = req.headers.authorization || "";
  const supplied = Buffer.from(value.startsWith("Bearer ") ? value.slice(7) : "");
  const expected = Buffer.from(TOKEN);
  return expected.length >= 32 && supplied.length === expected.length && timingSafeEqual(supplied, expected);
}
function send(res, status, body) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}
async function readBody(req) {
  let body = "";
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 32000) throw new Error("Request body too large");
  }
  return JSON.parse(body || "{}");
}
async function download(url, target) {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:") throw new Error("Only HTTPS asset URLs are accepted");
  const response = await fetch(url, { signal: AbortSignal.timeout(120000) });
  if (!response.ok || !response.body) throw new Error("Asset download failed: HTTP " + response.status);
  const size = Number(response.headers.get("content-length") || 0);
  if (size > 500 * 1024 * 1024) throw new Error("Asset exceeds 500 MB");
  await pipeline(response.body, createWriteStream(target));
}
function ffmpeg(args) {
  return new Promise((resolve, reject) => {
    const child = spawn("ffmpeg", args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", chunk => { stderr += chunk.toString(); if (stderr.length > 12000) stderr = stderr.slice(-12000); });
    child.on("error", reject);
    child.on("close", code => code === 0 ? resolve() : reject(new Error("FFmpeg exited " + code + ": " + stderr)));
  });
}
async function uploadFinal(file, projectId) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) throw new Error("Render worker Supabase credentials are missing");
  const stat = await fs.stat(file);
  const objectPath = "projects/" + projectId + "/final.mp4";
  const url = SUPABASE_URL.replace(/\/$/, "") + "/storage/v1/object/" + BUCKET + "/" + objectPath.split("/").map(encodeURIComponent).join("/");
  const stream = (await import("node:fs")).createReadStream(file);
  const response = await fetch(url, {
    method: "POST",
    headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, authorization: "Bearer " + SUPABASE_SERVICE_ROLE_KEY, "content-type": "video/mp4", "content-length": String(stat.size), "x-upsert": "true" },
    body: stream,
    duplex: "half"
  });
  if (!response.ok) throw new Error("Supabase final upload failed: HTTP " + response.status + " " + (await response.text()).slice(0, 1000));
  return { path: objectPath, sizeBytes: stat.size };
}
const server = http.createServer(async (req, res) => {
  if (req.method === "GET" && req.url === "/health") return send(res, 200, { ok: true, service: "ketemuterus-motion-render-worker" });
  if (req.method !== "POST" || req.url !== "/render") return send(res, 404, { error: "Not found" });
  if (!authorized(req)) return send(res, 401, { error: "Unauthorized" });
  let dir;
  try {
    const body = await readBody(req);
    if (!/^[0-9a-f-]{36}$/i.test(body.projectId || "")) return send(res, 400, { error: "A valid projectId is required" });
    if (!Array.isArray(body.clips) || body.clips.length < 2 || body.clips.length > 12) return send(res, 400, { error: "clips must contain between 2 and 12 HTTPS URLs" });
    if (!["9:16", "16:9"].includes(body.aspectRatio)) return send(res, 400, { error: "Unsupported aspect ratio" });
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "kt-motion-"));
    const inputs = [];
    for (let i = 0; i < body.clips.length; i++) {
      const target = path.join(dir, "clip-" + i + ".mp4");
      await download(body.clips[i], target);
      inputs.push(target);
    }
    const output = path.join(dir, "final.mp4");
    const width = body.aspectRatio === "9:16" ? 1080 : 1920;
    const height = body.aspectRatio === "9:16" ? 1920 : 1080;
    const args = [];
    for (const input of inputs) args.push("-i", input);
    const filters = inputs.map((_, i) => "[" + i + ":v]scale=" + width + ":" + height + ":force_original_aspect_ratio=increase,crop=" + width + ":" + height + ",setsar=1,fps=30,format=yuv420p[v" + i + "]");
    filters.push(inputs.map((_, i) => "[v" + i + "]").join("") + "concat=n=" + inputs.length + ":v=1:a=0[vout]");
    args.push("-filter_complex", filters.join(";"), "-map", "[vout]", "-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=48000", "-map", inputs.length + ":a:0", "-shortest", "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", "-shortest", output);
    await ffmpeg(args);
    const uploaded = await uploadFinal(output, body.projectId);
    return send(res, 200, { ok: true, renderId: randomUUID(), ...uploaded });
  } catch (error) {
    return send(res, 500, { error: error instanceof Error ? error.message : "Render failed" });
  } finally {
    if (dir) await fs.rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
});
server.listen(PORT, "0.0.0.0", () => process.stdout.write("Render worker listening on " + PORT + "\n"));
