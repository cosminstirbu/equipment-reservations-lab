using System.Net;
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
                && value.EndsWith(": failed to listen on TCP socket: address already in use", StringComparison.Ordinal);
        }
        catch (JsonException)
        {
            return false;
        }
    }
}
