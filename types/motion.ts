export type MotionStatus = "brief_created" | "generating" | "processing" | "completed" | "failed";
export type AspectRatio = "9:16" | "16:9";
export interface MotionBrief {
  title: string; objective: string; prompt: string;
  targetDurationSec: 15 | 30 | 45 | 60;
  aspectRatio: AspectRatio; resolution: "720p" | "1080p";
  tone?: string; musicMood?: string;
}
export interface MotionProject {
  id: string; title: string; brief: MotionBrief; status: MotionStatus; provider: string;
  providerInteractionId?: string | null; providerFileUri?: string | null;
  finalVideoPath?: string | null; errorMessage?: string | null;
  createdAt: string; updatedAt: string;
}
export interface MotionShot {
  id: string; projectId: string; shotIndex: number; durationSec: number; prompt: string;
  status: "queued" | "generating" | "processing" | "completed" | "failed";
  interactionId?: string | null; clipPath?: string | null; errorMessage?: string | null;
}