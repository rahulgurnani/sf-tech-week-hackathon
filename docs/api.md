# Audition data model and API contract

## Scope and implementation status

This is a foundation only. Database tables exist; all 23 Audition API operations
are empty route stubs returning **HTTP 501**, regardless of input. They do not
authenticate, validate incoming data, create invitations, start sessions, record
evidence, run analysis, sign credentials, or access files. Existing design
prototypes are not connected. Only the existing `GET /api/healthz` is implemented.

`lib/api-spec/openapi.yaml` is the machine-readable source of truth. The success
responses in that specification are the **future contract**, not functionality
available today. The current stub response is:

```json
{
  "error": "not_implemented",
  "message": "This endpoint is a contract stub. No feature behavior is implemented."
}
```

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
