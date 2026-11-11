import { createMcpHandler } from "mcp-handler";
import { GoogleAuth } from "google-auth-library";
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";

export const runtime = "nodejs";
export const maxDuration = 60;

type VertexOperation = {
  name?: string;
  done?: boolean;
  error?: { code?: number; message?: string };
  response?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
};

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}
function isAuthorized(request: Request): boolean {
  const expected = process.env.MCP_ACCESS_TOKEN;
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\\s+/i, "");
  if (!expected || !supplied) return false;
  const a = Buffer.from(expected), b = Buffer.from(supplied);
  return a.length === b.length && timingSafeEqual(a, b);
}
async function vertexAccessToken(): Promise<string> {
  const credentials = JSON.parse(requiredEnv("GOOGLE_SERVICE_ACCOUNT_JSON"));
  const auth = new GoogleAuth({ credentials, scopes: ["https://www.googleapis.com/auth/cloud-platform"] });
  const client = await auth.getClient();
  const token = await client.getAccessToken();
  if (!token.token) throw new Error("Google Cloud authentication returned no access token.");
  return token.token;
}
function vertexBaseUrl(): string {
  const project = requiredEnv("GOOGLE_CLOUD_PROJECT");
  const location = process.env.GOOGLE_CLOUD_LOCATION || "us-central1";
  const model = process.env.GOOGLE_VEO_MODEL || "veo-3.1-generate-001";
  return `https://${location}-aiplatform.googleapis.com/v1/projects/${project}/locations/${location}/publishers/google/models/${model}`;
}
async function vertexRequest(method: string, body: Record<string, unknown>): Promise<VertexOperation> {
  const response = await fetch(`${vertexBaseUrl()}:${method}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${await vertexAccessToken()}`, "Content-Type": "application/json" },
    body: JSON.stringify(body), cache: "no-store"
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = (payload as { error?: { message?: string } }).error?.message;
    throw new Error(`Vertex AI request failed (${response.status}): ${message || JSON.stringify(payload)}`);
  }
  return payload as VertexOperation;
}

const handler = createMcpHandler((server) => {
  server.registerTool("create_motion_brief", {
    title: "Create Motion Brief",
    description: "Turn a business goal into a short-form video brief and Veo-ready prompt.",
    inputSchema: z.object({
      business: z.string().min(1).max(120), goal: z.string().min(1).max(500),
      duration_seconds: z.number().int().min(4).max(60).default(15),
      aspect_ratio: z.enum(["9:16", "16:9", "1:1"]).default("9:16"),
      style: z.string().max(300).default("Cinematic handcrafted 3D paper diorama, warm vintage documentary, subtle film grain."),
      language: z.string().max(40).default("Indonesian"), call_to_action: z.string().max(180).optional()
    })
  }, async ({ business, goal, duration_seconds, aspect_ratio, style, language, call_to_action }) => {
    const prompt = [
      `Create a ${duration_seconds}-second promotional video for ${business}.`,
      `Objective: ${goal}`, `Visual direction: ${style}`,
      `Format: ${aspect_ratio}, social-first framing, deliberate camera movement.`,
      `Language: ${language}. Avoid gibberish text, fake logos, watermarks and subtitles.`,
      call_to_action ? `End card / CTA: ${call_to_action}` : "Leave clean end-card space for typography in post-production.",
      "Maintain consistent subject identity, lighting, palette and visual continuity."
    ].join("\\n");
    return { content: [{ type: "text", text: JSON.stringify({ business, duration_seconds, aspect_ratio, prompt }, null, 2) }] };
  });

  server.registerTool("generate_motion_video", {
    title: "Generate Motion Video",
    description: "Submit one asynchronous 4, 6 or 8-second Veo 3.1 clip to Vertex AI. Returns an operation name.",
    inputSchema: z.object({
      prompt: z.string().min(10).max(8000), aspect_ratio: z.enum(["9:16", "16:9", "1:1"]).default("9:16"),
      duration_seconds: z.union([z.literal(4), z.literal(6), z.literal(8)]).default(8),
      resolution: z.enum(["720p", "1080p"]).default("720p"), negative_prompt: z.string().max(2000).optional()
    })
  }, async ({ prompt, aspect_ratio, duration_seconds, resolution, negative_prompt }) => {
    const parameters: Record<string, unknown> = {
      aspectRatio: aspect_ratio, durationSeconds: duration_seconds, sampleCount: 1,
      storageUri: requiredEnv("GCS_OUTPUT_URI"), resolution
    };
    if (negative_prompt) parameters.negativePrompt = negative_prompt;
    const operation = await vertexRequest("predictLongRunning", { instances: [{ prompt }], parameters });
    if (!operation.name) throw new Error("Vertex AI did not return an operation name.");
    return { content: [{ type: "text", text: JSON.stringify({
      status: "submitted", operation_name: operation.name,
      model: process.env.GOOGLE_VEO_MODEL || "veo-3.1-generate-001",
      next_step: "Call check_video_status, then get_video_result when done."
    }, null, 2) }] };
  });

  const operationSchema = z.object({ operation_name: z.string().min(1).max(1000) });
  server.registerTool("check_video_status", {
    title: "Check Video Status", description: "Poll a Veo long-running operation.", inputSchema: operationSchema
  }, async ({ operation_name }) => {
    const project = requiredEnv("GOOGLE_CLOUD_PROJECT");
    if (!operation_name.includes(`projects/${project}/`)) throw new Error("Operation is not from the configured project.");
    const operation = await vertexRequest("fetchPredictOperation", { operationName: operation_name });
    return { content: [{ type: "text", text: JSON.stringify({
      done: Boolean(operation.done), operation_name, error: operation.error || null, metadata: operation.metadata || null
    }, null, 2) }] };
  });

  server.registerTool("get_video_result", {
    title: "Get Video Result", description: "Retrieve the final result payload for a completed Veo operation.",
    inputSchema: operationSchema
  }, async ({ operation_name }) => {
    const project = requiredEnv("GOOGLE_CLOUD_PROJECT");
    if (!operation_name.includes(`projects/${project}/`)) throw new Error("Operation is not from the configured project.");
    const operation = await vertexRequest("fetchPredictOperation", { operationName: operation_name });
    if (!operation.done) return { content: [{ type: "text", text: "Video is still processing. Check again later." }] };
    if (operation.error) return { isError: true, content: [{ type: "text", text: JSON.stringify(operation.error) }] };
    return { content: [{ type: "text", text: JSON.stringify(operation.response || operation, null, 2) }] };
  });
}, { serverInfo: { name: "ketemuterus-motion-studio", version: "0.1.0" } });

async function protectedHandler(request: Request): Promise<Response> {
  if (!isAuthorized(request)) return new Response("Unauthorized", {
    status: 401, headers: { "WWW-Authenticate": 'Bearer realm="KetemuTerus Motion Studio"' }
  });
  return handler(request);
}
export { protectedHandler as GET, protectedHandler as POST };
