using System.ComponentModel;
using System.Diagnostics;
using System.Text;

namespace TestSupport;

public static class SpectralValidation
{
    public static Task AssertValidAsync(string json, string service, CancellationToken cancellationToken)
    {
        DirectoryInfo? directory = new(AppContext.BaseDirectory);
        while (directory is not null && !(File.Exists(Path.Combine(directory.FullName, "EquipmentReservation.slnx"))
            && File.Exists(Path.Combine(directory.FullName, "package.json"))))
        {
            directory = directory.Parent;
        }

        if (directory is null)
        {
            throw new InvalidOperationException($"{service}: cannot locate repository solution/package markers for Spectral validation.");
        }

        string script = Path.Combine(directory.FullName, "scripts", "openapi-lint.mjs");
        if (!File.Exists(script))
        {
            throw new InvalidOperationException($"{service}: Spectral script is missing; restore scripts/openapi-lint.mjs from the repository.");
        }

        var command = new ProcessStartInfo("node") { WorkingDirectory = directory.FullName };
        command.ArgumentList.Add(script);
        command.ArgumentList.Add(service);
        return RunProcessAsync(command, json, service, TimeSpan.FromSeconds(30), cancellationToken);
    }

    internal static async Task RunProcessAsync(ProcessStartInfo command, string json, string service, TimeSpan timeout, CancellationToken cancellationToken)
    {
        command.UseShellExecute = false;
        command.RedirectStandardInput = true;
        command.RedirectStandardOutput = true;
        command.RedirectStandardError = true;
        using var deadline = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        deadline.CancelAfter(timeout);
        using var process = new Process { StartInfo = command };
        try
        {
            _ = process.Start();
        }
        catch (Win32Exception exception)
        {
            throw new InvalidOperationException($"{service}: cannot start Spectral validator; install Node and run npm ci from the repository root.", exception);
        }

        Task<string> output = ReadOutputAsync(process.StandardOutput, deadline.Token);
        Task<string> errors = ReadOutputAsync(process.StandardError, deadline.Token);
        try
        {
            await process.StandardInput.WriteAsync(json.AsMemory(), deadline.Token);
            process.StandardInput.Close();
            await Task.WhenAll(process.WaitForExitAsync(deadline.Token), output, errors).WaitAsync(deadline.Token);
        }
        catch (OperationCanceledException exception)
        {
            if (!process.HasExited)
            {
                process.Kill(entireProcessTree: true);
            }

            await process.WaitForExitAsync(CancellationToken.None);
            string diagnostics = Limit(await output + await errors);
            if (cancellationToken.IsCancellationRequested)
            {
                throw new OperationCanceledException($"{service}: Spectral validation cancelled. {diagnostics}", exception, cancellationToken);
            }

            throw new InvalidOperationException($"{service}: Spectral validation exceeded its deadline. {diagnostics}", exception);
        }
        catch (IOException exception)
        {
            if (!process.HasExited)
            {
                process.Kill(entireProcessTree: true);
            }

            await process.WaitForExitAsync(CancellationToken.None);
            throw new InvalidOperationException($"{service}: Spectral input/stream failed; verify Node and npm ci. {Limit(await output + await errors)}", exception);
        }

        if (process.ExitCode != 0)
        {
            throw new InvalidOperationException($"{service}: Spectral validator exited {process.ExitCode}; verify findings and Node/npm ci setup. {Limit(await output + await errors)}");
        }
    }

    private static string Limit(string value)
    {
        return value.Length <= 8000 ? value : value[..8000] + " [diagnostics truncated]";
    }

    private static async Task<string> ReadOutputAsync(StreamReader reader, CancellationToken cancellationToken)
    {
        var output = new StringBuilder();
        char[] buffer = new char[1024];
        try
        {
            int count;
            while ((count = await reader.ReadAsync(buffer.AsMemory(), cancellationToken)) != 0)
            {
                int remaining = 8000 - output.Length;
                if (remaining > 0)
                {
                    _ = output.Append(buffer, 0, Math.Min(count, remaining));
                }
            }
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            // Preserve diagnostics already received while the caller terminates the process.
        }

        return output.ToString();
    }
}
