"""Writes a database in the schema of builds before ingredient groups (ingredients hung off
recipes directly) and UTC times, for test_migration.py. Only the tables the migration touches; the server's
AutoMigrate creates the rest."""

import os
import sqlite3
import sys

path = sys.argv[1]
if os.path.exists(path):
    os.remove(path)
db = sqlite3.connect(path)
db.executescript('''
CREATE TABLE `users` (`avatar_url` text,`created_at` datetime,`email` text NOT NULL,`id` integer PRIMARY KEY AUTOINCREMENT,`name` text NOT NULL DEFAULT "",`subject` text NOT NULL,`updated_at` datetime);
CREATE UNIQUE INDEX `idx_users_subject` ON `users`(`subject`);
CREATE TABLE `recipes` (`created_at` datetime,`description` text NOT NULL DEFAULT "",`id` integer PRIMARY KEY AUTOINCREMENT,`notes` text NOT NULL DEFAULT "",`servings` integer NOT NULL DEFAULT 4,`tags` text NOT NULL,`time_text` text NOT NULL DEFAULT "",`title` text NOT NULL DEFAULT "",`updated_at` datetime,`user_id` integer NOT NULL,`version` integer NOT NULL DEFAULT 1,CONSTRAINT `fk_recipes_user` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,CONSTRAINT `chk_recipes_servings` CHECK (servings >= 1));
CREATE TABLE `ingredients` (`id` integer PRIMARY KEY AUTOINCREMENT,`name` text NOT NULL DEFAULT "",`position` integer NOT NULL,`quantity` text NOT NULL DEFAULT "",`recipe_id` integer NOT NULL,CONSTRAINT `fk_recipes_ingredients` FOREIGN KEY (`recipe_id`) REFERENCES `recipes`(`id`) ON DELETE CASCADE);
CREATE INDEX `ingredients_recipe_position` ON `ingredients`(`recipe_id`,`position`);

INSERT INTO users (id, email, name, subject) VALUES (1, 'cook@example.com', 'Тест Кухар', 'local:cook@example.com');
-- Older builds wrote local time. Around the October DST switch the text order (what SQLite
-- sorts by) disagrees with real time: 1 is 00:30 UTC, 2 is 01:10 UTC.
INSERT INTO recipes (id, title, tags, user_id, created_at, updated_at) VALUES
  (1, 'Вареники', '[]', 1, '2026-01-01 00:00:00', '2026-10-25 03:30:00+03:00'),
  (2, 'Узвар', '[]', 1, '2026-01-02 00:00:00', '2026-10-25 03:10:00.5+02:00'),
  (3, 'Деруни', '[]', 1, '2026-01-03 00:00:00', '2026-01-03 00:00:00');
-- ids deliberately out of display order
INSERT INTO ingredients (id, recipe_id, position, name, quantity) VALUES
  (10, 1, 1, 'Вода', '200 мл'),
  (11, 1, 0, 'Борошно', '400 г'),
  (12, 3, 0, 'Картопля', '1 кг');
''')
db.commit()
