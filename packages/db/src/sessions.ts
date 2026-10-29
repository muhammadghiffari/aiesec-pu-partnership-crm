/** FR-100: M0-05 ports backed by migration 0001 and 0005, never client-supplied roles. */
import type {
  AccessRole,
  SessionRecord,
  SessionStore,
  UserDirectory,
  UserRecord,
} from "../../core/src/auth/types";
import type { SqlClient } from "./migrate";

type UserRow = {
  user_id: string;
  email: string;
  name: string;
  access_role: string;
  is_active: boolean;
  organizational_title: string | null;
};
type SessionRow = {
  session_id: string;
  user_id: string;
  token_hash: string;
  created_at: Date;
  expires_at: Date;
  revoked_at: Date | null;
};
function user(row: UserRow): UserRecord {
  return {
    userId: row.user_id,
    email: row.email,
    name: row.name,
    accessRole: row.access_role as AccessRole,
    isActive: row.is_active,
    ...(row.organizational_title ? { organizationalTitle: row.organizational_title } : {}),
  };
}
function session(row: SessionRow): SessionRecord {
  return {
    sessionId: row.session_id,
    userId: row.user_id,
    tokenHash: row.token_hash.trim(),
    createdAt: new Date(row.created_at),
    expiresAt: new Date(row.expires_at),
    ...(row.revoked_at ? { revokedAt: new Date(row.revoked_at) } : {}),
  };
}
export function createUserDirectory(db: SqlClient): UserDirectory {
  return {
    async findByEmail(email) {
      const result = await db.query<UserRow>("SELECT * FROM users WHERE email = $1", [email]);
      return result.rows[0] ? user(result.rows[0]) : null;
    },
    async findById(id) {
      const result = await db.query<UserRow>("SELECT * FROM users WHERE user_id = $1", [id]);
      return result.rows[0] ? user(result.rows[0]) : null;
    },
  };
}
export function createSessionStore(db: SqlClient): SessionStore {
  return {
    async create(record) {
      await db.query(
        "INSERT INTO user_sessions (session_id, user_id, token_hash, created_at, expires_at) VALUES ($1,$2,$3,$4,$5)",
        [record.sessionId, record.userId, record.tokenHash, record.createdAt, record.expiresAt],
      );
    },
    async findByTokenHash(hash) {
      const result = await db.query<SessionRow>(
        "SELECT * FROM user_sessions WHERE token_hash = $1",
        [hash],
      );
      return result.rows[0] ? session(result.rows[0]) : null;
    },
    async revoke(id, at) {
      await db.query(
        "UPDATE user_sessions SET revoked_at = $2 WHERE session_id = $1 AND revoked_at IS NULL",
        [id, at],
      );
    },
    async revokeAllForUser(id, at) {
      const result = await db.query<{ session_id: string }>(
        "UPDATE user_sessions SET revoked_at = $2 WHERE user_id = $1 AND revoked_at IS NULL RETURNING session_id",
        [id, at],
      );
      return result.rows.length;
    },
  };
}
