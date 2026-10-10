# Audition

**Fair, evidence-based pre-interviews for technical hiring.**

Audition gives every candidate for a technical role the same short, live, AI-run pre-interview, and gives the hiring team an evidence-backed report. The AI prepares the decision. A human makes it.

Built in one night at the **SF Tech Week Hackathon – Building from the Farm 2026** (Stanford) with **ElevenLabs** and **Nebius**.

---

## The problem

- **Structured interviews work best, but they don't scale.** Interviews where everyone gets the same questions and a fixed rubric are the strongest single predictor of job performance (mean validity r = .42, Sackett et al., 2022). But they cost engineering hours, so most companies screen with ad-hoc calls or take-home tasks.
- **First rounds are inconsistent.** Every interviewer asks different questions, so candidates can't be compared fairly.
- **AI makes screening easy to fake.** Take-homes and recorded video answers can be solved off-screen. Gartner expects that by 2028, 1 in 4 candidate profiles worldwide could be fake.

## What Audition does

1. **Approve.** The company enters role and job description. A Qwen model on Nebius drafts one behavioral question and one short coding task. The company edits and approves them, and the question set is then frozen (snapshot + hash) for every candidate.
2. **Invite.** Each candidate gets a private, single-use link.
3. **Audition.** The candidate does a live voice interview with **Sam**, an ElevenLabs agent: 1 minute behavioral, then 1 minute technical (fix a buggy Python function, then explain its complexity), with mandatory full-screen sharing. The clock is locked on the server, so it can't be paused or reset. When Sam says goodbye and ends the call, the session is submitted immediately.
4. **Report.** Qwen on Nebius scores every competency from 1 to 4, and every score has to cite the transcript or the code. A vision model describes what was on screen. The hiring team sees a recommendation (Advance / Hold / Not now) with evidence and decides who gets a callback.

## How we evaluate a candidate

| Step | What happens |
|---|---|
| Same test for everyone | Frozen questions, the same interviewer, the same fixed clock. Nobody can pause, restart or change the questions. |
| Evidence, not impressions | Full transcript (ElevenLabs), code saved every 10 s, screenshots every 10 s during the technical part, integrity events. |
| Every score has proof | Each competency gets a score from 1 to 4 plus a quote from the transcript or code. Quotes are checked automatically against the source. If a quote can't be found, the score is marked `needs_review`. If a competency never came up, it's marked `not_covered` instead of guessed. |
| Screen, not face | The vision model builds a factual timeline of the shared screen (editor, other apps, AI tools). No face, emotion or "lie" analysis. |
| Integrity flags stay separate | Tab switches, window blur, large pastes and a stopped screen share are shown to the reviewer and never change the score. |
| A human decides | The report recommends. Only a person clicks **Send callback**. |

## Built with

- **ElevenLabs Agents:** the live voice interviewer "Sam" (Eleven v3 conversational, patient turn-taking, interruptions). Candidate name, company, role, questions and coding task are passed as dynamic variables. The app sends phase cues ("Start technical part", "Wrap up"), and Sam ends the call himself with the End conversation system tool. Signed URLs are created server-side, so no API key reaches the browser.
- **Nebius Token Factory** (OpenAI-compatible API):
  - `Qwen/Qwen3.5-397B-A17B`: question drafting and evidence-based scoring (JSON output)
  - `Qwen/Qwen3.8-27B`: screenshot analysis for the screen timeline
- **Replit:** TypeScript monorepo (pnpm workspace), React frontend, TypeScript API server, PostgreSQL with Drizzle ORM, OpenAPI spec with generated client types, Replit Object Storage for private screenshots.

## Repository structure

```
artifacts/
  api-server/        # API: invites, sessions, timer, evidence, ElevenLabs + Nebius clients, scoring
    src/lib/         # elevenlabs.ts, nebius-client.ts, objectStorage.ts, health-diagnostics.ts, …
  audition/          # React app: candidate room, company workspace, reports
lib/
  db/                # Drizzle schema (auditions, candidates, sessions, transcript, screenshots, integrity events, …)
  api-spec/          # OpenAPI spec
  api-zod/           # generated request/response types
docs/api.md          # API documentation
```

## Running it

The project runs on Replit. To run it elsewhere:

1. Set these environment variables (secrets, never commit them):
   - `NEBIUS_API_KEY`
   - `NEBIUS_TEXT_MODEL` (e.g. `Qwen/Qwen3.5-397B-A17B`)
   - `NEBIUS_VISION_MODEL` (e.g. `Qwen/Qwen3.8-27B`)
   - `ELEVENLABS_API_KEY`
   - `ELEVENLABS_AGENT_ID`
   - a PostgreSQL connection and object storage
2. `pnpm install`
3. Start the API server and the web app (Replit workflows "API Server" and "web").
4. Optional demo data: `pnpm --filter @workspace/api-server run seed:room`
5. Open `/admin/health` to check that all integrations are connected.

**Note:** Qwen thinking models on Nebius return empty text unless `max_tokens >= 1024` and `enable_thinking: false`. The shared `nebius-client.ts` handles this.

**Requirements for candidates:** Google Chrome on a desktop computer, microphone, full-screen sharing. Headphones are recommended.

## Principles

- Same test for everyone.
- Every score has proof.
- Screen only, never faces, emotions or "lie detection".
- Integrity flags inform the reviewer and never change the score.
- The AI recommends, a human decides.

## Limitations and next steps

- The demo uses a 2-minute format (1 min behavioral, 1 min technical). The durations are one config constant; the planned default is 3 + 3 minutes.
- Chrome on desktop only for now.
- Next: a verifiable credential for candidates (W3C VC signed with Ed25519, with a public `/verify` page), a spoken report summary via ElevenLabs TTS, and more task types per role.

## Team

- **Jonas Juchelka:** product and build (Management & Technology, TU Munich · UC Berkeley)
- **Rahul Gurnani:** engineering (Software Engineer, Google)

## Sources

- Sackett, P. R. et al. (2022), via SIOP: [Is cognitive ability the best predictor of job performance?](https://www.siop.org/tip-article/is-cognitive-ability-the-best-predictor-of-job-performance)
- Gartner (2025), via HR Dive: [1 in 4 candidate profiles could be fake by 2028](https://www.hrdive.com/news/fake-job-candidates-ai/757126/)
