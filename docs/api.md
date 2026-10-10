# Audition data model and API contract

## Scope and implementation status

The original general-purpose API remains a foundation: all 23 Audition domain operations
are empty route stubs returning **HTTP 501**, regardless of input. They do not
authenticate, validate incoming data, create invitations, start sessions, record
evidence, run analysis, sign credentials, or access files. Existing design
prototypes remain separate. The **candidate-only room routes** listed below, `GET /api/healthz`,
and integration diagnostics are implemented. Evaluations, credentials and manager workflows
remain outside this build.

`lib/api-spec/openapi.yaml` is the machine-readable source of truth. The success
responses for the original general-purpose operations are the **future contract**;
candidate-only success responses are live. The unchanged foundation stub response is:

```json
{
  "error": "not_implemented",
  "message": "This endpoint is a contract stub. No feature behavior is implemented."
}
```

## Live candidate room

Every candidate route requires `Authorization: Bearer <candidate invite token>`.
Invites are random 256-bit, candidate-scoped capabilities, separate from the original
audition-level token. They authorize only that candidate's single session. Responses
are `Cache-Control: no-store`; tokens are not logged or sent to analytics. Candidates
do not need to create an account. Provider API keys never reach the browser.

| Method | `/api` path | Behavior |
| --- | --- | --- |
| GET | `/candidate/room` | Frozen audition including company, candidate, existing session and latest/final editor content |
| POST | `/candidate/start` | `{screen_surface:"monitor", candidate_name, candidate_email}`; atomic immutable server start; retries reuse the same session |
| GET | `/candidate/session/{sessionId}` | Server clock, deadline, submission and transcript-import status |
| POST | `/candidate/session/{sessionId}/voice` | One server-issued ElevenLabs signed WebSocket URL and frozen dynamic variables |
| POST | `/candidate/session/{sessionId}/conversation` | `{conversation_id, ended?}`; binds one SDK conversation; `ended:true` schedules server transcript retrieval |
| POST | `/candidate/session/{sessionId}/snapshots` | `{timestamp_ms, content}`; immutable, idempotent ten-second editor slots |
| POST | `/candidate/session/{sessionId}/screenshots/{timestampMs}` | Binary `image/jpeg`, ≤1 MiB; technical ten-second slots only; private App Storage file, metadata in PostgreSQL |
| POST | `/candidate/session/{sessionId}/integrity` | `{event_id, timestamp_ms, type, character_count?}`; deduplicated, server-sequenced events |
| POST | `/candidate/session/{sessionId}/commands` | `{command_id, kind}`; server-defined app controls, excluded from scoring |
| POST | `/candidate/session/{sessionId}/submit` | `{reason:"time_limit"\|"finished_early", editor_content?}`; irreversible, idempotent submission |

Screen and microphone consent precede capture. The actual selected video track must
report `displaySurface === "monitor"`; tab/window selection, denied permission, or an
unverifiable surface must not start a session. The browser checks the real track;
the server validates the matching input enum. Browser evidence is not cryptographic
proof of integrity.

At elapsed 3:00 the display-only phase changes to Technical and the SDK receives
`sendUserMessage("Start technical part")`; at 5:30 it receives `"Wrap up"`. At 6:00
the browser stops voice/capture and submits. A persistent-state maintenance worker
also closes abandoned sessions, storing the exact deadline as `submitted_at` even
if its next sweep is later. There are no pause, restart, phase-selection or deadline
editing endpoints. Final editor content is saved separately so finishing between
ten-second slots does not lose recent changes.

SDK dynamic variables are `candidate_name`, `company`, `role`, numbered
`behavioral_questions`, and `coding_task`. An additional `audition_session_id`
variable and SDK `userId` bind the conversation to its session. The server verifies
agent and session binding before importing the ElevenLabs transcript. Provider
timestamps are aligned to the session start; speech beyond effective submission
is excluded. Delayed processing is retried with persisted attempt state. Import
status is `not_started`, `pending`, `ready`, or `error`, with redacted errors.

