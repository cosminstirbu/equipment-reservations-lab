using System.Globalization;
using Aspire.Hosting.JavaScript;
using BrokerBootstrap;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Npgsql;

IDistributedApplicationBuilder builder = DistributedApplication.CreateBuilder(args);

IResourceBuilder<ParameterResource> postgresPassword = Secret("postgres-password");
IResourceBuilder<ParameterResource> inventoryPassword = Secret("inventory-password");
IResourceBuilder<ParameterResource> reservationsPassword = Secret("reservations-password");
IResourceBuilder<ParameterResource> notificationsPassword = Secret("notifications-password");
IResourceBuilder<ParameterResource> brokerPassword = Secret("broker-password");
IResourceBuilder<ParameterResource> publisherPassword = Secret("reservations-broker-password");
IResourceBuilder<ParameterResource> consumerPassword = Secret("notifications-broker-password");
IResourceBuilder<ParameterResource> administratorSalt = Secret("broker-admin-salt");
IResourceBuilder<ParameterResource> publisherSalt = Secret("reservations-broker-salt");
IResourceBuilder<ParameterResource> consumerSalt = Secret("notifications-broker-salt");
IResourceBuilder<ParameterResource> identityAdminPassword = Secret("identity-admin-password");
IResourceBuilder<ParameterResource> employeeAPassword = Secret("employee-a-password");
IResourceBuilder<ParameterResource> employeeBPassword = Secret("employee-b-password");
IResourceBuilder<ParameterResource> approverPassword = Secret("approver-password");
IResourceBuilder<ParameterResource> equipmentStaffPassword = Secret("equipment-staff-password");
IResourceBuilder<ParameterResource> reservationsClientSecret = Secret("reservations-client-secret");

string? configuredIdentityPort = builder.Configuration["IdentityPort"];
if (configuredIdentityPort is not null)
{
    configuredIdentityPort = configuredIdentityPort.Trim();
    if (configuredIdentityPort.Length == 0)
    {
        throw new InvalidOperationException("IdentityPort must be a valid stable local TCP port.");
    }

    int prefixLength = 0;
    if (configuredIdentityPort.StartsWith('#'))
    {
        prefixLength = 1;
    }
    else if (configuredIdentityPort.StartsWith("0x", StringComparison.OrdinalIgnoreCase)
        || configuredIdentityPort.StartsWith("&h", StringComparison.OrdinalIgnoreCase))
    {
        prefixLength = 2;
    }

    if (prefixLength != 0)
    {
        try
        {
            configuredIdentityPort = Convert.ToInt32(configuredIdentityPort[prefixLength..], 16).ToString(CultureInfo.InvariantCulture);
        }
        catch (Exception exception) when (exception is ArgumentException or FormatException or OverflowException)
        {
            throw new InvalidOperationException("IdentityPort must be a valid stable local TCP port.", exception);
        }
    }

    builder.Configuration["IdentityPort"] = configuredIdentityPort;
}

int identityPort = builder.Configuration.GetValue("IdentityPort", 18080);
if (identityPort is < 1 or > 65535)
{
    throw new InvalidOperationException("IdentityPort must be a valid stable local TCP port.");
}

IResourceBuilder<KeycloakResource> identity = builder.AddKeycloak("identity", port: identityPort, adminPassword: identityAdminPassword)
    .WithImageTag("26.8.1")
    .WithDataVolume("equipment-reservations-identity")
    .WithDisabledFeatures("opentelemetry")
    .WithEnvironment("KC_TRACING_ENABLED", "false")
    .WithEndpoint("http", endpoint =>
    {
        endpoint.TargetHost = "127.0.0.1";
        endpoint.IsProxied = true;
    })
    .WithEndpoint("management", endpoint =>
    {
        endpoint.TargetHost = "127.0.0.1";
        endpoint.IsProxied = true;
        endpoint.IsExternal = false;
        endpoint.ExcludeReferenceEndpoint = true;
    })
    .WithEndpointProxySupport(true);
_ = identity.WithEnvironment("KC_HOSTNAME", identity.GetEndpoint("http", KnownNetworkIdentifiers.LocalhostNetwork));

var authority = ReferenceExpression.Create($"{identity.GetEndpoint("http")}/realms/equipment");

IResourceBuilder<PostgresServerResource> postgres = builder.AddPostgres("postgres", password: postgresPassword)
    .WithImageTag("18.6")
    .WithDataVolume("equipment-reservations-postgres")
    .WithEndpoint("tcp", endpoint =>
    {
        endpoint.TargetPort = 5432;
        endpoint.IsProxied = true;
        endpoint.TargetHost = "127.0.0.1";
    })
    .WithEndpointProxySupport(true);

