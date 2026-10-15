# Walking-skeleton retirement

On 2026-10-15 the owner authorized retirement of the hello walking skeleton now
that bookings provides the application journey. The current implementation removes
its UI, operations, transient notification store, messaging and telemetry. Shared
booking contracts moved from HelloMessaging to ReservationMessaging; wire formats,
reservation topology, data and recovery behavior are preserved.

The AppHost secret-store identifier `equipment-hello-apphost-local` intentionally
remains unchanged so existing local credentials still match persistent storage.
Existing obsolete broker resources and messages are left untouched; this work does
not authorize purging them or resetting local data.

Historical agreements and reviews describe earlier revisions and are preserved
byte-for-byte. Their verdicts do not approve this retirement. See the
[walking skeleton](../../specs/001-hello-world-skeleton/),
[booking feature](../../specs/002-book-cancel-equipment/) and
[database tracing](../../specs/003-database-tracing/) records.
The [retirement specification](../../specs/004-remove-hello/spec.md) and its team
records hold the current review and acceptance status. Authorization to implement
is separate from acceptance of the completed result.
