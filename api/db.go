package api

import (
	"fmt"
	"log"
	"net/url"
	"os"
	"time"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"

	"cookbook/api/http"
)

func InitDb(path string, debug bool) (*gorm.DB, error) {
	// Pragmas go in the DSN rather than through db.Exec: mattn/go-sqlite3 applies DSN pragmas to
	// every connection it opens, while an Exec only reaches whichever connection served it.
	q := url.Values{}
	q.Set("_foreign_keys", "1")
	q.Set("_journal_mode", "WAL")
	q.Set("_busy_timeout", "5000")
	q.Set("_synchronous", "NORMAL")
	// times read back in UTC, whatever offset an old row was written with (see http.Now)
	q.Set("_loc", "UTC")

	logLevel := logger.Warn
	if debug {
		logLevel = logger.Info
	}
	dbLogger := logger.New(log.New(os.Stderr, "", log.LstdFlags), logger.Config{
		SlowThreshold: 200 * time.Millisecond,
		LogLevel:      logLevel,
		// lookups that may legitimately miss (sessions, upserts) are not errors
		IgnoreRecordNotFoundError: true,
	})

	db, err := gorm.Open(sqlite.Open("file:"+path+"?"+q.Encode()), &gorm.Config{
		Logger:                                   dbLogger,
		NowFunc:                                  http.Now,
		DisableForeignKeyConstraintWhenMigrating: false,
	})
	if err != nil {
		return nil, fmt.Errorf("open database %s: %w", path, err)
	}

	sqlDB, err := db.DB()
	if err != nil {
		return nil, err
	}
	sqlDB.SetMaxOpenConns(1)

	if err := db.AutoMigrate(
		&http.User{},
		&http.Session{},
		&http.Recipe{},
		&http.IngredientGroup{},
		&http.Step{},
		&http.Photo{},
	); err != nil {
		return nil, fmt.Errorf("migrate: %w", err)
	}
	if err := migrateIngredients(db); err != nil {
		return nil, fmt.Errorf("migrate ingredients: %w", err)
	}

	if err := migrateTimesToUTC(db); err != nil {
		return nil, fmt.Errorf("migrate times to UTC: %w", err)
	}

	if err := initSearch(db); err != nil {
		return nil, fmt.Errorf("search index: %w", err)
	}

	return db, nil
}

// migrateIngredients moves ingredients from recipes into groups. Databases created before groups
// existed have ingredients.recipe_id; each such recipe gets one unnamed group holding its
// ingredients, ids and order kept. SQLite cannot add a NOT NULL foreign key column in place, so
// the table is rebuilt.
func migrateIngredients(db *gorm.DB) error {
	m := db.Migrator()
	if !m.HasTable("ingredients") || m.HasColumn("ingredients", "group_id") {
		return db.AutoMigrate(&http.Ingredient{})
	}
	return db.Transaction(func(tx *gorm.DB) error {
		for _, s := range []string{
			`ALTER TABLE ingredients RENAME TO ingredients_ungrouped`,
			// index names are global in SQLite and the renamed table keeps them
			`DROP INDEX IF EXISTS ingredients_recipe_position`,
		} {
			if err := tx.Exec(s).Error; err != nil {
				return err
			}
		}
		if err := tx.AutoMigrate(&http.Ingredient{}); err != nil {
			return err
		}
		for _, s := range []string{
			`INSERT INTO ingredient_groups (recipe_id, position, name)
				SELECT DISTINCT recipe_id, 0, '' FROM ingredients_ungrouped`,
			`INSERT INTO ingredients (id, group_id, position, name, quantity)
				SELECT i.id, g.id, i.position, i.name, i.quantity
				FROM ingredients_ungrouped i JOIN ingredient_groups g ON g.recipe_id = i.recipe_id`,
			`DROP TABLE ingredients_ungrouped`,
		} {
			if err := tx.Exec(s).Error; err != nil {
				return err
			}
		}
		return nil
	})
}

