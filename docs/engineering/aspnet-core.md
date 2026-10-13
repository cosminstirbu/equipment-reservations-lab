# ASP.NET Core

Applies to backend services. Read with [testing](testing.md) and
[observability and resilience](observability-and-resilience.md).

## Everyday defaults

Prefer focused feature code and built-in dependency injection. Choose Minimal APIs or
controllers during planning; consistency and readability matter more than a universal
choice. Do not introduce repository wrappers, mediator pipelines, or service layers
without a concrete need.

Required: use nullable reference checking, validate untrusted input, and enforce
permissions on the server. Request/response contracts must not expose persistence
internals accidentally. Business rejection, authentication failure, and unexpected
failure must remain distinguishable to clients.

Use asynchronous I/O and propagate cancellation. Do not block with `.Result` or `.Wait()`
or wrap synchronous I/O in `Task.Run`. Background work must have an appropriate lifetime;
do not capture request-scoped services after the request ends.

Source: [ASP.NET Core best practices](https://learn.microsoft.com/en-us/aspnet/core/fundamentals/best-practices?view=aspnetcore-10.0).

## Relevant .NET 10 features

Prefer built-in capabilities before adding equivalent libraries:

- Minimal APIs support validation through `AddValidation()` and DataAnnotations.
  Keep business rules separate from request-shape validation.
- Built-in OpenAPI generation supports OpenAPI 3.1. Check compatibility with Angular
  client-generation tools before selecting the document version.
- Known API endpoints using cookie authentication return 401/403 instead of redirects.
  Test authentication behavior with the chosen endpoint style.
- Handled exceptions can have diagnostics suppressed by default. Verify important failures
  still produce the telemetry required by our observability guide.

Use Problem Details for consistent HTTP errors without leaking stack traces or secrets.
An HTTP error response is not evidence that the failure was logged or traced.

Sources: [.NET 10 release notes](https://learn.microsoft.com/en-us/aspnet/core/release-notes/aspnetcore-10.0?view=aspnetcore-10.0)
and [Error handling](https://learn.microsoft.com/en-us/aspnet/core/fundamentals/error-handling?view=aspnetcore-10.0).

## C# 14: use when clearer

The `field` keyword can remove backing-field boilerplate; extension members can express
small reusable operations; null-conditional assignment can simplify optional updates.
Use these features when they reveal intent. Do not obscure business rules with clever
syntax or adopt span-based optimization without a measured need.

Source: [C# 14 changes](https://learn.microsoft.com/en-us/dotnet/csharp/whats-new/csharp-14).

## Planning decisions

Record persistence technology, authentication scheme, API style, and concurrency strategy
for the feature. Reservation rules involving concurrent requests must be tested through
public interfaces against the real database. Do not invent overlap or approval rules;
obtain those decisions from the human owner.
