# Company workspace and hiring reports

These implemented endpoints extend the original foundation contract in
`docs/api.md`. The authoritative typed contract is `lib/api-spec/openapi.yaml`.

## Demo company links

`POST /api/company` accepts `company`, `contact_email`, `role`, and
`job_description`, returning a 256-bit `company_token`. The browser opens
`/company/{token}`. This is a capability link, not a user account: anyone with
the link can access that company's candidate evidence. Keep it private.

| Endpoint | Behavior |
|---|---|
| `GET /api/company/{token}` | Workspace, frozen state, candidates, progress, scores, invite/report links |
| `POST /api/company/{token}/draft` | `{}` generates a Nebius draft; `{draft}` saves company edits |
| `POST /api/company/{token}/approve` | `{draft}` approves atomically, freezes questions and SHA-256 snapshot hash |
| `POST /api/company/{token}/candidates` | `{name,email}` creates a distinct single-use invite |
| `POST /api/company/{token}/candidates/{id}/callback` | Human action; records callback time and returns a prefilled `mailto:` |

The draft contains `behavioral: {requirement,prompt,reference_note}`,
`technical: {requirement,prompt,follow_up,reference_note}`, `starter_code`, and
`language: "Python"`. Generation uses Nebius's strict JSON-schema response
format; all generated and edited data is also validated on the server.
Technical scoring references are private to the company/scorer and never sent
to the candidate or ElevenLabs. Approval locks out edits/regeneration; concurrent
approvals produce the same snapshot/hash, never duplicate questions.

New sessions freeze duration, phase timing and question snapshot at start.
The current demo is 60 seconds Behavioral + 60 seconds Technical, configured in
`shared/audition-config.ts`. Existing six-minute session history is retained.

The Callbacks view shows Invited, In progress, Scoring and Ready; score and report
links come from persisted sessions/evaluations. Callback never sends email
automatically. A candidate must have submitted before a callback can be marked.
Mutation traffic is rate-limited; model generation consumes more of that limit.
Do not treat this demo capability-link scheme as production account security.

## Asynchronous scoring

Finalization enqueues scoring. The worker waits for final code and transcript
import when available, then scores using the shared Nebius client. Text scoring
requires actual `message.content`, `response_format: json_object`, thinking
disabled and at least 1024 output tokens. Reasoning-only output is not accepted.

Inputs are frozen questions (including private references), candidate speech
transcript and final code. App commands are not answers. Each frozen requirement
gets level 1–4 or `not_covered`, rationale, and source-attributed exact quotes.
Quote timestamps are derived from matching source entries, not model-supplied
times; code quotes have no speech timestamp. Unmatched quotes or scored
requirements lacking evidence receive `needs_review`. Only verified numeric
scores contribute to the overall 1–4 average. Evidence requiring review forces a
Hold recommendation. Missing speech produces explicit not-covered Behavioral
scores rather than invented answers.

Up to six evenly sampled technical screenshots are separately sent to the vision
model, for a factual screen-only timeline. No webcam capture or face analysis.
Vision failure remains visible without discarding text scores.
Integrity events are displayed separately and are never supplied to scoring or
used to change scores or the recommendation.

| Endpoint | Authorization and response |
|---|---|
| `GET /api/review/{candidateId}` | `Authorization: Bearer {company_token}`; scoring state/error, recommendation, scores/evidence, final code, timeline, integrity flags and full transcript |
| `POST /api/review/{candidateId}/retry` | Same company authorization; requeues failed scoring |
| `GET /api/review/{candidateId}/screenshots/{id}` | Same authorization and ownership checks; private JPEG stream |

The browser route is `/report/{candidateId}?company={company_token}`. It polls
while scoring and loads screenshot blobs with authenticated requests. Candidate
invite tokens cannot authorize hiring reports. Credential remains explicitly
“not issued”; this scope does not mint credentials or send callback emails.

After schema pushes, declared database CHECK constraints are synchronized
atomically: changing their definitions is not reliably handled by schema push
alone. This preserves existing records while enforcing the declared state and
duration rules, including `conversation_ended`.
