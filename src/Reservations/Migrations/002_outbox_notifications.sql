CREATE FUNCTION notify_reservation_outbox_changed() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    PERFORM pg_catalog.pg_notify('reservation_outbox_changed', '');
    RETURN NULL;
END;
$$;

CREATE TRIGGER reservation_outbox_changed
AFTER INSERT ON reservation_outbox
FOR EACH STATEMENT EXECUTE FUNCTION notify_reservation_outbox_changed();
