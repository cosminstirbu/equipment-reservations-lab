# PostgreSQL retention failure diagnosis, attempt 2

## Read-only evidence and scope

Owner reported run 39429285803 attempt 2, job 118654005981. The private captured
log shows `OwnDatabasePrivilegesAndRepeatedProvisioningRetainDataAndPasswords`
failed after 17.807 s at line 92: expected one preserved camera row, actual zero.
The UPDATE had already asserted one affected row; recreation and both normal and
changed-password reconciliation completed before the failed SELECT. No provider,
build or source mutation has been performed in this investigation yet. Other agents
own shared PostgreSQL/identity fixtures; no edits to their scope are authorized here.

The diagnosing-bugs skill's executable reproduction phase is pending the coordinator's
provider slot. The captured hosted failure supplies a real symptom but is not claimed
as a new local reproduction. Read-only inspection is explicitly requested first;
ranked hypotheses below are provisional, not conclusions or an approved fix.

## Primary-source findings

Pinned [Testcontainers 4.16 PostgreSqlBuilder](https://raw.githubusercontent.com/testcontainers/testcontainers-dotnet/4.16.0/src/Testcontainers.PostgreSql/PostgreSqlBuilder.cs)
sets `fsync=off`, `full_page_writes=off` and `synchronous_commit=off` in its defaults.
The retention test uses those defaults for both containers. It disposes the original
container immediately after the acknowledged UPDATE.

Default tracked-container [DisposeAsyncCore](https://raw.githubusercontent.com/testcontainers/testcontainers-dotnet/4.16.0/src/Testcontainers/Containers/DockerContainer.cs)
uses deletion rather than graceful StopAsync. This combination does not establish
production durability. PostgreSQL documents these settings as
[non-durable configurations](https://www.postgresql.org/docs/18/non-durability.html).

The test uses the same explicitly created named volume at `/var/lib/postgresql`
for both PostgreSQL 18.6 containers. The application provisioner never deletes or
truncates equipment; migration seed inserts use `ON CONFLICT (id) DO NOTHING`.
Thus reseeding alone cannot replace an already durable modified row.

## Ranked hypotheses and predictions

1. Non-durable asynchronous commit acknowledges UPDATE before WAL persistence;
   immediate container removal loses it. Prediction: actual SHOW confirms all three
   durability settings off; enabling them for both test containers retains the row
   through the same immediate forced replacement without changing assertions.
2. Replacement is attached to a new/wrong data directory. Prediction: PostgreSQL
   system identifier or volume/mount data differs across replacement; explicit mount
   and identifier proof would expose it even with durable commits enabled.
3. Reconciliation or changed-password attempt overwrites data. Prediction: a read
   immediately after replacement retains the change but reads after one of those
   calls lose it; actual source currently provides no overwrite path.
4. The UPDATE wasn't committed as expected. Prediction: independent connection read
   before replacement fails despite one affected row. The current command executes
   outside an explicit transaction, so normal Npgsql autocommit should exclude this.

## Proposed faithful regression boundary

Retain the real PostgreSQL image/volume and actual DatabaseProvisioner migrations,
roles, authentication and reconciliation calls. No doubles. Use the existing public
provisioning test as the red-capable retained-row oracle; assert actual provider
`pg_settings` durability values before the acknowledged write, capturing a deterministic
RED for the currently unsuitable durability fixture. Verify the committed modified
row from a second connection before replacement, then the same row immediately after
replacement and after both reconciliation/password-rejection calls to localize loss.
Keep the strict row/count/password/privilege assertions and bounded existing deadline.
No sleeps, retry, wider timeout, checkpoint or graceful stop should hide crash-loss.
A scoped builder durability override is only a candidate until actual provider evidence.

## Reviewed regression and source-free provider probe

Quality reviewer `/root/quality` approved this narrow fixture correction: effective
provider durability assertions before the first write and immediately after replacement,
then all three flags enabled on both builders after intended RED. Preserve forced
replacement and the original retention/password/privilege outcomes. No production or
blanket shared-fixture change is authorized.

Coordinator granted a source-free probe: start a uniquely named PostgreSQL 18.6
container with the exact pinned module command flags, no published ports, and a
private disposable runtime filesystem; query effective settings via `psql` and remove
that exact container in finally. It returned:

```text
fsync=off
full_page_writes=off
synchronous_commit=off
```

This mirrors the official module flags and proves their real PostgreSQL effect; it
is not claimed as execution of the .NET builder or a local retained-row reproduction.
[DockerContainerOperations 4.16](https://raw.githubusercontent.com/testcontainers/testcontainers-dotnet/4.16.0/src/Testcontainers/Clients/DockerContainerOperations.cs)
confirms removal uses `Force=true`. No stop/checkpoint protects the immediate UPDATE.

Added only two `AssertDurabilityAsync` calls and its real `current_setting` query,
expecting `on,on,on`; no builder correction yet. Exact-file formatter passed and
manual readback/diff check passed. Coordinator's full-suite diagnostic run now owns
the resource slot and is intentionally retaining this settings regression as RED;
this should not be mislabeled as a reproduction of the original retained-count loss.
Source frozen for that run at SHA256
`70f920f8d85969cf15738d9f68e9dfc2210be53f5feeb07e74aa1d2529050c3e`.

## Actual .NET regression RED and scoped correction

Coordinator's `npm run check` diagnostic run captured the intended real .NET provider
RED in `/private/tmp/equipment-identity-diagnostic-check-05.log`: the retention test
failed after 4.672 s in `AssertDurabilityAsync` line 103 / test line 26, expected
`on,on,on`, actual `off,off,off`. The run had 559/564 passing and five failures:
this intended settings failure plus four unrelated AMQP restart failures. That is
not a new local reproduction of the hosted missing-row assertion and does not
establish any cause for the other failures.

After that RED, explicitly enabled `fsync`, `full_page_writes` and
`synchronous_commit` on both builders in this test only. This preserves forceful
container replacement, actual named-volume recovery, the acknowledged UPDATE,
unchanged privilege/role/password checks and strict retained-camera/seed counts.
No checkpoint, sleep, retry, graceful-stop substitution, deadline extension,
shared-fixture default or production source change was introduced.
Exact-file formatting and diff check passed; manually reread both builders,
settings assertions and retained-data checks. Frozen source SHA256:
`a651568fb307aaf77e9acd2cd88ac458d26423a4bbc6187d41f83c9bdf42a25e`.
Focused real replacement GREEN is pending the coordinator's next build/provider
slot; final application checks and hosted verification remain required.

## Focused GREEN and handoff

After the coordinator's frozen solution build passed with zero warnings/errors,
the exclusive focused provider slot ran:

```sh
DOCKER_HOST=unix:///var/folders/6k/z9rq_rsj7gj5ghmy_rx43nzh0000gp/T/podman/podman-machine-default-api.sock TESTCONTAINERS_RYUK_DISABLED=true dotnet test --project tests/DatabaseBootstrap.Tests/DatabaseBootstrap.Tests.csproj --filter-class '*DatabaseProvisioningTests' --no-build --output Detailed
```

Exit 0: one test passed, zero failed/skipped. Test duration 2940 ms; runner duration
6494 ms. Both real provider settings assertions returned `on,on,on`. Immediate forced
removal and recreation against the same volume retained the modified camera name
and `operational=false`, exact equipment count three, scoped privileges and original
passwords; changed-password reconciliation was still rejected. Resources completed
their existing disposal paths; the provider slot was released immediately afterward.
No formatter or build was run concurrently with this focused provider check.

Quality independently reviewed frozen source SHA256 `a651568fb307aaf77e9acd2cd88ac458d26423a4bbc6187d41f83c9bdf42a25e`
and passed the exact narrow change. This corrects a confirmed non-durable retention
fixture; it does not prove the causal history of the hosted lost-row incident or
resolve unrelated identity/AMQP failures. Final full checks and hosted acceptance
remain coordinator-owned. No commit, push, production/bootstrap edit, assertion
weakening or task/checklist verdict change was performed.
