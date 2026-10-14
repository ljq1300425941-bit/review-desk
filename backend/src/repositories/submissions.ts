import type Database from "better-sqlite3";
import type {
  MediaAttachment,
  SubmissionRow,
  SubmissionStatus,
} from "../types.js";

function toSubmission(row: SubmissionRow) {
  return {
    id: row.id,
    title: row.title,
    authorName: row.author_name,
    status: row.status,
    revision: row.revision,
    createdAt: row.created_at,
    reviewedBy: row.reviewed_by,
    reviewerName: row.reviewer_name,
    reviewedAt: row.reviewed_at,
    rejectionReason: row.rejection_reason,
  };
}

export function listSubmissions(
  db: Database.Database,
  query: {
    status: SubmissionStatus | "all";
    q: string;
    page: number;
    pageSize: number;
  },
) {
  const clauses: string[] = [];
  const values: (string | number)[] = [];
  if (query.status !== "all") {
    clauses.push("status = ?");
    values.push(query.status);
  }
  if (query.q) {
    clauses.push(
      "(title LIKE ? ESCAPE '\\' OR author_name LIKE ? ESCAPE '\\')",
    );
    const term = `%${query.q.replace(/[\\%_]/g, "\\$&")}%`;
    values.push(term, term);
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const total = (
    db
      .prepare(`SELECT count(*) AS count FROM submissions ${where}`)
      .get(...values) as { count: number }
  ).count;
  const items = (
    db
      .prepare(
        `SELECT * FROM submissions ${where} ORDER BY created_at ASC, id ASC LIMIT ? OFFSET ?`,
      )
      .all(
        ...values,
        query.pageSize,
        (query.page - 1) * query.pageSize,
      ) as SubmissionRow[]
  ).map(toSubmission);
  return { items, total, page: query.page, pageSize: query.pageSize };
}

export function getSubmission(db: Database.Database, id: number) {
  const row = db.prepare("SELECT * FROM submissions WHERE id = ?").get(id) as
    SubmissionRow | undefined;
  if (!row) return null;
  const logs = db
    .prepare(
      `SELECT id, batch_id AS batchId, operator_id AS operatorId, operator_name AS operatorName, action,
    from_status AS fromStatus, to_status AS toStatus, reason, created_at AS createdAt
    FROM review_logs WHERE submission_id = ? ORDER BY id ASC`,
    )
    .all(id);
  return {
    ...toSubmission(row),
    body: row.body,
    attachments: JSON.parse(row.attachments_json) as MediaAttachment[],
    logs,
  };
}
