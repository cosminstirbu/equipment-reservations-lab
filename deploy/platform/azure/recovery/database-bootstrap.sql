\set ON_ERROR_STOP on
\getenv backup_password BACKUP_PASSWORD
\getenv restore_password RESTORE_PASSWORD
SET log_statement = 'none';
SET log_min_error_statement = 'panic';
SELECT 'CREATE ROLE equipment_backup' WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'equipment_backup') \gexec
SELECT 'CREATE ROLE equipment_restore' WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'equipment_restore') \gexec
ALTER ROLE equipment_backup LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD :'backup_password';
ALTER ROLE equipment_restore LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD :'restore_password';
-- Remove historical memberships before establishing the exact reviewed set.
SELECT format('REVOKE %I FROM %I', parent.rolname, member.rolname)
FROM pg_auth_members membership JOIN pg_roles parent ON parent.oid = membership.roleid JOIN pg_roles member ON member.oid = membership.member
WHERE member.rolname IN ('equipment_backup', 'equipment_restore') \gexec
GRANT pg_read_all_data TO equipment_backup;
GRANT inventory_app, reservations_app, notifications_app, keycloak_app TO equipment_restore WITH INHERIT FALSE, SET TRUE;
GRANT CONNECT ON DATABASE inventory, reservations, notifications, keycloak TO equipment_backup, equipment_restore;
