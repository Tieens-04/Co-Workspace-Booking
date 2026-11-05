-- CWB-77: per-user token version for server-side JWT revocation. Additive only: existing rows get 0,
-- which is also the version assumed for tokens issued before this column existed, so deploying
-- does not end any current session.
-- AlterTable
ALTER TABLE `users` ADD COLUMN `token_version` INTEGER NOT NULL DEFAULT 0;
