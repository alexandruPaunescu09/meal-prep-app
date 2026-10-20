-- "What's new" pop-up: the last release the customer acknowledged (a registry id from
-- lib/portal/whats-new.ts). Written only by POST /api/portal/whats-new (service client);
-- customers get no UPDATE policy on profiles (it holds `role`).
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS whats_new_seen text;
