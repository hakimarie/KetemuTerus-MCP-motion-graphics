# KetemuTerus Motion Studio

MCP server for creating short-form video briefs and generating Veo clips on Google Cloud Vertex AI.

## Tools
- `create_motion_brief`: create a creative brief and Veo-ready prompt.
- `generate_motion_video`: submit one 4, 6, or 8-second Veo 3.1 generation job.
- `check_video_status`: poll the asynchronous Vertex AI operation.
- `get_video_result`: retrieve the completed operation response and output location.

## Local setup
1. Use Node.js 20 or later.
2. Copy `.env.example` to `.env.local` and set the required values.
3. Enable Vertex AI API and billing in Google Cloud.
4. Create a service account with Vertex AI User and write access to the output GCS bucket.
5. Run `npm install`, then `npm run dev`.
6. MCP endpoint: `http://localhost:3000/api/mcp`.

All MCP requests require `Authorization: Bearer <MCP_ACCESS_TOKEN>`. Keep Google credentials server-side.

## Vercel deployment
Import this repository into Vercel, configure the variables in `.env.example` in Project Settings, then deploy with Node.js 20+. Connect Claude to `https://YOUR-DOMAIN/api/mcp` with the bearer token.

## Important limits
Each Veo request creates one clip (4, 6, or 8 seconds). A 15-second finished edit requires multiple clips and a separate stitching/rendering stage. This initial version does not yet assemble multiple clips into one MP4.
