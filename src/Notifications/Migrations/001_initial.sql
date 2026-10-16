CREATE TABLE reservation_inbox (
    event_id uuid PRIMARY KEY,
    reservation_id uuid NOT NULL,
    user_key text NOT NULL CHECK (user_key COLLATE "C" ~ '^[0-9a-f]{64}$'),
    event_type text NOT NULL CHECK (event_type IN ('ReservationConfirmed', 'ReservationCancelled')),
    schema_version integer NOT NULL CHECK (schema_version = 1),
    equipment_id text NOT NULL CHECK (equipment_id COLLATE "C" ~ '^[A-Za-z0-9_-]{1,64}$'),
    equipment_name text NOT NULL CHECK (length(equipment_name) <= 256 AND length(btrim(equipment_name)) >= 1),
    start_at timestamptz NOT NULL CHECK (isfinite(start_at)),
    end_at timestamptz NOT NULL CHECK (isfinite(end_at)),
    occurred_at timestamptz NOT NULL CHECK (isfinite(occurred_at)),
    received_at timestamptz NOT NULL CHECK (isfinite(received_at)),
    message text NOT NULL CHECK (length(message) <= 1024 AND length(btrim(message)) >= 1),
    CHECK (start_at < end_at)
);

CREATE INDEX reservation_inbox_history ON reservation_inbox (user_key, occurred_at DESC, event_id);
