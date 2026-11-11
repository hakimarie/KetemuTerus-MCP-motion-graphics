import { randomUUID } from "node:crypto";
import { getSupabase } from "@/lib/supabase";
import type { MotionBrief, MotionProject, MotionStatus } from "@/types/motion";

type ProjectRow = {
  id: string;
  title: string;
  brief: MotionBrief;
  status: MotionStatus;
  provider: string;
  provider_interaction_id: string | null;
  provider_file_uri: string | null;
  final_video_path: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
};

function mapRow(row: ProjectRow): MotionProject {
  return {
    id: row.id,
    title: row.title,
    brief: row.brief,
    status: row.status,
    provider: row.provider,
    providerInteractionId: row.provider_interaction_id,
    providerFileUri: row.provider_file_uri,
    finalVideoPath: row.final_video_path,
    errorMessage: row.error_message,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export async function createProject(brief: MotionBrief): Promise<MotionProject> {
  const now = new Date().toISOString();
  const row = {
    id: randomUUID(),
    title: brief.title,
    brief,
    status: "brief_created" as const,
    provider: "gemini-omni",
    created_at: now,
    updated_at: now
  };
  const { data, error } = await getSupabase()
    .from("motion_projects")
    .insert(row)
    .select("*")
    .single();
  if (error) throw new Error(`Could not create project: ${error.message}`);
  return mapRow(data as ProjectRow);
}

export async function getProject(id: string): Promise<MotionProject | null> {
  const { data, error } = await getSupabase()
    .from("motion_projects")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`Could not read project: ${error.message}`);
  return data ? mapRow(data as ProjectRow) : null;
}

export async function updateProject(
  id: string,
  patch: Partial<Pick<MotionProject, "status" | "providerInteractionId" | "providerFileUri" | "finalVideoPath" | "errorMessage">>
): Promise<MotionProject> {
  const dbPatch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.status !== undefined) dbPatch.status = patch.status;
  if (patch.providerInteractionId !== undefined) dbPatch.provider_interaction_id = patch.providerInteractionId;
  if (patch.providerFileUri !== undefined) dbPatch.provider_file_uri = patch.providerFileUri;
  if (patch.finalVideoPath !== undefined) dbPatch.final_video_path = patch.finalVideoPath;
  if (patch.errorMessage !== undefined) dbPatch.error_message = patch.errorMessage;

  const { data, error } = await getSupabase()
    .from("motion_projects")
    .update(dbPatch)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw new Error(`Could not update project: ${error.message}`);
  return mapRow(data as ProjectRow);
}

export async function listProjects(limit = 20): Promise<MotionProject[]> {
  const { data, error } = await getSupabase()
    .from("motion_projects")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`Could not list projects: ${error.message}`);
  return (data ?? []).map((row) => mapRow(row as ProjectRow));
}