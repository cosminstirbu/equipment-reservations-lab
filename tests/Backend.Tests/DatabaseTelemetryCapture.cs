using System.Collections.Concurrent;
using System.Diagnostics;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using OpenTelemetry;
using OpenTelemetry.Logs;
using OpenTelemetry.Metrics;
using OpenTelemetry.Trace;

namespace Backend.Tests;

internal sealed class DatabaseTelemetryCapture : IDisposable
{
    public SpanExporter Spans { get; } = new();

    public ConcurrentQueue<string> Fields { get; } = new();

    public void Register(IServiceCollection services)
    {
        _ = services.AddOpenTelemetry()
            .WithTracing(tracing => tracing.AddProcessor(new SimpleActivityExportProcessor(Spans)))
            .WithMetrics(metrics => metrics.AddReader(new PeriodicExportingMetricReader(new MetricExporter(Fields), 60000)));
        _ = services.AddLogging(logging =>
        {
            _ = logging.AddProvider(new ConsoleExporter(Fields));
            _ = logging.AddOpenTelemetry(options => options.AddProcessor(new SimpleLogRecordExportProcessor(new LogExporter(Fields))));
        });
    }

    public WebApplicationFactory<TProgram> App<TProgram>(string database, string connection, bool? captureSql = null) where TProgram : class
    {
        return new AuthenticatedApplicationFactory<TProgram>().WithWebHostBuilder(builder =>
        {
            _ = builder.ConfigureAppConfiguration((_, configuration) => configuration.AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["ConnectionStrings:" + database] = connection,
                ["ConnectionStrings:messaging"] = "",
                ["DatabaseTracing:CaptureSqlText"] = captureSql?.ToString(System.Globalization.CultureInfo.InvariantCulture)
            }));
            _ = builder.ConfigureServices(Register);
        });
    }

    public IEnumerable<string> AllFields => Fields.Concat(Spans.Values.SelectMany(span => span.Fields));

    public void Dispose()
    {
        Spans.Dispose();
    }

    internal sealed class SpanExporter : BaseExporter<Activity>
    {
        public ConcurrentQueue<DatabaseSpan> Values { get; } = new();

        public Exception? Failure
        {
            get; private set;
        }

        public override ExportResult Export(in Batch<Activity> batch)
        {
            try
            {
                string[] resource = ParentProvider is null ? [] : [.. ParentProvider.GetResource().Attributes.Select(pair => pair.Key + "=" + pair.Value)];
                foreach (Activity activity in batch)
                {
                    Values.Enqueue(new DatabaseSpan(activity.Source.Name, activity.OperationName, activity.DisplayName, activity.Kind, activity.TraceId,
                        activity.SpanId, activity.ParentSpanId, activity.Duration, activity.Status, activity.TagObjects.ToDictionary(),
                        [activity.DisplayName, activity.StatusDescription ?? "", .. resource,
                        .. activity.TagObjects.Select(pair => pair.Key + "=" + pair.Value),
                        .. activity.Events.SelectMany(value => value.Tags.Select(pair => pair.Key + "=" + pair.Value).Prepend(value.Name)),
                        .. activity.Links.SelectMany(link => (link.Tags ?? []).Select(pair => pair.Key + "=" + pair.Value)),
                        .. activity.Baggage.Select(pair => pair.Key + "=" + pair.Value)]));
                }

                return ExportResult.Success;
            }
            catch (Exception exception)
            {
                Failure = exception;
                return ExportResult.Failure;
            }
        }
    }

    private sealed class LogExporter(ConcurrentQueue<string> fields) : BaseExporter<LogRecord>
    {
        public override ExportResult Export(in Batch<LogRecord> batch)
        {
            foreach (KeyValuePair<string, object> attribute in ParentProvider.GetResource().Attributes)
            {
                fields.Enqueue(attribute.Key + "=" + attribute.Value);
            }

            foreach (LogRecord record in batch)
            {
                fields.Enqueue(record.FormattedMessage ?? record.Body?.ToString() ?? "");
                fields.Enqueue(record.Exception?.ToString() ?? "");
                foreach (KeyValuePair<string, object?> attribute in record.Attributes ?? [])
                {
                    fields.Enqueue(attribute.Key + "=" + attribute.Value);
                }

                record.ForEachScope((scope, values) =>
                {
                    foreach (KeyValuePair<string, object?> attribute in scope)
                    {
                        values.Enqueue(attribute.Key + "=" + attribute.Value);
                    }
                }, fields);
            }

            return ExportResult.Success;
        }
    }

    private sealed class MetricExporter(ConcurrentQueue<string> fields) : BaseExporter<Metric>
    {
        public override ExportResult Export(in Batch<Metric> batch)
        {
            foreach (Metric metric in batch)
            {
                fields.Enqueue(metric.Name);
                foreach (ref readonly MetricPoint point in metric.GetMetricPoints())
                {
                    foreach (KeyValuePair<string, object?> tag in point.Tags)
                    {
                        fields.Enqueue(tag.Key + "=" + tag.Value);
                    }
                }
            }

            return ExportResult.Success;
        }
    }

    private sealed class ConsoleExporter(ConcurrentQueue<string> fields) : ILoggerProvider
    {
        public ILogger CreateLogger(string categoryName)
        {
            return new CaptureLogger(fields);
        }

        public void Dispose()
        {
        }

        private sealed class CaptureLogger(ConcurrentQueue<string> fields) : ILogger
        {
            public IDisposable? BeginScope<TState>(TState state) where TState : notnull
            {
                return null;
            }

            public bool IsEnabled(LogLevel logLevel)
            {
                return true;
            }

            public void Log<TState>(LogLevel logLevel, EventId eventId, TState state, Exception? exception, Func<TState, Exception?, string> formatter)
            {
                fields.Enqueue(formatter(state, exception));
                fields.Enqueue(exception?.ToString() ?? "");
                if (state is IEnumerable<KeyValuePair<string, object?>> attributes)
                {
                    foreach (KeyValuePair<string, object?> attribute in attributes)
                    {
                        fields.Enqueue(attribute.Key + "=" + attribute.Value);
                    }
                }
            }
        }
    }
}

internal sealed record DatabaseSpan(string Source, string OperationName, string Name, ActivityKind Kind, ActivityTraceId TraceId,
    ActivitySpanId SpanId, ActivitySpanId ParentSpanId, TimeSpan Duration, ActivityStatusCode Status, Dictionary<string, object?> Tags, string[] Fields);
