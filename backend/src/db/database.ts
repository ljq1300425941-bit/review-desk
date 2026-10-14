import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { databasePath } from "../config/paths.js";
import { seedDatabase } from "./seed.js";

const schema = `
CREATE TABLE submissions (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  author_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  attachments_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  reviewed_by TEXT,
  reviewer_name TEXT,
  reviewed_at TEXT,
  rejection_reason TEXT,
  CHECK (
    (status = 'pending' AND reviewed_by IS NULL AND reviewer_name IS NULL AND reviewed_at IS NULL AND rejection_reason IS NULL)
    OR (status = 'approved' AND reviewed_by IS NOT NULL AND reviewer_name IS NOT NULL AND reviewed_at IS NOT NULL AND rejection_reason IS NULL)
    OR (status = 'rejected' AND reviewed_by IS NOT NULL AND reviewer_name IS NOT NULL AND reviewed_at IS NOT NULL
      AND rejection_reason IS NOT NULL AND length(trim(rejection_reason)) BETWEEN 1 AND 500)
  )
);
CREATE INDEX submissions_status_created ON submissions(status, created_at, id);
CREATE TABLE review_logs (
  id INTEGER PRIMARY KEY,
  submission_id INTEGER NOT NULL REFERENCES submissions(id),
  batch_id TEXT NOT NULL,
  operator_id TEXT NOT NULL,
  operator_name TEXT NOT NULL,
  from_status TEXT NOT NULL CHECK (from_status = 'pending'),
  to_status TEXT NOT NULL CHECK (to_status IN ('approved', 'rejected')),
  reason TEXT,
  created_at TEXT NOT NULL,
  CHECK ((to_status = 'approved' AND reason IS NULL) OR
    (to_status = 'rejected' AND reason IS NOT NULL AND length(trim(reason)) BETWEEN 1 AND 500))
);
CREATE INDEX review_logs_submission ON review_logs(submission_id);
`;

export function openDatabase(
  filename = databasePath,
  options: { seed?: boolean; timeout?: number } = {},
) {
  if (filename !== ":memory:")
    mkdirSync(dirname(filename), { recursive: true });
  const db = new Database(filename, { timeout: options.timeout ?? 3000 });
  try {
    db.pragma("foreign_keys = ON");
    db.pragma("journal_mode = WAL");
    const version = db.pragma("user_version", { simple: true });
    if (version === 0) {
      db.transaction(() => {
        db.exec(schema);
        if (options.seed !== false) seedDatabase(db);
        db.pragma("user_version = 1");
      }).immediate();
    } else if (version !== 1) {
      throw new Error(`Unsupported database schema version: ${version}`);
    }
    return db;
  } catch (error) {
    db.close();
    throw error;
  }
}

export function resetDatabase(db: Database.Database) {
  db.transaction(() => {
    db.exec("DELETE FROM review_logs; DELETE FROM submissions;");
    seedDatabase(db);
  }).immediate();
}
