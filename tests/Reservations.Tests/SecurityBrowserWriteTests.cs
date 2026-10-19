using System.Net;
using System.Net.Http.Json;
using System.Net.Sockets;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using Xunit;

namespace Reservations.Tests;

[Collection("Authentication and input security")]
public sealed class SecurityBrowserWriteTests(PostgresFixture postgres)
{
    private static readonly string[] DuplicateOrigins = ["http://localhost", "http://localhost"];

    [Theory]
    [InlineData("http://evil.test")]
    [InlineData("https://evil.localhost")]
    [InlineData("http://localhost.evil")]
    [InlineData("http://127.0.0.1.evil")]
    [InlineData("null")]
    [InlineData("")]
    [InlineData("http://user@localhost")]
    [InlineData("http://localhost/")]
    [InlineData("http://localhost?query=1")]
    [InlineData("http://localhost#fragment")]
    [InlineData("file://localhost")]
    [InlineData("http://127.1")]
    [InlineData("http://localhost.")]
    [InlineData("http://localhost:0")]
    [InlineData("http://localhost:65536")]
    [InlineData("http://localhost,http://evil.test")]
    [InlineData("http://localhost http://evil.test")]
    [InlineData("not-an-origin")]
    public async Task UntrustedOrMalformedOriginCannotCreateOrCancelEvenWithForgedSameOriginMetadata(string origin)
    {
        await using BookingScenario scenario = await BookingScenario.CreateAsync(postgres);
        BookedReservation original = (await (await scenario.BookAsync()).Content.ReadFromJsonAsync<BookedReservation>(cancellationToken: TestContext.Current.CancellationToken))!;
        int calls = scenario.Inventory.Calls;
        using HttpRequestMessage create = CreateRequest("text/plain");
        _ = create.Headers.TryAddWithoutValidation("Origin", origin);
        _ = create.Headers.TryAddWithoutValidation("Sec-Fetch-Site", "same-origin");
        _ = create.Headers.TryAddWithoutValidation("X-Forwarded-Host", "localhost");
        await AssertForbiddenAsync(scenario.Client, create);
        foreach (Guid id in new[] { original.Id, Guid.NewGuid() })
        {
            using var cancel = new HttpRequestMessage(HttpMethod.Post, $"/api/reservations/{id}/cancel");
            _ = cancel.Headers.TryAddWithoutValidation("Origin", origin);
            await AssertForbiddenAsync(scenario.Client, cancel, origin.Length == 0 ? scenario : null, "Origin");
        }

        Assert.Equal(original, await scenario.Client.GetFromJsonAsync<BookedReservation>($"/api/reservations/{original.Id}", cancellationToken: TestContext.Current.CancellationToken));
        Assert.Equal(1L, await scenario.CountAsync("reservations"));
        Assert.Equal(1L, await scenario.CountAsync("reservation_outbox"));
        Assert.Equal(calls, scenario.Inventory.Calls);
    }

    [Theory]
    [InlineData("Sec-Fetch-Site", "same-origin")]
    [InlineData("Sec-Fetch-Site", "none")]
    [InlineData("Sec-Fetch-Site", "")]
    [InlineData("Sec-Fetch-Mode", "cors")]
    [InlineData("Sec-Fetch-Unknown", "")]
    [InlineData("Referer", "http://localhost:4200/")]
    public async Task OriginlessBrowserMetadataBlocksAllReservationPostsBeforeDependencies(string header, string value)
    {
        await using BookingScenario scenario = await BookingScenario.CreateAsync(postgres);
        foreach (string path in new[] { "/api/reservations", $"/api/reservations/{Guid.NewGuid()}/cancel" })
        {
            using HttpRequestMessage request = CreateRequest("application/json", path);
            _ = request.Headers.TryAddWithoutValidation(header, value);
            await AssertForbiddenAsync(scenario.Client, request, value.Length == 0 ? scenario : null, header);
        }

        Assert.Equal(0, scenario.Inventory.Calls);
        Assert.Equal(0L, await scenario.CountAsync("reservations"));
        Assert.Equal(0L, await scenario.CountAsync("reservation_outbox"));
    }

    [Theory]
    [InlineData("evil.test")]
    [InlineData("localhost.evil")]
    [InlineData("localhost.")]
    [InlineData("127.1")]
    [InlineData("2130706433")]
    [InlineData("[::ffff:127.0.0.1]")]
    [InlineData("localhost:0")]
    [InlineData("localhost:65536")]
    public async Task NoncanonicalRequestHostIsRejectedDespiteTrustedOrigin(string host)
    {
        await using BookingScenario scenario = await BookingScenario.CreateAsync(postgres);
        using HttpRequestMessage request = CreateRequest("application/json");
        _ = request.Headers.TryAddWithoutValidation("Host", host);
        _ = request.Headers.TryAddWithoutValidation("Origin", "http://localhost:4200");
        await AssertForbiddenAsync(scenario.Client, request);
        Assert.Equal(0, scenario.Inventory.Calls);
        Assert.Equal(0L, await scenario.CountAsync("reservations"));
        Assert.Equal(0L, await scenario.CountAsync("reservation_outbox"));
    }

