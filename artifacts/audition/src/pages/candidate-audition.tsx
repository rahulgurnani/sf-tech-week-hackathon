import { useMemo, useState } from "react";
import { useParams } from "wouter";
import { ConversationProvider } from "@elevenlabs/react";
import {
  Activity, AlertCircle, ArrowRight, Check, Clock3, Code2, LockKeyhole,
  Mic2, Monitor, Radio, RotateCw, ShieldCheck, Sparkles, Square, Terminal,
} from "lucide-react";
import { useCandidateAudition } from "@/hooks/use-candidate-audition";
import type { CandidateRoomController } from "@/lib/candidate-room-types";
import "./candidate-audition.css";

function InviteRoute() {
  const { token = "" } = useParams<{ token: string }>();
  return <ConversationProvider><CandidateAudition token={token} /></ConversationProvider>;
}

function CandidateAudition({ token }: { token: string }) {
  const roomController: CandidateRoomController = useCandidateAudition(token);
  const {
    room, session, loading, error, notices, stage, remainingSeconds, phase,
    voiceState, screenShared, candidateName, candidateEmail, setCandidateName,
    setCandidateEmail, code, setCode, onEditorKeyDown, onEditorPaste,
    lastSavedAt, screenshotsSaved, liveTranscript, start, finishEarly,
    retrySubmission, reload,
  } = roomController;
  const [screenConsent, setScreenConsent] = useState(false);
  const [micConsent, setMicConsent] = useState(false);
  const [confirmFinish, setConfirmFinish] = useState(false);
  const audition = room?.audition;
  const candidate = room?.candidate;
  const technicalQuestion = useMemo(
    () => audition?.frozen_questions?.find((question) => question.phase === "Technical"),
    [audition?.frozen_questions],
  );
  const codeLines = code.split("\n").length;
  const time = `${Math.floor(Math.max(remainingSeconds, 0) / 60).toString().padStart(2, "0")}:${(Math.max(remainingSeconds, 0) % 60).toString().padStart(2, "0")}`;
  const isWorking = stage === "starting" || stage === "submitting";
  const canStart = screenConsent && micConsent && candidateName.trim().length > 0 && candidateEmail.trim().length > 0 && !isWorking;

  const handleStart = async () => {
    try { await start(); } catch { /* hook exposes the actionable error */ }
  };
  const handleFinish = async () => {
    setConfirmFinish(false);
    try { await finishEarly(); } catch { /* hook exposes the actionable error */ }
  };
  const handleRetrySubmission = async () => {
    try { await retrySubmission(); } catch { /* hook exposes the actionable error */ }
  };
  const displayTime = (stamp: number | null) => stamp
    ? new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(stamp)
    : null;

  return (
    <div className="candidate-audition">
      <div className="ca-shell">
        <aside className="ca-sidebar" aria-label="Audition navigation">
          <div className="ca-brand"><span className="ca-mark" aria-hidden="true" /><span>audition<small>fair skill signals</small></span></div>
          <div className="ca-side-label">Your audition</div>
          <div className="ca-side-link" aria-current="page"><Activity size={16} /><span>Audition room</span></div>
          <div className="ca-side-foot">Your responses are private to you and the hiring team.</div>
        </aside>
        <main className="ca-main">
          <header className="ca-topbar">
            <div className="ca-crumb">Auditions <span aria-hidden="true">/</span> <strong>{audition?.role || "Candidate room"}</strong></div>
            <div className="ca-org"><span className="ca-org-mark">{audition?.company?.slice(0, 1) || "A"}</span><span>{audition?.company || "Audition"}</span></div>
          </header>

          <div className="ca-content">
            {loading && !room ? <LoadingRoom /> : error && !room ? (
              <section className="ca-panel ca-error-page" role="alert">
                <div className="ca-spotlight" aria-hidden="true" />
                <div className="ca-overline">Invite unavailable</div>
                <h2>We couldn’t open this audition.</h2>
                <p>{error}</p>
                <button className="ca-secondary" onClick={() => void reload()}><RotateCw size={14} /> Try again</button>
              </section>
            ) : !room ? <LoadingRoom /> : (
              <>
                {error && <div className="ca-notice error" role="alert"><AlertCircle size={16} /><span><strong>There’s an issue with this session.</strong> {error}</span></div>}
                {!!notices.length && <div className="ca-notices" role="status" aria-live="polite">{notices.map((notice, index) => <div className="ca-notice" key={`${notice}-${index}`}><AlertCircle size={15} /><span>{notice}</span></div>)}</div>}
                <div className="ca-page-head">
                  <div>
                    <div className="ca-overline">{stage === "ready" ? "A fair, focused conversation" : stage === "submitted" ? "Audition submitted" : "Candidate room"}</div>
                    <h1>{candidateName || candidate?.name || "Your audition"} <span className="ca-company-pill">{audition.company}</span></h1>
                    <p>{audition.role} <span aria-hidden="true">·</span> Six-minute live voice audition</p>
                  </div>
                  {(stage === "active" || stage === "starting" || stage === "submitting") && session && (
                    <div className="ca-timer" aria-label={`${time} remaining`}><Clock3 size={16} /><strong>{time}</strong><span>remaining</span></div>
                  )}
                </div>

                {stage === "ready" && (
                  <ReadyStage
                    company={audition.company}
                    role={audition.role}
                    language={audition.editor_language}
                    jobDescription={audition.job_description}
                    candidateName={candidateName}
                    candidateEmail={candidateEmail}
                    setCandidateName={setCandidateName}
                    setCandidateEmail={setCandidateEmail}
                    screenConsent={screenConsent}
                    setScreenConsent={setScreenConsent}
                    micConsent={micConsent}
                    setMicConsent={setMicConsent}
                    canStart={canStart}
                    starting={stage === "starting"}
                    onStart={handleStart}
                  />
                )}

                {(stage === "active" || stage === "starting" || stage === "submitting") && (
                  <ActiveStage
                    company={audition.company}
                    language={audition.editor_language}
                    role={audition.role}
                    phase={phase}
                    time={time}
                    voiceState={voiceState}
                    screenShared={screenShared}
                    technicalQuestion={technicalQuestion}
                    code={code}
                    setCode={setCode}
                    onEditorKeyDown={onEditorKeyDown}
                    onEditorPaste={onEditorPaste}
                    lastSavedAt={lastSavedAt}
                    screenshotsSaved={screenshotsSaved}
                    liveTranscript={liveTranscript}
                    running={isWorking}
                    canFinish={stage === "active"}
                    onFinish={() => setConfirmFinish(true)}
                    onRetry={reload}
                  />
                )}

                {stage === "submitted" && (
                  <SubmittedStage
                    session={session}
                    retrySubmission={handleRetrySubmission}
                    submitting={false}
                  />
                )}
              </>
            )}
          </div>
        </main>
      </div>
      {confirmFinish && (
        <div className="ca-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setConfirmFinish(false); }}>
          <section className="ca-modal" role="dialog" aria-modal="true" aria-labelledby="ca-finish-title" aria-describedby="ca-finish-copy">
            <h2 id="ca-finish-title">Finish your audition early?</h2>
            <p id="ca-finish-copy">Your audition will end immediately and cannot be restarted. The time remaining and unanswered questions will not be restored. The timer keeps counting down while this confirmation is open.</p>
            <div className="ca-modal-actions">
              <button className="ca-secondary" onClick={() => setConfirmFinish(false)}>Keep going</button>
              <button className="ca-danger" onClick={() => void handleFinish()}><Square size={12} fill="currentColor" /> Finish early</button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

function LoadingRoom() {
  return <section className="ca-panel ca-skeleton" aria-label="Loading your audition" aria-busy="true">
    <div className="ca-skeleton-line" /><div className="ca-skeleton-line large" /><div className="ca-skeleton-line" /><div className="ca-skeleton-card" />
  </section>;
}

type ReadyStageProps = {
  company: string;
  role: string;
  language: string;
  jobDescription: string;
  candidateName: string;
  candidateEmail: string;
  setCandidateName: (value: string) => void;
  setCandidateEmail: (value: string) => void;
  screenConsent: boolean;
  setScreenConsent: (value: boolean) => void;
  micConsent: boolean;
  setMicConsent: (value: boolean) => void;
  canStart: boolean;
  starting: boolean;
  onStart: () => void;
};

function ReadyStage(props: ReadyStageProps) {
  return <>
    <div className="ca-notice"><Sparkles size={16} /><span><strong>A calm, consistent six minutes.</strong> The questions are frozen before the interview and the technical workspace is prepared for your role.</span></div>
    <div className="ca-ready-grid">
      <section className="ca-panel ca-ready-main">
        <div className="ca-spotlight" aria-hidden="true" />
        <div className="ca-overline">Before you begin</div>
        <h2>Settle in. This is your time.</h2>
        <p className="ca-lede">You’ll have a short live voice conversation, then a focused coding task. A human on the hiring team will review the session before making a decision.</p>
        <div className="ca-field-grid">
          <div className="ca-field"><label htmlFor="candidate-name">Your name</label><input id="candidate-name" autoComplete="name" value={props.candidateName} onChange={(event) => props.setCandidateName(event.target.value)} /></div>
          <div className="ca-field"><label htmlFor="candidate-email">Email address</label><input id="candidate-email" type="email" autoComplete="email" value={props.candidateEmail} onChange={(event) => props.setCandidateEmail(event.target.value)} /></div>
        </div>
        <label className="ca-check"><input type="checkbox" checked={props.screenConsent} onChange={(event) => props.setScreenConsent(event.target.checked)} /><span>I understand the interview requires sharing my entire screen. Private technical screenshots are captured every 10 seconds for the hiring team’s review.</span></label>
        <label className="ca-check"><input type="checkbox" checked={props.micConsent} onChange={(event) => props.setMicConsent(event.target.checked)} /><span>I consent to microphone access for the live voice interview and understand that my spoken responses may be transcribed.</span></label>
        <div className="ca-ready-actions">
          <button className="ca-primary" disabled={!props.canStart} onClick={props.onStart}>{props.starting ? <><span className="ca-spinner" aria-hidden="true" /> Connecting…</> : <>Check permissions &amp; begin <ArrowRight size={14} /></>}</button>
          <span className="ca-meta-label">6 minutes · cannot pause</span>
        </div>
        <div className="ca-browser-note"><Monitor size={16} /><span><strong>For the smoothest setup, open this invite in a separate desktop Chrome tab.</strong> You’ll need to allow screen sharing and microphone access when your browser asks.</span></div>
      </section>
      <aside className="ca-panel ca-setup-aside">
        <h3>Your audition details</h3>
        <div className="ca-detail-row"><div className="ca-detail-icon"><Clock3 size={15} /></div><div><b>Six minutes, one continuous session</b><span>The timer starts when the session begins and continues if you leave this page.</span></div></div>
        <div className="ca-detail-row"><div className="ca-detail-icon"><Mic2 size={15} /></div><div><b>Voice conversation</b><span>Answer naturally. You can speak at your own pace while the interviewer listens.</span></div></div>
        <div className="ca-detail-row"><div className="ca-detail-icon"><Code2 size={15} /></div><div><b>Technical workspace · {props.language}</b><span>{props.jobDescription || `A coding exercise prepared for your ${props.role} interview.`}</span></div></div>
        <div className="ca-timeline"><span>Conversation</span><span className="ca-timeline-bar"><i /><i /></span><span>Code</span></div>
      </aside>
    </div>
  </>;
}

type TranscriptItem = { source: "user" | "ai"; text: string };
type ActiveStageProps = {
  company: string;
  language: string;
  role: string;
  phase: "Behavioral" | "Technical";
  time: string;
  voiceState: "speaking" | "listening" | "connecting" | "disconnected";
  screenShared: boolean;
  technicalQuestion?: { phase: string; position: number; prompt: string; requirement: string; time_limit_seconds: number };
  code: string;
  setCode: (value: string) => void;
  onEditorKeyDown: () => void;
  onEditorPaste: (text: string) => void;
  lastSavedAt: number | null;
  screenshotsSaved: number;
  liveTranscript: TranscriptItem[];
  running: boolean;
  canFinish: boolean;
  onFinish: () => void;
  onRetry: () => void;
};

function ActiveStage(props: ActiveStageProps) {
  const voiceLabel: Record<ActiveStageProps["voiceState"], string> = {
    speaking: "Interviewer is speaking",
    listening: "Listening to you",
    connecting: "Connecting to voice",
    disconnected: "Voice disconnected",
  };
  const voiceDetail: Record<ActiveStageProps["voiceState"], string> = {
    speaking: "A question is being read aloud. Take a moment, then answer in your own words.",
    listening: "Your voice connection is active. Take your time; your answer is being captured.",
    connecting: "Restoring the live voice connection. The audition timer continues.",
    disconnected: "The voice connection has ended. The session remains in progress and cannot be restarted.",
  };
  const saved = props.lastSavedAt ? new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit", second: "2-digit" }).format(props.lastSavedAt) : null;
  return <>
    <div className="ca-active-top" role="status">
      <div className="ca-capture-left"><span className="ca-record-dot" /><b>Audition in progress</b>{props.screenShared ? <span className="ca-screen-chip">Entire screen shared</span> : <span>Screen sharing stopped</span>}</div>
      <div className="ca-capture-right"><span className="ca-secure"><ShieldCheck size={14} /> Private to you and {props.company}</span><span>{props.screenshotsSaved} private screenshots saved</span></div>
    </div>
    {!props.screenShared && <div className="ca-notice error" role="alert"><AlertCircle size={16} /><span><strong>Screen sharing stopped.</strong> The technical workspace may no longer be visible to the hiring team. Use your browser’s share controls to restore sharing if available; the timer cannot pause or restart.</span><button className="ca-secondary" onClick={props.onRetry}>Check session</button></div>}
    {props.voiceState === "disconnected" && <div className="ca-notice warning" role="alert"><AlertCircle size={16} /><span><strong>Voice disconnected.</strong> The audition timer is still running. This active session cannot be restarted; continue in the workspace or finish early.</span></div>}
    {props.running && <div className="ca-notice" role="status"><RotateCw size={15} /><span>{props.time} remains. Your session is being finalized; please keep this page open.</span></div>}
    <div className="ca-session-meta">
      <div className="ca-phase-pills" aria-label={`Display-only current phase: ${props.phase}`}><span className={props.phase === "Behavioral" ? "selected" : ""}>Behavioral</span><span className={props.phase === "Technical" ? "selected" : ""}>Technical</span></div>
      <span className="ca-meta-label">Display only · fixed interview sequence</span>
    </div>
    <div className="ca-standard-note"><LockKeyhole size={13} /> Questions and time limits are the same for every candidate.</div>
    <section className="ca-workbench" aria-label="Live audition workspace">
      <div className="ca-left-stack">
        <section className="ca-panel ca-voice">
          <div className="ca-voice-head"><div><div className="ca-overline">Audition room</div><h2>One question at a time.</h2></div><Radio size={16} color={props.voiceState === "disconnected" ? "#b85c55" : "#4b9d91"} aria-hidden="true" /></div>
          <div className={`ca-orb-wrap ${props.voiceState === "speaking" ? "speaking" : ""} ${props.voiceState === "disconnected" ? "disconnected" : ""}`} aria-hidden="true"><div className="ca-orb-halo" /><div className="ca-orb"><span /><i /><b /></div></div>
          <div className="ca-voice-state" aria-live="polite"><span className="ca-voice-pulse" />{voiceLabel[props.voiceState]}</div>
          <p className="ca-voice-note">{voiceDetail[props.voiceState]}</p>
          <div className="ca-live-transcript">
            <div className="ca-live-transcript-head"><span>Live transcript</span><span>Only when available</span></div>
            {props.liveTranscript.length ? <div className="ca-transcript-list" aria-live="polite">{props.liveTranscript.map((item, index) => <div className="ca-transcript-line" key={`${item.source}-${index}`}><b>{item.source === "user" ? "You" : "Interviewer"}</b>{item.text}</div>)}</div> : <div className="ca-transcript-empty">Transcript will appear here as it becomes available.</div>}
          </div>
        </section>
        {props.phase === "Technical" && props.technicalQuestion && <section className="ca-panel ca-question">
          <div className="ca-overline">Technical challenge · Question {props.technicalQuestion.position}</div>
          <h3>{props.technicalQuestion.prompt}</h3>
          <div className="ca-requirement"><span className="ca-requirement-icon"><Code2 size={14} /></span><span><b>Requirement</b><small>{props.technicalQuestion.requirement}</small></span></div>
          <div className="ca-timeline"><span><Clock3 size={13} /> {Math.floor(props.technicalQuestion.time_limit_seconds / 60)}:{String(props.technicalQuestion.time_limit_seconds % 60).padStart(2, "0")} allotted</span><span>Ends with audition</span></div>
        </section>}
        {props.phase === "Behavioral" && <section className="ca-panel ca-question"><div className="ca-overline">Conversation</div><h3>Listen, then respond in your own words.</h3><p>There’s no need to rush. Speak clearly and share the context that helps explain your thinking.</p></section>}
      </div>
      <section className="ca-panel ca-editor" aria-label="Code editor">
        <div className="ca-editor-top"><div className="ca-editor-title"><Terminal size={15} /><span>Solution</span><span className="ca-file-name">solution</span></div><span className="ca-fixed-language"><LockKeyhole size={12} />{props.language} · Set by {props.company}</span></div>
        <div className="ca-editor-sub"><span>{props.role} workspace · <b>{props.language}</b></span><span>Editable workspace</span></div>
        <div className="ca-code-frame"><div className="ca-lines" aria-hidden="true">{Array.from({ length: codeLines }, (_, index) => <span key={index}>{index + 1}</span>)}</div><textarea aria-label="Code editor" spellCheck={false} value={props.code} onChange={(event) => props.setCode(event.target.value)} onKeyDown={() => props.onEditorKeyDown()} onPaste={(event) => { const pasted = event.clipboardData.getData("text"); if (pasted.length > 50) props.onEditorPaste(pasted); }} /></div>
        <div className="ca-editor-foot"><span className="ca-save-state"><span className="ca-save-dot" />{saved ? `Saved at ${saved}` : "Waiting for first save"}</span><span className="ca-workspace-private"><LockKeyhole size={12} />Private workspace · {props.screenshotsSaved} screenshots</span></div>
      </section>
    </section>
    <footer className="ca-room-footer"><div><ShieldCheck size={14} /> Session is private to you and the hiring team.</div>{props.canFinish && <button className="ca-danger" onClick={props.onFinish}><Square size={12} fill="currentColor" /> Finish early</button>}</footer>
  </>;
}

function SubmittedStage({ session, retrySubmission, submitting }: { session: CandidateRoomController["session"]; retrySubmission: () => void; submitting: boolean }) {
  const transcriptStatus = session?.transcript_status;
  const transcriptCopy = transcriptStatus === "ready"
    ? "Your transcript is ready for the hiring team."
    : transcriptStatus === "error"
      ? session?.transcript_error || "We couldn’t prepare the transcript yet."
      : transcriptStatus === "not_started"
        ? "Transcript processing has not started yet."
        : "The transcript is being prepared. This page will update when it’s ready.";
  const transcriptError = transcriptStatus === "error";
  return <section className="ca-panel ca-complete" role="status">
    <div className="ca-spotlight" aria-hidden="true" />
    <div className="ca-overline">Session submitted</div>
    <h2>Your audition is complete.</h2>
    <p>This session has ended and cannot be restarted. The hiring team will review your responses before deciding on next steps.</p>
    <p>{session?.finish_reason === "finished_early" ? "You chose to finish before the time limit." : session?.finish_reason === "time_limit" ? "The six-minute time limit was reached." : "Your responses have been submitted."}</p>
    <div className={`ca-complete-state ${transcriptError ? "error" : ""}`}><span className={transcriptStatus === "pending" ? "ca-spinner" : ""} aria-hidden="true" />{transcriptCopy}</div>
    {transcriptError && <p className="ca-meta-label">Your submission remains saved. The transcript service reported an issue.</p>}
    <button className="ca-secondary" style={{ marginTop: 16 }} disabled={submitting} onClick={retrySubmission}><RotateCw size={14} /> {submitting ? "Retrying…" : "Retry submission"}</button>
  </section>;
}

export default InviteRoute;
