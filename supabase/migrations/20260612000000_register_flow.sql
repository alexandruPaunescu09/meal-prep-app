-- Customer self-registration: enforce email uniqueness on clients
-- (case-insensitive, only for non-NULL emails) and track which clients
-- came in via self-registration vs admin-created.
--
-- Existing duplicate-email rows BLOCK this migration. That is intentional:
-- silent dedup-on-migrate is the wrong call for live customer data. If the
-- CREATE UNIQUE INDEX fails, run a query like:
--   SELECT lower(email), array_agg(id) FROM clients
--   WHERE email IS NOT NULL GROUP BY 1 HAVING count(*) > 1;
-- ...resolve dupes manually, then re-apply.

CREATE UNIQUE INDEX clients_email_unique_ci
  ON clients (lower(email))
  WHERE email IS NOT NULL;

ALTER TABLE clients
  ADD COLUMN registered_at TIMESTAMPTZ;
