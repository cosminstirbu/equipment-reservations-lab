using System.Globalization;
using System.Net;
using System.Net.Sockets;
using System.Text.Json;
using Docker.DotNet;

namespace TestSupport;

internal static class ContainerStartup
{
    public static async Task StartAsync(Func<CancellationToken, Task> start, CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        try
        {
            await start(cancellationToken);
        }
        catch (DockerApiException exception) when (IsPublicationCollision(exception))
        {
            // Docker releases failed pre-process publications before returning this error.
            await Task.Delay(TimeSpan.FromMilliseconds(Random.Shared.Next(100, 201)), cancellationToken);
            cancellationToken.ThrowIfCancellationRequested();
            await start(cancellationToken);
        }
    }

    private static bool IsPublicationCollision(DockerApiException exception)
    {
        if (exception.StatusCode != HttpStatusCode.InternalServerError
            || string.IsNullOrWhiteSpace(exception.ResponseBody))
        {
            return false;
        }

        try
        {
            using var response = JsonDocument.Parse(exception.ResponseBody);
            if (response.RootElement.ValueKind != JsonValueKind.Object
                || !response.RootElement.TryGetProperty("message", out JsonElement message)
                || message.ValueKind != JsonValueKind.String)
            {
                return false;
            }

            string value = message.GetString()!;
            return value.StartsWith("failed to set up container networking: driver failed programming external connectivity on endpoint ", StringComparison.Ordinal)
                && (value.EndsWith(": failed to listen on TCP socket: address already in use", StringComparison.Ordinal)
                    || IsLoopbackTcpBindCollision(value));
        }
        catch (JsonException)
        {
            return false;
        }
    }

    private static bool IsLoopbackTcpBindCollision(string message)
    {
        const string bindingPrefix = ": failed to bind host port for 127.0.0.1::";
        const string bindingSuffix = "/tcp: address already in use";
        int bindingStart = message.LastIndexOf(bindingPrefix, StringComparison.Ordinal);
        if (bindingStart < 0 || !message.EndsWith(bindingSuffix, StringComparison.Ordinal))
        {
            return false;
        }

        int addressStart = bindingStart + bindingPrefix.Length;
        int bindingEnd = message.Length - bindingSuffix.Length;
        if (bindingEnd <= addressStart)
        {
            return false;
        }

        int separator = message.LastIndexOf(':', bindingEnd - 1, bindingEnd - addressStart);
        if (separator <= addressStart)
        {
            return false;
        }

        string addressText = message[addressStart..separator];
        return IPAddress.TryParse(addressText, out IPAddress? address)
            && address.AddressFamily == AddressFamily.InterNetwork
            && address.ToString() == addressText
            && ushort.TryParse(message.AsSpan(separator + 1, bindingEnd - separator - 1), NumberStyles.None,
                CultureInfo.InvariantCulture, out ushort port)
            && port > 0;
    }
}
