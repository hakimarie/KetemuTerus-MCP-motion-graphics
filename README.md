# KetemuTerus Motion Studio

Private Remote MCP server for creating branded social videos with **Gemini Omni Flash**.

The integration follows Google's Gemini Interactions API and Omni video-generation documentation. The current documented public model identifier is `gemini-omni-1.1-flash`; availability and quota must be confirmed with the Google AI project used for deployment.

## Architecture

- Next.js App Router on Vercel
- MCP Streamable HTTP endpoint at `/api/mcp`
- Gemini Omni Flash video generation through the Interactions API
- Background interaction IDs for asynchronous generation and polling
- Supabase Postgres for project state
- Private Supabase Storage for final MP4 files
- No FFmpeg or local video stitching in the MVP

## MCP tools

1. `create_motion_brief` — save a structured video brief
2. `generate_motion_video` — start a Gemini video-generation interaction
3. `check_video_status` — poll Gemini and persist completed MP4 output
4. `get_video_result` — return a private, 24-hour signed download URL
5. `list_motion_projects` — list recent projects

Default output: portrait 9:16, 10 seconds, 1080p. The current MVP caps a single generation at 10 seconds. Longer videos require a later multi-shot orchestration feature.

## Required environment variables

Configure these in Vercel Project Settings → Environment Variables:

- `GEMINI_API_KEY` — Google AI Studio API key with Gemini API access
- `GEMINI_VIDEO_MODEL` — optional; defaults to `gemini-omni-1.1-flash`
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

Call `create_motion_brief`, then `generate_motion_video`. The job is submitted to Gemini and the interaction ID is returned. Poll `check_video_status` until complete, then call `get_video_result`.

The signed video URL expires after 24 hours. A fresh link can be requested at any time by calling `get_video_result` again.

## MVP limitations

- One generated video per project, up to 10 seconds; no multi-clip stitching.
- Video references, uploaded voiceovers and custom logo compositing are not in this first foundation.
- No FFmpeg post-processing or independent frame-level QC.
- A real generation test requires a configured Gemini API key, model access, quota and Supabase project.
