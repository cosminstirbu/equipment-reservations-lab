Yes, that is sufficient for live credential/privilege evidence, with these conditions:

- Connect using `psql -h 127.0.0.1` inside the exact PostgreSQL container. This forces TCP authentication; a default Unix socket could bypass password verification.
- Use each running API’s actual username/password/database, parsed privately. Keep passwords out of arguments, logs and printed environment.
- Disable startup scripts with `--no-psqlrc`; use fixed database/role arguments and bounded subprocess deadlines.
- Reject newline-containing passwords before the line-based stdin transfer, and close stdin afterward.
- Capture stdout/stderr privately. Print only sanitized role flags, membership counts, connection outcomes and verified error codes.
- Prove own access, absent elevated privileges/memberships, and denied connections to both other service databases plus `postgres`/`template1`.

Also query `has_database_privilege(current_user, <fixed database>, 'CONNECT')` for the forbidden databases. Pair its false result with the failed connection attempts. `psql` may not expose SQLSTATE for connection failures; do not label a failure `42501` unless actually observed.

This verifies credentials and database admission. Separate host socket/Podman mapping inspection must establish external exposure; container-internal connections do not establish that boundary.

No temporary C# project is necessary.
