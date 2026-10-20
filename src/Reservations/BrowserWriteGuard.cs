using System.Globalization;
using System.Text.RegularExpressions;
using ApiDocumentation;
using Microsoft.Net.Http.Headers;

namespace Reservations;

internal static partial class BrowserWriteGuard
{
    public static void UseBrowserWriteGuard(this WebApplication app)
    {
        string? configuredOrigin = app.Configuration["Application:ExternalOrigin"];
        if (configuredOrigin is not null)
        {
            ApiDocumentationExtensions.ValidateExternalOrigin(configuredOrigin);
        }

        Uri? externalOrigin = configuredOrigin is null ? null : new Uri(configuredOrigin);
        _ = app.Use(async (context, next) =>
        {
            HttpRequest request = context.Request;
            if (!HttpMethods.IsPost(request.Method) || !request.Path.StartsWithSegments("/api"))
            {
                await next(context);
                return;
            }

            if (!Admitted(request, externalOrigin))
            {
                await Results.Problem(statusCode: 403, title: "Browser write not allowed",
                    detail: "Use the local application or a direct local API client.",
                    extensions: new Dictionary<string, object?> { ["code"] = "browser_write_forbidden" }).ExecuteAsync(context);
                return;
            }

            if (request.Path.Value?.TrimEnd('/').Equals("/api/reservations", StringComparison.OrdinalIgnoreCase) == true
                && !JsonUtf8(request))
            {
                await Results.Problem(statusCode: 415, title: "JSON content type required",
                    detail: "Send application/json encoded as UTF-8.",
                    extensions: new Dictionary<string, object?> { ["code"] = "unsupported_media_type" }).ExecuteAsync(context);
                return;
            }

            await next(context);
        });
    }

    private static bool Admitted(HttpRequest request, Uri? externalOrigin)
    {
        if ((!request.Scheme.Equals("http", StringComparison.OrdinalIgnoreCase)
                && !request.Scheme.Equals("https", StringComparison.OrdinalIgnoreCase))
            || request.Headers.Host.Count != 1
            || (externalOrigin is null ? !CanonicalAuthority(request.Host.Value) : request.Host.Value != externalOrigin.Authority))
        {
            return false;
        }

        if (request.Headers.TryGetValue("Origin", out Microsoft.Extensions.Primitives.StringValues origins))
        {
            if (origins.Count != 1 || origins[0] is not { Length: > 0 and <= 128 } value || value.Any(character => !char.IsAscii(character)))
            {
                return false;
            }

            if (externalOrigin is not null)
            {
                return value == externalOrigin.GetLeftPart(UriPartial.Authority);
            }

            Match origin = Origin().Match(value);
            return origin.Success && CanonicalAuthority(origin.Groups["authority"].Value);
        }

        return !request.Headers.ContainsKey("Referer")
            && !request.Headers.Keys.Any(name => name.StartsWith("Sec-Fetch-", StringComparison.OrdinalIgnoreCase));
    }

    private static bool CanonicalAuthority(string? value)
    {
        if (value is null || value.Length is 0 or > 128 || value.Any(character => !char.IsAscii(character)))
        {
            return false;
        }

        Match authority = Authority().Match(value);
        if (!authority.Success)
        {
            return false;
        }

        string port = authority.Groups["port"].Value;
        return port.Length == 0 || (int.TryParse(port, NumberStyles.None, CultureInfo.InvariantCulture, out int number) && number is >= 1 and <= 65535);
    }

    private static bool JsonUtf8(HttpRequest request)
    {
        if (request.Headers.ContentType.Count != 1 || request.ContentType is not { Length: > 0 and <= 128 } value
            || !MediaTypeHeaderValue.TryParse(value, out MediaTypeHeaderValue? media)
            || !media.MediaType.Equals("application/json", StringComparison.OrdinalIgnoreCase))
        {
            return false;
        }

        if (media.Parameters.Count == 0)
        {
            return true;
        }

        if (media.Parameters.Count != 1)
        {
            return false;
        }

        NameValueHeaderValue parameter = media.Parameters[0];
        return parameter.Name.Equals("charset", StringComparison.OrdinalIgnoreCase)
            && parameter.Value.Value?.Trim('"').Equals("utf-8", StringComparison.OrdinalIgnoreCase) == true;
    }

    [GeneratedRegex(@"^(?:localhost|127\.0\.0\.1|\[::1\])(?::(?<port>[0-9]{1,5}))?\z", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant, 50)]
    private static partial Regex Authority();

    [GeneratedRegex(@"^https?://(?<authority>(?:localhost|127\.0\.0\.1|\[::1\])(?::[0-9]{1,5})?)\z", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant, 50)]
    private static partial Regex Origin();
}
