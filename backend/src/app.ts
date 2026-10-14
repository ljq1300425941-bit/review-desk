import express, { type ErrorRequestHandler } from "express";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import type Database from "better-sqlite3";
import { ZodError } from "zod";
import { frontendDist } from "./config/paths.js";
import { apiRouter } from "./routes/api.js";

export function createApp(
  db: Database.Database,
  options: { staticDir?: string; logErrors?: boolean } = {},
) {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "256kb" }));
  app.use("/api", apiRouter(db));
  app.use("/api", (_request, response) =>
    response.status(404).json({ code: "NOT_FOUND", message: "接口不存在" }),
  );
  const staticDir = options.staticDir ?? frontendDist;
  if (existsSync(resolve(staticDir, "index.html"))) {
    app.use(express.static(staticDir));
    app.get("/", (_request, response) =>
      response.sendFile(resolve(staticDir, "index.html")),
    );
  }
  const errorHandler: ErrorRequestHandler = (
    error,
    _request,
    response,
    _next,
  ) => {
    if (error instanceof ZodError) {
      response
        .status(400)
        .json({
          code: "VALIDATION_ERROR",
          message: "请检查请求参数，本批次没有执行",
          details: error.issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message,
          })),
        });
      return;
    }
    if (
      error?.type === "entity.parse.failed" ||
      error?.type === "entity.too.large"
    ) {
      response
        .status(400)
        .json({
          code: "INVALID_BODY",
          message: "请求正文无效或过大，本批次没有执行",
        });
      return;
    }
    if (error?.code === "SQLITE_BUSY" || error?.code === "SQLITE_LOCKED") {
      response
        .status(503)
        .json({
          code: "DATABASE_BUSY",
          message: "数据库忙，本批次没有提交，请稍后重试",
        });
      return;
    }
    if (options.logErrors !== false) console.error(error);
    response
      .status(500)
      .json({
        code: "INTERNAL_ERROR",
        message: "处理异常，本批次没有提交，请稍后重试",
      });
  };
  app.use(errorHandler);
  return app;
}
