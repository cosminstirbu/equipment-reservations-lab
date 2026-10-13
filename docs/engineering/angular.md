# Angular

Applies to the client. Read with [testing](testing.md) and the [constitution](../../.specify/memory/constitution.md).
The Angular team's recommendations below are defaults unless marked as required.

## Components and state

Prefer standalone components, signal-based local state, `computed()` for derived values,
and `input()` / `output()` for component contracts. Use `model()` for genuine two-way
bindings and `linkedSignal()` for writable state that must stay synchronized with reactive
sources. Prefer `inject()` and the decorator's `host` object over `@HostBinding` or
`@HostListener`. Keep transformations pure and predictable; use signal `set()` or `update()`,
not `mutate`. Lazy-load feature routes and use `NgOptimizedImage` for static images;
inline base64 images are unsupported.

Follow the pinned version: omit redundant `standalone: true` from v20 and explicit
`ChangeDetectionStrategy.OnPush` from v22, where these are defaults.
Prefer Signal Forms on v22+, where stable; otherwise prefer Reactive Forms.
For v22+ singleton services, follow the team's `@Service` guidance; for earlier versions,
use `@Injectable({ providedIn: 'root' })`. Keep subscriptions lifecycle-bound.

Source: [Angular team's best practices](https://angular.dev/assets/context/best-practices.md),
linked from its [AI guidance](https://angular.dev/ai/develop-with-ai).

## Templates

Prefer `@if`, `@for`, and `@switch` over structural directive equivalents, and direct
class/style bindings over `ngClass` / `ngStyle`. Import only the needed directives and
pipes rather than `CommonModule`. Use `AsyncPipe` for template observables.

Prefer inline templates for small components. External template/style paths are relative
to the component TypeScript file. Keep expressions simple; do not assume JavaScript
globals such as `Date` are available in templates.

## Code organization

Prefer feature folders, focused components, and colocated templates, styles, and tests.
Keep services focused on one responsibility as well.
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
