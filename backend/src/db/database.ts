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
  revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
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
  action TEXT NOT NULL DEFAULT 'review' CHECK (action IN ('review', 'withdraw')),
  from_status TEXT NOT NULL,
  to_status TEXT NOT NULL,
  reason TEXT,
  created_at TEXT NOT NULL,
  CHECK (
    (action = 'review' AND from_status = 'pending' AND
      ((to_status = 'approved' AND reason IS NULL) OR
       (to_status = 'rejected' AND reason IS NOT NULL AND length(trim(reason)) BETWEEN 1 AND 500)))
    OR (action = 'withdraw' AND from_status IN ('approved', 'rejected') AND to_status = 'pending' AND reason IS NULL)
  )
);
CREATE INDEX review_logs_submission ON review_logs(submission_id);
`;

function migrateV1(db: Database.Database) {
  const dependentObjects = db
    .prepare(
      `SELECT sql FROM sqlite_schema
    WHERE tbl_name = 'review_logs' AND type IN ('index', 'trigger') AND sql IS NOT NULL`,
    )
    .all() as { sql: string }[];
  db.transaction(() => {
    db.exec(`ALTER TABLE submissions ADD COLUMN revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0);
      UPDATE submissions SET revision = (SELECT count(*) FROM review_logs WHERE submission_id = submissions.id);`);
    const logsSchema = schema.slice(
      schema.indexOf("CREATE TABLE review_logs ("),
      schema.indexOf("CREATE INDEX review_logs_submission"),
    );
    db.exec(
      logsSchema.replace(
        "CREATE TABLE review_logs (",
        "CREATE TABLE review_logs_v2 (",
      ),
    );
    db.exec(`INSERT INTO review_logs_v2 (id, submission_id, batch_id, operator_id, operator_name, action, from_status, to_status, reason, created_at)
      SELECT id, submission_id, batch_id, operator_id, operator_name, 'review', from_status, to_status, reason, created_at FROM review_logs;
      DROP TABLE review_logs;
      ALTER TABLE review_logs_v2 RENAME TO review_logs;`);
    for (const object of dependentObjects) db.exec(object.sql);
    db.exec(
      "CREATE INDEX IF NOT EXISTS review_logs_submission ON review_logs(submission_id)",
    );
    const foreignKeyErrors = db.pragma("foreign_key_check");
    if (!Array.isArray(foreignKeyErrors) || foreignKeyErrors.length)
      throw new Error("Database migration failed foreign key validation");
    db.pragma("user_version = 2");
  }).immediate();
}

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
        db.pragma("user_version = 2");
      }).immediate();
    } else if (version === 1) {
      migrateV1(db);
    } else if (version !== 2) {
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
