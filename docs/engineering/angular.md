# Angular

Applies to the client. Read with [testing](testing.md) and the [constitution](../../.specify/memory/constitution.md).
The Angular team's recommendations below are defaults unless marked as required.

## Components and state

Prefer standalone components, signal-based local state, `computed()` for derived values,
and `input()` / `output()` for component contracts. Use `model()` for genuine two-way
bindings. Prefer `inject()`, decorator `host` bindings, native template control flow,
and direct class/style bindings. Keep state transformations predictable; use signal
`set()` or `update()`. Lazy-load feature routes and use `NgOptimizedImage` for static
images where supported.

Follow the pinned version: standalone is implicit from v20; OnPush is the default from
v22. Prefer Signal Forms on v22+, where stable; otherwise prefer Reactive Forms.
For v22+ singleton services, follow the team's `@Service` guidance; for earlier versions,
use `@Injectable({ providedIn: 'root' })`. Keep subscriptions lifecycle-bound.

Source: [Angular team's AI guidance](https://angular.dev/ai/develop-with-ai).

## Code organization

Prefer feature folders, focused components, and colocated templates, styles, and tests.
Use descriptive hyphenated filenames rather than generic helpers or utilities.
Keep templates and lifecycle hooks simple; give non-trivial logic a meaningful name.
Template-only members can be protected; do not make them public for tests.

TypeScript must use strict checking. Avoid `any`; narrow `unknown` at untrusted boundaries.
Prefer inferred types when clear. Keep Angular-owned input/output references readonly.

Sources: [Style guide](https://angular.dev/style-guide) and
[TypeScript guidance](https://angular.dev/ai/develop-with-ai).

## User-facing behavior

Required: use semantic HTML, keyboard-operable controls, labels, clear validation messages,
and deliberate focus management. Meet WCAG AA and pass automated axe checks for changed
screens; also review keyboard behavior manually. Automated checks alone are insufficient.

Required: keep Angular's sanitization protections. Do not bypass them without a reviewed
reason. Route guards improve navigation but do not replace server-side authorization.

Sources: [Accessibility guidance](https://angular.dev/ai/develop-with-ai) and
[Security](https://angular.dev/best-practices/security).

## Tests

Prefer the Angular CLI's supported test setup; current new projects use Vitest.
Exercise rendered output, user actions, and component inputs/outputs through TestBed.
Keep internal collaborators real; double HTTP boundaries. Use browser tests when behavior
requires actual browser capabilities. Do not assert private fields or component internals.

Source: [Angular testing](https://angular.dev/guide/testing).
