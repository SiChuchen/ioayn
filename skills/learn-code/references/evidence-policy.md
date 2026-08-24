# Evidence and claim policy v1.1

## Claim types

- `FACT`: directly supported by current-revision source, test, trace, log, network, database, or Git evidence.
- `INFERENCE`: a reasoned interpretation built from facts; list basis references and limitations.
- `UNKNOWN`: evidence is insufficient. Also create an Unknown asset when it matters to the active slice.
- `CONFLICT`: two credible observations disagree. Preserve both until resolved.

## Confidence

- `high`: deterministic current source or current source plus runtime/test confirmation.
- `medium`: current source supports the claim but dynamic selection, environment, or runtime behavior remains unverified.
- `low`: naming, comments, generated documents, incomplete paths, stale revisions, or speculative reasoning.

Fluent language must never raise confidence.

## Evidence kinds

- `source`
- `test`
- `runtime_trace`
- `log`
- `network`
- `database`
- `git`
- `documentation`

Documentation is context, not proof of current code behavior.

## Required evidence fields

Record the supported claim, claim type, kind, revision, location or artifact, timestamp, confidence, basis references, limitations, and relevant goal/slice/round.

## Freshness

A different commit is historical evidence. A dirty tree requires local source verification. Atlas nodes derived from stale assets must be marked stale rather than silently presented as current.
