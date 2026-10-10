import type { CandidateRoom, RoomSession } from "@workspace/api-client-react";

export interface CandidateRoomController {
  room: CandidateRoom | null;
  session: RoomSession | null;
  loading: boolean;
  error: string | null;
  notices: string[];
  stage: "ready" | "starting" | "active" | "submitting" | "submitted";
  remainingSeconds: number;
  phase: "Behavioral" | "Technical";
  voiceState: "speaking" | "listening" | "connecting" | "disconnected";
  screenShared: boolean;
  candidateName: string;
  candidateEmail: string;
  setCandidateName: (value: string) => void;
  setCandidateEmail: (value: string) => void;
  code: string;
  setCode: (value: string) => void;
  onEditorKeyDown: () => void;
  onEditorPaste: (text: string) => void;
  lastSavedAt: number | null;
  screenshotsSaved: number;
  liveTranscript: { source: "user" | "ai"; text: string }[];
  start: () => Promise<void>;
  finishEarly: () => Promise<void>;
  retrySubmission: () => Promise<void>;
  reload: () => Promise<void>;
}
