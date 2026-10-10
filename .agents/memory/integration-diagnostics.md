---
name: Paid integration diagnostics
description: Security and scope decision for provider-health checks before admin identity exists
---

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
