---
name: Audition product direction
description: User-stated positioning and visual direction for Audition
---

Audition is an AI pre-interview platform for technical hiring. "Every candidate gets an audition before the human interview; the best get a callback."

**Why:** The user defined this as the product's positioning.

**How to apply:** Keep candidate and hiring-manager experiences consistent with an audition followed by a human callback.

The user wants modern enterprise SaaS styling: a light workspace, navy sidebar, teal accents, Inter font, a calm and trustworthy feel, and a subtle spotlight motif in the logo and empty states.

**Why:** The user explicitly specified the visual direction.

**How to apply:** Preserve this direction when extending these screens unless the user changes it.

The audition is standardized. The current demo is two minutes total: one minute Behavioral and one minute Technical; timing must be easy to switch back to three plus three. Candidates cannot pause, select phases, or change the company-set editor language. Finishing early is irreversible.

**Why:** The user requested a shorter demo while retaining the same questions and time limits for every candidate.

**How to apply:** Use the shared phase timing, freeze timing at session start, and finish immediately when the voice conversation ends. Reports must reflect the actual session duration.

Keep manual-test invitations unused during automated verification; use separate test candidates.

**Why:** The user explicitly repeated that their manual invite must never be opened in our tests.

**How to apply:** Update the associated audition in place without opening or starting the manual invitation. Verify preservation against the actual invitation, not an identifier assumed from an earlier test.

Candidates must share their entire monitor before the audition starts. Window or tab sharing is insufficient. SDK time controls, integrity notifications and other app messages are not candidate answers and must be excluded from scoring.

**Why:** The user explicitly required monitor-only admission and exclusion of every app message from evaluation.

**How to apply:** Preserve explicit screen/microphone consent, private evidence storage, and candidate-only scoring provenance when implementing later analysis and report features.

Integrity flags never change competency scores. Hiring recommendations support a
human reviewer; callbacks are a human action and open an email draft, not an
automatically sent email.

**Why:** The user explicitly required separate integrity flags, human-review
recommendations and manual callback decisions.

**How to apply:** Keep evidence scoring independent of integrity observations and
never automatically contact candidates based on a model recommendation.

Company approval freezes a question snapshot and hash. Candidates for the same
audition receive the same approved questions and time limits.

**Why:** The user requires standardized auditions and irreversible approval.

**How to apply:** Allow company editing only before approval; keep private scoring
references out of candidate and voice-agent payloads.

Original demo candidates that have been archived must remain stored, including
their invitations, sessions and reports.

**Why:** The user asked to hide candidates for the demo while explicitly keeping their data.

**How to apply:** Hide archived candidates from dashboard lists; do not purge their data as test cleanup.