App controls have kinds `initial_context`, `technical_start`, `wrap_up`, `time_check`,
`page_left`, and `screen_share_stopped`. Their transcript entries retain
`is_app_message:true` and `origin:"app"`; matching provider copies are also marked.
Provider user entries with `source_medium:"text"` and contextual-update entries are
also excluded: this room accepts candidate answers only through voice, never chat.
**Future scoring and quoted candidate evidence must filter `is_app_message = false`.**
SDK VAD/input volume detects a candidate turn longer than 75 seconds and sends
`"Time check: politely cut in and move on."`. Every editor keystroke invokes
`sendUserActivity()`. Page leave and stopped screen share invoke
`sendContextualUpdate()` immediately and are not candidate answers.

Integrity types include `page_left`, `window_blur`, `large_paste` (>50 characters,
count required), and `screen_share_stopped`. These are observations, not automatic
proof of misconduct. Capture timestamps must remain inside 0–360000 ms and before
effective submission. A 30-second receipt grace admits in-flight, pre-end evidence;
future and stale captures are rejected. Missing frames are never reconstructed.

The shared Nebius client supplies `max_tokens:1024` and
`chat_template_kwargs:{enable_thinking:false}` to text and vision requests.
Future scoring requires nonempty `message.content` and
`response_format:{type:"json_object"}`; reasoning fallback stays diagnostics-only.

Development seed: `pnpm --filter @workspace/api-server run seed:room` reuses one
Google Software Engineer audition with two 90-second behavioral questions, one
180-second coding task and company-fixed TypeScript. `--test` creates a separate
candidate invite for verification without consuming the demo invitation. Seeding
does not run automatically in production.

Base path: `/api`. JSON keys use `snake_case`; IDs are UUIDs. Absolute times are
UTC RFC 3339 strings. Evidence `timestamp_ms` values are integer millisecond
offsets from `server_start_time`, in **0–360000**, rendered as 0:00–6:00.

## Shared model and relationships

An **Audition** is one frozen company-defined role assessment shared by its
candidates. A **Candidate** belongs to an audition (the same person applying to
another audition has another candidate row). A candidate has at most one
**Session**. A session has ordered transcript entries, editor snapshots,
screenshots, integrity events, at most one **Evaluation**, and at most one
**Credential**. An evaluation has one result per distinct requirement and
zero or more quoted evidence items per result.

| Table | Fields |
|---|---|
| `auditions` | `id`, `role`, `job_description`, `editor_language`, sensitive `invite_token`, `duration_seconds` (=360), `created_at` |
| `audition_questions` | `id`, `audition_id`, `position`, `requirement`, `prompt`, `phase` (Behavioral/Technical), `time_limit_seconds` |
| `candidates` | `id`, `audition_id`, `name`, `email`, `status`, `created_at` |
| `sessions` | `id`, unique `candidate_id`, `server_start_time`, nullable `submitted_at`, nullable `finish_reason`, `status` |
| `transcript_entries` | `id`, `session_id`, `sequence`, `timestamp_ms`, `speaker` (candidate/interviewer), `text` |
| `editor_snapshots` | `id`, `session_id`, `timestamp_ms`, full editor `content` |
| `screenshots` | `id`, `session_id`, `timestamp_ms`, private `file_path`, `mime_type` |
| `integrity_events` | `id`, `session_id`, `sequence`, `timestamp_ms`, `type`, JSON `details` |
| `evaluations` | `id`, unique `session_id`, nullable `overall_score`, `spoken_summary_text`, nullable `spoken_summary_audio_file`, `created_at` |
| `requirement_evaluations` | `id`, `evaluation_id`, `requirement`, nullable integer `level`, boolean `not_covered`, `rationale` |
| `evaluation_quotes` | `id`, `requirement_evaluation_id`, `timestamp_ms`, `quote` |
| `credentials` | `id`, unique `session_id`, unique `evaluation_id`, unique `signed_token`, `session_data_hash`, `issued_at` |

DB foreign keys preserve links and restrict deletion rather than silently
discarding evidence. Unique constraints cover question order, candidate email
per audition, one session per candidate, one evaluation/credential per session,
requirement per evaluation, transcript/event sequence, and snapshot/screenshot
timestamp per session. Candidate emails must be normalized to lowercase before
insertion by the future handler.

### Frozen questions and timing

- Creation accepts `frozen_questions` as an ordered array of copied prompts,
  requirements, phases and limits, not pointers to editable question templates.
- `position` must be unique and contiguous starting at 1. Behavioral questions
  precede Technical questions. Limits sum to 180 seconds **per phase**.
