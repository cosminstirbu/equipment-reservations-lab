# Administration Console Contract

This is a developer interface contract, not a new application API.

- Development/run: existing dashboard exposes current dynamic RabbitMQ Management and pgAdmin HTTP links. Both work through loopback; every proxy/backing host publication also remains loopback, IPv4 and IPv6. Consumer services receive no admin HTTP endpoint reference.
- RabbitMQ: existing generated development username/password provide normal login; unauthenticated management requests fail. Existing AMQP clients/topology remain compatible. Queues, exchanges, bindings, consumers and messages can be inspected; isolated messages can be published and queue contents purged.
- pgAdmin: use explicitly pinned `dpage/pgadmin4:9.18.0` rather than the installed integration's 9.15 default; opening the link requires no separate console login or server/password registration. The preconfigured server grants administrator access to all three application databases, supporting browsing, SQL, schema changes and row mutation/deletion. UI settings are disposable; recreation restores connection configuration.
- Publish and non-Development: pgAdmin and Rabbit management endpoint/plugin changes are absent, while ordinary database/broker/application resources remain.
- Secrets: documentation identifies secure retrieval from existing development secret storage/dashboard without committing values. No URL embeds credentials and no diagnostic artifact records secret-bearing generated server files or authentication payloads.
- No custom UI error/retry behavior is promised. Existing console and Aspire readiness/error surfaces apply. A console failure must not become a new dependency preventing application startup.

Observable success is usable UI behavior plus effect verification; a configured annotation or successful direct database connection alone is insufficient.
