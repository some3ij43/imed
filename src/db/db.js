import Database from "better-sqlite3";

const db = new Database("bot.db");

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    expiresAt INTEGER
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS tests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS test_questions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    testId INTEGER NOT NULL,

    frontText TEXT,
    frontImageId TEXT,   -- ← новая колонка

    backText TEXT,
    backImageId TEXT,    -- ← новая колонка

    FOREIGN KEY(testId) REFERENCES tests(id)
  );
`);

export default db;
