export default function Home() {
  return (
    <main className="shell">
      <nav className="nav">
        <div className="brand"><span className="mark">KT</span><span>KetemuTerus <b>Motion Studio</b></span></div>
        <span className="status"><i /> MCP service</span>
      </nav>
      <section className="hero">
        <p className="eyebrow">REMOTE MCP · AI VIDEO PRODUCTION</p>
        <h1>From creative brief<br /><em>to finished motion.</em></h1>
        <p className="intro">A private motion production endpoint for Claude.ai, powered by Gemini Omni Flash and Supabase Storage.</p>
        <div className="endpoint"><span>ENDPOINT</span><code>/api/mcp</code></div>
      </section>
      <section className="grid">
        <article><small>01 / BRIEF</small><h2>Build the concept</h2><p>Create a structured video brief with objective, visual direction, aspect ratio and duration.</p></article>
        <article><small>02 / GENERATE</small><h2>Render with Gemini</h2><p>Start background video generation. No long-running render loop inside the MCP request.</p></article>
        <article><small>03 / DELIVER</small><h2>Track & retrieve</h2><p>Poll job status, save completed MP4 files to private storage and return a 24-hour signed link.</p></article>
      </section>
      <footer><span>KetemuTerus Motion Studio</span><span>Build for local business storytelling.</span></footer>
    </main>
  );
}