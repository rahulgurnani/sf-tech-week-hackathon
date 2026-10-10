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
