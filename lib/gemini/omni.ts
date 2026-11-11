const API_BASE = "https://generativelanguage.googleapis.com/v1beta";

function apiKey(): string {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY is not configured.");
  return key;
}

async function geminiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("x-goog-api-key", apiKey());
  if (init.body) headers.set("content-type", "application/json");
  const response = await fetch(`${API_BASE}${path}`, { ...init, headers, cache: "no-store" });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Gemini API ${response.status}: ${detail.slice(0, 1200)}`);
  }
  return response;
}

export interface StartedInteraction {
  id: string;
  status: string;
  outputVideoUri?: string;
}

export async function startVideoInteraction(input: {
  prompt: string;
  durationSec: number;
  aspectRatio: "9:16" | "16:9";
  resolution: "720p" | "1080p";
}): Promise<StartedInteraction> {
  const model = process.env.GEMINI_VIDEO_MODEL || "gemini-omni-1.2-flash";
  const response = await geminiFetch("/interactions", {
    method: "POST",
    body: JSON.stringify({
      model,
      input: input.prompt,
      background: true,
      store: true,
      response_format: {
        type: "video",
        aspect_ratio: input.aspectRatio,
        resolution: input.resolution,
        duration: `${input.durationSec}s`,
        delivery: "uri"
      }
    })
  });
  const json = await response.json();
  if (!json.id) throw new Error("Gemini did not return an interaction ID.");
  return {
    id: json.id as string,
    status: String(json.status ?? "in_progress"),
    outputVideoUri: json.output_video?.uri
  };
}

export async function getInteraction(id: string): Promise<any> {
  const response = await geminiFetch(`/interactions/${encodeURIComponent(id)}`);
  return response.json();
}

export async function getFileInfo(fileName: string): Promise<any> {
  const response = await geminiFetch(`/files/${encodeURIComponent(fileName)}`);
  return response.json();
}

export async function downloadGeminiFile(uriOrName: string): Promise<Buffer> {
  const fileName = uriOrName.startsWith("files/")
    ? uriOrName
    : `files/${uriOrName.match(/files\/([^/:?]+)/)?.[1] ?? uriOrName}`;
  const response = await geminiFetch(`/${fileName}:download?alt=media`);
  return Buffer.from(await response.arrayBuffer());
}

export function extractVideoOutput(interaction: any): { data?: string; uri?: string } {
  const direct = interaction?.output_video;
  if (direct?.data || direct?.uri) return { data: direct.data, uri: direct.uri };

  for (const step of interaction?.steps ?? []) {
    for (const item of step?.content ?? []) {
      if (item?.type === "video" && (item.data || item.uri)) {
        return { data: item.data, uri: item.uri };
      }
    }
  }
  return {};
}