using System.Diagnostics;
using System.Diagnostics.Metrics;
using BrokerBootstrap;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using OpenTelemetry.Logs;
using OpenTelemetry.Metrics;
using OpenTelemetry.Trace;
using ServiceDefaults;

HostApplicationBuilder builder = Host.CreateApplicationBuilder(args);
builder.AddApplicationTelemetry();
_ = builder.Services.AddOpenTelemetry()
    .WithTracing(tracing => tracing.AddSource("Equipment.BrokerBootstrap"))
    .WithMetrics(metrics => metrics.AddMeter("Equipment.BrokerBootstrap"));
using IHost host = builder.Build();
ILogger logger = host.Services.GetRequiredService<ILoggerFactory>().CreateLogger("BrokerBootstrap");
using var activities = new ActivitySource("Equipment.BrokerBootstrap");
using var meter = new Meter("Equipment.BrokerBootstrap");
Counter<long> operations = meter.CreateCounter<long>("broker.definitions.preparation");
using var deadline = new CancellationTokenSource(TimeSpan.FromSeconds(30));
try
{
    await host.StartAsync(deadline.Token);
    return Prepare(args, logger, activities, operations);
}
catch (Exception exception)
{
    BrokerBootstrapLog.Failed(logger, exception.GetType().Name);
    return 1;
}
finally
{
    using var shutdown = new CancellationTokenSource(TimeSpan.FromSeconds(5));
    try
    {
        await host.StopAsync(shutdown.Token);
    }
    catch (OperationCanceledException) when (shutdown.IsCancellationRequested)
    {
        // A host shutdown deadline must not prevent independent bounded exporter drains.
    }
    finally
    {
        _ = host.Services.GetRequiredService<TracerProvider>().Shutdown(3000);
        _ = host.Services.GetRequiredService<LoggerProvider>().Shutdown(3000);
        _ = host.Services.GetRequiredService<MeterProvider>().Shutdown(3000);
    }
}

static int Prepare(string[] args, ILogger logger, ActivitySource activities, Counter<long> operations)
{
    using Activity? operation = activities.StartActivity("broker.definitions.prepare");
    try
    {
        if (args.Length != 2 || args[0] != "--output" || !Path.IsPathFullyQualified(args[1]))
        {
            throw new InvalidOperationException("An absolute output file is required.");
        }

        string output = Path.GetFullPath(args[1]);
        string definitions = BrokerProvisioning.Build(Required("BrokerAdministrator"), Required("BrokerPassword"),
            Required("BrokerAdministratorSalt"), Required("PublisherPassword"), Required("PublisherSalt"),
            Required("ConsumerPassword"), Required("ConsumerSalt"));
        PrivateDefinitionsFile.Publish(output, definitions);
        _ = operation?.SetStatus(ActivityStatusCode.Ok);
        operations.Add(1, new KeyValuePair<string, object?>("outcome", "success"));
        BrokerBootstrapLog.Completed(logger);
        return 0;
    }
    catch (Exception exception)
    {
        _ = operation?.SetStatus(ActivityStatusCode.Error, "preparation_failed");
        operations.Add(1, new KeyValuePair<string, object?>("outcome", "failure"));
        BrokerBootstrapLog.Failed(logger, exception.GetType().Name);
        return 1;
    }
}

static string Required(string name)
{
    string? value = Environment.GetEnvironmentVariable(name);
    return string.IsNullOrEmpty(value) ? throw new InvalidOperationException("Broker configuration is incomplete.") : value;
}
