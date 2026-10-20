using System.Diagnostics;
using Xunit;

namespace Inventory.Tests;

public sealed class SpectralValidationTests
{
    [Fact]
    public async Task MissingExecutableFailsWithSetupInstructions()
    {
        var command = new ProcessStartInfo("spectral-missing-" + Guid.NewGuid().ToString("N"));
        InvalidOperationException error = await Assert.ThrowsAsync<InvalidOperationException>(() =>
            SpectralValidation.RunProcessAsync(command, "{}", "Inventory", TimeSpan.FromSeconds(30), TestContext.Current.CancellationToken));
        Assert.Contains("Inventory", error.Message, StringComparison.Ordinal);
        Assert.Contains("Node", error.Message, StringComparison.Ordinal);
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task CancellationOrDeadlineTerminatesRunningValidator(bool cancel)
    {
        var command = new ProcessStartInfo("node");
        command.ArgumentList.Add("-e");
        command.ArgumentList.Add("process.stdout.write('PID=' + process.pid); setInterval(() => {}, 1000)");
        using var cancellation = CancellationTokenSource.CreateLinkedTokenSource(TestContext.Current.CancellationToken);
        if (cancel)
        {
            cancellation.CancelAfter(TimeSpan.FromSeconds(1));
        }

        Exception? error = await Record.ExceptionAsync(() =>
            SpectralValidation.RunProcessAsync(command, "{}", "Inventory", TimeSpan.FromSeconds(cancel ? 30 : 1), cancellation.Token));
        Assert.NotNull(error);
        if (cancel)
        {
            _ = Assert.IsType<OperationCanceledException>(error);
        }
        else
        {
            _ = Assert.IsType<InvalidOperationException>(error);
        }

        Assert.Contains(cancel ? "cancelled" : "deadline", error.Message, StringComparison.Ordinal);
        int processId = int.Parse(error.Message.Split("PID=", StringSplitOptions.None)[1], System.Globalization.CultureInfo.InvariantCulture);
        _ = Assert.Throws<ArgumentException>(() => Process.GetProcessById(processId));
    }
}
