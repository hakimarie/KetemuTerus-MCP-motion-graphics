# KetemuTerus Motion Studio

Private Remote MCP for producing branded social videos with Gemini video generation and a separate FFmpeg rendering worker.

## Product output

- Final duration: **15, 30, 45 or 60 seconds**
- Formats: 9:16 portrait (default) or 16:9 landscape
- Resolution setting: 720p or 1080p for provider-generated shots
- Multiple generated clips are normalized and stitched into one MP4
- Final MP4 and intermediate clips are stored in a private Supabase Storage bucket

A 60-second video is not one 60-second Gemini request. It is split into short provider clips (currently 3–10 seconds each), generated asynchronously, then concatenated by FFmpeg.

## Architecture

- Next.js App Router + MCP Streamable HTTP endpoint on Vercel: `/api/mcp`
- Gemini Interactions API for asynchronous clip generation
- Supabase Postgres for project and shot state
- Private Supabase Storage for clips and final MP4
- Separate Docker render worker with FFmpeg; deploy on a container host that supports Docker and long-running HTTP services
- Worker uploads the final MP4 directly to Supabase to avoid sending large video payloads through Vercel

## MCP tools

1. `create_motion_brief` — create a brief for 15/30/45/60 seconds
2. `generate_motion_video` — split the brief and start each shot generation
3. `check_video_status` — poll shots, stitch clips and finalize the MP4
4. `get_video_result` — create a 24-hour signed download URL
5. `list_motion_projects` — list recent projects

Shot plans are balanced to fit the current 10-second per-shot pipeline:
- 15 sec → 8 + 7 sec
- 30 sec → 10 + 10 + 10 sec
- 45 sec → 9 + 9 + 9 + 9 + 9 sec
- 60 sec → 10 + 10 + 10 + 10 + 10 + 10 sec

## Environment variables

### Vercel MCP app

- `GEMINI_API_KEY` — Google AI Studio API key
- `GEMINI_VIDEO_MODEL` — optional; default `gemini-omni-1.2-flash`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` — server-side only
- `MCP_AUTH_TOKEN` — random bearer secret, minimum 32 characters
- `RENDER_WORKER_URL` — public HTTPS URL of the render worker
- `RENDER_WORKER_TOKEN` — same secret as worker, minimum 32 characters

### Render worker container

- `PORT` — defaults to 8080
- `RENDER_WORKER_TOKEN` — same random secret configured in Vercel
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` — used only by the worker to upload the final MP4

Never expose Gemini keys, Supabase service-role keys or bearer tokens in browser code or public client bundles.

## Supabase setup

Run both SQL migrations in order in the Supabase SQL Editor:

1. `supabase/migrations/001_motion_projects.sql`
2. `supabase/migrations/002_motion_shots.sql`

They create the project and shot tables, enable RLS, revoke public table access and create/use the private `motion-studio` storage bucket.

## Deploy

### 1. Deploy the render worker first

Deploy the `render-worker/` directory as a Docker service on a container platform that supports persistent HTTP processes. Configure `RENDER_WORKER_TOKEN`, `SUPABASE_URL`, and `SUPABASE_SERVICE_ROLE_KEY`. Expose port 8080 and use the platform's HTTPS URL.

Health check: `GET /health`.

### 2. Deploy the MCP app to Vercel

Import this repository, select the project root, and configure the Vercel environment variables above. Set `RENDER_WORKER_URL` to the worker's HTTPS base URL. Set the same `RENDER_WORKER_TOKEN` on both services.

### 3. Apply database migrations

Run migrations 001 and 002 in Supabase SQL Editor in numerical order.

### 4. Connect Claude

Configure Claude's remote MCP server URL as:

`https://YOUR-VERCEL-DOMAIN/api/mcp`

Use HTTP Bearer authentication with `MCP_AUTH_TOKEN`.

## Local development

```bash
npm install
cp .env.example .env.local
npm run dev
```

The render worker can be run locally with Docker:

```bash
docker build -t ketemuterus-motion-worker ./render-worker
docker run --rm -p 8080:8080 --env-file render-worker/.env ketemuterus-motion-worker
```

## Current limitations / validation required

- The per-shot cap is deliberately set to 10 seconds for predictable orchestration; verify model availability, aspect-ratio support, duration support and quota with the Google AI project used for deployment.
- The current renderer concatenates video and adds a silent audio track. Voice-over generation, voice-over timing, music licensing selection, subtitles, logo compositing and detailed shot-to-shot continuity review are not implemented yet.
- The render worker currently performs a synchronous render request. Long renders may exceed hosting request limits; production deployment should use a durable job queue and asynchronous worker status endpoint.
- The worker and MCP app have not yet been deployed or tested against live Gemini/Supabase credentials. Do not treat this branch as production-ready until CI, migrations, provider generation and end-to-end rendering pass.
