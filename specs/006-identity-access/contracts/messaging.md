# Messaging contract and permissions

Existing exchange reservations (durable direct), queue reservation-notifications (durable), routes reservation.confirmed/reservation.cancelled and envelope metadata remain. Replacement schema version 1 event fields: schemaVersion,eventId,eventType,reservationId,userKey,equipmentId,equipmentName,startAt,endAt,occurredAt. userKey exactly 64 lowercase hex. No credential/access token/session/profile fields. No old demo envelope compatibility. Existing strict unknown-field validation, maximum size, timestamp rules, schema/routing consistency and trace propagation remain.

BrokerBootstrap is a pure definitions-builder library invoked by the AppHost run-mode container-file callback before broker boot. Core definitions import provisions dedicated vhost equipment, exact users/ACLs/topology without the management plugin. Existing administrator is explicitly defined using the existing secret plus `/` and equipment permissions because imported fresh nodes do not create defaults. Runtime accounts have empty tags and no other-vhost access. Only local Development exposes the existing loopback management console; ordinary other run environments and publish output retain image4.3.6 with no HTTP administration endpoint. No new management-network privilege is introduced.

| Account | configure | write | read |
| --- | --- | --- | --- |
| reservations-publisher | ^$ | ^reservations$ | ^$ |
| notifications-consumer | ^$ | ^$ | ^reservation-notifications$ |

Publisher uses confirms and mandatory publication only; it never declares resources/bindings or consumes. Consumer consumes/acks/rejects its exact queue only, never declares/binds/publishes. Bootstrap owns declarations and bindings. No default-exchange permissions. Contract tests exercise normal confirm/delivery/ack, denied publish/consume/configure unrelated resources and no other-vhost/administration authority; use separate channels per denied operation. Existing poison/retry/permanent-fault behavior and correct recipient deduplication remain.


## Boot definitions and lifecycle

Use core config `definitions.import_backend = local_filesystem`, `definitions.local.path = /etc/rabbitmq/equipment-definitions.json`, `definitions.skip_if_unchanged = true` in injected `/etc/rabbitmq/conf.d/20-equipment.conf`. AppHost uses Aspire13.6.1 async WithContainerFiles in run mode, generated named JSON contracts, owner/group999 and mode0600 files; new containing directories0700. No application-created host secret files, committed hashes or logged definitions. Verify actual container/staging permissions. Hashes are sensitive: explicit `hashing_algorithm` is `rabbit_password_hashing_sha256`, password_hash is base64(salt4 || SHA256(salt4 || UTF8password)). Derive each salt4 from SHA256 of independently generated persisted random salt material; unchanged parameters yield byte-stable files across restarts.

Broker core imports before workload readiness; users/vhosts/permissions/exchanges/queues/bindings are explicit. Existing durable/non-auto-delete flags retained. Pinned importer updates included user hashes/tags and permissions, skips existing queue/exchange definitions, deletes no unrelated state. Skip unchanged content on normal boot; no global drift scrub or operator mutation reversal promised. Workers must not become ready on failed/invalid import or wrong credentials/topology; exact runtime AMQP validation is bounded and creates no diagnostic production message.

Publish/model-only mode does not resolve local secrets, run callback or embed generated definitions/hash material. It retains ordinary infrastructure model and zero management endpoint; production secret provisioning/deployment is outside scope. Import is local-file work: safe startup preparation/readiness logs/metrics and native broker dependency traces establish outcomes; no admin-HTTP span requirement exists for this path. Failure evidence includes malformed/unreadable config, safe broker diagnostics and retained data after normal restart. No volume deletion/credential rotation/reset.
