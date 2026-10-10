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

The audition is standardized: six minutes total, Behavioral for the first three minutes and Technical for the last three. Candidates cannot pause, select phases, or change the company-set editor language. Finishing early is irreversible.

**Why:** The user explicitly requested the same questions and time limits for every candidate, with a fixed six-minute format.

**How to apply:** Keep phase switching automatic at 03:00 remaining, require confirmation before finishing early, and keep report duration and evidence timestamps within 00:00–06:00.

Candidates must share their entire monitor before the audition starts. Window or tab sharing is insufficient. SDK time controls, integrity notifications and other app messages are not candidate answers and must be excluded from scoring.

**Why:** The user explicitly required monitor-only admission and exclusion of every app message from evaluation.

**How to apply:** Preserve explicit screen/microphone consent, private evidence storage, and candidate-only scoring provenance when implementing later analysis and report features.
