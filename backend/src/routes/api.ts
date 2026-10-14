import { Router } from "express";
import type Database from "better-sqlite3";
import { z } from "zod";
import { operators } from "../config/operators.js";
import { getSubmission, listSubmissions } from "../repositories/submissions.js";
import { reviewBatch, reviewSchema } from "../services/reviews.js";
import { withdrawalSchema, withdrawReview } from "../services/withdrawals.js";

const querySchema = z.object({
  status: z.enum(["pending", "approved", "rejected", "all"]).default("pending"),
  q: z.string().trim().max(200).default(""),
  page: z.coerce.number().int().min(1).max(100000).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});

export function apiRouter(db: Database.Database) {
  const router = Router();
  router.get("/health", (_request, response) => response.json({ ok: true }));
  router.get("/operators", (_request, response) =>
    response.json({ items: operators }),
  );
  router.get("/submissions", (request, response) =>
    response.json(listSubmissions(db, querySchema.parse(request.query))),
  );
  router.get("/submissions/:id", (request, response) => {
    const id = z.coerce.number().int().positive().parse(request.params.id);
    const detail = getSubmission(db, id);
    if (!detail) {
      response.status(404).json({ code: "NOT_FOUND", message: "该投稿不存在" });
      return;
    }
    response.json(detail);
  });
  router.post("/reviews/batch", (request, response) =>
    response.json(reviewBatch(db, reviewSchema.parse(request.body))),
  );
  router.post("/submissions/:id/withdraw", (request, response) => {
    const id = z.coerce.number().int().positive().parse(request.params.id);
    const result = withdrawReview(db, id, withdrawalSchema.parse(request.body));
    response.status(result.statusCode).json(result.body);
  });
  return router;
}
