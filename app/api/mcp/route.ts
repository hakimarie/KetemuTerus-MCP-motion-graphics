import { timingSafeEqual } from "node:crypto";
import { NextRequest } from "next/server";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { buildServer } from "@/lib/mcp/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function isAuthorized(request: NextRequest): boolean {
  const expected = process.env.MCP_AUTH_TOKEN;
  if (!expected || expected.length < 32) return false;
  const actual = request.headers.get("authorization") ?? "";
  const supplied = actual.startsWith("Bearer ") ? actual.slice(7) : "";
  const a = Buffer.from(supplied);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function jsonError(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

export async function POST(request: NextRequest) {
  if (!process.env.MCP_AUTH_TOKEN || process.env.MCP_AUTH_TOKEN.length < 32) {
    return jsonError("MCP authentication is not configured. Set a random token of at least 32 characters.", 503);
  }
  if (!isAuthorized(request)) return jsonError("Unauthorized", 401);

  const headers = new Headers(request.headers);
  if (!headers.has("accept")) headers.set("accept", "application/json, text/event-stream");
  const mcpRequest = new Request(request, { headers });

  const server = buildServer();
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true
  });

  try {
    await server.connect(transport);
    return await transport.handleRequest(mcpRequest);
  } catch (error) {
    console.error("MCP request failed:", error);
    return jsonError("MCP request failed", 500);
  } finally {
    await transport.close().catch(() => undefined);
    await server.close().catch(() => undefined);
  }
}

export async function GET() {
  return jsonError("This stateless MCP endpoint accepts POST requests only.", 405);
}

export async function DELETE() {
  return jsonError("Stateless MCP transport does not use DELETE.", 405);
}