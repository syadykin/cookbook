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
		&http.Ingredient{},
		&http.Step{},
		&http.Photo{},
	); err != nil {
		return nil, fmt.Errorf("migrate: %w", err)
	}

	if err := initSearch(db); err != nil {
		return nil, fmt.Errorf("search index: %w", err)
	}

	return db, nil
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
