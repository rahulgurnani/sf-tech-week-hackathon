import { pgEnum } from "drizzle-orm/pg-core";

export const auditionPhase = pgEnum("audition_phase", ["Behavioral", "Technical"]);
export const candidateStatus = pgEnum("candidate_status", ["Invited", "In progress", "Submitted", "Analyzed"]);
export const sessionStatus = pgEnum("session_status", ["In progress", "Submitted"]);
export const integrityEventType = pgEnum("integrity_event_type", ["page_left", "large_paste", "screen_share_stopped"]);
export const transcriptSpeaker = pgEnum("transcript_speaker", ["candidate", "interviewer"]);
