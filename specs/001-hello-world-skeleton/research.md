# Research decisions

**Date**: 2026-10-13. Repository inspected: instructions and guides, constitution 1.1.0; no existing application projects. No extension hook file exists. Research used official sources and existing team specialist input; no extra agents.

| Decision | Rationale | Alternatives considered |
| --- | --- | --- |
| .NET 10 LTS SDK 10.0.301, C# 14 | Installed supported baseline required by engineering guide | .NET 11 prerelease excluded |
| Angular 22.2.2, Node 24.15.0, TS 6.0 family | [Angular compatibility table](https://angular.dev/reference/versions) documents the baseline; official npm registry Angular22.2.2 engines accept Node24.15.0 and compiler-cli accepts TS >=6.0 <6.1. Targeted upgrade from 22.0.8 follows coder audit finding (2 critical, 2 high, 5 moderate), with zero findings reported on 22.2.2; reviewers recheck final lock | Older supported Angular unnecessary; prereleases excluded |
| Aspire 13.6.1 C# project AppHost | Installed CLI; [official package](https://www.nuget.org/packages/Aspire.Hosting.JavaScript/13.6.1) published stable Oct 7; keeps orchestration separate | Compose explicitly superseded; TypeScript/file AppHost unnecessary |
| Podman runtime | [Official prerequisites](https://aspire.dev/get-started/prerequisites/) support ASPIRE_CONTAINER_RUNTIME=podman; runtime already installed/running | Docker CLI absent; no new runtime required |
| RabbitMQ 4.3.6 / Client 7.2.2 | [Server download](https://www.rabbitmq.com/docs/download) identifies stable server; [official client package](https://www.nuget.org/packages/RabbitMQ.Client/7.2.2) targets .NET 8+ | Older unsupported broker excluded; bus abstraction unnecessary |
| JavaScript AppHost resource + npm ci + Angular proxy | [JavaScript hosting](https://aspire.dev/integrations/frameworks/javascript/) supports fixed endpoint environment references and deterministic install; same-origin calls avoid CORS | Browser discovery names do not resolve; extra gateway unnecessary |
| Explicit loopback endpoints plus live verification | [Endpoint source](https://source.dot.net/Aspire.Hosting/ApplicationModel/EndpointAnnotation.cs.html) has TargetHost and proxy configuration; source says default localhost. Actual Podman mappings are mandatory validation | IsExternal controls publishing, not workstation isolation; never rely on label alone |
| Minimal APIs, bounded transient topology/store | Smallest requested connectivity slice; confirms actual broker acceptance without introducing recovery guarantees | Database, outbox, deduplication, retries explicitly excluded |
| Narrow API/UI tests + real AppHost smoke and broker contract | Meets public-interface/test-first policy while validating RabbitMQ case by case | Pure simulated E2E insufficient; every test requiring AppHost would slow feedback |
| OpenTelemetry exporter 1.19.1 / instrumentation 1.19.0 | Stable patched versions selected during setup; verify restored dependency graph, with telemetry design unchanged | Older vulnerable transitive versions excluded |
| Aspire in-memory OTEL dashboard | Existing local inspection tool and no external infrastructure | Production telemetry persistence excluded |

All product decisions resolved by spec. Package restore, exact client package patch pinning and actual container bind behavior remain implementation checks, not assumed passed evidence. No further research or prerequisite approval is required to write tasks after design review.

## Targeted broker compatibility repair — 2026-10-14

Decision: declare hello-notifications as a durable nonexclusive queue, retaining one non-durable direct exchange, one queue, one consumer and transient/non-persistent messages. Live RabbitMQ4.3.6 rejected the previous non-durable nonexclusive declaration with INTERNAL_ERROR because transient_nonexcl_queues is deprecated and disabled by default. Use supported metadata rather than enable the deprecated feature. No volume is mounted; AppHost container recreation clears broker state, and Notifications restart clears in-memory results. Durable queue metadata does not create a persistent delivery/replay guarantee. This is a routine implementation compatibility decision with unchanged product scope and acceptance criteria. Preserve TTL/capacity, acknowledgements, publisher confirms and zero retries.