    [Theory]
    [InlineData("text/plain")]
    [InlineData("application/x-www-form-urlencoded")]
    [InlineData("multipart/form-data; boundary=demo")]
    [InlineData("application/vendor+json")]
    [InlineData("application/json; charset=utf-16")]
    [InlineData("application/json; extra=value")]
    [InlineData("application/json, text/plain")]
    [InlineData(null)]
    public async Task LocalCreationRequiresParsedJsonUtf8MediaBeforeAnyEffects(string? contentType)
    {
        await using BookingScenario scenario = await BookingScenario.CreateAsync(postgres);
        using HttpRequestMessage request = CreateRequest(contentType);
        using HttpResponseMessage response = await scenario.Client.SendAsync(request, TestContext.Current.CancellationToken);
        Assert.Equal(HttpStatusCode.UnsupportedMediaType, response.StatusCode);
        using var problem = JsonDocument.Parse(await response.Content.ReadAsStringAsync(TestContext.Current.CancellationToken));
        Assert.Equal("unsupported_media_type", problem.RootElement.GetProperty("code").GetString());
        Assert.Equal(0, scenario.Inventory.Calls);
        Assert.Equal(0L, await scenario.CountAsync("reservations"));
        Assert.Equal(0L, await scenario.CountAsync("reservation_outbox"));
    }

    [Theory]
    [InlineData("/api/reservations/")]
    [InlineData("/API/RESERVATIONS")]
    public async Task CreationRouteVariantsCannotBypassJsonMediaPolicy(string path)
    {
        await using BookingScenario scenario = await BookingScenario.CreateAsync(postgres);
        using HttpRequestMessage request = CreateRequest("text/plain", path);
        Assert.Equal(HttpStatusCode.UnsupportedMediaType, (await scenario.Client.SendAsync(request, TestContext.Current.CancellationToken)).StatusCode);
        Assert.Equal(0, scenario.Inventory.Calls);
        Assert.Equal(0L, await scenario.CountAsync("reservations"));
        Assert.Equal(0L, await scenario.CountAsync("reservation_outbox"));
    }

