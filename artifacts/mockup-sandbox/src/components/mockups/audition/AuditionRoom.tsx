import React, { useEffect, useState } from "react";
import "./_group.css";
import { Chrome } from "./_shared/Chrome";
import { ArrowLeft, CircleHelp, Clock3, Code2, LockKeyhole, Radio, ShieldCheck, Sparkles, Square, Terminal } from "lucide-react";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog";

const starter = `import { db } from "./db";

type WebhookEvent = {
  id: string;
  eventType: string;
  payload: unknown;
};

export async function ingestWebhook(event: WebhookEvent) {
  // TODO: make ingestion safe to retry
  await db.query(
    "INSERT INTO webhook_events (id, event_type, payload) VALUES ($1, $2, $3)",
    [event.id, event.eventType, event.payload]
  );

  return { accepted: true };
}`;

export function AuditionRoom() {
  const [deadline] = useState(() => {
    const saved = Number(sessionStorage.getItem("audition-demo-deadline"));
    if (saved > 0) return saved;
    // The preview opens 1:48 into the standardized six-minute audition.
    const next = Date.now() + (4 * 60 + 12) * 1000;
    sessionStorage.setItem("audition-demo-deadline", String(next));
    return next;
  });
  const [seconds, setSeconds] = useState(() => Math.max(0, Math.ceil((deadline - Date.now()) / 1000)));
  const [code, setCode] = useState(starter);
  const language = "TypeScript";
  const [ended, setEnded] = useState(() => sessionStorage.getItem("audition-demo-finished") === "true");
  const [confirmFinish, setConfirmFinish] = useState(false);
  const completed = ended || seconds === 0;
  const phase = seconds > 3 * 60 ? "Behavioral" : "Technical";
  const speaking = seconds % 24 >= 16;

  useEffect(() => {
    if (ended) return;
    const timer = window.setInterval(() => {
      const remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setSeconds((previous) => Math.min(previous, remaining));
      if (remaining === 0) {
        sessionStorage.setItem("audition-demo-finished", "expired");
        setConfirmFinish(false);
        window.clearInterval(timer);
      }
    }, 250);
    return () => window.clearInterval(timer);
  }, [deadline, ended]);
  const finishEarly = () => {
    sessionStorage.setItem("audition-demo-finished", "true");
    setEnded(true);
    setConfirmFinish(false);
  };
  const time = `${Math.floor(seconds / 60).toString().padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`;
  const lines = code.split("\n");

  return <Chrome active="room" crumb="Alex Morgan">
    <div className="screen-pad room">
      <div className="room-head">
        <div><div className="back-link"><ArrowLeft size={14}/> Your audition</div>
          <div className="candidate-line"><div className="candidate-avatar">AM</div><div><h1>Alex Morgan <span className="company-tag">Northstar</span></h1><p>Backend Engineer audition <span>·</span> 6-minute audition <span>·</span> Session 08-241</p></div></div>
        </div>
        <div className="room-meta">
          <div className="phase-switch" aria-label={`Current phase: ${completed ? "Complete" : phase}`}><span className={phase === "Behavioral" ? "selected" : ""}>Behavioral</span><span className={phase === "Technical" ? "selected" : ""}>Technical</span></div>
          <div className="time-block"><Clock3 size={15}/><strong>{time}</strong><span>{completed ? "finished" : "remaining"}</span></div>
        </div>
      </div>
      <div className="room-status"><div className="capture-status"><span>{!completed && <span className="rec-dot"/>}<b>{completed ? "Recording complete" : "Recording"}</b></span>{!completed && <span className="screen-share-chip"><span className="share-dot"/>Screen shared: entire screen</span>}<span>Encrypted and private</span></div><div className="secure"><ShieldCheck size={14}/> Candidate can request a human review</div></div>
      <div className="standard-note"><LockKeyhole size={13}/> Questions and time limits are the same for every candidate.</div>

      {completed ? <section className="completion-card panel" role="status"><div className="spotlight"/><h2>{ended ? "Audition finished early" : "Your audition is complete"}</h2><p>{ended ? "You chose to finish before the time limit." : "The six-minute time limit has been reached."} This audition cannot be restarted.</p><p>The hiring team will review your responses.</p><small>Design preview · no live interview submission</small></section> : phase === "Behavioral" ? <section className="behavior-card panel">
        <div className="behavior-left">
          <div className={`orb-wrap ${speaking ? "is-speaking" : "is-listening"}`}><div className="orb-halo"/><div className="voice-orb"><span/><i/><b/></div></div>
          <div className="voice-state"><span className="voice-pulse"/>{speaking ? "Audition is speaking" : "Listening to Alex"}</div>
          <p className="voice-note">{speaking ? "A question is being read aloud." : "Take your time. Your answer is being captured."}</p>
        </div>
        <div className="behavior-prompt"><div className="eyebrow">Behavioral · Ownership</div><h2>Tell me about a time you made a system more reliable.</h2><p>What did you notice, what did you change, and how did you know it worked?</p>
          <div className="transcript-card"><span className="eyebrow">Live transcript</span><blockquote>“We had duplicate delivery from a partner during a deploy. I traced it to a retry path that treated a timeout as a hard failure. I added an idempotency key at the boundary, then watched duplicate writes in our event logs drop to zero over the next week.”</blockquote><span className="transcript-time">01:32 <span>·</span> Alex Morgan</span></div>
          <div className="prompt-foot"><span><Sparkles size={13}/> Standardized question · Ownership</span><span>Technical begins at 03:00 remaining</span></div>
        </div>
      </section> : <section className="workbench">
        <div className="left-column">
          <div className="voice-card panel">
            <div className="voice-heading"><div><div className="eyebrow">Audition room</div><h2>One question at a time.</h2></div><button className="help-button" aria-label="Question guidance"><CircleHelp size={16}/></button></div>
            <div className={`orb-wrap ${speaking ? "is-speaking" : "is-listening"}`}><div className="orb-halo"/><div className="voice-orb"><span/><i/><b/></div></div>
            <div className="voice-state"><span className="voice-pulse"/>{speaking ? "Audition is speaking" : "Listening to Alex"}</div>
            <p className="voice-note">{speaking ? "Reading the prompt aloud. You can interrupt at any time." : "Alex is working through the technical challenge."}</p>
          </div>
          <div className="question-card panel">
            <div className="eyebrow">Technical challenge <span className="difficulty">· Backend systems</span></div>
            <h3>Idempotent webhook ingestion</h3>
            <p>Design an ingestion function for a webhook provider that may retry deliveries. Persist each event once, even under concurrent requests.</p>
            <div className="requirement"><span className="requirement-icon"><Code2 size={14}/></span><span><b>Consider</b><small>Database constraints, transaction boundaries, and retry behavior</small></span></div>
            <div className="challenge-footer"><span><Clock3 size={13}/> No trick questions</span><span>Ends at 00:00</span></div>
          </div>
        </div>
        <div className="editor panel">
          <div className="editor-top"><div className="editor-title"><Terminal size={15}/><span>Solution</span><span className="file-name">webhook.ts</span></div><span className="fixed-language"><LockKeyhole size={12}/>{language} · Set by Northstar</span></div>
          <div className="editor-sub"><span>Webhook ingestion · <b>{language}</b></span><span className="edit-hint">Editable workspace</span></div>
          <div className="code-area"><div className="line-numbers">{lines.map((_, i) => <span key={i}>{i + 1}</span>)}</div><textarea spellCheck={false} aria-label="Code editor" value={code} onChange={(e) => setCode(e.target.value)} /></div>
          <div className="editor-bottom"><span className="saved-state"><span/> Changes saved locally</span></div>
        </div>
      </section>}
      <div className="room-footer"><div><Radio size={14}/> <span>Session is private to Alex and the hiring team</span></div>{!completed && <button className="end-session" onClick={() => setConfirmFinish(true)}><Square size={12} fill="currentColor"/>Finish early</button>}</div>
    </div>
    <AlertDialog open={confirmFinish && !completed} onOpenChange={setConfirmFinish}>
      <AlertDialogContent style={{fontFamily:"Inter, sans-serif"}}>
        <AlertDialogHeader>
          <AlertDialogTitle>Finish your audition early?</AlertDialogTitle>
          <AlertDialogDescription>Your audition will end immediately and cannot be restarted. The time remaining and unanswered questions will not be restored. The timer keeps counting down while this dialog is open.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep going</AlertDialogCancel>
          <AlertDialogAction onClick={finishEarly} style={{background:"#188e87"}}>Finish early</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    <style>{`
      .room { max-width:1520px; padding-top:23px; }
      .room-head { display:flex;justify-content:space-between;align-items:flex-end;gap:20px;margin-bottom:19px; }
      .back-link { border:0;background:none;color:#718294;padding:0;display:flex;align-items:center;gap:6px;font-size:11px;margin-bottom:15px; }
      .candidate-line{display:flex;align-items:center;gap:12px}.candidate-avatar{display:grid;place-items:center;width:42px;height:42px;border-radius:12px;background:#dcefeb;color:#286d69;font-weight:700;font-size:13px}
      .candidate-line h1{font-size:19px;letter-spacing:-.55px;margin:0;color:#23394d;font-weight:650}.candidate-line p{font-size:11px;margin:5px 0 0;color:#81909e}.candidate-line p span{padding:0 5px}
      .company-tag{font-size:9px;vertical-align:middle;margin-left:6px;background:#f0f4f6;color:#607485;padding:4px 7px;border-radius:5px;letter-spacing:0;font-weight:500}
      .room-meta{display:flex;align-items:center;gap:12px}.phase-switch{display:flex;background:#eff3f5;padding:3px;border-radius:8px}.phase-switch button{border:0;background:none;padding:7px 10px;border-radius:6px;color:#778797;font-size:10px}.phase-switch button.selected{background:#fff;box-shadow:0 1px 3px #1932491a;color:#334b60;font-weight:600}
      .time-block{display:flex;align-items:center;gap:7px;color:#788896;padding:0 9px}.time-block strong{font-family:'DM Mono',monospace;color:#304558;font-size:14px;font-weight:500}.time-block span{font-size:10px}
      .icon-btn{width:31px;height:31px;border:1px solid var(--line);background:#fff;border-radius:7px;display:grid;place-items:center;color:#718394}
      .room-status{display:flex;justify-content:space-between;align-items:center;background:#eaf5f3;border:1px solid #d8ebe7;padding:10px 14px;border-radius:8px;margin-bottom:17px;color:#56756f;font-size:10px}.room-status b{font-weight:600;color:#376e69}.rec-dot{display:inline-block;width:7px;height:7px;background:#de756c;border-radius:50%;margin-right:7px;animation:rec 1.7s ease-in-out infinite}.status-divider{padding:0 7px;color:#9ab6b1}.secure{display:flex;align-items:center;gap:6px;color:#70918c}
      .workbench{display:grid;grid-template-columns:minmax(275px,.78fr) minmax(470px,1.5fr);gap:16px;align-items:stretch}.left-column{display:flex;flex-direction:column;gap:14px;min-width:0}
      .voice-card{padding:16px 18px 15px;text-align:center;position:relative;overflow:hidden;background:radial-gradient(ellipse at 50% 42%,#f0fbf9 0%,#fff 61%)}.voice-heading{display:flex;justify-content:space-between;text-align:left;align-items:flex-start}.voice-heading h2{font-size:15px;letter-spacing:-.3px;margin:6px 0 0;font-weight:600}.help-button{border:0;background:none;color:#9aa8b4}
      .orb-wrap{width:148px;height:148px;margin:3px auto -2px;position:relative;display:grid;place-items:center}.orb-halo{position:absolute;inset:13px;border-radius:50%;border:1px solid rgba(33,158,150,.19);box-shadow:0 0 0 9px rgba(61,180,169,.035),0 0 0 21px rgba(61,180,169,.025);animation:orbit 7s linear infinite}.voice-orb{width:94px;height:94px;border-radius:50%;position:relative;overflow:hidden;background:radial-gradient(circle at 32% 26%,#d4fff8 0 5%,#91e5d6 15%,#33b8aa 42%,#138c87 68%,#126d75 100%);box-shadow:inset -9px -12px 23px rgba(7,73,83,.24),inset 8px 6px 15px rgba(255,255,255,.48),0 10px 25px rgba(22,141,134,.2);animation:orb-breathe 3.2s ease-in-out infinite}
      .voice-orb:before{content:'';position:absolute;width:70px;height:23px;border-radius:50%;background:rgba(228,255,250,.26);top:13px;left:12px;filter:blur(7px);transform:rotate(-34deg)}.voice-orb span,.voice-orb i,.voice-orb b{position:absolute;display:block;background:rgba(234,255,251,.65);width:2px;border-radius:5px;left:50%;top:50%;transform:translate(-50%,-50%);height:10px}.voice-orb i{margin-left:7px;height:17px}.voice-orb b{margin-left:-7px;height:13px}
      .is-speaking .voice-orb{animation:orb-talk .54s ease-in-out infinite alternate}.is-speaking .voice-orb span{height:17px;animation:wave .38s infinite alternate}.is-speaking .voice-orb i{height:9px;animation:wave .47s .12s infinite alternate}.is-speaking .voice-orb b{height:20px;animation:wave .34s .06s infinite alternate}.is-listening .voice-orb{animation:orb-breathe 3.2s ease-in-out infinite}
      .is-speaking .orb-halo{animation:orbit 3s linear infinite;box-shadow:0 0 0 9px rgba(61,180,169,.07),0 0 0 21px rgba(61,180,169,.035)}
      .voice-state{display:flex;justify-content:center;align-items:center;gap:7px;font-size:11px;font-weight:600;color:#416a68}.voice-pulse{width:6px;height:6px;border-radius:50%;background:#28a89b;box-shadow:0 0 0 3px #28a89b21}.voice-note{font-size:10px;color:#8796a3;margin:7px auto 12px;max-width:230px;line-height:1.5}.voice-toggle{font-size:10px!important;padding:7px 10px!important}
      .question-card{padding:17px 18px;flex:1}.question-card h3{font-size:14px;margin:10px 0 7px;letter-spacing:-.25px}.question-card>p{color:#728292;font-size:11px;line-height:1.65;margin:0 0 15px}.difficulty{font-weight:400;letter-spacing:0;text-transform:none;color:#9aa7b2}.requirement{display:flex;align-items:flex-start;gap:9px;padding:11px;border-radius:7px;background:#f7f9fa}.requirement-icon{width:25px;height:25px;background:#e6f3f1;color:#278c84;display:grid;place-items:center;border-radius:6px}.requirement b{display:block;font-size:10px;color:#516779}.requirement small{display:block;font-size:9px;color:#8493a0;margin-top:4px;line-height:1.4}.challenge-footer{border-top:1px solid #edf0f2;margin-top:15px;padding-top:12px;display:flex;justify-content:space-between;align-items:center;color:#91a0ac;font-size:9px}.challenge-footer span{display:flex;gap:5px;align-items:center}.challenge-footer button{border:0;background:none;color:#3d8882;font-size:9px;display:flex;gap:5px;align-items:center}
      .editor{overflow:hidden;display:flex;flex-direction:column;min-width:0}.editor-top{height:46px;padding:0 15px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #edf0f2}.editor-title{display:flex;align-items:center;gap:8px;font-weight:600;font-size:11px;color:#415569}.editor-title svg{color:#4c7882}.file-name{font-weight:400;color:#9aa6b1;font-family:'DM Mono',monospace;font-size:10px;border-left:1px solid #e3e8eb;padding-left:9px;margin-left:3px}.language-select{position:relative;display:flex;align-items:center;color:#758594}.language-select select{appearance:none;border:1px solid #e3e9ed;border-radius:5px;padding:6px 23px 6px 9px;background:#fff;color:#536678;font-size:10px;outline:none}.language-select svg{position:absolute;right:7px;pointer-events:none}.editor-sub{display:flex;justify-content:space-between;padding:10px 15px 8px;color:#83919e;font-size:9px}.editor-sub b{font-weight:500;color:#5e7182}.edit-hint{color:#a5b0b8}
      .code-area{display:flex;min-height:355px;flex:1;background:#f9fbfc;border-top:1px solid #f0f3f5;border-bottom:1px solid #edf0f2;padding:13px 0;overflow:auto}.line-numbers{display:flex;flex-direction:column;width:42px;flex:0 0 42px;text-align:right;padding-right:12px;color:#b3bec7;font:10px/20px 'DM Mono',monospace;user-select:none}.code-area textarea{resize:none;flex:1;min-width:350px;border:0;outline:0;background:transparent;color:#455c70;font:10px/20px 'DM Mono',monospace;white-space:pre;overflow:hidden;padding:0 14px 0 0;tab-size:2}.editor-bottom{display:flex;justify-content:space-between;align-items:center;padding:10px 14px}.editor-actions{display:flex;gap:8px}.run-btn,.reset-btn{border:0;border-radius:6px;padding:7px 10px;display:flex;align-items:center;gap:6px;font-size:10px;font-weight:600}.run-btn{background:#188e87;color:white}.reset-btn{background:#f2f5f6;color:#657686;font-weight:500}.saved-state{font-size:9px;color:#9aa8b3;display:flex;align-items:center;gap:6px}.saved-state span{width:5px;height:5px;background:#57b69e;border-radius:50%}
      .test-results{border-top:1px solid #edf0f2;padding:10px 14px 11px;background:#fcfdfd;min-height:39px}.test-head{display:flex;align-items:center;justify-content:space-between;color:#728494;font-size:9px}.test-head>span:first-child{display:flex;align-items:center;gap:6px}.test-count{color:#aa7943}.test-list{display:grid;grid-template-columns:1fr 1fr;gap:7px 14px;margin-top:10px}.test-list>div{display:grid;grid-template-columns:13px 1fr;column-gap:5px;font-size:9px;color:#607383}.test-list small{grid-column:2;color:#a0aab3;font-size:8px;margin-top:3px}.test-fail{color:#c77b6a}.test-pass{color:#51a38e}
      .room-footer{display:flex;justify-content:space-between;align-items:center;padding-top:15px;color:#91a0ad;font-size:9px}.room-footer>div{display:flex;align-items:center;gap:7px}.end-session{display:flex;align-items:center;gap:7px;border:1px solid #e8d9d5;background:#fff;color:#a66f62;border-radius:6px;padding:7px 10px;font-size:9px}
      .behavior-card{display:grid;grid-template-columns:minmax(280px,.72fr) minmax(400px,1.3fr);min-height:610px;overflow:hidden}.behavior-left{background:radial-gradient(ellipse at 50% 39%,#eaf8f6,white 62%);display:flex;flex-direction:column;align-items:center;justify-content:center;padding:28px;border-right:1px solid var(--line)}.behavior-left .orb-wrap{width:220px;height:220px}.behavior-left .voice-orb{width:132px;height:132px}.behavior-left .voice-note{max-width:250px;text-align:center}.behavior-prompt{padding:42px 44px;display:flex;flex-direction:column;justify-content:center}.behavior-prompt h2{font-size:24px;line-height:1.3;letter-spacing:-.8px;max-width:570px;margin:13px 0 10px}.behavior-prompt>p{font-size:12px;color:#788897;line-height:1.7;margin:0 0 24px}.transcript-card{background:#f6f9fa;border:1px solid #e9eef1;border-radius:9px;padding:17px 18px}.transcript-card blockquote{font-size:12px;line-height:1.8;color:#536a7b;margin:12px 0 13px}.transcript-time{font-size:9px;color:#8c9aa6}.transcript-time span{padding:0 4px}.prompt-foot{display:flex;justify-content:space-between;align-items:center;margin-top:22px;color:#84939f;font-size:9px}.prompt-foot span{display:flex;align-items:center;gap:6px}.prompt-foot button{border:0;background:none;color:#168981;display:flex;align-items:center;gap:6px;font-size:10px;font-weight:600}
      @keyframes orb-breathe{0%,100%{transform:scale(.98)}50%{transform:scale(1.04)}}@keyframes orb-talk{to{transform:scale(1.08) rotate(3deg)}}@keyframes wave{to{height:4px;opacity:.65}}@keyframes orbit{to{transform:rotate(360deg)}}@keyframes rec{50%{opacity:.35}} 
      @media(max-width:980px){.workbench{grid-template-columns:minmax(245px,.78fr) minmax(400px,1.3fr)}.voice-card{padding-left:12px;padding-right:12px}.room-meta{gap:5px}.time-block span{display:none}}
      @media(max-width:760px){.room-head{align-items:flex-start;flex-direction:column}.room-meta{width:100%;justify-content:space-between}.workbench{grid-template-columns:1fr}.left-column{display:grid;grid-template-columns:1fr 1.1fr}.voice-card{min-height:280px}.code-area{min-height:300px}.behavior-card{grid-template-columns:1fr}.behavior-left{border-right:0;border-bottom:1px solid var(--line);padding:15px}.behavior-left .orb-wrap{width:150px;height:150px}.behavior-left .voice-orb{width:100px;height:100px}.behavior-prompt{padding:26px 22px}}
      @media(max-width:540px){.candidate-line h1{font-size:16px}.room-status{align-items:flex-start;gap:8px;flex-direction:column}.left-column{grid-template-columns:1fr}.voice-card{min-height:255px}.question-card{min-height:210px}.test-list{grid-template-columns:1fr}.secure{font-size:9px}.time-block{padding:0 3px}.phase-switch button{padding:7px}.behavior-prompt h2{font-size:21px}.prompt-foot{gap:12px;align-items:flex-start;flex-direction:column}}
      .capture-status{display:flex;align-items:center;gap:12px;flex-wrap:wrap}.screen-share-chip{display:inline-flex;align-items:center;gap:6px;background:#fff;border:1px solid #cfe6db;border-radius:999px;padding:5px 9px;color:#376e55;font-weight:500}.share-dot{width:6px;height:6px;border-radius:50%;background:#22a366;flex-shrink:0}
      .room .orb-wrap{width:222px;height:222px}.room .voice-orb{width:141px;height:141px}.room .behavior-left .orb-wrap{width:330px;height:330px}.room .behavior-left .voice-orb{width:198px;height:198px}.room .editor-bottom{justify-content:flex-end}
      @media(max-width:1100px){.room-status{flex-wrap:wrap;gap:8px}}
      @media(max-width:760px){.room .behavior-left .orb-wrap{width:225px;height:225px}.room .behavior-left .voice-orb{width:150px;height:150px}}
      .phase-switch>span{padding:7px 10px;border-radius:6px;color:#778797;font-size:10px}.phase-switch>span.selected{background:#fff;box-shadow:0 1px 3px #1932491a;color:#334b60;font-weight:600}.standard-note{display:flex;align-items:center;gap:7px;font-size:10px;color:#708591;margin:-4px 0 16px}.fixed-language{display:flex;align-items:center;gap:6px;font-size:10px;color:#607485}.completion-card{min-height:480px;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:32px}.completion-card h2{font-size:22px;margin:15px 0 8px}.completion-card p{font-size:12px;line-height:1.7;color:#718294;max-width:430px}.completion-card small{font-size:10px;color:#8a9ba7;margin-top:12px}
    `}</style>
  </Chrome>;
}
