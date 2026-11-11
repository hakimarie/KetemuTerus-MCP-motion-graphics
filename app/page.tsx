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
        <p className="intro">A private video production MCP for Claude.ai. Generate 15–60 second social videos from multiple Gemini clips, then assemble the final MP4 with FFmpeg.</p>
        <div className="endpoint"><span>ENDPOINT</span><code>/api/mcp</code></div>
      </section>
      <section className="grid">
        <article><small>01 / BRIEF</small><h2>Build the concept</h2><p>Set the objective, visual direction, aspect ratio and final duration: 15, 30, 45 or 60 seconds.</p></article>
        <article><small>02 / GENERATE</small><h2>Create multiple shots</h2><p>Gemini generates short clips asynchronously. Shot state and intermediate assets are stored in Supabase.</p></article>
        <article><small>03 / DELIVER</small><h2>Assemble & retrieve</h2><p>A separate FFmpeg worker joins the clips into one MP4 and saves the result to private storage.</p></article>
      </section>
      <footer><span>KetemuTerus Motion Studio</span><span>Build for local business storytelling.</span></footer>
    </main>
  );
}