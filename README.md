# KetemuTerus Motion Studio

Private Remote MCP server for creating branded social videos with **Gemini Omni Flash**.

> The Gemini API Veo 3.1 Preview models were shut down on 22 October 2026. This project uses the current Gemini Omni Flash video-generation flow through the Interactions API instead.

## Architecture

- Next.js App Router on Vercel
- MCP Streamable HTTP endpoint at `/api/mcp`
- Gemini Omni Flash background interactions for video generation
- Supabase Postgres for project state
- Private Supabase Storage for final MP4 files
- No FFmpeg or local video stitching in the MVP

## MCP tools

1. `create_motion_brief` — save a structured video brief
2. `generate_motion_video` — start an asynchronous Gemini generation job
3. `check_video_status` — poll Gemini and persist completed MP4 output
4. `get_video_result` — return a private, 24-hour signed download URL
5. `list_motion_projects` — list recent projects

Default output: portrait 9:16, 15 seconds, 1080p. Gemini Omni Flash supports video durations from 3 to 15 seconds.

## Required environment variables

Configure these in Vercel Project Settings → Environment Variables:

- `GEMINI_API_KEY` — Google AI Studio API key with Gemini API access
- `GEMINI_VIDEO_MODEL` — optional; defaults to `gemini-omni-1.2-flash`
- `SUPABASE_URL` — Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` — Supabase service-role key; server-side only
- `MCP_AUTH_TOKEN` — random secret with at least 32 characters

Never expose the service-role key, Gemini key, or MCP bearer token in client-side code or public repositories.

## Supabase setup

Run `supabase/migrations/001_motion_projects.sql` in the Supabase SQL Editor. It creates the project table, enables RLS, revokes public table access and creates a private video bucket.

## Local development

```bash
npm install
cp .env.example .env.local
npm run dev
```

## Deploy to Vercel

1. Import this repository into Vercel.
2. Add all required environment variables.
3. Run the Supabase migration.
4. Deploy.
5. Configure Claude.ai with the remote MCP URL `https://YOUR-VERCEL-DOMAIN/api/mcp` and HTTP Bearer authentication using `MCP_AUTH_TOKEN`.

The MCP endpoint requires POST and rejects requests when the bearer token is missing or invalid.

## Generation workflow

Call `create_motion_brief`, then `generate_motion_video`. Generation runs as a background interaction; poll `check_video_status` until complete, then call `get_video_result`.

The signed video URL expires after 24 hours. A fresh link can be requested at any time by calling `get_video_result` again.

## MVP limitations

- One generated video per project; no multi-clip stitching.
- Video references, uploaded voiceovers and custom logo compositing are not in this first foundation.
- The model returns 1080p output as requested; no FFmpeg post-processing or independent frame-level QC is performed.
- A real generation test requires a configured Gemini API key, Supabase project and billing/quota access.
