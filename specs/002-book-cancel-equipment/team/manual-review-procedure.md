Proposed T041 procedure for the final running AppHost revision. This is a preparation checklist, not review evidence or approval.

Record the frozen source hash, browser/version, actual loopback Web URL, reviewer/date and separate automated browser/axe results. Use native browser interaction with keyboard input and inspect actual focus and status outcomes.

| State/journey | Keyboard actions | Required outcomes |
|---|---|---|
| Initial loading and loaded catalog | Tab through navigation, reload, equipment and time controls | Logical order, visible focus, meaningful labels; loading changes to loaded or empty/error state |
| Booking validation | Submit missing inputs; equal/reversed/past dates; select non-operational item if exposed | Understandable messages, no unintended booking; usable focus and correction path |
| Timezone/DST | Enter future dates; inspect displayed zone/offset; exercise repeated/nonexistent local times when practical | Time interpretation clear; nonexistent time rejects; repeated time requires an explicit offset |
| Availability | Activate Check availability with Enter/Space; change an input afterward | Pending state visible; advisory result clear; changed inputs invalidate it; focus remains usable |
| Confirmed booking | Submit a valid interval using keyboard | One saved Confirmed result; inputs/actions recover; notification observation remains distinct |
| Conflict/dependency error | Attempt a known overlap; use controlled Inventory outage | Specific safe errors; no false success; keyboard can recover/retry deliberately |
| History/empty/load failure | Activate Refresh reservations | Loading, empty, history and failure are distinct; statuses and timezone information readable |
| Cancellation | Tab to future reservation’s Cancel button and activate; repeat click while pending | One transition; pending blocks duplicates; Cancelled history remains; removed action leaves focus on a meaningful fallback |
| Rejected cancellation | Attempt a Confirmed reservation at/after start | Clear rejection; unchanged Confirmed state; usable focus |
| Inbox/pending/error | Refresh inbox before delivery, after recovery and during controlled inbox failure | Saved booking survives failure; pending and observed entries distinguishable; explicit refresh operable |
| Preserved hello | Follow Connectivity demo; send using Enter/Space twice | Two distinct IDs/results; pending/error/success clear; focus restored without stealing it |
| Navigation | Move between booking and hello using keyboard | Links operable; each screen retains a logical keyboard entry path |

For each important transition, record the focused element before/after, exact visible status, keyboard action and outcome. Inspect live-region semantics in the native accessibility tree; record assistive-technology announcement behavior where available. Screenshots alone do not establish keyboard or announcement behavior.

**PRE-Q-001 closure evidence:** a revision-matched report documenting this manual review, including preserved hello, plus disposition of every failure. Automated keyboard/axe results supplement it. I must independently validate the report before closure.

Preserve historical skeleton reports unchanged. Add a new closure report referencing original Q-001 and PRE-Q-001, with current revision/evidence and original-reviewer verdict; coordinator updates both finding records to reference that report. This closes the accessibility evidence gap only. It does not retroactively approve historical snapshots or grant final human feature acceptance.