IResourceBuilder<RabbitMQServerResource> messaging = builder.AddRabbitMQ("messaging", password: brokerPassword)
    .WithImageTag("4.3.6")
    .WithDataVolume("equipment-reservations-rabbitmq")
    .WithEndpoint("tcp", endpoint =>
    {
        endpoint.TargetPort = 5672;
        endpoint.IsProxied = true;
        endpoint.TargetHost = "127.0.0.1";
    })
    .WithEndpointProxySupport(true);

ReferenceExpression publisherConnection = BrokerConnection("reservations-publisher", publisherPassword);
ReferenceExpression consumerConnection = BrokerConnection("notifications-consumer", consumerPassword);

if (builder.ExecutionContext.IsRunMode)
{
    _ = builder.Services.AddOpenTelemetry()
        .WithTracing(tracing => tracing.AddSource(BrokerDiagnostics.Name))
        .WithMetrics(metrics => metrics.AddMeter(BrokerDiagnostics.Name));
    _ = messaging.WithContainerFiles("/etc/rabbitmq", async (context, cancellationToken) =>
    {
        using var budget = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        budget.CancelAfter(TimeSpan.FromSeconds(10));
        ILogger logger = context.Services.GetRequiredService<ILoggerFactory>().CreateLogger("BrokerBootstrap");
        string definitions = await BrokerDiagnostics.PrepareAsync(async token =>
        {
            return BrokerProvisioning.Build(
                await messaging.Resource.UserNameReference.GetValueAsync(token) ?? "",
                await brokerPassword.Resource.GetValueAsync(token) ?? "",
                await administratorSalt.Resource.GetValueAsync(token) ?? "",
                await publisherPassword.Resource.GetValueAsync(token) ?? "",
                await publisherSalt.Resource.GetValueAsync(token) ?? "",
                await consumerPassword.Resource.GetValueAsync(token) ?? "",
                await consumerSalt.Resource.GetValueAsync(token) ?? "");
        }, logger, budget.Token);
        return
        [
            new ContainerFile { Name = "equipment-definitions.json", Contents = definitions, Owner = 999, Group = 999, Mode = UnixFileMode.UserRead | UnixFileMode.UserWrite },
            new ContainerDirectory
            {
                Name = "conf.d", Owner = 999, Group = 999, Mode = UnixFileMode.UserRead | UnixFileMode.UserWrite | UnixFileMode.UserExecute,
                Entries = [new ContainerFile { Name = "20-equipment.conf", Contents = BrokerProvisioning.Configuration, Owner = 999, Group = 999, Mode = UnixFileMode.UserRead | UnixFileMode.UserWrite }]
            }
        ];
    }, defaultOwner: 999, defaultGroup: 999);

    _ = builder.Services.AddHealthChecks().AddCheck("broker-workloads", new BrokerReadiness(
        token => ResolveBrokerAsync(publisherConnection, token),
        token => ResolveBrokerAsync(consumerConnection, token),
        ResolveAdministratorBrokerAsync));
    _ = messaging.WithHealthCheck("broker-workloads");
}

if (builder.ExecutionContext.IsRunMode && builder.Environment.IsDevelopment())
{
    _ = postgres.WithPgAdmin(pgAdmin =>
    {
        _ = pgAdmin
            .WithImageTag("9.18.0")
            .WithEndpoint("http", endpoint =>
            {
                endpoint.TargetHost = "127.0.0.1";
                endpoint.IsProxied = true;
                endpoint.IsExternal = false;
                endpoint.ExcludeReferenceEndpoint = true;
            })
            .WithEndpointProxySupport(true)
            .WaitFor(postgres)
            .ExcludeFromManifest();
    });

    _ = messaging.WithManagementPlugin()
        .WithEndpoint(messaging.Resource.ManagementEndpoint.EndpointName, endpoint =>
        {
            endpoint.TargetHost = "127.0.0.1";
            endpoint.IsProxied = true;
            endpoint.IsExternal = false;
            endpoint.ExcludeReferenceEndpoint = true;
        });
}

IResourceBuilder<ProjectResource> bootstrap = builder.AddProject<Projects.DatabaseBootstrap>("database-bootstrap")
    .WithReference(postgres)
    .WithEnvironment("InventoryPassword", inventoryPassword)
    .WithEnvironment("ReservationsPassword", reservationsPassword)
    .WithEnvironment("NotificationsPassword", notificationsPassword)
    .WaitFor(postgres);

IResourceBuilder<ProjectResource> inventory = OwnDatabase(builder.AddProject<Projects.Inventory>("inventory"), "inventory", inventoryPassword)
    .WithHttpEndpoint(name: "http")
    .WithEndpoint("http", endpoint => endpoint.TargetHost = "127.0.0.1")
    .WithHttpHealthCheck("/health");

