using System.Diagnostics;
using Microsoft.Extensions.Logging;
using Xunit;

namespace Smoke.Tests;

internal static class BrokerMetadata
{
    public static async Task<string> RunAsync(string[] arguments, CancellationToken cancellationToken)
    {
        var start = new ProcessStartInfo("podman") { RedirectStandardOutput = true, RedirectStandardError = true };
        foreach (string argument in arguments)
        {
            start.ArgumentList.Add(argument);
        }

        using Process process = Process.Start(start) ?? throw new InvalidOperationException("Unable to inspect test broker metadata.");
        Task<string> output = process.StandardOutput.ReadToEndAsync(cancellationToken);
        Task<string> errors = process.StandardError.ReadToEndAsync(cancellationToken);
        try
        {
            await process.WaitForExitAsync(cancellationToken);
        }
        catch (OperationCanceledException)
        {
            process.Kill(entireProcessTree: true);
            throw;
        }

        _ = await errors;
        Assert.True(process.ExitCode == 0, "Test broker metadata inspection failed.");
        return await output;
    }
}

internal sealed class DcpStorageCapture : ILoggerProvider
{
    private string? session;

    public bool SessionRemoved => session is not null && !Directory.Exists(session);

    public string Inspect()
    {
        if (OperatingSystem.IsWindows())
        {
            throw new PlatformNotSupportedException("This metadata contract requires the supported local Unix container runtime.");
        }

        string directory = Volatile.Read(ref session) ?? throw new InvalidOperationException("Actual DCP session path was not observed.");
        UnixFileMode directoryMode = File.GetUnixFileMode(directory);
        Assert.Equal(UnixFileMode.None, directoryMode & (UnixFileMode.GroupWrite | UnixFileMode.OtherWrite));
        UnixFileMode credentials = File.GetUnixFileMode(Path.Combine(directory, "kubeconfig"));
        Assert.Equal(UnixFileMode.None, credentials & (UnixFileMode.GroupRead | UnixFileMode.GroupWrite | UnixFileMode.OtherRead | UnixFileMode.OtherWrite));
        string[] children = [.. Directory.EnumerateFileSystemEntries(directory).Take(64)];
        int publiclyReadableFiles = 0;
        foreach (string child in children)
        {
            if (!Directory.Exists(child) && (File.GetUnixFileMode(child) & (UnixFileMode.GroupRead | UnixFileMode.OtherRead)) != 0)
            {
                publiclyReadableFiles++;
            }
        }

        return $"DCP session directory mode {Convert.ToString((int)directoryMode, 8)}; kubeconfig mode {Convert.ToString((int)credentials, 8)}; direct children observed {children.Length}; group/other-readable direct files {publiclyReadableFiles}. No file contents inspected.";
    }

    public ILogger CreateLogger(string categoryName)
    {
        return new Capture(this, categoryName);
    }

    public void Dispose()
    {
    }

    private sealed class Capture(DcpStorageCapture owner, string category) : ILogger
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
            if (category != "Aspire.Hosting.Dcp.DcpHost" || state is not IEnumerable<KeyValuePair<string, object?>> values)
            {
                return;
            }

            object? value = values.FirstOrDefault(value => value.Key == "Arguments").Value;
            string arguments = value as string ?? (value is IEnumerable<string> parts ? string.Join(' ', parts) : "");
            int marker = arguments.IndexOf("--kubeconfig", StringComparison.Ordinal);
            if (marker < 0)
            {
                return;
            }

            string rest = arguments[(marker + "--kubeconfig".Length)..].TrimStart(' ', '=');
            string path;
            if (rest.StartsWith('"'))
            {
                int end = rest.IndexOf('"', 1);
                if (end < 0)
                {
                    return;
                }

                path = rest[1..end];
            }
            else
            {
                path = rest.Split(' ', 2)[0];
            }

            if (Path.IsPathFullyQualified(path) && Path.GetFileName(path) == "kubeconfig")
            {
                Volatile.Write(ref owner.session, Path.GetDirectoryName(path));
            }
        }
    }
}