// migrateTimesToUTC rewrites stored times in UTC. Builds before it wrote them in the server's
// local zone, and SQLite compares those as text (see http.Now), so recipes edited on either side
// of a DST switch sorted wrongly. Every datetime column is covered, so a column added later
// needs nothing here; rows already in UTC are skipped, which makes reruns no-ops.
func migrateTimesToUTC(db *gorm.DB) error {
	type column struct{ Table, Name string }
	cols := []column{}
	if err := db.Raw(`SELECT m.name AS "table", c.name AS name
		FROM sqlite_master m JOIN pragma_table_info(m.name) c
		WHERE m.type = 'table' AND lower(c.type) = 'datetime'`).Scan(&cols).Error; err != nil {
		return err
	}
	return db.Transaction(func(tx *gorm.DB) error {
		for _, c := range cols {
			// collected first: with one connection, an open result set blocks the updates
			type row struct {
				Rowid int64
				Value time.Time
			}
			rows := []row{}
			if err := tx.Raw(fmt.Sprintf("SELECT rowid AS rowid, %[1]q AS value FROM %[2]q WHERE %[1]q IS NOT NULL AND %[1]q NOT LIKE '%%+00:00'",
				c.Name, c.Table)).Scan(&rows).Error; err != nil {
				return err
			}
			for _, r := range rows {
				// the driver yields the zero time for text it cannot parse; leave such rows alone
				if r.Value.IsZero() {
					continue
				}
				if err := tx.Exec(fmt.Sprintf("UPDATE %q SET %q = ? WHERE rowid = ?", c.Table, c.Name),
					r.Value.UTC(), r.Rowid).Error; err != nil {
					return err
				}
			}
		}
		return nil
	})
}

// initSearch keeps an FTS5 copy of each recipe's title and tags. FTS5's unicode61 tokenizer
// case-folds Cyrillic, which SQLite's LIKE/LOWER do not, so this is what makes «сир» match
// «Сирники».
func initSearch(db *gorm.DB) error {
	tagsText := func(row string) string {
		return "(SELECT COALESCE(group_concat(value, ' '), '') FROM json_each(" + row + ".tags))"
	}

	statements := []string{
		`CREATE VIRTUAL TABLE IF NOT EXISTS recipes_fts USING fts5(title, tags, tokenize = 'unicode61 remove_diacritics 2')`,

		// Dropped and recreated (rather than IF NOT EXISTS) so that editing a trigger here takes
		// effect on a database created by an older build.
		`DROP TRIGGER IF EXISTS recipes_fts_insert`,
		`CREATE TRIGGER recipes_fts_insert AFTER INSERT ON recipes BEGIN
			INSERT INTO recipes_fts(rowid, title, tags) VALUES (new.id, new.title, ` + tagsText("new") + `);
		END`,
		`DROP TRIGGER IF EXISTS recipes_fts_update`,
		`CREATE TRIGGER recipes_fts_update AFTER UPDATE OF title, tags ON recipes BEGIN
			DELETE FROM recipes_fts WHERE rowid = old.id;
			INSERT INTO recipes_fts(rowid, title, tags) VALUES (new.id, new.title, ` + tagsText("new") + `);
		END`,
		`DROP TRIGGER IF EXISTS recipes_fts_delete`,
		`CREATE TRIGGER recipes_fts_delete AFTER DELETE ON recipes BEGIN
			DELETE FROM recipes_fts WHERE rowid = old.id;
		END`,

		// A full rebuild is cheap at personal-collection sizes and repairs any drift (a crash
		// mid-migration, a trigger changed above) without a separate reindex command.
		`DELETE FROM recipes_fts`,
		`INSERT INTO recipes_fts(rowid, title, tags) SELECT id, title, ` + tagsText("recipes") + ` FROM recipes`,
	}

	return db.Transaction(func(tx *gorm.DB) error {
		for _, s := range statements {
			if err := tx.Exec(s).Error; err != nil {
				return err
			}
		}
		return nil
	})
}
