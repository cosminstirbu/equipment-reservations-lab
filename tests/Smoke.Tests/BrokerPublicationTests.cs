using Aspire.Hosting.ApplicationModel;
using Aspire.Hosting.Testing;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;

namespace Smoke.Tests;

public sealed class BrokerPublicationTests
{
    [Theory]
    [InlineData("reservations", "reservations-publisher", "reservations-broker-password")]
    [InlineData("notifications", "notifications-consumer", "notifications-broker-password")]
    public async Task FullWorkerPublishEnvironmentRetainsSymbolicBrokerSecretWithoutResolvingIt(string worker, string username, string secret)
    {
        using var deadline = new CancellationTokenSource(TimeSpan.FromSeconds(10));
        string manifest = Path.Combine(Path.GetTempPath(), "broker-model-" + Guid.NewGuid().ToString("N") + ".json");
        await using IDistributedApplicationTestingBuilder builder = await DistributedApplicationTestingBuilder.CreateAsync<Projects.AppHost>(["--environment=Development", "--publisher=manifest", "--output-path=" + manifest], deadline.Token);
        Assert.True(builder.ExecutionContext.IsPublishMode);
        var guard = new BrokerParameterGuard(builder.Resources.OfType<ParameterResource>());
        _ = ((IConfigurationBuilder)builder.Configuration).Add(guard);

        foreach (IResource resource in builder.Resources)
        {
            foreach (EndpointAnnotation endpoint in resource.Annotations.OfType<EndpointAnnotation>())
            {
                endpoint.AllocatedEndpoint = new AllocatedEndpoint(endpoint, "127.0.0.1", 19001);
            }
        }

        ProjectResource project = Assert.Single(builder.Resources.OfType<ProjectResource>(), resource => resource.Name == worker);
        IExecutionConfigurationResult configuration = await ExecutionConfigurationBuilder.Create(project)
            .WithEnvironmentVariablesConfig()
            .BuildAsync(builder.ExecutionContext, NullLogger.Instance, deadline.Token);
        Assert.Null(configuration.Exception);
        Assert.Equal(0, guard.Attempts);
        string connection = configuration.EnvironmentVariables.Single(variable => variable.Key == "ConnectionStrings__messaging").Value;
        Assert.True(connection.StartsWith("amqp://" + username + ":", StringComparison.Ordinal), "Expected the exact scoped broker user.");
        Assert.True(connection.Contains("{" + secret + ".value", StringComparison.Ordinal), "Expected a symbolic secret reference without local resolution.");
        Assert.True(connection.EndsWith("/equipment", StringComparison.Ordinal), "Expected only the equipment vhost.");
        RabbitMQServerResource broker = Assert.Single(builder.Resources.OfType<RabbitMQServerResource>());
        Assert.Empty(broker.Annotations.OfType<ContainerFileSystemCallbackAnnotation>());
        Assert.DoesNotContain(broker.Annotations.OfType<EndpointAnnotation>(), endpoint => endpoint.UriScheme == "http");
    }

    [Fact]
    public async Task ParameterGuardRejectsActualValueResolutionBeforeReadingLocalSecret()
    {
        using var deadline = new CancellationTokenSource(TimeSpan.FromSeconds(10));
        await using IDistributedApplicationTestingBuilder builder = await DistributedApplicationTestingBuilder.CreateAsync<Projects.AppHost>(["--publisher=manifest", "--output-path=unused-model.json"], deadline.Token);
        var guard = new BrokerParameterGuard(builder.Resources.OfType<ParameterResource>());
        _ = ((IConfigurationBuilder)builder.Configuration).Add(guard);
        ParameterResource secret = Assert.Single(builder.Resources.OfType<ParameterResource>(), resource => resource.Name == "reservations-broker-password");
        _ = await Assert.ThrowsAsync<InvalidOperationException>(async () => _ = await secret.GetValueAsync(deadline.Token));
        Assert.Equal(1, guard.Attempts);
    }

    private sealed class BrokerParameterGuard(IEnumerable<ParameterResource> parameters) : IConfigurationSource
    {
        private readonly Dictionary<string, bool> keys = parameters.ToDictionary(parameter => "Parameters:" + parameter.Name, parameter => parameter.Name.Contains("broker", StringComparison.Ordinal), StringComparer.OrdinalIgnoreCase);

        public int Attempts
        {
            get;
            private set;
        }

        public IConfigurationProvider Build(IConfigurationBuilder builder)
        {
            return new GuardProvider(this);
        }

        private sealed class GuardProvider(BrokerParameterGuard guard) : ConfigurationProvider
        {
            public override bool TryGet(string key, out string? value)
            {
                if (!guard.keys.TryGetValue(key, out bool broker))
                {
                    value = null;
                    return false;
                }

                if (broker)
                {
                    guard.Attempts++;
                    throw new InvalidOperationException("Local broker secret resolution is forbidden in model publication.");
                }

                value = "synthetic-model-parameter-value-00000000";
                return true;
            }
        }
    }
}
