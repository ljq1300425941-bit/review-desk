import { afterEach, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import type Database from "better-sqlite3";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { createApp } from "../src/app.js";
import { openDatabase, resetDatabase } from "../src/db/database.js";

let db: Database.Database;
let temporaryDirectories: string[];
const approve = (submissionId: number) => ({
  submissionId,
  decision: "approve",
});
const reject = (submissionId: number, reason: string) => ({
  submissionId,
  decision: "reject",
  reason,
});
const post = (items: unknown[], operatorId = "reviewer-a") =>
  request(createApp(db, { logErrors: false }))
    .post("/api/reviews/batch")
    .send({ operatorId, items });
const get = (path: string) =>
  request(createApp(db, { logErrors: false })).get(path);
const row = (id: number) =>
  db.prepare("SELECT * FROM submissions WHERE id = ?").get(id) as Record<
    string,
    unknown
  >;
const logCount = () =>
  (
    db.prepare("SELECT count(*) AS count FROM review_logs").get() as {
      count: number;
    }
  ).count;
function tempDatabasePath() {
  const directory = mkdtempSync(join(tmpdir(), "review-desk-"));
  temporaryDirectories.push(directory);
  return join(directory, "test.sqlite");
}

beforeEach(() => {
  db = openDatabase(":memory:");
  temporaryDirectories = [];
});
afterEach(() => {
  if (db.open) db.close();
  for (const directory of temporaryDirectories) {
    if (
      !resolve(directory).startsWith(resolve(tmpdir()) + sep + "review-desk-")
    )
      throw new Error("Unsafe test cleanup path");
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("审核接口的业务与原子性", () => {
  it("同批通过和驳回，每条原因独立且操作人姓名来自后端", async () => {
    const response = await post(
      [approve(1), reject(2, "  商业广告  "), reject(3, "正文与标题无关")],
      "reviewer-b",
    );
    expect(response.status).toBe(200);
    expect(response.body.summary).toEqual({
      requested: 3,
      success: 3,
      conflict: 0,
      notFound: 0,
    });
    expect(row(1)).toMatchObject({
      status: "approved",
      rejection_reason: null,
      reviewed_by: "reviewer-b",
      reviewer_name: "陈舟",
    });
    expect(row(2)).toMatchObject({
      status: "rejected",
      rejection_reason: "商业广告",
    });
    expect(row(3)).toMatchObject({
      status: "rejected",
      rejection_reason: "正文与标题无关",
    });
    const detail = await get("/api/submissions/2");
    expect(detail.body.logs).toHaveLength(1);
    expect(detail.body.logs[0]).toMatchObject({
      operatorName: "陈舟",
      toStatus: "rejected",
      reason: "商业广告",
      batchId: response.body.batchId,
    });
    expect(logCount()).toBe(9);
  });

  it("有效项、已审核项和不存在项并存时逐条反馈", async () => {
    const response = await post([
      approve(1),
      reject(25, "不应覆盖已有结果"),
      approve(999),
    ]);
    expect(response.status).toBe(200);
    expect(response.body.summary).toEqual({
      requested: 3,
      success: 1,
      conflict: 1,
      notFound: 1,
    });
    expect(
      response.body.results.map((item: { outcome: string }) => item.outcome),
    ).toEqual(["success", "conflict", "not_found"]);
    expect(row(25)).toMatchObject({
      status: "approved",
      rejection_reason: null,
      reviewed_by: "reviewer-a",
    });
    expect(logCount()).toBe(7);
  });

  it("重试或重复点击不产生重复审核记录", async () => {
    const first = await post([reject(1, "第一次原因")]);
    const second = await post([approve(1)], "reviewer-b");
    expect(first.body.summary.success).toBe(1);
    expect(second.body.summary.conflict).toBe(1);
    expect(row(1)).toMatchObject({
      status: "rejected",
      rejection_reason: "第一次原因",
      reviewed_by: "reviewer-a",
    });
    expect(logCount()).toBe(7);
  });

  it("两个并发 HTTP 请求处理同一条，只允许一个成功", async () => {
    const results = await Promise.all([
      post([approve(1)]),
      post([reject(1, "另一位审核员")], "reviewer-b"),
    ]);
    expect(results.map((result) => result.status)).toEqual([200, 200]);
    expect(
      results.reduce((count, result) => count + result.body.summary.success, 0),
    ).toBe(1);
    expect(
      results.reduce(
        (count, result) => count + result.body.summary.conflict,
        0,
      ),
    ).toBe(1);
    expect(logCount()).toBe(7);
  });

  it("第二条日志失败时，连同第一条状态和日志一起回滚", async () => {
    db.exec(`CREATE TRIGGER fail_test_log BEFORE INSERT ON review_logs WHEN NEW.submission_id = 2
      BEGIN SELECT RAISE(ABORT, 'injected test failure'); END;`);
    const response = await post([approve(1), reject(2, "测试原因")]);
    expect(response.status).toBe(500);
    expect(response.body.code).toBe("INTERNAL_ERROR");
    expect(row(1).status).toBe("pending");
    expect(row(2).status).toBe("pending");
    expect(logCount()).toBe(6);
  });

  it.each([
    ["空批次", []],
    ["重复 ID", [approve(1), reject(1, "重复")]],
    ["空白原因", [approve(1), reject(2, " \t\n ")]],
    ["缺少原因", [{ submissionId: 1, decision: "reject" }]],
    ["缺少决策", [{ submissionId: 1 }]],
    ["非法决策", [{ submissionId: 1, decision: "pending" }]],
    ["非法 ID", [approve(-1)]],
    ["小数 ID", [approve(1.5)]],
    [
      "超过批次上限",
      Array.from({ length: 51 }, (_, index) => approve(index + 1)),
    ],
    ["超过原因上限", [reject(1, "字".repeat(501))]],
  ])("%s：返回 400，整批没有写入", async (_name, items) => {
    const response = await post(items);
    expect(response.status).toBe(400);
    expect(response.body.code).toBe("VALIDATION_ERROR");
    expect(response.body.details.length).toBeGreaterThan(0);
    expect(row(1).status).toBe("pending");
    expect(logCount()).toBe(6);
  });

  it("不存在的操作人不能写入审核记录", async () => {
    expect((await post([approve(1)], "fake-operator")).status).toBe(400);
    expect(row(1).status).toBe("pending");
    expect(logCount()).toBe(6);
  });

  it("通过决策不会保留无关的驳回原因", async () => {
    expect((await post([{ ...approve(1), reason: "不应被记录" }])).status).toBe(
      200,
    );
    expect(row(1).rejection_reason).toBeNull();
  });

  it("500 个 Unicode 字符在前后端及 SQLite 中保持相同边界", async () => {
    expect((await post([reject(1, "😀".repeat(500))])).status).toBe(200);
    expect((await post([reject(2, "😀".repeat(501))])).status).toBe(400);
  });
});

describe("列表、详情与数据库交付行为", () => {
  it("默认待审核、稳定分页、已审核不可混入待审核列表", async () => {
    const first = await get("/api/submissions");
    const second = await get("/api/submissions?page=2");
    expect(first.body.total).toBe(24);
    expect(first.body.items).toHaveLength(20);
    expect(first.body.items[0].id).toBe(1);
    expect(second.body.items.map((item: { id: number }) => item.id)).toEqual([
      21, 22, 23, 24,
    ]);
    expect((await get("/api/submissions?status=all")).body.total).toBe(30);
  });

  it("标题、作者搜索与参数绑定正常，通配符按文字处理", async () => {
    expect(
      (await get("/api/submissions?q=" + encodeURIComponent("图书馆"))).body
        .items,
    ).toHaveLength(1);
    expect(
      (await get("/api/submissions?q=" + encodeURIComponent("小禾"))).body.items
        .length,
    ).toBeGreaterThan(1);
    expect(
      (await get("/api/submissions?q=" + encodeURIComponent("' OR 1=1 --")))
        .body.total,
    ).toBe(0);
    expect((await get("/api/submissions?q=%25")).body.total).toBe(0);
    db.prepare(
      "INSERT INTO submissions (title, body, author_name, created_at) VALUES (?, 'text', 'author', '2026-10-14T00:00:00Z')",
    ).run("100%_literal");
    expect((await get("/api/submissions?q=%25_")).body.total).toBe(1);
  });

  it("详情返回原始文本、媒体占位及一致的演示审核记录", async () => {
    const special = await get("/api/submissions/20");
    expect(special.body.body).toContain("<script>");
    expect(special.body.attachments).toEqual([]);
    const rejected = await get("/api/submissions/28");
    expect(rejected.body.logs[0].reason).toBe(rejected.body.rejectionReason);
    expect(rejected.body.logs[0].operatorName).toBe(rejected.body.reviewerName);
    expect((await get("/api/submissions/999")).status).toBe(404);
    expect((await get("/api/submissions/abc")).status).toBe(400);
  });

  it.each(["page=0", "pageSize=51", "status=unknown", "q=x&q=y"])(
    "拒绝非法查询 %s",
    async (query) => {
      expect((await get("/api/submissions?" + query)).status).toBe(400);
    },
  );

  it("畸形 JSON 不写入，未知 API 返回 JSON 404", async () => {
    expect(
      (
        await request(createApp(db))
          .post("/api/reviews/batch")
          .type("json")
          .send("{broken")
      ).status,
    ).toBe(400);
    expect((await get("/api/unknown")).status).toBe(404);
    expect(logCount()).toBe(6);
  });

  it("数据库约束阻止空白原因、非法状态和无关联投稿的日志", () => {
    expect(() =>
      db
        .prepare("UPDATE submissions SET status = 'unknown' WHERE id = 1")
        .run(),
    ).toThrow();
    expect(() =>
      db
        .prepare(
          "UPDATE submissions SET status = 'rejected', reviewed_by = 'x', reviewer_name = 'x', reviewed_at = 'x', rejection_reason = ' ' WHERE id = 1",
        )
        .run(),
    ).toThrow();
    expect(() =>
      db
        .prepare(
          "INSERT INTO review_logs (submission_id,batch_id,operator_id,operator_name,from_status,to_status,created_at) VALUES (999,'x','x','x','pending','approved','x')",
        )
        .run(),
    ).toThrow();
  });

  it("关闭并重新打开文件数据库后保留状态，重复初始化不重置数据", async () => {
    const filename = tempDatabasePath();
    db.close();
    db = openDatabase(filename);
    await post([reject(1, "持久化原因")]);
    db.close();
    db = openDatabase(filename);
    expect(row(1)).toMatchObject({
      status: "rejected",
      rejection_reason: "持久化原因",
    });
    expect(logCount()).toBe(7);
    resetDatabase(db);
    expect(row(1).status).toBe("pending");
    expect(logCount()).toBe(6);
  });

  it("其他连接占用写锁时返回 503，没有写入", async () => {
    const filename = tempDatabasePath();
    db.close();
    db = openDatabase(filename, { timeout: 20 });
    const other = openDatabase(filename);
    try {
      other.exec("BEGIN IMMEDIATE");
      const response = await post([approve(1)]);
      expect(response.status).toBe(503);
      expect(response.body.code).toBe("DATABASE_BUSY");
      expect(row(1).status).toBe("pending");
      expect(logCount()).toBe(6);
    } finally {
      if (other.inTransaction) other.exec("ROLLBACK");
      other.close();
    }
  });
});
