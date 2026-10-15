namespace HelloMessaging;

public interface IRecoverySchedule
{
    double Jitter();

    Task DelayAsync(TimeSpan delay, CancellationToken cancellationToken);
}

public sealed class RecoverySchedule : IRecoverySchedule
{
    public double Jitter()
    {
        return Random.Shared.NextDouble();
    }

    public Task DelayAsync(TimeSpan delay, CancellationToken cancellationToken)
    {
        return Task.Delay(delay, cancellationToken);
    }
}