IResourceBuilder<ProjectResource> reservations = OwnDatabase(builder.AddProject<Projects.Reservations>("reservations"), "reservations", reservationsPassword)
    .WithHttpEndpoint(name: "http")
    .WithEndpoint("http", endpoint => endpoint.TargetHost = "127.0.0.1")
    .WithReference(inventory)
    .WithEnvironment("ConnectionStrings__messaging", publisherConnection)
    .WaitFor(messaging)
    .WithEnvironment("InventoryUrl", inventory.GetEndpoint("http"))
    .WithEnvironment("Identity__ClientId", "reservations-service")
    .WithEnvironment("Identity__ClientSecret", reservationsClientSecret)
    .WaitFor(inventory)
    .WithHttpHealthCheck("/health");

IResourceBuilder<ProjectResource> notifications = OwnDatabase(builder.AddProject<Projects.Notifications>("notifications"), "notifications", notificationsPassword)
    .WithHttpEndpoint(name: "http")
    .WithEndpoint("http", endpoint => endpoint.TargetHost = "127.0.0.1")
    .WithEnvironment("ConnectionStrings__messaging", consumerConnection)
    .WaitFor(messaging)
    .WithHttpHealthCheck("/health");

IResourceBuilder<JavaScriptAppResource> web = builder.AddJavaScriptApp("web", "../Web", "start")
    .WithNpm(install: true, installCommand: "ci")
    .WithHttpEndpoint(env: "PORT")
    .WithEndpoint("http", endpoint => endpoint.TargetHost = "127.0.0.1")
    .WithReference(inventory)
    .WithReference(reservations)
    .WithReference(notifications)
    .WaitFor(inventory)
    .WaitFor(reservations)
    .WaitFor(notifications);

IResourceBuilder<ProjectResource> identityBootstrap = builder.AddProject<Projects.IdentityBootstrap>("identity-bootstrap")
    .WithEnvironment("Identity__Authority", authority)
    .WithEnvironment("WebRoot", ReferenceExpression.Create($"{web.GetEndpoint("http")}/"))
    .WithEnvironment("AdminUsername", "admin")
    .WithEnvironment("AdminPassword", identityAdminPassword)
    .WithEnvironment("EmployeeAPassword", employeeAPassword)
    .WithEnvironment("EmployeeBPassword", employeeBPassword)
    .WithEnvironment("ApproverPassword", approverPassword)
    .WithEnvironment("EquipmentStaffPassword", equipmentStaffPassword)
    .WithEnvironment("ReservationsClientSecret", reservationsClientSecret)
    .WaitFor(identity);

foreach (IResourceBuilder<ProjectResource> api in new[] { inventory, reservations, notifications })
{
    _ = api.WithEnvironment("Identity__Authority", authority).WaitForCompletion(identityBootstrap);
}

_ = web.WithEnvironment("Identity__Authority", authority)
    .WithEnvironment("Identity__Realm", "equipment")
    .WithEnvironment("Identity__ClientId", "equipment-web")
    .WaitForCompletion(identityBootstrap);

builder.Build().Run();

ReferenceExpression BrokerConnection(string username, IResourceBuilder<ParameterResource> password)
{
    EndpointReference endpoint = messaging.Resource.PrimaryEndpoint;
    return ReferenceExpression.Create($"amqp://{Uri.EscapeDataString(username)}:{password:uri}@{endpoint.Property(EndpointProperty.Host)}:{endpoint.Property(EndpointProperty.Port)}/equipment");
}

async Task<string> ResolveAdministratorBrokerAsync(CancellationToken cancellationToken)
{
    string username = await messaging.Resource.UserNameReference.GetValueAsync(cancellationToken)
        ?? throw new InvalidOperationException("Broker account unavailable.");
    return await ResolveBrokerAsync(BrokerConnection(username, brokerPassword), cancellationToken);
}

static async Task<string> ResolveBrokerAsync(ReferenceExpression connection, CancellationToken cancellationToken)
{
    return await connection.GetValueAsync(cancellationToken)
        ?? throw new InvalidOperationException("Broker endpoint unavailable.");
}

IResourceBuilder<ParameterResource> Secret(string name)
{
    return builder.AddParameter(name, new GenerateParameterDefault { MinLength = 32, Special = false }, secret: true, persist: true);
}

IResourceBuilder<ProjectResource> OwnDatabase(IResourceBuilder<ProjectResource> service, string database, IResourceBuilder<ParameterResource> password)
{
    return service.WaitForCompletion(bootstrap)
        .WithEnvironment(async context =>
        {
            string adminConnection = await postgres.Resource.ConnectionStringExpression.GetValueAsync(context.CancellationToken) ?? throw new InvalidOperationException("PostgreSQL endpoint unavailable.");
            var settings = new NpgsqlConnectionStringBuilder(adminConnection)
            {
                Database = database,
                Username = database + "_app",
                Password = await password.Resource.GetValueAsync(context.CancellationToken),
                Timeout = 3,
                CommandTimeout = 5,
                IncludeErrorDetail = false,
                LogParameters = false
            };
            context.EnvironmentVariables["ConnectionStrings__" + database] = settings.ConnectionString;
        });
}
