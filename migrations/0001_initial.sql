-- English Fluency Tracker — initial schema
-- Copyright (c) 2026 Kiyan Amirian. Licensed under the MIT License.

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  google_sub TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL,
  name TEXT,
  picture TEXT,
  created_at TEXT NOT NULL,
  last_login_at TEXT NOT NULL
);

-- Session IDs are SHA-256 hashes of the cookie token; the raw token is never stored.
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE INDEX sessions_user_id ON sessions(user_id);
CREATE INDEX sessions_expires_at ON sessions(expires_at);

CREATE TABLE tracker_states (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  state_json TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL
);

-- API keys are encrypted with AES-GCM using KEY_ENCRYPTION_SECRET; only the last four characters are kept in clear text.
CREATE TABLE ai_connections (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  label TEXT NOT NULL,
  base_url TEXT,
  model TEXT NOT NULL,
  options_json TEXT NOT NULL DEFAULT '{}',
  key_ciphertext TEXT NOT NULL,
  key_iv TEXT NOT NULL,
  key_hint TEXT NOT NULL,
  is_default INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX ai_connections_user_id ON ai_connections(user_id);
