-- SQLite schema для застосунку «Рецепти» (чернетка)
PRAGMA foreign_keys = ON;

CREATE TABLE users (
  id          INTEGER PRIMARY KEY,
  google_sub  TEXT    NOT NULL UNIQUE,      -- стабільний id користувача від Google
  email       TEXT    NOT NULL,
  name        TEXT    NOT NULL DEFAULT '',
  avatar_url  TEXT,
  created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE sessions (
  token_hash  TEXT    PRIMARY KEY,          -- sha256 від випадкового токена з cookie
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at  TEXT    NOT NULL,
  created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX sessions_user ON sessions(user_id);

CREATE TABLE recipes (
  id           INTEGER PRIMARY KEY,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title        TEXT    NOT NULL DEFAULT '',
  description  TEXT    NOT NULL DEFAULT '',
  time_text    TEXT    NOT NULL DEFAULT '',   -- вільний текст: «30 хв», «1,5 год»
  servings     INTEGER NOT NULL DEFAULT 4 CHECK (servings >= 1),
  created_at   TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at   TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX recipes_user_updated ON recipes(user_id, updated_at DESC);

CREATE TABLE tags (
  id       INTEGER PRIMARY KEY,
  user_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name     TEXT    NOT NULL,                  -- зберігається в нижньому регістрі
  UNIQUE (user_id, name)
);

CREATE TABLE recipe_tags (
  recipe_id  INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  tag_id     INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  position   INTEGER NOT NULL,
  PRIMARY KEY (recipe_id, tag_id)
);

CREATE TABLE ingredients (
  id         INTEGER PRIMARY KEY,
  recipe_id  INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  position   INTEGER NOT NULL,
  name       TEXT    NOT NULL DEFAULT '',
  quantity   TEXT    NOT NULL DEFAULT ''     -- «500 г», «2 шт», «дрібка»; число на початку масштабується за порціями
);
CREATE INDEX ingredients_recipe ON ingredients(recipe_id, position);

CREATE TABLE steps (
  id             INTEGER PRIMARY KEY,
  recipe_id      INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  position       INTEGER NOT NULL,
  text           TEXT    NOT NULL DEFAULT '',
  timer_seconds  INTEGER CHECK (timer_seconds IS NULL OR timer_seconds > 0)  -- NULL = таймера немає
);
CREATE INDEX steps_recipe ON steps(recipe_id, position);

CREATE TABLE photos (
  id          TEXT    PRIMARY KEY,            -- випадковий id (напр. ULID); він же ім'я файлу на диску
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mime        TEXT    NOT NULL,
  width       INTEGER NOT NULL,
  height      INTEGER NOT NULL,
  size_bytes  INTEGER NOT NULL,
  created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE recipe_photos (
  recipe_id  INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  photo_id   TEXT    NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
  position   INTEGER NOT NULL,                -- 0 = обкладинка
  PRIMARY KEY (recipe_id, photo_id)
);

CREATE TABLE step_photos (
  step_id   INTEGER NOT NULL REFERENCES steps(id) ON DELETE CASCADE,
  photo_id  TEXT    NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
  position  INTEGER NOT NULL,
  PRIMARY KEY (step_id, photo_id)
);

-- Пошук: назва + теги. Для невеликих обсягів достатньо LIKE; за потреби — FTS5:
-- CREATE VIRTUAL TABLE recipes_fts USING fts5(title, description, content='recipes', content_rowid='id');
