import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import { z } from "zod";
import { operators } from "../config/operators.js";
import type { ReviewResult, SubmissionStatus } from "../types.js";

export const operatorIdSchema = z
  .string()
  .refine(
    (id) => operators.some((operator) => operator.id === id),
    "请选择有效的操作人",
  );
const expectedRevisionSchema = z.number().int().nonnegative().default(0);

const itemSchema = z.discriminatedUnion("decision", [
  z.object({
    submissionId: z.number().int().positive(),
    expectedRevision: expectedRevisionSchema,
    decision: z.literal("approve"),
    reason: z.string().nullable().optional(),
  }),
  z.object({
    submissionId: z.number().int().positive(),
    expectedRevision: expectedRevisionSchema,
    decision: z.literal("reject"),
    reason: z
      .string()
      .trim()
      .min(1, "请填写驳回原因")
      .refine(
        (value) => Array.from(value).length <= 500,
        "驳回原因不能超过 500 个字符",
      ),
  }),
]);

export const reviewSchema = z
  .object({
    operatorId: operatorIdSchema,
    items: z
      .array(itemSchema)
      .min(1, "至少选择一条投稿")
      .max(50, "一次最多审核 50 条"),
  })
  .superRefine((value, context) => {
    const seen = new Set<number>();
    value.items.forEach((item, index) => {
      if (seen.has(item.submissionId))
        context.addIssue({
          code: "custom",
          path: ["items", index, "submissionId"],
          message: "同一投稿不能重复提交",
        });
      seen.add(item.submissionId);
    });
  });

export type ValidReviewRequest = z.infer<typeof reviewSchema>;

export function reviewBatch(
  db: Database.Database,
  request: ValidReviewRequest,
) {
  const operator = operators.find((item) => item.id === request.operatorId);
  if (!operator)
    throw new Error("Review service requires a validated operator");
  const batchId = randomUUID();
  const time = new Date().toISOString();
  const update =
    db.prepare(`UPDATE submissions SET status = ?, reviewed_by = ?, reviewer_name = ?,
    reviewed_at = ?, rejection_reason = ?, revision = revision + 1
    WHERE id = ? AND status = 'pending' AND revision = ?`);
  const insertLog =
    db.prepare(`INSERT INTO review_logs (submission_id, batch_id, operator_id, operator_name,
    from_status, to_status, reason, created_at) VALUES (?, ?, ?, ?, 'pending', ?, ?, ?)`);
  const findStatus = db.prepare("SELECT status FROM submissions WHERE id = ?");

  return db
    .transaction(() => {
      const results: ReviewResult[] = [];
      for (const item of request.items) {
        const status = item.decision === "approve" ? "approved" : "rejected";
        const reason = item.decision === "reject" ? item.reason : null;
        const change = update.run(
          status,
          operator.id,
          operator.name,
          time,
          reason,
          item.submissionId,
          item.expectedRevision,
        );
        if (change.changes === 1) {
          insertLog.run(
            item.submissionId,
            batchId,
            operator.id,
            operator.name,
            status,
            reason,
            time,
          );
          results.push({
            submissionId: item.submissionId,
            outcome: "success",
            status,
            message: status === "approved" ? "已通过" : "已驳回",
          });
        } else {
          const current = findStatus.get(item.submissionId) as
            { status: SubmissionStatus } | undefined;
          results.push(
            current
              ? {
                  submissionId: item.submissionId,
                  outcome: "conflict",
                  status: current.status,
                  message:
                    current.status === "pending"
                      ? "投稿状态已更新，请刷新后重新设置决策"
                      : "该投稿已经被审核，请查看最新结果",
                }
              : {
                  submissionId: item.submissionId,
                  outcome: "not_found",
                  message: "该投稿不存在",
                },
          );
        }
      }
      return {
        batchId,
        summary: {
          requested: results.length,
          success: results.filter((item) => item.outcome === "success").length,
          conflict: results.filter((item) => item.outcome === "conflict")
            .length,
          notFound: results.filter((item) => item.outcome === "not_found")
            .length,
        },
        results,
      };
    })
    .immediate();
}
