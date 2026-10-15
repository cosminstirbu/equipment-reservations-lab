using System.Net;
using System.Net.Http.Json;
using Aspire.Hosting;
using Aspire.Hosting.Testing;
using HelloMessaging;
using RabbitMQ.Client;
using Xunit;

namespace Smoke.Tests;

public class HelloSmokeTests
{
    [Fact]
    public async Task RealHTTPHTTPBrokerConsumerJourneyIsCorrelated()
    {
        using var deadline = new CancellationTokenSource(TimeSpan.FromMinutes(3));
        Environment.SetEnvironmentVariable("ASPIRE_CONTAINER_RUNTIME", "podman");
        IDistributedApplicationTestingBuilder builder = await DistributedApplicationTestingBuilder.CreateAsync<Projects.AppHost>(["--environment=Development"], deadline.Token);
        Assert.Contains(builder.Resources, resource => resource.Name == "inventory");
        SmokeStartup.IsolateStorage(builder);
        await using DistributedApplication app = await builder.BuildAsync(deadline.Token);
        await SmokeStartup.StartAsync(app, deadline.Token);
        _ = await app.ResourceNotifications.WaitForResourceHealthyAsync("inventory", deadline.Token);
        _ = await app.ResourceNotifications.WaitForResourceHealthyAsync("notifications", deadline.Token);
        foreach (string service in new[] { "inventory", "reservations", "notifications" })
        {
            Assert.True(app.ResourceNotifications.TryGetCurrentState(service, out Aspire.Hosting.ApplicationModel.ResourceEvent? resource));
            Assert.DoesNotContain(resource!.Snapshot.EnvironmentVariables, variable => variable.Name == "ConnectionStrings__postgres" || variable.Name.EndsWith("Password", StringComparison.Ordinal));
            Aspire.Hosting.ApplicationModel.EnvironmentVariableSnapshot own = Assert.Single(resource.Snapshot.EnvironmentVariables, variable => variable.Name == "ConnectionStrings__" + service);
            var connection = new Npgsql.NpgsqlConnectionStringBuilder(own.Value);
            Assert.Equal(service, connection.Database);
            Assert.Equal(service + "_app", connection.Username);
        }

        using HttpClient inventory = app.CreateHttpClient("inventory");
        using HttpClient reservations = app.CreateHttpClient("reservations");
        using HttpClient notifications = app.CreateHttpClient("notifications");
        Equipment[] items = (await inventory.GetFromJsonAsync<Equipment[]>("/api/equipment", deadline.Token))!;
        Equipment equipment = Assert.Single(items, item => item.Id == "camera-001");
        Assert.Equal("camera-001", equipment.Id);
        Assert.Equal("Demo Camera", equipment.Name);
        var invalidId = Guid.NewGuid();
        string? connectionString = await app.GetConnectionStringAsync("messaging", deadline.Token);
        await using (IConnection connection = await RabbitTopology.Factory(connectionString!, TimeSpan.FromSeconds(3)).CreateConnectionAsync(deadline.Token))
        await using (IChannel channel = await connection.CreateChannelAsync(new CreateChannelOptions(true, true), deadline.Token))
        {
            await RabbitTopology.DeclareAsync(channel, deadline.Token);
            byte[] invalid = System.Text.Json.JsonSerializer.SerializeToUtf8Bytes(new
            {
                correlationId = invalidId,
                equipmentId = "bad id",
                equipmentName = "Invalid",
                requestedAt = DateTimeOffset.UtcNow
            });
            await channel.BasicPublishAsync(RabbitTopology.Exchange, RabbitTopology.RoutingKey, true, new BasicProperties(), invalid, deadline.Token);
            await channel.BasicPublishAsync(RabbitTopology.Exchange, RabbitTopology.RoutingKey, true, new BasicProperties(), new byte[4097], deadline.Token);
        }
        var ids = new List<Guid>();
        for (int i = 0; i < 2; i++)
        {
            HttpResponseMessage send = await reservations.PostAsJsonAsync("/api/hellos", new
            {
                equipmentId = equipment.Id
            }, deadline.Token);
            Assert.Equal(HttpStatusCode.Accepted, send.StatusCode);
            Guid id = (await send.Content.ReadFromJsonAsync<HelloResult>(deadline.Token))!.CorrelationId;
            Assert.NotEqual(Guid.Empty, id);
            ids.Add(id);
            using var wait = CancellationTokenSource.CreateLinkedTokenSource(deadline.Token);
            wait.CancelAfter(TimeSpan.FromSeconds(30));
            Notification? result = null;
            while (result is null)
            {
                HttpResponseMessage response = await notifications.GetAsync($"/api/notifications/{id}", wait.Token);
                if (response.StatusCode == HttpStatusCode.OK)
                {
                    result = await response.Content.ReadFromJsonAsync<Notification>(wait.Token);
                }
                else
                {
                    Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
                    await Task.Delay(100, wait.Token);
                }
            }
            Assert.Equal(id, result.CorrelationId);
            Assert.Equal("Hello received for Demo Camera", result.Message);
        }
        Assert.NotEqual(ids[0], ids[1]);
        Assert.Equal(HttpStatusCode.NotFound, (await notifications.GetAsync($"/api/notifications/{invalidId}", deadline.Token)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await reservations.PostAsJsonAsync("/api/hellos", new
        {
            equipmentId = "unknown"
        }, deadline.Token)).StatusCode);
    }

    private sealed record Equipment(string Id, string Name);
    private sealed record HelloResult(Guid CorrelationId);
    private sealed record Notification(Guid CorrelationId, string Message);
}
