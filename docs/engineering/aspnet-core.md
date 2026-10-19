# ASP.NET Core

Applies to backend services. Read with [testing](testing.md) and
[observability](observability.md) and [resilience](resilience.md).

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

## Source generation

Application code must use supported .NET source generators when the required types,
patterns, or call sites are known at compile time. Apply this rule to existing code when
changing it and during engineering-practice migrations. Preserve behavior and wire
contracts; do not introduce a feature solely to use its generator.

- JSON: declare `JsonSerializerContext` types with `[JsonSerializable]` for known
  contracts. Use `JsonTypeInfo<T>` overloads for explicit serialization, deserialization,
  and HTTP client JSON calls. Register contexts ahead of fallback resolvers in ASP.NET
  Core HTTP JSON options. Use named response contracts instead of anonymous objects.
  Preserve web defaults and include collection types. Metadata generation is needed for
  deserialization and asynchronous HTTP serialization.
- Logging: use `[LoggerMessage]` partial methods with stable event IDs and structured
  message templates for application log events.
- Regular expressions: use `[GeneratedRegex]` partial members for constant patterns
  and supported options. Preserve matching options and timeouts. Simple character
  validation does not need to become a regular expression.
- Other features: use the supported generator for applicable configuration binding,
  Minimal API request delegates, interop (`LibraryImport`), and other .NET capabilities
  when those features are present. Check the target framework's support and generator
  diagnostics, and enable opt-in generators in the owning project when applicable.

Dynamic inputs or unsupported generator behavior require a documented rationale for
an exception and owner approval under the engineering standards. Framework-owned
serialization is governed by the framework; registering application contexts does not
make the entire service Native AOT compatible. Tests may construct raw JSON or use
independent fixture serialization to verify wire compatibility and malformed inputs;
application serializers must use generated metadata.

Sources: [JSON source generation](https://learn.microsoft.com/en-us/dotnet/standard/serialization/system-text-json/source-generation),
[generated logging](https://learn.microsoft.com/en-us/dotnet/core/extensions/logging/source-generation),
[generated regular expressions](https://learn.microsoft.com/en-us/dotnet/standard/base-types/regular-expression-source-generators),
[configuration binding](https://learn.microsoft.com/en-us/dotnet/core/extensions/configuration-generator),
[request delegate generation](https://learn.microsoft.com/en-us/aspnet/core/fundamentals/aot/request-delegate-generator/rdg?view=aspnetcore-10.0),
and [interop generation](https://learn.microsoft.com/en-us/dotnet/standard/native-interop/pinvoke-source-generation).

## Relevant .NET 10 features

Prefer built-in capabilities before adding equivalent libraries:

- Minimal APIs support validation through `AddValidation()` and DataAnnotations.
  Keep business rules separate from request-shape validation.
- For generated API documents and interactive testing, follow the
  [OpenAPI guide](openapi.md).
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
