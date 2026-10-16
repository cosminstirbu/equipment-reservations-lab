using Microsoft.Extensions.Hosting;
using Npgsql;

IDistributedApplicationBuilder builder = DistributedApplication.CreateBuilder(args);

IResourceBuilder<ParameterResource> postgresPassword = Secret("postgres-password");
IResourceBuilder<ParameterResource> inventoryPassword = Secret("inventory-password");
IResourceBuilder<ParameterResource> reservationsPassword = Secret("reservations-password");
IResourceBuilder<ParameterResource> notificationsPassword = Secret("notifications-password");
IResourceBuilder<ParameterResource> brokerPassword = Secret("broker-password");

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
    .WithReference(messaging)
    .WithEnvironment("InventoryUrl", inventory.GetEndpoint("http"))
    .WaitFor(inventory)
    .WithHttpHealthCheck("/health");

IResourceBuilder<ProjectResource> notifications = OwnDatabase(builder.AddProject<Projects.Notifications>("notifications"), "notifications", notificationsPassword)
    .WithHttpEndpoint(name: "http")
    .WithEndpoint("http", endpoint => endpoint.TargetHost = "127.0.0.1")
    .WithReference(messaging)
    .WithHttpHealthCheck("/health");

builder.AddJavaScriptApp("web", "../Web", "start")
    .WithNpm(install: true, installCommand: "ci")
    .WithHttpEndpoint(env: "PORT")
    .WithEndpoint("http", endpoint => endpoint.TargetHost = "127.0.0.1")
    .WithReference(inventory)
    .WithReference(reservations)
    .WithReference(notifications)
    .WaitFor(inventory)
    .WaitFor(reservations)
    .WaitFor(notifications);

builder.Build().Run();

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
