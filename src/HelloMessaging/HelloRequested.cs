namespace HelloMessaging;

public sealed record Equipment(string Id, string Name);
public sealed record HelloRequested(Guid CorrelationId, string EquipmentId, string EquipmentName, DateTimeOffset RequestedAt);
public interface IHelloPublisher
{
    Task PublishAsync(HelloRequested hello, CancellationToken cancellationToken);
}
public static class HelloValidation
{
    public static bool IsEquipmentId(string? id)
    {
        return id is { Length: > 0 and <= 64 } && id.All(c => char.IsAsciiLetterOrDigit(c) || c is '-' or '_');
    }
}
