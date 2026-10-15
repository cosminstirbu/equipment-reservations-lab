# Native review development observations

These observations are development evidence, not final accessibility approval. Final revision-matched review must repeat affected behavior after planned focus corrections.

Reviewer: primary coordinator using native CUA input/accessibility tree in Microsoft Edge 155.0.4283.45, macOS; local browser timezone Europe/Bucharest. Dates: 2026-10-14/15. Running Web `http://127.0.0.1:54442`, application-ready T037 source. No VoiceOver announcement claim; native accessibility tree and visible text/focus were observed.

| State | Native action | Observed result/focus |
|---|---|---|
| Navigation/form | Tab from page through Book equipment, Connectivity demo, Reload equipment, Equipment, date segments and calendar controls | Logical labeled order; visible calendar focus outline inspected in screenshot |
| Missing equipment | Keyboard Enter on Check availability | `Choose operational equipment.`; focus retained Check availability |
| Equipment choices | Keyboard popup open, Down, Space commit | Camera and Laptop Operational; Projector disabled Not operational. Space commits native popup; Return closed popup without committing, so corrected input method used |
| Equal interval | Native date segments entered with digit/Right keys, Enter on Check | `Start must be before end.`; Check retains focus |
| Past interval | Keyboard year correction to 2020 | `Start must not be in the past.`; Check retains focus |
| Timezone/advisory | Camera, 2091-01-01 local01:01–02:01; Enter Check | Visible Europe/Bucharest and UTC+02:00; `Available (advisory). Creation checks the dates again.` plus `Available (advisory). Booking checks these dates again.`; focus Check |
| Advisory invalidation | Keyboard changed end minute to02 | `Dates changed. Check availability again or book the new interval.`; advisory removed |
| Book | Tab to Book, Enter | `Reservation saved: Confirmed. Delivery is asynchronous; use Refresh notifications.`; focus Book; ID544215ee-3362-43f4-ae1c-9ba1aa968a81, UTC2090-12-31T23:01:00+00:00–2091-01-01T00:02:00+00:00; `Confirmation notification not yet observed.` |
| History | Tab Refresh reservations, Enter | Persisted record with local timezone/status and event59e815a5-4d9e-4ffb-8fa4-44a2185bd4f7; `Reservations refreshed.`. Focus lost to HTML/body: planned T038 correction required |
| Cancel | Keyboard Tab to future Cancel, Space | `Cancellation saved: Cancelled. Delivery is asynchronous; use Refresh notifications.`; Cancel removed, meaningful fallback focus Refresh reservations; retained Cancelled record, eventf8c05d85-4c3b-41e0-9118-cf2e6824b50b |
| Inbox | Tab Refresh notifications, Enter | `Notifications refreshed.`; both exact event IDs displayed and `Confirmation notification observed.` / `Cancellation notification observed.`; focus Refresh notifications |
| Released interval/rebooking | ShiftTab twice to Book, Enter | Same interval successfully rebooked, IDf97741d2-2b1d-455f-bb8a-ceeb0753d68e; focus Book |
| Conflict | Enter Book again | `This interval now conflicts with a confirmed reservation. Check another interval.`; focus Book |
| Inventory unavailable pending | Aspire stopped only task-owned Inventory, Space Book | `Saving reservation…`; booking/reload/date/history controls disabled, temporary HTML/body focus |
| Inventory unavailable completion | Actual bounded failure | `Inventory is unavailable. No reservation was created; try again later.`; controls reenabled and focus restored Book; latest saved result retained |
| Catalog loading/error | Keyboard ShiftTab to Reload, Space during same actual outage | `Loading equipment…`, controls disabled; then `Unable to load equipment. Inventory is unavailable; try Reload equipment.`. Focus stayed HTML/body: same planned T038 correction required. Inventory restored afterward |
| Hello navigation | ShiftTab to Connectivity demo, Enter | Preserved `/hello` with Demo Camera/camera-001 and Ready to send hello |
| Hello twice | Tab Send hello, Enter, then Space | `Hello received for Demo Camera`; distinct correlations295ced51-8db5-4118-a9b0-a9f6be38d2ef and69d5b95e-d452-4e11-bb1b-d24365769f0b; focus Send hello both times |
| Hello outage pending | Aspire stopped only task-owned RabbitMQ, Space Send hello | `Sending hello…`; button disabled, temporary HTML/body focus; completion/recovery pending at report creation |

Four actual Edge regressions and four rendered companion regressions failed for the intended Reload/history focus behavior before the coder began production correction. This is remaining planned T038 work; final manual/check evidence must revalidate it. No final acceptance or finding closure is inferred.
