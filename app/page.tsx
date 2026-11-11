export default function Home() {
  return (
    <main style={{ maxWidth: 760, margin: "12vh auto", padding: 24 }}>
      <p style={{ color: "#94a3b8", letterSpacing: 3, fontSize: 12 }}>KETEMUTERUS / AI CREATIVE TOOLS</p>
      <h1 style={{ fontSize: 42, marginBottom: 12 }}>Motion Studio</h1>
      <p style={{ color: "#cbd5e1", lineHeight: 1.7 }}>
        MCP endpoint for generating and tracking video jobs with Google Veo on Vertex AI.
      </p>
      <div style={{ marginTop: 32, padding: 20, border: "1px solid #334155", borderRadius: 12 }}>
        <strong>MCP endpoint</strong>
        <p style={{ color: "#93c5fd", marginBottom: 0 }}>/api/mcp</p>
      </div>
      <p style={{ color: "#94a3b8", fontSize: 13, marginTop: 28 }}>
        Configure the endpoint in Claude using the MCP URL and your bearer token.
      </p>
    </main>
  );
}