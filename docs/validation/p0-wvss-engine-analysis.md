# Validation Record: WVSS engine-analysis P0

This record is the original field observation summarized in `../15-p0-real-project-findings.md`.

## Scenario

- Project: WVSS engine-analysis
- Slice: Trunscan live-probe I/O path
- Rounds: 5
- Method: manual IOAYN-guided dialogue
- MCP: not connected

## Positive observation

The learner reconstructed the path from engine macro I/O to Trunscan scheduling and libsping sender/receiver behavior, then used fork semantics to identify the queue as the meaningful inter-process transfer path.

## Failed or partial assertions

| Assertion | Result |
|---|---|
| Goal, scope, and done criteria defined | partial; not restated later |
| Avoid directory/main-first exploration | passed |
| Teaching view bounded to 5–12 nodes | mostly passed; late density high |
| Fact/inference/unknown explicit | failed |
| Checkpoint per round | passed; difficulty inconsistent |
| No report dump | passed |
| New entity has contextual role | failed |
| MCP preflight and persistence | failed; MCP unavailable |
| Atlas location and historical links | not tested |

## Required rerun

Repeat this scenario with v1.1.0 and save the `.ioayn/` result as an anonymized fixture after reviewing it for sensitive source details.
