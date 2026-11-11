create table if not exists public.motion_shots (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.motion_projects(id) on delete cascade,
  shot_index integer not null check (shot_index >= 0),
  duration_sec integer not null check (duration_sec between 3 and 10),
  prompt text not null,
  status text not null default 'queued' check (status in ('queued','generating','processing','completed','failed')),
  provider_interaction_id text,
  clip_path text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(project_id, shot_index)
);
create index if not exists motion_shots_project_idx on public.motion_shots(project_id, shot_index);
alter table public.motion_shots enable row level security;
revoke all on public.motion_shots from anon, authenticated;
grant all on public.motion_shots to service_role;
update storage.buckets set file_size_limit = 524288000, allowed_mime_types = array['video/mp4'] where id = 'motion-studio';
