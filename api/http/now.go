package http

import "time"

// Now is the current time in UTC; use it for every time that is stored or compared in SQL.
// mattn/go-sqlite3 writes a time.Time as text in the time's own zone, and SQLite compares those
// texts as strings, so ORDER BY and < are right only while every stored value has the same
// offset. Local time breaks that at each DST switch or when the server's TZ changes.
func Now() time.Time {
	return time.Now().UTC()
}
