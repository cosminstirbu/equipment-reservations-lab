IDistributedApplicationBuilder builder = DistributedApplication.CreateBuilder(args);

IResourceBuilder<RabbitMQServerResource> messaging = builder.AddRabbitMQ("messaging")
    .WithImageTag("4.3.6")
    .WithEndpoint("tcp", endpoint =>
    {
        endpoint.TargetPort = 5672;
        endpoint.IsProxied = true;
        endpoint.TargetHost = "127.0.0.1";
    })
    .WithEndpointProxySupport(true);

IResourceBuilder<ProjectResource> inventory = builder.AddProject<Projects.Inventory>("inventory")
    .WithHttpEndpoint(name: "http")
    .WithEndpoint("http", endpoint => endpoint.TargetHost = "127.0.0.1")
    .WithHttpHealthCheck("/health");

IResourceBuilder<ProjectResource> reservations = builder.AddProject<Projects.Reservations>("reservations")
    .WithHttpEndpoint(name: "http")
    .WithEndpoint("http", endpoint => endpoint.TargetHost = "127.0.0.1")
    .WithReference(inventory)
    .WithReference(messaging)
    .WithEnvironment("InventoryUrl", inventory.GetEndpoint("http"))
    .WaitFor(inventory)
    .WaitFor(messaging)
    .WithHttpHealthCheck("/health");

IResourceBuilder<ProjectResource> notifications = builder.AddProject<Projects.Notifications>("notifications")
    .WithHttpEndpoint(name: "http")
    .WithEndpoint("http", endpoint => endpoint.TargetHost = "127.0.0.1")
    .WithReference(messaging)
    .WaitFor(messaging)
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
