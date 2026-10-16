# Validation baseline

Application revision: 87bd4bc6964ed8dd75b8fdba8a227b530675b22d. Source unchanged during baseline; feature agreements prepared concurrently.

`npm run check` passed with ASPIRE_CONTAINER_RUNTIME=podman, TESTCONTAINERS_RYUK_DISABLED=true and DOCKER_HOST pointing at the local Podman API socket; exit 0. See baseline-check.log. Format/style checks, ESLint, zero-warning .NET build, tooling 4, frontend 33, backend 216 and real infrastructure smoke 50 passed; zero failed/skipped. Angular build passed. Existing jsdom canvas getContext notices are nonfailing baseline output.

The first sandbox run failed before testing because .NET build-host named-pipe socket binding was denied (SocketException 13); elevated rerun passed. No baseline application failures observed. Full real-provider and authenticated browser checks will be new feature evidence.
