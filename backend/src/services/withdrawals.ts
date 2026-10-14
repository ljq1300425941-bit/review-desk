import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import { z } from "zod";
import { operators } from "../config/operators.js";
import type { SubmissionRow } from "../types.js";
import { operatorIdSchema } from "./reviews.js";

export const withdrawalSchema = z.object({
  operatorId: operatorIdSchema,
  expectedRevision: z.number().int().positive(),
});

export function withdrawReview(
  db: Database.Database,
  submissionId: number,
  request: z.infer<typeof withdrawalSchema>,
) {
  const operator = operators.find((item) => item.id === request.operatorId);
  if (!operator) throw new Error("Withdrawal requires a validated operator");
  return db
    .transaction(() => {
      const current = db
        .prepare("SELECT * FROM submissions WHERE id = ?")
        .get(submissionId) as SubmissionRow | undefined;
      if (!current)
        return {
          statusCode: 404,
          body: { code: "NOT_FOUND", message: "该投稿不存在" },
        };
      if (current.status === "pending")
        return {
          statusCode: 409,
          body: {
            code: "REVIEW_CONFLICT",
            message: "该投稿已处于待审核，无需再次撤回",
          },
        };
      if (current.reviewed_by !== operator.id)
        return {
          statusCode: 403,
          body: {
            code: "WITHDRAW_FORBIDDEN",
            message: "只有本次审核的原处理人可以撤回",
          },
        };
      if (current.revision !== request.expectedRevision)
        return {
          statusCode: 409,
          body: {
            code: "REVIEW_CONFLICT",
            message: "审核结果已更新，请核对最新记录后再撤回",
          },
        };
      const change = db
        .prepare(
          `UPDATE submissions SET status = 'pending', reviewed_by = NULL,
      reviewer_name = NULL, reviewed_at = NULL, rejection_reason = NULL, revision = revision + 1
      WHERE id = ? AND status = ? AND reviewed_by = ? AND revision = ?`,
        )
        .run(
          submissionId,
          current.status,
          operator.id,
          request.expectedRevision,
        );
      if (change.changes !== 1)
        return {
          statusCode: 409,
          body: {
            code: "REVIEW_CONFLICT",
            message: "审核结果已更新，请刷新后重试",
          },
        };
      db.prepare(
        `INSERT INTO review_logs (submission_id, batch_id, operator_id, operator_name,
      action, from_status, to_status, reason, created_at) VALUES (?, ?, ?, ?, 'withdraw', ?, 'pending', NULL, ?)`,
      ).run(
        submissionId,
        randomUUID(),
        operator.id,
        operator.name,
        current.status,
        new Date().toISOString(),
      );
      return {
        statusCode: 200,
        body: {
          submissionId,
          status: "pending",
          revision: current.revision + 1,
          message: "已撤回审核，投稿退回待审核，历史记录已保留",
        },
      };
    })
    .immediate();
}
