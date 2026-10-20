FROM mcr.microsoft.com/dotnet/sdk:10.0.301@sha256:ea8bde36c11b6e7eec2656d0e59101d4462f6bd630730f2c8201ed0572b295d5 AS build
ARG PROJECT=DatabaseBootstrap
WORKDIR /source
COPY . .
RUN case "$PROJECT" in DatabaseBootstrap|IdentityBootstrap|BrokerBootstrap) ;; *) exit 1 ;; esac \
    && dotnet restore "src/$PROJECT/$PROJECT.csproj" --locked-mode \
    && dotnet publish "src/$PROJECT/$PROJECT.csproj" --no-restore -c Release -o /app -p:UseAppHost=false \
    && printf '#!/bin/sh\nexec dotnet /app/%s.dll "$@"\n' "$PROJECT" > /app/run \
    && chmod 0555 /app/run

FROM mcr.microsoft.com/dotnet/aspnet:10.0.9@sha256:7644f992230d35cf230017189d4038c0ae0f7388b13f4f7ae1900a155bafb597
WORKDIR /app
COPY --from=build --chown=1654:1654 /app .
USER 1654:1654
ENTRYPOINT ["/app/run"]
