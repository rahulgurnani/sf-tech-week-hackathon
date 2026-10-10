---
name: Paid integration diagnostics
description: Security and scope decision for provider-health checks before admin identity exists
---

Candidate voice capabilities are separate from admin diagnostic probes. An active,
candidate-scoped invite may receive a temporary SDK signed URL, but never the provider
API key. The diagnostic production restriction must not be extended indiscriminately
to the actual invited-candidate interview.

**Why:** The user explicitly requested server-issued signed URLs for the browser SDK.
Invitation capabilities allow the requested candidate flow without introducing a
separate account-registration requirement, while constraining access to one session.

**How to apply:** Keep authorization and irreversible session timing on the server.
Treat health-page probes and live candidate conversations as different access scopes.

SDK lifecycle requests are not necessarily confirmation that a connection has opened
or closed. Use actual connection metadata for persistence and actual SDK mode for UI.

**Why:** Provider SDK lifecycle interfaces change; awaiting a synchronous lifecycle
request can appear successful before a conversation exists.

**How to apply:** Check the installed SDK's types rather than copying older tutorial
assumptions about lifecycle return values.

Do not enable credential-backed diagnostics in production simply to make the
admin-health page publishable. Require verified server-side admin authorization
before exposing paid probes or agent capabilities.

**Why:** Diagnostics were requested before the hiring workflow or admin identity
was implemented. Development-only access allowed testing without adding a
separate authentication feature or publicly exposing credit-consuming calls.

**How to apply:** Preserve the production restriction until real admin access
is built. Missing or invalid provider configuration should remain visible;
never substitute different models or fake success to hide a failed probe.

Show Nebius model identifiers as non-sensitive configuration, including trimmed
values and exact catalog membership. Show full provider error bodies, redacting
API keys and signed capabilities rather than model IDs.

**Why:** The user explicitly requested transparent debugging and stated the
text model identifier is not sensitive.

**How to apply:** Keep model-name diagnostics visible even if their environment
variables were originally stored using the workspace's secrets interface.

Reasoning text fallback is allowed only in fixed health checks. For real scoring,
require answer content using `response_format: { type: "json_object" }`.

**Why:** The user explicitly set this boundary when diagnosing Qwen thinking
models. Their completion budgets can be consumed before answer text appears.

**How to apply:** Check finish reason and token usage before treating empty
content as a connection failure. Never reuse diagnostic fallback for scoring.

JSON-object output does not enforce field names or nesting. For generated
question drafts, use Nebius's documented strict JSON-schema format and still
validate the result before allowing approval.

**Why:** Live draft generation moved editor fields into the technical object,
omitted required competency keys and copied example field descriptions as values.

**How to apply:** Specify real-content instructions instead of placeholder values;
fail visibly on invalid data, never invent missing questions or code.