- Questions, role description, timing, and editor language are immutable after
  creation. There is deliberately no update-question or change-phase endpoint.
- Every candidate receives the same prompts, order and limits; no adaptive
  follow-up generation. Server phase is Behavioral for elapsed time below
  180 seconds, then Technical until the 360-second deadline.
- `server_start_time` is server-generated and never client-supplied.
  `deadline_at` is derived as start +360 seconds, not stored separately.
- There are no pause, resume, reset or restart endpoints.
- Editor snapshots use slots 0, 10000, 20000, …, 360000 milliseconds.
  Capture continues every ten seconds even if code is unchanged. Slot 0 is
  the initial state; later-phase slots contain the company-fixed editor content.
  A final snapshot at 360000 is allowed. Cadence collection is not implemented.

### Candidate and session state

Candidate progression is **Invited → In progress → Submitted → Analyzed**.
Only the server changes status: invitation, start, finalization, then successful
evaluation persistence. No arbitrary status PATCH is exposed.

Session status is `In progress` or `Submitted`; finalization reason is
`time_limit` or `finished_early`. An early finish requires UI confirmation and
is irreversible. Automatic deadline finalization records the effective deadline
as `submitted_at`, even if a worker processes the action later. No evidence after
the effective submission time is accepted. A retry of start/submit returns the
existing session; it cannot start a second attempt or move the deadline.

### Integrity events

Allowed types are `page_left`, `large_paste`, `screen_share_stopped`. Each has a
sequence, elapsed timestamp, and a bounded details object. `duration_ms` is
optional for page-left/share-stop signals; `character_count` describes large
pastes without storing pasted text separately. These are informational events,
not proof of dishonesty. Detection thresholds and screenshot cadence are
intentionally deferred.

### Evaluation

JSON exposes `level` as an integer **1–4** or the string **`"not_covered"`**.
SQL stores a covered result as `level=1..4, not_covered=false`, or an uncovered
result as `level=NULL, not_covered=true`. The DB prevents mixed representations.

One result must exist for each distinct frozen requirement. Covered results
require supporting direct transcript quotes; uncovered results have an
explanatory rationale and empty quotes. Quotes must match the same session's
candidate transcript and timestamps, not invented evidence. Overall score is
the unweighted mean of covered levels, rounded to two decimals; it is `null`
when none are covered. `"not_covered"` is neither level zero nor a failed score.

Spoken summary text is stored independently of the nullable audio file reference.
No speech/audio generation occurs in this foundation.

```json
{
  "requirements": [
    {
      "requirement": "Reliability",
      "level": 4,
      "rationale": "Identified the race and proposed an atomic write.",
      "quotes": [
        { "timestamp_ms": 266000, "quote": "A read-then-insert can still race." }
      ]
    },
    {
      "requirement": "Data modeling",
      "level": "not_covered",
      "rationale": "No candidate evidence for this requirement.",
      "quotes": []
    }
  ],
  "overall_score": 4,
  "spoken_summary_text": "Strong reliability evidence; data modeling was not covered.",
  "spoken_summary_audio_file": null
}
```

### Credential and file storage

`signed_token` is server-generated, never client-supplied for issuance.
`session_data_hash` is lowercase SHA-256 hex (64 characters). The future signing
service must bind credential ID, session ID, evaluation ID, hash and issued-at
time, verify signatures with an allowlisted algorithm, and verify the stored
session hash. Signing/key management is not implemented.

Hash input is a versioned `audition-session-v1` canonical JSON object containing
the frozen audition definition (excluding invite token), candidate ID (not
email/name), session timing/finalization, transcript ordered by sequence, editor
snapshots and screenshots ordered by offset, and integrity events ordered by
sequence. Use RFC 8785 JSON canonicalization and UTF-8 SHA-256. It excludes
evaluation text and credentials to avoid circular hashing. File references are
included; hashing actual file bytes/adding content digests is deferred. No hash
or signature is calculated by the stubs.

Screenshots/audio use private durable storage references, not DB binary blobs,
base64, local temporary paths or permanently public URLs. Upload/download
authorization and storage integration are future work. Credential issuance
requires verified candidate consent and an evaluation linked to the same session.

## Endpoint inventory

**All operations below currently return 501.** The success codes and access
rules are requirements for future implementation, not enabled authentication.

