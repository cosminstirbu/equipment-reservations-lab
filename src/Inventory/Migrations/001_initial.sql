CREATE TABLE equipment (
    id text PRIMARY KEY CHECK (id COLLATE "C" ~ '^[A-Za-z0-9_-]{1,64}$'),
    name text NOT NULL CHECK (length(name) <= 256 AND length(btrim(name)) >= 1),
    operational boolean NOT NULL
);

INSERT INTO equipment (id, name, operational) VALUES
    ('camera-001', 'Demo Camera', true),
    ('laptop-001', 'Demo Laptop', true),
    ('projector-001', 'Demo Projector', false)
ON CONFLICT (id) DO NOTHING;
