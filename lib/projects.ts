import { randomUUID } from "node:crypto";
import { getSupabase } from "@/lib/supabase";
import type { MotionBrief, MotionProject, MotionStatus, MotionShot } from "@/types/motion";

type ProjectRow = {
  id:string; title:string; brief:MotionBrief; status:MotionStatus; provider:string;
  provider_interaction_id:string|null; provider_file_uri:string|null; final_video_path:string|null;
  error_message:string|null; created_at:string; updated_at:string;
};
type ShotRow = {
  id:string; project_id:string; shot_index:number; duration_sec:number; prompt:string; status:MotionShot["status"];
  provider_interaction_id:string|null; clip_path:string|null; error_message:string|null;
};
function mapRow(row:ProjectRow):MotionProject {
 return {id:row.id,title:row.title,brief:row.brief,status:row.status,provider:row.provider,
 providerInteractionId:row.provider_interaction_id,providerFileUri:row.provider_file_uri,
 finalVideoPath:row.final_video_path,errorMessage:row.error_message,createdAt:row.created_at,updatedAt:row.updated_at};
}
function mapShot(row:ShotRow):MotionShot {
 return {id:row.id,projectId:row.project_id,shotIndex:row.shot_index,durationSec:row.duration_sec,prompt:row.prompt,
 status:row.status,interactionId:row.provider_interaction_id,clipPath:row.clip_path,errorMessage:row.error_message};
}
export async function createProject(brief:MotionBrief):Promise<MotionProject>{
 const now=new Date().toISOString(), row={id:randomUUID(),title:brief.title,brief,status:"brief_created" as const,provider:"gemini-omni",created_at:now,updated_at:now};
 const {data,error}=await getSupabase().from("motion_projects").insert(row).select("*").single();
 if(error)throw new Error(`Could not create project: ${error.message}`);
 return mapRow(data as ProjectRow);
}
export async function getProject(id:string):Promise<MotionProject|null>{
 const {data,error}=await getSupabase().from("motion_projects").select("*").eq("id",id).maybeSingle();
 if(error)throw new Error(`Could not read project: ${error.message}`);
 return data?mapRow(data as ProjectRow):null;
}
export async function updateProject(id:string,patch:Partial<Pick<MotionProject,"status"|"providerInteractionId"|"providerFileUri"|"finalVideoPath"|"errorMessage">>):Promise<MotionProject>{
 const p:Record<string,unknown>={updated_at:new Date().toISOString()};
 if(patch.status!==undefined)p.status=patch.status;
 if(patch.providerInteractionId!==undefined)p.provider_interaction_id=patch.providerInteractionId;
 if(patch.providerFileUri!==undefined)p.provider_file_uri=patch.providerFileUri;
 if(patch.finalVideoPath!==undefined)p.final_video_path=patch.finalVideoPath;
 if(patch.errorMessage!==undefined)p.error_message=patch.errorMessage;
 const {data,error}=await getSupabase().from("motion_projects").update(p).eq("id",id).select("*").single();
 if(error)throw new Error(`Could not update project: ${error.message}`);
 return mapRow(data as ProjectRow);
}
export async function createShots(projectId:string,shots:Array<{shotIndex:number;durationSec:number;prompt:string}>):Promise<MotionShot[]>{
 const rows=shots.map(s=>({project_id:projectId,shot_index:s.shotIndex,duration_sec:s.durationSec,prompt:s.prompt,status:"queued"}));
 const {data,error}=await getSupabase().from("motion_shots").insert(rows).select("*");
 if(error)throw new Error(`Could not create shot records: ${error.message}`);
 return (data??[]).map(x=>mapShot(x as ShotRow));
}
export async function listShots(projectId:string):Promise<MotionShot[]>{
 const {data,error}=await getSupabase().from("motion_shots").select("*").eq("project_id",projectId).order("shot_index");
 if(error)throw new Error(`Could not list shots: ${error.message}`);
 return (data??[]).map(x=>mapShot(x as ShotRow));
}
export async function updateShot(id:string,patch:Partial<Pick<MotionShot,"status"|"interactionId"|"clipPath"|"errorMessage">>):Promise<void>{
 const p:Record<string,unknown>={updated_at:new Date().toISOString()};
 if(patch.status!==undefined)p.status=patch.status;
 if(patch.interactionId!==undefined)p.provider_interaction_id=patch.interactionId;
 if(patch.clipPath!==undefined)p.clip_path=patch.clipPath;
 if(patch.errorMessage!==undefined)p.error_message=patch.errorMessage;
 const {error}=await getSupabase().from("motion_shots").update(p).eq("id",id);
 if(error)throw new Error(`Could not update shot: ${error.message}`);
}
export async function listProjects(limit=20):Promise<MotionProject[]>{
 const {data,error}=await getSupabase().from("motion_projects").select("*").order("created_at",{ascending:false}).limit(limit);
 if(error)throw new Error(`Could not list projects: ${error.message}`);
 return (data??[]).map(x=>mapRow(x as ProjectRow));
}