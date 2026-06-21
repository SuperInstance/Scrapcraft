CREATE TABLE players (
  id TEXT PRIMARY KEY,
  name TEXT,
  onboarding_complete BOOLEAN DEFAULT FALSE,
  api_provider TEXT,
  api_key_encrypted TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE game_saves (
  player_id TEXT PRIMARY KEY REFERENCES players(id),
  state_json TEXT NOT NULL,
  version INTEGER DEFAULT 6,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE codex_entries (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  icon TEXT,
  text_markdown TEXT NOT NULL,
  category TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE shared_brain_programs (
  id TEXT PRIMARY KEY,
  name TEXT,
  author TEXT,
  program_json TEXT NOT NULL,
  description TEXT,
  rating REAL DEFAULT 0,
  uses INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE recipe_embeddings (
  id TEXT PRIMARY KEY,
  recipe_id TEXT,
  embedding BLOB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_onboarding ON players(onboarding_complete) WHERE onboarding_complete = FALSE;