| Method and path (relative to `/api`) | Request | Future response | Required principal |
|---|---|---|---|
| GET `/auditions` | none | 200 `Audition[]` | Hiring manager |
| POST `/auditions` | `AuditionInput` | 201 `AuditionInvitation` | Hiring manager |
| GET `/auditions/{auditionId}` | UUID path | 200 `Audition` | Authorized manager/candidate |
| GET `/auditions/{auditionId}/candidates` | UUID path | 200 `Candidate[]` | Hiring manager |
| POST `/auditions/{auditionId}/candidates` | `CandidateInput` | 201 `Candidate` | Hiring manager |
| GET `/candidates/{candidateId}` | UUID path | 200 `Candidate` | Authorized manager/own candidate |
| POST `/invites/resolve` | `InviteInput` | 200 `Audition` (no token) | Invite bearer |
| POST `/sessions` | `SessionInput` | 201 `Session` (200 on retry) | Verified candidate + invite |
| GET `/sessions/{sessionId}` | UUID path | 200 `Session` | Authorized manager/own candidate |
| GET `/sessions/{sessionId}/transcript` | UUID path | 200 `TranscriptEntry[]` | Authorized manager/own candidate |
| POST `/sessions/{sessionId}/transcript` | `TranscriptBatch` | 204 | Authorized recording service |
| GET `/sessions/{sessionId}/editor-snapshots` | UUID path | 200 `EditorSnapshot[]` | Authorized manager/own candidate |
| POST `/sessions/{sessionId}/editor-snapshots` | `EditorSnapshotBatch` | 204 | Own active candidate |
| GET `/sessions/{sessionId}/screenshots` | UUID path | 200 `Screenshot[]` | Authorized manager/own candidate |
| POST `/sessions/{sessionId}/screenshots` | `ScreenshotBatch` | 204 | Own active candidate |
| GET `/sessions/{sessionId}/integrity-events` | UUID path | 200 `IntegrityEvent[]` | Authorized manager/own candidate |
| POST `/sessions/{sessionId}/integrity-events` | `IntegrityEventBatch` | 204 | Own active candidate |
| POST `/sessions/{sessionId}/submit` | `SessionSubmission` | 200 `Session` | Own candidate/deadline worker |
| GET `/sessions/{sessionId}/evaluation` | UUID path | 200 `Evaluation` | Authorized manager/own candidate |
| POST `/sessions/{sessionId}/evaluation` | `EvaluationInput` | 201 `Evaluation` | Internal evaluation worker |
| GET `/sessions/{sessionId}/credential` | UUID path | 200 `Credential` | Authorized manager/own candidate |
| POST `/sessions/{sessionId}/credential` | `CredentialConsent` | 201 `Credential` | Verified consenting candidate |
| POST `/credentials/verify` | `CredentialVerificationInput` | 200 `CredentialVerification` | Signed credential bearer |

The invite token belongs to the audition as requested. It grants access to the
assessment, **not another candidate's identity or session**. A separate verified
candidate identity is mandatory before start/evidence access. Tokens belong in
request bodies, never URL paths/query strings or logs; ordinary audition GET/list
responses omit them. No invite emails are sent by the stub.

## Future validation and error semantics (not implemented)

- `400`: malformed UUID/body, invalid enum/range, inconsistent phase schedule.
- `401/403`: missing identity or unauthorized company/candidate/resource.
- `404`: authorized resource absent (e.g. evaluation not yet recorded).
- `409`: frozen-definition edit, second attempt, conflicting retry, post-submit
  evidence, evaluation/credential linked to the wrong session.
- `413`: evidence batch/file exceeds configured limits.
- Retries with the same session+sequence/slot and identical data are idempotent;
  conflicting content at the same key is 409. Batches are atomic, not partial.
- Future handlers derive status/timestamps, verify evidence against session time,
  reject caller-owned server fields, validate file ownership, and ensure quotes
  and requirement names belong to the session's audition.

DB checks currently enforce ranges, enums, required values, relations and
uniqueness. Cross-row phase sums, frozen-definition immutability, progression,
deadline finalization, evidence capture, overall mean, quote provenance,
authorization and cryptography remain handler/service responsibilities.
They are intentionally **not features in this foundation**.

## Implemented development diagnostics

