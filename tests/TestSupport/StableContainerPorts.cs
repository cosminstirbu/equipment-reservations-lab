using Docker.DotNet.Models;
using DotNet.Testcontainers.Builders;
using DotNet.Testcontainers.Configurations;
using DotNet.Testcontainers.Containers;

namespace TestSupport;

internal sealed class StableContainerPorts : IAsyncDisposable
{
    private readonly IContainer owner;

    public StableContainerPorts(params ushort[] ports)
    {
        ContainerBuilder builder = new ContainerBuilder("docker.io/library/postgres@sha256:74935e72241653ca55e0414067e6d8763aceb8a810eb51b452253ec3dcfc4336")
            .WithEntrypoint("/bin/sleep")
            .WithCommand("infinity");

        foreach (ushort port in ports)
        {
            builder = builder.WithPortBinding(port, true);
        }

        owner = builder.WithCreateParameterModifier(parameters =>
        {
            parameters.User = "999:999";
            HostConfig configuration = parameters.HostConfig ??= new HostConfig();
            configuration.CapDrop = ["ALL"];
            IDictionary<string, IList<PortBinding>> publications = configuration.PortBindings
                ?? throw new InvalidOperationException("Fixture namespace requires daemon-assigned published ports.");
            foreach (IList<PortBinding> bindings in publications.Values)
            {
                foreach (PortBinding binding in bindings)
                {
                    binding.HostIP = "127.0.0.1";
                }
            }
        }).Build();
    }

    public string Hostname => owner.Hostname;

    public string NetworkMode => "container:" + owner.Id;

    public ushort Port(ushort containerPort)
    {
        return owner.GetMappedPublicPort(containerPort);
    }

    public Task StartAsync(CancellationToken cancellationToken)
    {
        return owner.StartAsync(cancellationToken);
    }

    public IWaitUntil HttpReady(ushort port, string path)
    {
        return new HttpReadiness(owner, new HttpWaitStrategy().ForPort(port).ForPath(path));
    }

    public ValueTask DisposeAsync()
    {
        return owner.DisposeAsync();
    }

    private sealed class HttpReadiness(IContainer endpoint, HttpWaitStrategy strategy) : IWaitUntil
    {
        public Task<bool> UntilAsync(IContainer container)
        {
            return strategy.UntilAsync(endpoint);
        }
    }
}
