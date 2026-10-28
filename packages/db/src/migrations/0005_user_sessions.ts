import type { Migration } from "./types";

/**
 * Operational (non-diagram) table backing the M0-05 `SessionStore` port. Only the SHA-256
 * hash of the opaque session token is stored.
 */
export const migration0005: Migration = {
  version: 5,
  name: "user_sessions",
  up: `
CREATE TABLE user_sessions (
  session_id uuid PRIMARY KEY,
  user_id    uuid NOT NULL REFERENCES users (user_id) ON DELETE RESTRICT,
  token_hash char(64) NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  CONSTRAINT user_sessions_expiry CHECK (expires_at > created_at)
);
CREATE INDEX user_sessions_user_idx ON user_sessions (user_id) WHERE revoked_at IS NULL;
`,
  down: `
DROP TABLE user_sessions;
`,
};
