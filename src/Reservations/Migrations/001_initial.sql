CREATE TABLE reservations (
    id uuid PRIMARY KEY,
    user_key text NOT NULL CHECK (user_key COLLATE "C" ~ '^[0-9a-f]{64}$'),
    equipment_id text NOT NULL CHECK (equipment_id COLLATE "C" ~ '^[A-Za-z0-9_-]{1,64}$'),
    equipment_name text NOT NULL CHECK (length(equipment_name) <= 256 AND length(btrim(equipment_name)) >= 1),
    start_at timestamptz NOT NULL CHECK (isfinite(start_at)),
    end_at timestamptz NOT NULL CHECK (isfinite(end_at)),
    confirmed_at timestamptz NOT NULL CHECK (isfinite(confirmed_at)),
    cancelled_at timestamptz CHECK (isfinite(cancelled_at)),
    status text NOT NULL CHECK (status IN ('Confirmed', 'Cancelled')),
    CHECK (start_at < end_at),
    CHECK ((status = 'Confirmed' AND cancelled_at IS NULL) OR (status = 'Cancelled' AND cancelled_at IS NOT NULL)),
    CONSTRAINT reservations_no_confirmed_overlap EXCLUDE USING gist
        (equipment_id WITH =, tstzrange(start_at, end_at, '[)') WITH &&)
        WHERE (status = 'Confirmed')
);

CREATE TABLE reservation_outbox (
    event_id uuid PRIMARY KEY,
    reservation_id uuid NOT NULL REFERENCES reservations (id),
    event_type text NOT NULL CHECK (event_type IN ('ReservationConfirmed', 'ReservationCancelled')),
    schema_version integer NOT NULL CHECK (schema_version = 1),
    user_key text NOT NULL CHECK (user_key COLLATE "C" ~ '^[0-9a-f]{64}$'),
    equipment_id text NOT NULL CHECK (equipment_id COLLATE "C" ~ '^[A-Za-z0-9_-]{1,64}$'),
    equipment_name text NOT NULL CHECK (length(equipment_name) <= 256 AND length(btrim(equipment_name)) >= 1),
    start_at timestamptz NOT NULL CHECK (isfinite(start_at)),
    end_at timestamptz NOT NULL CHECK (isfinite(end_at)),
    occurred_at timestamptz NOT NULL CHECK (isfinite(occurred_at)),
    traceparent text CHECK (length(traceparent) <= 55),
    tracestate text CHECK (length(tracestate) <= 512),
    attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
    next_attempt_at timestamptz NOT NULL CHECK (isfinite(next_attempt_at)),
    published_at timestamptz CHECK (isfinite(published_at)),
    CHECK (start_at < end_at),
    UNIQUE (reservation_id, event_type)
);

CREATE INDEX reservation_outbox_pending ON reservation_outbox (next_attempt_at, event_id) WHERE published_at IS NULL;
CREATE INDEX reservations_history ON reservations (user_key, confirmed_at DESC, id);
