
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

PRAGMA user_version = 1;
