---
# synced-from: skills/resume-learning@1.1.3
name: resume-learning
description: Resume the user's persistent IOAYN learning context, including recent conversation, current abstraction level, reusable assets, blocking unknowns, Atlas location, and recommended next paths.
argument-hint: "[可选：session id 或继续方向]"
disable-model-invocation: true
---

# Resume IOAYN learning

Call `preflight_learning`, then `resume_learning_context` using the message text after /resume-learning only when it is a valid session identifier.

Call `resume_learning_session` after the user confirms which stored session to continue, so opt-in Hook capture is re-enabled without overwriting prior history.

Present:

- current goal and main-path progress: stations already covered vs remaining, reconstructed from the latest round's `next_actions` and the session journal;
- last abstraction level;
- latest verified learning asset;
- the previous checkpoint and answer state;
- blocking unknowns;
- bounded Atlas location and historical connections.

Then keep teaching agent-led: propose the single next station from the main path with a one-line rationale. The learner holds veto and redirect; do not present open path menus to a first-contact learner.

Do not restart repository analysis from zero. Do not claim freshness until `freshness_report` is checked. When the user confirms, reactivate the existing session with `resume_learning_session`, then continue the bounded workflow without calling `start_learning_session` again. Invoke `/learn-code` only as the teaching protocol entry, preserving the existing goal/session identifiers.

If the user returned for unrelated work, do not resume silently — ask, and if learning is over call `finish_learning_session` so capture stops.