Page: `/admin/health` in the Audition web artifact. This does not implement the
audition workflow or change its tables.

- `GET /api/admin/health`: returns configuration availability and last results;
  never makes provider requests. No key values or signed capabilities returned.
- `POST /api/admin/health/{checkId}`: runs a fixed test, returns a
  `ConnectionCheck` with `ok`, `error`, or `missing` status. Valid IDs:
  `nebius_models`, `nebius_text`, `nebius_vision`, `elevenlabs_tts`,
  `elevenlabs_agent`. Ready but untested checks have status `untested`.
- `GET /api/admin/health/tts-audio`: serves the temporary MP3 already generated
  by the speech test, or 404 when missing/expired. It does not generate speech.

All diagnostics are **blocked with 403 outside NODE_ENV=development** until
verified admin authorization is added. Same-origin browser POSTs only; this is
not a substitute for authentication. Calls have 25-second timeouts, bounded
response sizes, per-test request coalescing, and a 60-second result cache to
limit accidental credit consumption. Tests run only on explicit user action.
No API key or upstream bearer header reaches the browser. Provider errors are
returned with HTTP codes and credential values redacted.

Each provider result now includes the actual upstream `http_status` (null when
no response was received) and, on non-2xx responses, `error_response_body`.
The latter preserves the entire received error body, including nested fields,
whitespace and plain-text responses; only credentials and signed capabilities
are redacted. The 1 MiB diagnostic response safety limit still applies; an
oversized body is reported explicitly rather than silently truncated.

Nebius text/vision checks expose public `configured_model` (trimmed),
`model_env`, and exact case-sensitive `model_in_catalog` (null if unavailable).
They verify catalog membership through the shared cached model-catalog check,
but still submit the requested completion so its real provider error is shown.
The page also exposes the actual `request_method`, `request_endpoint`, and
`request_body` without authorization headers. Model IDs are not credentials.
HTTP 200 responses that fail diagnostic validation also show their complete
received body (for example, an empty completion with `finish_reason: length`).
Text and vision diagnostic budgets are both 1024 completion tokens; these
include reasoning tokens on thinking models. Both requests send
`chat_template_kwargs: { enable_thinking: false }`. Only an explicit HTTP
400/422 rejection naming that parameter triggers one retry without it;
the page exposes that rejection and the actual retried request body.

`completion_details` and structured server logs include `finish_reason`,
`message.content`, `message.reasoning_content`, and the entire `usage` object
(credentials redacted). A non-empty `content` is always preferred. Only these
fixed health probes may use non-empty `reasoning_content` as fallback, clearly
marked by `output_source` and an explanation. Empty content and reasoning are
still a failure. HTTP success alone is not enough.

Future real scoring must require `message.content` with
`response_format: { type: "json_object" }`, validate its JSON, and never use this
health-only reasoning fallback. Scoring routes remain unimplemented here.

Required configuration:

| Test | Secrets | Actual request |
|---|---|---|
| Nebius catalog | `NEBIUS_API_KEY` | GET `https://api.tokenfactory.nebius.com/v1/models`, returns all IDs |
| Nebius text | key + `NEBIUS_TEXT_MODEL` | POST `/v1/chat/completions`, user message `Say OK` |
| Nebius vision | key + `NEBIUS_VISION_MODEL` | POST `/v1/chat/completions`, synthetic red square/blue circle PNG as a base64 data URL |
| ElevenLabs speech | `ELEVENLABS_API_KEY` | POST `/v1/text-to-speech/JBFqnCBsd6RMkjVDRZzb`, default George voice, `eleven_multilingual_v2`, short fixed sentence |
| ElevenLabs agent | key + `ELEVENLABS_AGENT_ID` | GET `/v1/convai/conversation/get-signed-url?agent_id=…` on the server |

Missing/blank configuration returns `missing` with secret **names**, not failure
or an upstream request. Add secrets through the workspace secrets tooling and
restart the API server to load them.

Speech audio is held in process memory for five minutes, not saved as a durable
asset or DB binary; it disappears on restart. Browser controls play it on demand
to comply with autoplay policies. Vision success means a non-empty provider
response, not a guarantee of visual accuracy. Agent success means a valid
ElevenLabs `wss:` signed URL was acquired; the diagnostics page receives only
`signed_url_available`, not the signed URL itself.
