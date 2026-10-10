import { useCallback, useEffect, useRef, useState } from "react";
import { useConversation } from "@elevenlabs/react";
import {
  getCandidateRoom, startCandidateRoom, getCandidateVoice, bindCandidateConversation,
  getCandidateSession, saveCandidateSnapshot, saveCandidateIntegrity, saveCandidateCommand,
  getSaveCandidateScreenshotUrl, submitCandidateRoom,
  type CandidateRoom, type RoomSession, type RoomCommandInput, type RoomIntegrityInput,
} from "@workspace/api-client-react";
import type { CandidateRoomController } from "@/lib/candidate-room-types";
import { AUDITION_MS, AUDITION_SECONDS, TECHNICAL_START_MS, WRAP_UP_MS } from "../../../../shared/audition-config";

type Task = { label: string; run: () => Promise<unknown> };
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const safeError = (error: unknown) => (error instanceof Error ? error.message : "Request failed.")
  .replace(/wss?:\/\/[^\s"<>]+/gi, "[voice connection]").slice(0, 1000);

/** SDK voice, evidence and deadlines all use the same server-anchored session clock. */
export function useCandidateAudition(token: string): CandidateRoomController {
  const [room, setRoom] = useState<CandidateRoom | null>(null);
  const [session, setSession] = useState<RoomSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notices, setNotices] = useState<string[]>([]);
  const [stage, setStageState] = useState<CandidateRoomController["stage"]>("ready");
  const [remainingSeconds, setRemaining] = useState(AUDITION_SECONDS);
  const [screenShared, setScreenShared] = useState(false);
  const [candidateName, setCandidateName] = useState("");
  const [candidateEmail, setCandidateEmail] = useState("");
  const [code, setCodeState] = useState("");
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [screenshotsSaved, setScreenshotsSaved] = useState(0);
  const [liveTranscript, setLiveTranscript] = useState<CandidateRoomController["liveTranscript"]>([]);
  const sessionRef = useRef<RoomSession | null>(null);
  const stageRef = useRef(stage);
  const offset = useRef(0);
  const codeRef = useRef("");
  const screen = useRef<MediaStream | null>(null);
  const video = useRef<HTMLVideoElement | null>(null);
  const finished = useRef(false);
  const finishing = useRef(false);
  const starting = useRef(false);
  const alive = useRef(true);
  const lastSlot = useRef(-1);
  const lastPageLeft = useRef(0);
  const autoFinishAttempted = useRef(false);
  const commandsSent = useRef(new Set<string>());
  const appTexts = useRef(new Set<string>());
  const pendingControls = useRef<{ text: string; delivery: string }[]>([]);
  const failedTasks = useRef<Task[]>([]);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const binding = useRef<Promise<unknown> | null>(null);
  const conversationId = useRef<string | null>(null);
  const speech = useRef<{ started: number; lastSound: number; checked: boolean } | null>(null);
  const vad = useRef<{ score: number; at: number } | null>(null);
  const finishContent = useRef<string | null>(null);
  const finishReason = useRef<"time_limit" | "finished_early" | "conversation_ended">("time_limit");
  const connectedAction = useRef<(id: string) => Promise<void>>(async () => {});
  const disconnectedAction = useRef<() => void>(() => {});
  const disconnectedSignal = useRef<(() => void) | null>(null);
  const notice = useCallback((text: string) => {
    if (alive.current) setNotices(previous => previous.includes(text) ? previous : [...previous.slice(-7), text]);
  }, []);
  const options = useCallback(() => ({
    headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(25_000),
  }), [token]);
  const setStage = (next: CandidateRoomController["stage"]) => {
    stageRef.current = next;
    if (alive.current) setStageState(next);
  };
  const elapsed = () => {
    const current = sessionRef.current;
    return current ? Math.max(0, Math.min(AUDITION_MS,
      Date.now() + offset.current - Date.parse(current.server_start_time))) : 0;
  };
  const applySession = (value: RoomSession, sentAt = Date.now()) => {
    const sameSession = sessionRef.current?.id === value.id;
    offset.current = Date.parse(value.server_now) - (sentAt + Date.now()) / 2;
    sessionRef.current = value;
    if (alive.current) {
      setSession(value);
      const seconds = Math.max(0, Math.ceil((Date.parse(value.deadline_at) - Date.now() - offset.current) / 1000));
      setRemaining(previous => sameSession ? Math.min(previous, seconds) : seconds);
    }
  };

  const conversation = useConversation({
    onConnect: ({ conversationId: id }) => { void connectedAction.current(id); },
    onDisconnect: () => disconnectedAction.current(),
    onError: message => {
      notice(`Voice connection: ${safeError(new Error(message))} The session clock does not stop.`);
    },
    onVadScore: ({ vadScore }) => { vad.current = { score: vadScore, at: Date.now() }; },
    onMessage: message => {
      if (!appTexts.current.has(message.message) && alive.current) {
        setLiveTranscript(previous => [...previous.slice(-99), { source: message.source, text: message.message }]);
      }
    },
  });
  const voice = useRef(conversation);
  voice.current = conversation;

  const runTask = async (task: Task) => {
    for (let attempt = 0; attempt < 3; attempt++) {
      try { await task.run(); return; }
      catch (failure) {
        if (attempt === 2) {
          failedTasks.current.push(task);
          notice(`${task.label} could not be saved: ${safeError(failure)}`);
          return;
        }
        await delay(400 * (attempt + 1));
      }
    }
  };
  const enqueue = (task: Task) => {
    queue.current = queue.current.then(() => runTask(task));
    return queue.current;
  };

  const sendCommand = async (kind: RoomCommandInput["kind"]) => {
    const current = sessionRef.current;
    if (!current || finished.current || elapsed() >= AUDITION_MS) return;
    const body: RoomCommandInput = { command_id: crypto.randomUUID(), kind };
    const immediate = {
      technical_start: "Start technical part", wrap_up: "Wrap up",
      time_check: "Time check: politely cut in and move on.",
    };
    const direct = immediate[kind as keyof typeof immediate];
    if (direct) {
      appTexts.current.add(direct);
      if (voice.current.status === "connected") voice.current.sendUserMessage(direct);
      else pendingControls.current.push({ text: direct, delivery: "user_message" });
    }
    return runTask({ label: "Interview control", run: async () => {
      const command = await saveCandidateCommand(current.id, body, options());
      appTexts.current.add(command.text);
      if (direct) return; // Timed controls do not wait behind evidence uploads.
      if (voice.current.status === "connected") {
        if (command.delivery === "contextual_update") voice.current.sendContextualUpdate(command.text);
        else voice.current.sendUserMessage(command.text);
      } else pendingControls.current.push(command);
    } });
  };

  const recordIntegrity = (type: RoomIntegrityInput["type"], characterCount?: number) => {
    const current = sessionRef.current;
    if (!current || stageRef.current !== "active" || finishing.current || finished.current) return;
    const body: RoomIntegrityInput = {
      event_id: crypto.randomUUID(), timestamp_ms: Math.round(elapsed()), type,
      ...(characterCount ? { character_count: characterCount } : {}),
    };
    // keepalive preserves small integrity writes during page navigation.
    void saveCandidateIntegrity(current.id, body, { ...options(), keepalive: true })
      .catch(failure => notice(`Integrity event could not be saved: ${safeError(failure)}`));
    if (type === "page_left" || type === "screen_share_stopped") {
      const text = type === "page_left" ? "The candidate left the audition page." : "The candidate stopped sharing their screen.";
      appTexts.current.add(text);
      if (voice.current.status === "connected") {
        try { voice.current.sendContextualUpdate(text); } catch { /* closing connection */ }
      }
      void saveCandidateCommand(current.id, { kind: type, command_id: crypto.randomUUID() }, {
        ...options(), keepalive: true,
      }).catch(failure => notice(`App context could not be recorded: ${safeError(failure)}`));
    }
  };

  const capture = async (slot: number) => {
    const current = sessionRef.current;
    if (!current || slot < 0 || slot > AUDITION_MS) return;
    const content = codeRef.current; // Capture NOW, never reconstruct missed earlier slots.
    void enqueue({ label: "Editor snapshot", run: async () => {
      await saveCandidateSnapshot(current.id, { timestamp_ms: slot, content }, options());
      if (alive.current) setLastSavedAt(Date.now());
    } });
    const source = video.current;
    if (slot < TECHNICAL_START_MS || !source || !screen.current?.getVideoTracks().some(track => track.readyState === "live")) return;
    try {
      if (!source.videoWidth || !source.videoHeight) throw new Error("The shared screen has no video frame.");
      const canvas = document.createElement("canvas");
      const ratio = Math.min(1, 1440 / source.videoWidth);
      canvas.width = Math.round(source.videoWidth * ratio);
      canvas.height = Math.round(source.videoHeight * ratio);
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Screen capture is not supported by this browser.");
      context.drawImage(source, 0, 0, canvas.width, canvas.height);
      const image = await new Promise<Blob>((resolve, reject) => canvas.toBlob(
        blob => blob ? resolve(blob) : reject(new Error("Screenshot encoding failed.")), "image/jpeg", 0.8));
      void enqueue({ label: "Private screenshot", run: async () => {
        const response = await fetch(getSaveCandidateScreenshotUrl(current.id, slot), {
          ...options(), method: "POST", headers: { ...options().headers, "Content-Type": "image/jpeg" }, body: image,
        });
        if (!response.ok) {
          const result = await response.json();
          throw new Error(result.message ?? `Screenshot upload HTTP ${response.status}`);
        }
        if (alive.current) setScreenshotsSaved(count => count + 1);
      } });
    } catch (failure) { notice(`Screenshot capture failed: ${safeError(failure)}`); }
  };

  const stopSharing = () => {
    screen.current?.getTracks().forEach(track => track.stop());
    screen.current = null;
    if (video.current) video.current.srcObject = null;
    video.current = null;
    if (alive.current) setScreenShared(false);
  };

  const finish = async (reason: "time_limit" | "finished_early" | "conversation_ended") => {
    const current = sessionRef.current;
    if (!current || finishing.current || finished.current) return;
    finishing.current = true;
    finishReason.current = reason;
    finishContent.current ??= codeRef.current;
    setStage("submitting");
    setError(null);
    try {
      // Stop microphone/conversation and the shared screen immediately at the deadline.
      const closing = voice.current.status === "connected" || voice.current.status === "connecting"
        ? new Promise<void>(resolve => { disconnectedSignal.current = resolve; }) : Promise.resolve();
      let end: unknown;
      try { end = voice.current.endSession(); } catch { /* already disconnected */ }
      stopSharing();
      await Promise.resolve(end).catch(failure => notice(`Voice shutdown: ${safeError(failure)}`));
      await Promise.race([closing, delay(3000)]);
      if (conversationId.current) {
        void bindCandidateConversation(current.id, { conversation_id: conversationId.current, ended: true }, {
          ...options(), keepalive: true,
        }).catch(failure => notice(`Conversation end could not be saved: ${safeError(failure)}`));
      }
      const sentAt = Date.now();
      let result: RoomSession | undefined;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          result = await submitCandidateRoom(current.id, {
            reason, editor_content: finishContent.current,
          }, options());
          break;
        } catch (failure) {
          // A small clock-estimation error cannot authorize an early time-limit submission.
          if (reason !== "time_limit" || (failure as { status?: number }).status !== 409 || attempt === 2) throw failure;
          await delay(600);
        }
      }
      if (!result) throw new Error("The submission was not confirmed by the server.");
      applySession(result, sentAt);
      finished.current = true;
      setStage("submitted");
      const retries = failedTasks.current.splice(0);
      for (const task of retries) void enqueue(task);
      const drained = await Promise.race([queue.current.then(() => true), delay(10_000).then(() => false)]);
      if (!drained) notice("Evidence uploads are still finishing. Keep this page open until the uploads complete.");
      if (failedTasks.current.length) notice("Some evidence could not be uploaded. The audition is submitted; no evidence has been fabricated.");
    } catch (failure) {
      if (alive.current) setError(`Submission needs retry: ${safeError(failure)} The timer cannot be restarted.`);
    } finally { finishing.current = false; }
  };
  const finishAction = useRef(finish);
  finishAction.current = finish;

  connectedAction.current = async id => {
    conversationId.current = id;
    const current = sessionRef.current;
    if (!current) return;
    binding.current = bindCandidateConversation(current.id, { conversation_id: id }, options())
      .catch(failure => notice(`Conversation ID could not be saved yet: ${safeError(failure)}`));
    await binding.current;
    if (finishing.current || finished.current || elapsed() >= AUDITION_MS) {
      await voice.current.endSession();
      return;
    }
    for (const control of pendingControls.current.splice(0)) {
      if (control.delivery === "contextual_update") voice.current.sendContextualUpdate(control.text);
      else voice.current.sendUserMessage(control.text);
    }
    void sendCommand("initial_context");
  };
  disconnectedAction.current = () => {
    disconnectedSignal.current?.();
    disconnectedSignal.current = null;
    const current = sessionRef.current;
    if (current && conversationId.current) void bindCandidateConversation(current.id, {
      conversation_id: conversationId.current, ended: true,
    }, { ...options(), keepalive: true }).catch(failure => notice(`Conversation end could not be recorded: ${safeError(failure)}`));
    if (stageRef.current === "active" && !finishing.current && !finished.current) {
      void finishAction.current("conversation_ended");
    }
  };

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    const sentAt = Date.now();
    try {
      const result = await getCandidateRoom(options());
      if (!alive.current) return;
      const alreadyActive = stageRef.current === "active" || stageRef.current === "submitting";
      setRoom(result);
      setScreenshotsSaved(result.screenshot_count);
      if (!alreadyActive) {
        setCandidateName(result.candidate.name === "Your name" ? "" : result.candidate.name);
        setCandidateEmail(result.candidate.email === "candidate-demo@example.test" ? "" : result.candidate.email);
        codeRef.current = result.editor_content;
        setCodeState(result.editor_content);
      }
      if (result.session && result.last_snapshot_ms !== null) {
        setLastSavedAt(Date.parse(result.session.server_start_time) + result.last_snapshot_ms);
      }
      if (result.session) {
        applySession(result.session, sentAt);
        conversationId.current = result.session.conversation_id;
        if (alreadyActive) {
          if (result.session.status === "Submitted") void finishAction.current(result.session.finish_reason ?? "time_limit");
        } else {
          finished.current = result.session.status === "Submitted";
          setStage(finished.current ? "submitted" : "active");
          if (!finished.current) notice("This audition has already started. Its timer continues; refreshing the page does not restart the interview.");
        }
      }
    } catch (failure) { if (alive.current) setError(safeError(failure)); }
    finally { if (alive.current) setLoading(false); }
  }, [options, notice]);

  useEffect(() => {
    alive.current = true;
    void reload();
    return () => { alive.current = false; screen.current?.getTracks().forEach(track => track.stop()); };
  }, [reload]);

  const start = async () => {
    if (starting.current || sessionRef.current) return;
    starting.current = true;
    setStage("starting");
    setError(null);
    try {
      if (!candidateName.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(candidateEmail.trim())) {
        throw new Error("Enter your name and a valid email address before starting.");
      }
      if (!navigator.mediaDevices?.getDisplayMedia) throw new Error("Use a desktop browser with entire-screen sharing support.");
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: { displaySurface: "monitor" }, audio: false });
      screen.current = stream;
      const track = stream.getVideoTracks()[0];
      if (!track || track.getSettings().displaySurface !== "monitor") {
        throw new Error("Share your entire screen, not a browser tab or application window. The audition has not started.");
      }
      track.addEventListener("ended", () => {
        if (alive.current) setScreenShared(false);
        if (!finishing.current && !finished.current && sessionRef.current) {
          recordIntegrity("screen_share_stopped");
          notice("Screen sharing stopped. The timer continues; the interruption has been recorded.");
        }
      });
      const microphone = await navigator.mediaDevices.getUserMedia({ audio: true });
      microphone.getTracks().forEach(input => input.stop());
      const display = document.createElement("video");
      display.muted = true; display.playsInline = true; display.srcObject = stream;
      await display.play();
      video.current = display;
      // Permission may have been withdrawn while the microphone prompt was open.
      if (track.readyState !== "live") throw new Error("Screen sharing stopped before the audition started. Try again.");
      setScreenShared(true);
      const sentAt = Date.now();
      const created = await startCandidateRoom({
        screen_surface: "monitor", candidate_name: candidateName.trim(), candidate_email: candidateEmail.trim(),
      }, options());
      applySession(created, sentAt);
      if (created.status === "Submitted") {
        finished.current = true; stopSharing(); setStage("submitted"); return;
      }
      setStage("active");
      setRoom(await getCandidateRoom(options()));
      const connection = await getCandidateVoice(created.id, options());
      if (elapsed() >= AUDITION_MS || finishing.current) return;
      voice.current.startSession({
        signedUrl: connection.signed_url, connectionType: "websocket",
        dynamicVariables: connection.dynamic_variables, userId: created.id,
      });
    } catch (failure) {
      if (sessionRef.current) {
        notice(`Voice could not start: ${safeError(failure)} The locked session timer continues.`);
        setStage("active");
      } else {
        stopSharing(); setStage("ready"); setError(safeError(failure));
      }
    } finally { starting.current = false; }
  };

  useEffect(() => {
    if (!session?.id || stage !== "active") return;
    const tick = () => {
      const time = elapsed();
      setRemaining(previous => Math.min(previous, Math.max(0, Math.ceil((AUDITION_MS - time) / 1000))));
      const slot = Math.floor(time / 10_000) * 10_000;
      if (slot > lastSlot.current) {
        if (lastSlot.current >= 0 && slot - lastSlot.current > 10_000) notice("The browser delayed evidence collection while the page was inactive. Missing frames are not reconstructed.");
        lastSlot.current = slot;
        void capture(slot);
      }
      if (time >= AUDITION_MS) {
        if (!autoFinishAttempted.current) { autoFinishAttempted.current = true; void finishAction.current("time_limit"); }
        return;
      }
      for (const [threshold, kind] of [[TECHNICAL_START_MS, "technical_start"], [WRAP_UP_MS, "wrap_up"]] as const) {
        if (time >= threshold && !commandsSent.current.has(kind)) {
          commandsSent.current.add(kind); void sendCommand(kind);
        }
      }
      if (voice.current.status !== "connected" || voice.current.isSpeaking) { speech.current = null; return; }
      const now = Date.now();
      const speaking = vad.current && now - vad.current.at < 1000
        ? vad.current.score >= 0.6 : voice.current.getInputVolume() > 0.08;
      if (speaking) {
        speech.current ??= { started: now, lastSound: now, checked: false };
        speech.current.lastSound = now;
      } else if (speech.current && now - speech.current.lastSound > 2000) speech.current = null;
      if (speech.current && !speech.current.checked && now - speech.current.started > 75_000) {
        speech.current.checked = true; void sendCommand("time_check");
      }
    };
    tick();
    const timer = setInterval(tick, 250);
    return () => clearInterval(timer);
  }, [session?.id, stage]);

  useEffect(() => {
    if (!session?.id) return;
    let pending = false;
    const timer = setInterval(async () => {
      if (pending || !alive.current || finishing.current) return;
      pending = true;
      try {
        const sentAt = Date.now();
        const latest = await getCandidateSession(session.id, options());
        applySession(latest, sentAt);
        if (latest.status === "Submitted" && stageRef.current === "active") void finishAction.current("time_limit");
      } catch (failure) { notice(`Session status could not be refreshed: ${safeError(failure)}`); }
      finally { pending = false; }
    }, 10_000);
    return () => clearInterval(timer);
  }, [session?.id, options, notice]);

  useEffect(() => {
    const pageLeft = () => {
      const now = Date.now();
      if (now - lastPageLeft.current < 500) return;
      lastPageLeft.current = now;
      recordIntegrity("page_left");
    };
    const visibility = () => { if (document.visibilityState === "hidden") pageLeft(); };
    const blur = () => recordIntegrity("window_blur");
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("pagehide", pageLeft);
    window.addEventListener("blur", blur);
    return () => {
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("pagehide", pageLeft);
      window.removeEventListener("blur", blur);
    };
  }, [session?.id, stage]);

  return {
    room, session, loading, error, notices, stage, remainingSeconds,
    phase: remainingSeconds <= AUDITION_SECONDS - TECHNICAL_START_MS / 1000 ? "Technical" : "Behavioral",
    voiceState: conversation.status === "connected" ? (conversation.isSpeaking ? "speaking" : "listening") :
      conversation.status === "connecting" ? "connecting" : "disconnected",
    screenShared, candidateName, candidateEmail, setCandidateName, setCandidateEmail,
    code, setCode: value => {
      if (value.length > 60_000) { notice("The editor limit is 60,000 characters."); return; }
      if (stageRef.current !== "active" || finished.current || elapsed() >= AUDITION_MS) return;
      codeRef.current = value; setCodeState(value);
    },
    onEditorKeyDown: () => { if (voice.current.status === "connected") {
      try { voice.current.sendUserActivity(); } catch { /* ended during this keystroke */ }
    } },
    onEditorPaste: text => { if (text.length > 50) recordIntegrity("large_paste", text.length); },
    lastSavedAt, screenshotsSaved, liveTranscript, start,
    finishEarly: () => finishAction.current("finished_early"),
    retrySubmission: () => finishAction.current(finishReason.current), reload,
  };
}
