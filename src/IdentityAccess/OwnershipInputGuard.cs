using System.Text.Json;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;

namespace IdentityAccess;

public static class OwnershipInputGuard
{
    private static readonly HashSet<string> IdentityHeaders = new(StringComparer.OrdinalIgnoreCase)
    {
        "X-User-Id", "X-User-Key", "X-Owner-Id", "X-Owner-Key", "X-Demo-User-Id", "X-Subject", "X-Issuer",
        "X-Authenticated-User", "X-Forwarded-User"
    };

    public static IApplicationBuilder UseOwnershipInputGuard(this IApplicationBuilder app)
    {
        return app.Use(async (context, next) =>
        {
            HttpRequest request = context.Request;
            if (!request.Path.StartsWithSegments("/api"))
            {
                await next(context);
                return;
            }

            bool invalid = request.Headers.Keys.Any(IdentityHeaders.Contains)
                || request.Query.Keys.Any(key => !AllowedQuery(request.Path, key));
            int status = 0;
            if (invalid)
            {
                status = StatusCodes.Status400BadRequest;
            }
            else if (HttpMethods.IsPost(request.Method) && request.Path.StartsWithSegments("/api/reservations"))
            {
                status = await BodyStatusAsync(request, context.RequestAborted);
            }

            if (status != 0)
            {
                await Results.Problem(statusCode: status, title: "Invalid request inputs.",
                    extensions: new Dictionary<string, object?> { ["code"] = "invalid_request" }).ExecuteAsync(context);
                return;
            }

            await next(context);
        });
    }

    private static bool AllowedQuery(PathString path, string key)
    {
        return path.Equals(new PathString("/api/availability")) && key is "equipmentId" or "startAt" or "endAt";
    }

    private static async Task<int> BodyStatusAsync(HttpRequest request, CancellationToken cancellationToken)
    {
        if (request.ContentLength > 4096)
        {
            return StatusCodes.Status413PayloadTooLarge;
        }

        request.EnableBuffering();
        byte[] buffer = new byte[4097];
        int size = 0;
        try
        {
            while (size < buffer.Length)
            {
                int read = await request.Body.ReadAsync(buffer.AsMemory(size), cancellationToken);
                if (read == 0)
                {
                    break;
                }

                size += read;
            }

            if (size > 4096)
            {
                return StatusCodes.Status413PayloadTooLarge;
            }

            bool cancellation = request.Path.Value?.EndsWith("/cancel", StringComparison.OrdinalIgnoreCase) == true;
            if (size == 0)
            {
                return cancellation ? 0 : StatusCodes.Status400BadRequest;
            }

            using var document = JsonDocument.Parse(buffer.AsMemory(0, size));
            if (cancellation)
            {
                return document.RootElement.ValueKind == JsonValueKind.Null ? 0 : StatusCodes.Status400BadRequest;
            }

            if (document.RootElement.ValueKind != JsonValueKind.Object)
            {
                return StatusCodes.Status400BadRequest;
            }

            var seen = new HashSet<string>(StringComparer.Ordinal);
            foreach (JsonProperty property in document.RootElement.EnumerateObject())
            {
                if (property.Name is not ("equipmentId" or "startAt" or "endAt") || !seen.Add(property.Name))
                {
                    return StatusCodes.Status400BadRequest;
                }
            }

            return 0;
        }
        catch (JsonException)
        {
            return StatusCodes.Status400BadRequest;
        }
        finally
        {
            request.Body.Position = 0;
        }
    }
}