    [Theory]
    [InlineData("localhost:54321", "http://localhost:4200", "application/json")]
    [InlineData("127.0.0.1:54321", "https://LOCALHOST:4200", "APPLICATION/JSON; CHARSET=UTF-8")]
    [InlineData("[::1]:54321", "http://[::1]:4200", "application/json; charset=\"utf-8\"")]
    [InlineData("localhost", null, "application/json; charset=utf-8")]
    public async Task TrustedLoopbackProxyAndHeaderFreeCliRetainBookingAndBodylessCancellation(string host, string? origin, string contentType)
    {
        await using BookingScenario scenario = await BookingScenario.CreateAsync(postgres);
        using HttpRequestMessage request = CreateRequest(contentType);
        _ = request.Headers.TryAddWithoutValidation("Host", host);
        if (origin is not null)
        {
            _ = request.Headers.TryAddWithoutValidation("Origin", origin);
            _ = request.Headers.TryAddWithoutValidation("Sec-Fetch-Site", "cross-site");
        }

        using HttpResponseMessage response = await scenario.Client.SendAsync(request, TestContext.Current.CancellationToken);
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        BookedReservation saved = (await response.Content.ReadFromJsonAsync<BookedReservation>(cancellationToken: TestContext.Current.CancellationToken))!;
        using var cancel = new HttpRequestMessage(HttpMethod.Post, $"/api/reservations/{saved.Id}/cancel");
        _ = cancel.Headers.TryAddWithoutValidation("Host", host);
        if (origin is not null)
        {
            _ = cancel.Headers.TryAddWithoutValidation("Origin", origin);
        }

        Assert.Equal(HttpStatusCode.OK, (await scenario.Client.SendAsync(cancel, TestContext.Current.CancellationToken)).StatusCode);
        Assert.Equal(1L, await scenario.CountAsync("reservations"));
        Assert.Equal(2L, await scenario.CountAsync("reservation_outbox"));
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task DuplicateOrOversizedOriginIsRejected(bool oversized)
    {
        await using BookingScenario scenario = await BookingScenario.CreateAsync(postgres);
        using HttpRequestMessage request = CreateRequest("application/json");
        _ = request.Headers.TryAddWithoutValidation("Origin", oversized ? ["http://localhost:" + new string('1', 129)] : DuplicateOrigins);
        await AssertForbiddenAsync(scenario.Client, request);
        Assert.Equal(0, scenario.Inventory.Calls);
        Assert.Equal(0L, await scenario.CountAsync("reservation_outbox"));
    }

    private static HttpRequestMessage CreateRequest(string? contentType, string path = "/api/reservations")
    {
        byte[] body = JsonSerializer.SerializeToUtf8Bytes(new
        {
            equipmentId = "laptop-001",
            startAt = "2030-01-03T12:00:00Z",
            endAt = "2030-01-03T13:00:00Z"
        });
        var request = new HttpRequestMessage(HttpMethod.Post, path) { Content = new ByteArrayContent(body) };
        if (contentType is not null)
        {
            _ = request.Content.Headers.TryAddWithoutValidation("Content-Type", contentType);
        }

        return request;
    }

    private static async Task<HttpResponseMessage> SendEmptyHeaderAsync(BookingScenario scenario, HttpRequestMessage request, string emptyHeader)
    {
        using var deadline = new CancellationTokenSource(TimeSpan.FromSeconds(10));
        using WebApplicationFactory<Program> app = scenario.App.WithWebHostBuilder(builder => { });
        app.UseKestrel(options => options.Listen(IPAddress.Loopback, 0));
        using HttpClient initialized = app.CreateClient();
        Uri endpoint = initialized.BaseAddress!;
        using var socket = new TcpClient();
        await socket.ConnectAsync(endpoint.Host, endpoint.Port, deadline.Token);
        await using NetworkStream stream = socket.GetStream();
        byte[] body = request.Content is null ? [] : await request.Content.ReadAsByteArrayAsync(deadline.Token);
        var headers = new StringBuilder($"POST {request.RequestUri!.OriginalString} HTTP/1.1\r\nHost: localhost:{endpoint.Port}\r\nConnection: close\r\n{emptyHeader}:\r\n");
        _ = headers.Append("Authorization: ").Append(scenario.Client.DefaultRequestHeaders.Authorization).Append("\r\n");
        foreach (KeyValuePair<string, System.Net.Http.Headers.HeaderStringValues> header in request.Headers.NonValidated)
        {
            if (!header.Key.Equals(emptyHeader, StringComparison.OrdinalIgnoreCase))
            {
                _ = headers.Append(header.Key).Append(": ").Append(header.Value.ToString()).Append("\r\n");
            }
        }

        if (request.Content is not null)
        {
            foreach (KeyValuePair<string, System.Net.Http.Headers.HeaderStringValues> header in request.Content.Headers.NonValidated)
            {
                if (!header.Key.Equals("Content-Length", StringComparison.OrdinalIgnoreCase))
                {
                    _ = headers.Append(header.Key).Append(": ").Append(header.Value.ToString()).Append("\r\n");
                }
            }
        }

        _ = headers.Append("Content-Length: ").Append(body.Length).Append("\r\n\r\n");
        await stream.WriteAsync(Encoding.ASCII.GetBytes(headers.ToString()), deadline.Token);
        await stream.WriteAsync(body, deadline.Token);
        using var reader = new StreamReader(stream, Encoding.UTF8, leaveOpen: true);
        string statusLine = (await reader.ReadLineAsync(deadline.Token))!;
        var status = (HttpStatusCode)int.Parse(statusLine.Split(' ')[1], System.Globalization.CultureInfo.InvariantCulture);
        bool chunked = false;
        string? line;
        while (!string.IsNullOrEmpty(line = await reader.ReadLineAsync(deadline.Token)))
        {
            chunked |= line.Equals("Transfer-Encoding: chunked", StringComparison.OrdinalIgnoreCase);
        }

        string content;
        if (chunked)
        {
            var decoded = new StringBuilder();
            while (true)
            {
                string sizeLine = (await reader.ReadLineAsync(deadline.Token))!;
                int size = int.Parse(sizeLine.Split(';')[0], System.Globalization.NumberStyles.HexNumber, System.Globalization.CultureInfo.InvariantCulture);
                if (size == 0)
                {
                    break;
                }

                Assert.InRange(size, 1, 8192);
                char[] buffer = new char[size];
                Assert.Equal(size, await reader.ReadBlockAsync(buffer, deadline.Token));
                _ = decoded.Append(buffer);
                _ = await reader.ReadLineAsync(deadline.Token);
            }

            content = decoded.ToString();
        }
        else
        {
            content = await reader.ReadToEndAsync(deadline.Token);
        }

        return new HttpResponseMessage(status) { Content = new StringContent(content, Encoding.UTF8, "application/json") };
    }

    private static async Task AssertForbiddenAsync(HttpClient client, HttpRequestMessage request, BookingScenario? rawHost = null, string? emptyHeader = null)
    {
        using HttpResponseMessage response = rawHost is null
            ? await client.SendAsync(request)
            : await SendEmptyHeaderAsync(rawHost, request, emptyHeader!);
        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        using var problem = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("browser_write_forbidden", problem.RootElement.GetProperty("code").GetString());
        Assert.Equal("Browser write not allowed", problem.RootElement.GetProperty("title").GetString());
        Assert.Equal("Use the local application or a direct local API client.", problem.RootElement.GetProperty("detail").GetString());
    }
}
