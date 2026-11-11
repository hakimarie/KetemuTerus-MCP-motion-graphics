create table if not exists public.motion_projects (
  id uuid primary key,
  title text not null,
  brief jsonb not null,
  status text not null default 'brief_created'
    check (status in ('brief_created', 'generating', 'processing', 'completed', 'failed')),
  provider text not null default 'gemini-omni',
  provider_interaction_id text,
  provider_file_uri text,
  final_video_path text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists motion_projects_created_at_idx
  on public.motion_projects (created_at desc);

create index if not exists motion_projects_status_idx
  on public.motion_projects (status);

alter table public.motion_projects enable row level security;
revoke all on public.motion_projects from anon, authenticated;
grant all on public.motion_projects to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('motion-studio', 'motion-studio', false, 524288000, array['video/mp4'])
on conflict (id) do update
set public = false,
    file_size_limit = 524288000,
    allowed_mime_types = array['video/mp4'];