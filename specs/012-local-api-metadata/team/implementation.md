# Implementation evidence

Feature: `012-local-api-metadata`; base revision `4dd685c4e34288f94e932dcd49beb22eea965075`; working-tree changes identify each checkpoint below. Coder owns author evidence, not independent verdicts.

## Setup and test design (T001–T002)

Inventory confirmed against source and coverage matrix: eight operations; five application models with 33 declared properties; framework ProblemDetails and its optional code/field extensions. Unrelated Kubernetes documents and approved OpenAPI guide amendment preserved. Existing ignores cover build/generated/node artifacts; private root package is not published and needs no npmignore. No implementation extension hooks file exists.

Requirements checklist 16/16 checked; custom metadata-quality checklist 8/8 checked. Read-only gates passed. Prerequisites script selected this exact feature directory. Applicable standards: constitution, formatting, testing, ASP.NET Core, OpenAPI and linked observability/resilience/Aspire guides; plan records their application.

Existing HTTP document tests retain production routing, middleware, metadata, source-generated application JSON and actual OpenAPI generation. Real isolated PostgreSQL is provisioned/migrated through PostgresFixture. Existing IdentityAuthorityFixture replaces the external identity provider's discovery/JWKS/token boundary; fidelity remains established by existing identity provider contract tests. Notifications retains its production background consumer/subscription; this document test does not configure a broker and makes no delivery/readiness claim. No new doubles or solitary tests. New assertions observe descriptions in `/openapi/v1.json`; omission of any scoped model/property/operation/input/outcome prose must fail without freezing exact wording. Existing shape/security/environment assertions remain unchanged. Full application suite guards runtime behavior.

Container environment for focused commands: `DOCKER_HOST=unix:///var/folders/6k/z9rq_rsj7gj5ghmy_rx43nzh0000gp/T/podman/podman-machine-default-api.sock ASPIRE_CONTAINER_RUNTIME=podman TESTCONTAINERS_RYUK_DISABLED=true`. Commands run with cache/container access outside sandbox when required.

## US1 red (T003)

`npm run check:openapi` with the environment above: exit 1; build 0 warnings/errors; Inventory 1 failed/3 passed, Reservations and Notifications each 1 failed/2 passed. Intended failures: `Missing description for EquipmentItem.`, `ReservationInput.`, and `InboxEntry.` respectively. Existing fixture/environment checks succeeded. Raw author log: `/tmp/metadata-model-red.log` (temporary, not committed).

## US1 green (T004–T008)

`npm run check:openapi`: exit 0; build 0 warnings/errors; all 10 HTTP documentation tests pass (Inventory4, Reservations3, Notifications3). Model/type Description attributes surface natively; no bridge or reflection workaround added. Every exposed model/property description checked, existing shape/security/environment expectations retained. Reservation input transformer no longer owns property prose; its strict valid-input schema corrections remain. Prose facts checked against ReservationValidation, ReservationStore (half-open intervals/lifecycle), ReservationInbox (event/receipt timestamps), and existing contracts. Log: `/tmp/metadata-model-attributes.log`.

## US2 red/green (T009–T013)

Before endpoint edits, `npm run check:openapi`: exit 1; intended failures `Missing description for CreateReservation request body.` and `Missing description for GetEquipment parameter id.` Notifications already had nonempty generic response descriptions and passed; those were replaced with useful outcome prose. Log: `/tmp/metadata-operation-red.log`.

After endpoint-local transformations, `npm run check:openapi`: exit 0, clean build, all 10 tests pass. Log: `/tmp/metadata-operation-green.log`. Existing operation IDs/routes/status sets, request/response schema references, required input fields, non-null strict input strings, extra-property rejection, Location header, empty read auth bodies, optional write403 Problem Details, security schemes and Development-only visibility assertions are unchanged. Final run additionally checks semantic write403 prose differentiates bodyless auth from browser rejection.

## Ownership and author inspection (T014; T015 structural portion)

Inspected complete source diff: handler statements, routes, parameter types/names/binding, authorization, serializer registration, storage and error handling are unchanged. Only Description attributes decorate existing path parameters; no Required/Range/validation attributes or new bound inputs. All model/property prose belongs to records; all operation-specific prose/corrections belong to endpoint chains. Shared framework ProblemDetails prose remains central because those declarations are framework-owned. ReservationDocumentation retains only its ReservationInput strict valid-input shape correction because nullable storage/manual validation intentionally differs from the valid wire request. It contains no property prose and no operation-ID dispatch. Existing security/server/document transformers remain untouched.

Checked prose against source: nonoperational equipment is400 (InventoryClient), overlap409 and half-open intervals (ReservationStore), source/receipt timestamp distinction and event types (ReservationInbox), cancellation repeat-before-start semantics (ReservationStore) and timestamp precision/offset rules (ReservationValidation). No new examples, secrets, persistence-only models, operational routes, UI/auth exposure or runtime behavior introduced. Existing shared helper is unchanged and no documentation DSL added.

Scoped `dotnet format style EquipmentReservation.slnx --no-restore --severity info --verify-no-changes --include <nine edited C# files>`: exit0, no diagnostics (`/tmp/metadata-style.log`). Per-edit format hook or exact-file command executed after each source edit; reread and inspected. `git diff --check`: exit0. No committed exported baseline or snapshot-comparison framework added; unchanged shape confidence comes from existing assertions, source diff and full application checks (coordinator-owned final gate).

## Final focused checkpoint

`npm run check:openapi` with documented Podman environment: exit0, clean build, Inventory4/Reservations3/Notifications3 all pass; no skips. Includes final semantic lifecycle/advisory/timestamp/write403 checks and retained existing expectations. Log `/tmp/metadata-final-focused.log`. Application/test source frozen for coordinator format/lint/full suite and independent reviews. T015 runtime portion and T016–T017 remain pending coordinator evidence. No extension hooks exist to dispatch before/after implementation.
