using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.OpenApi;
using Scalar.AspNetCore;

namespace ApiDocumentation;

public static class ApiDocumentationExtensions
{
    public static void AddApiDocumentation(this WebApplicationBuilder builder)
    {
        _ = builder.Logging.AddFilter("Microsoft.AspNetCore.Mvc.Infrastructure.DefaultActionDescriptorCollectionProvider", LogLevel.Warning);
        string authority = builder.Configuration["Identity:Authority"] ?? throw new InvalidOperationException("Identity authority is required.");
        _ = builder.Services.AddOpenApi("v1", options =>
        {
            options.OpenApiVersion = OpenApiSpecVersion.OpenApi3_1;
            options.ShouldInclude = description => description.RelativePath?.StartsWith("api/", StringComparison.Ordinal) == true;
            _ = options.AddSchemaTransformer((schema, context, _) =>
            {
                if (context.JsonTypeInfo.Type == typeof(ProblemDetails))
                {
                    schema.Properties ??= new Dictionary<string, IOpenApiSchema>();
                    schema.Properties["code"] = new OpenApiSchema { Type = JsonSchemaType.String, Description = "Optional application error code; absent on some middleware responses." };
                    schema.Properties["field"] = new OpenApiSchema { Type = JsonSchemaType.String | JsonSchemaType.Null, Description = "Optional validation field; may be absent or null." };
                }

                return Task.CompletedTask;
            });
            _ = options.AddDocumentTransformer((document, _, _) =>
            {
                document.Info.Description = "Business operations for the Equipment Reservations application.";
                document.Info.Contact = new OpenApiContact { Name = "Equipment Reservations team" };

                document.Components ??= new OpenApiComponents();
                document.Components.SecuritySchemes = new Dictionary<string, IOpenApiSecurityScheme>
                {
                    ["DocumentationOAuth"] = new OpenApiSecurityScheme
                    {
                        Type = SecuritySchemeType.OAuth2,
                        Flows = new OpenApiOAuthFlows
                        {
                            AuthorizationCode = new OpenApiOAuthFlow
                            {
                                AuthorizationUrl = new Uri(authority + "/protocol/openid-connect/auth"),
                                TokenUrl = new Uri(authority + "/protocol/openid-connect/token"),
                                Scopes = new Dictionary<string, string> { ["openid"] = "Sign in with your development identity" }
                            }
                        }
                    },
                    ["ServiceBearer"] = new OpenApiSecurityScheme { Type = SecuritySchemeType.Http, Scheme = "bearer", BearerFormat = "JWT" }
                };
                document.Servers = [new OpenApiServer { Url = "/" }];
                foreach (IOpenApiPathItem path in document.Paths.Values)
                {
                    foreach (OpenApiOperation operation in path.Operations!.Values)
                    {
                        operation.Security = [new OpenApiSecurityRequirement { [new OpenApiSecuritySchemeReference("DocumentationOAuth", document)] = ["openid"] }];
                        if (operation.OperationId is "ListEquipment" or "GetEquipment")
                        {
                            operation.Security.Add(new OpenApiSecurityRequirement { [new OpenApiSecuritySchemeReference("ServiceBearer", document)] = [] });
                        }
                    }
                }

                return Task.CompletedTask;
            });
        });
    }

    public static void MapApiDocumentation(this WebApplication app)
    {
        if (!app.Environment.IsDevelopment())
        {
            return;
        }

        string callback = app.Configuration["Documentation:Callback"] ?? throw new InvalidOperationException("Documentation callback is required in Development.");
        ValidateCallback(callback);
        _ = app.MapOpenApi();
        static async Task CallbackAsync(HttpContext context)
        {
            context.Response.Headers.CacheControl = "no-store";
            context.Response.Headers["Referrer-Policy"] = "no-referrer";
            context.Response.Headers.ContentSecurityPolicy = "default-src 'none'";
            context.Response.ContentType = "text/html; charset=utf-8";
            await context.Response.WriteAsync("""
                <!doctype html>
                <html lang="en">
                <head><meta charset="utf-8"><title>API documentation sign-in</title></head>
                <body><main><h1>Return to API documentation</h1>
                <p>This window closes automatically after the documentation receives the sign-in response.</p>
                </main></body>
                </html>
                """, context.RequestAborted);
        }

        _ = app.MapGet("/oauth/callback", CallbackAsync).ExcludeFromDescription();
        _ = app.MapScalarApiReference(options =>
        {
            options.PersistentAuthentication = false;
            _ = options
            .WithTitle("Development API — requests change real development data")
            .DisableAgent()
            .DisableDefaultFonts()
            .AddPreferredSecuritySchemes("DocumentationOAuth")
            .AddAuthorizationCodeFlow("DocumentationOAuth", flow =>
            {
                flow.ClientId = "equipment-docs";
                flow.Pkce = Pkce.Sha256;
                flow.RedirectUri = callback;
                flow.SelectedScopes = ["openid"];
                flow.AdditionalQueryParameters = new Dictionary<string, string> { ["response_mode"] = "fragment" };
            });
        });
    }

    public static void ValidateCallback(string callback)
    {
        if (!Uri.TryCreate(callback, UriKind.Absolute, out Uri? uri) || !uri.IsLoopback
            || uri.Port < 1 || uri.Scheme is not ("http" or "https") || uri.AbsolutePath != "/oauth/callback"
            || uri.Query.Length != 0 || uri.Fragment.Length != 0 || uri.UserInfo.Length != 0
            || uri.AbsoluteUri != callback || uri.Host is not ("localhost" or "127.0.0.1" or "[::1]"))
        {
            throw new InvalidOperationException("Documentation callback must be an exact canonical loopback /oauth/callback URL.");
        }
    }

    public static RouteHandlerBuilder DescribeBusinessOperation<T>(this RouteHandlerBuilder endpoint, string id, string summary, string tag, string access, int success, params int[] errors)
    {
        _ = endpoint.WithName(id).WithSummary(summary).WithTags(tag).WithDescription(access)
            .Produces<T>(success).Produces(401).Produces(403);
        foreach (int status in errors)
        {
            _ = endpoint.ProducesProblem(status);
        }

        return endpoint;
    }
}
