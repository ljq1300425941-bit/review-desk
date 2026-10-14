import { afterEach, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import Database from "better-sqlite3";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { createApp } from "../src/app.js";
import { openDatabase } from "../src/db/database.js";

let db: Database.Database;
const directories: string[] = [];
const app = () => createApp(db, { logErrors: false });
const review = (
  id: number,
  revision = 0,
  operatorId = "reviewer-a",
  decision = "approve",
) =>
  request(app())
    .post("/api/reviews/batch")
    .send({
      operatorId,
      items: [
        {
          submissionId: id,
          expectedRevision: revision,
          decision,
          reason: "原始驳回原因",
        },
      ],
    });
const withdraw = (
  id: number,
  expectedRevision = 1,
  operatorId = "reviewer-a",
) =>
  request(app())
    .post(`/api/submissions/${id}/withdraw`)
    .send({ operatorId, expectedRevision });
const detail = async (id: number) =>
  (await request(app()).get(`/api/submissions/${id}`)).body;

beforeEach(() => {
  db = openDatabase(":memory:");
});
afterEach(() => {
  if (db.open) db.close();
  for (const directory of directories.splice(0)) {
    if (
      !resolve(directory).startsWith(
        resolve(tmpdir()) + sep + "review-desk-withdraw-",
      )
    )
      throw new Error("Unsafe cleanup path");
    rmSync(directory, { recursive: true, force: true });
  }
});

function legacyDatabase() {
  const directory = mkdtempSync(join(tmpdir(), "review-desk-withdraw-"));
  directories.push(directory);
  const filename = join(directory, "legacy.sqlite");
  const old = new Database(filename);
  old.exec(
    readFileSync(new URL("./fixtures/schema-v1.sql", import.meta.url), "utf8"),
  );
  old.exec(`INSERT INTO submissions (id,title,body,author_name,status,created_at,reviewed_by,reviewer_name,reviewed_at,rejection_reason) VALUES
    (1,'历史待审','原文','旧作者','pending','2026-10-10',NULL,NULL,NULL,NULL),
    (2,'历史通过','原文','旧作者','approved','2026-10-10','reviewer-a','林晓','2026-10-11',NULL),
    (3,'历史驳回','原文','旧作者','rejected','2026-10-10','reviewer-b','陈舟','2026-10-11','原有原因');
    INSERT INTO review_logs (id,submission_id,batch_id,operator_id,operator_name,from_status,to_status,reason,created_at) VALUES
    (10,2,'old-batch','reviewer-a','林晓','pending','approved',NULL,'2026-10-11'),
    (12,3,'old-batch','reviewer-b','陈舟','pending','rejected','原有原因','2026-10-11');`);
  return { filename, old };
}

describe("撤回审核", () => {
  it.each(["approve", "reject"])(
    "原处理人撤回 %s 后退回待审核，并保留原记录",
    async (decision) => {
      expect((await review(1, 0, "reviewer-a", decision)).status).toBe(200);
      const response = await withdraw(1);
      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        submissionId: 1,
        status: "pending",
        revision: 2,
      });
      const current = await detail(1);
      expect(current).toMatchObject({
        status: "pending",
        reviewedBy: null,
        reviewerName: null,
        reviewedAt: null,
        rejectionReason: null,
        revision: 2,
      });
      expect(current.logs).toHaveLength(2);
      expect(current.logs[0]).toMatchObject({
        action: "review",
        toStatus: decision === "approve" ? "approved" : "rejected",
        reason: decision === "approve" ? null : "原始驳回原因",
      });
      expect(current.logs[1]).toMatchObject({
        action: "withdraw",
        fromStatus: current.logs[0].toStatus,
        toStatus: "pending",
        operatorName: "林晓",
        reason: null,
      });
      expect(
        (await request(app()).get("/api/submissions")).body.items.some(
          (item: { id: number }) => item.id === 1,
        ),
      ).toBe(true);
    },
  );

  it("其他处理人无法撤回，服务端拒绝绕过界面的请求", async () => {
    await review(1);
    expect((await withdraw(1, 1, "reviewer-b")).status).toBe(403);
    expect(await detail(1)).toMatchObject({ status: "approved", revision: 1 });
    expect((await detail(1)).logs).toHaveLength(1);
  });

  it("重复或并发撤回只写一条撤回记录", async () => {
    await review(1);
    const responses = await Promise.all([withdraw(1), withdraw(1)]);
    expect(responses.map((response) => response.status).sort()).toEqual([
      200, 409,
    ]);
    expect((await detail(1)).logs).toHaveLength(2);
    expect((await detail(1)).revision).toBe(2);
  });

  it("同一个人重新审核后，旧撤回请求不能撤掉新结果", async () => {
    await review(1);
    await withdraw(1);
    expect(
      (await review(1, 2, "reviewer-a", "reject")).body.summary.success,
    ).toBe(1);
    expect((await withdraw(1, 1)).status).toBe(409);
    expect(await detail(1)).toMatchObject({
      status: "rejected",
      revision: 3,
      rejectionReason: "原始驳回原因",
    });
    expect((await detail(1)).logs).toHaveLength(3);
  });

  it("重新审核由另一人处理时，原处理人不再拥有撤回权限", async () => {
    await review(1);
    await withdraw(1);
    await review(1, 2, "reviewer-b");
    expect((await withdraw(1, 3, "reviewer-a")).status).toBe(403);
    expect((await withdraw(1, 3, "reviewer-b")).status).toBe(200);
  });

  it("撤回后的待审状态不会接受旧页面的审核决策", async () => {
    await review(1);
    await withdraw(1);
    const stale = await review(1, 0);
    expect(stale.body.summary.conflict).toBe(1);
    expect(stale.body.results[0]).toMatchObject({
      outcome: "conflict",
      status: "pending",
    });
    expect((await detail(1)).logs).toHaveLength(2);
    expect((await review(1, 2)).body.summary.success).toBe(1);
  });

  it("旧审核请求与撤回并发时不会恢复误审批", async () => {
    await review(1);
    const [withdrawal, stale] = await Promise.all([withdraw(1), review(1, 0)]);
    expect(withdrawal.status).toBe(200);
    expect(stale.body.summary.conflict).toBe(1);
    expect(await detail(1)).toMatchObject({ status: "pending", revision: 2 });
  });

  it("撤回日志写入失败时保留原状态、原因、处理人和版本", async () => {
    await review(1, 0, "reviewer-a", "reject");
    db.exec(`CREATE TRIGGER fail_withdraw BEFORE INSERT ON review_logs WHEN NEW.action = 'withdraw'
      BEGIN SELECT RAISE(ABORT, 'injected withdrawal failure'); END;`);
    expect((await withdraw(1)).status).toBe(500);
    expect(await detail(1)).toMatchObject({
      status: "rejected",
      revision: 1,
      reviewedBy: "reviewer-a",
      rejectionReason: "原始驳回原因",
    });
    expect((await detail(1)).logs).toHaveLength(1);
  });

  it("不存在和未审核的投稿不能撤回", async () => {
    expect((await withdraw(999)).status).toBe(404);
    expect((await withdraw(1)).status).toBe(409);
    expect((await detail(1)).logs).toHaveLength(0);
  });

  it.each([
    { operatorId: "fake", expectedRevision: 1 },
    { operatorId: "reviewer-a" },
    { operatorId: "reviewer-a", expectedRevision: 0 },
    { operatorId: "reviewer-a", expectedRevision: -1 },
    { operatorId: "reviewer-a", expectedRevision: 1.5 },
  ])("无效身份或版本不能撤回：%j", async (body) => {
    await review(1);
    expect(
      (await request(app()).post("/api/submissions/1/withdraw").send(body))
        .status,
    ).toBe(400);
    expect((await detail(1)).status).toBe("approved");
  });
});

describe("已有数据库升级", () => {
  it("V1 升级保留所有记录、ID、原因及自定义索引和触发器，不重新生成演示数据", async () => {
    const { filename, old } = legacyDatabase();
    old.exec(`CREATE INDEX historical_batch_idx ON review_logs(batch_id);
      CREATE TRIGGER historical_observer AFTER INSERT ON review_logs BEGIN SELECT 1; END;`);
    const before = old.prepare("SELECT * FROM review_logs ORDER BY id").all();
    old.close();
    db.close();
    db = openDatabase(filename);
    expect(db.pragma("user_version", { simple: true })).toBe(2);
    const rows = db
      .prepare("SELECT id, revision FROM submissions ORDER BY id")
      .all();
    expect(rows).toEqual([
      { id: 1, revision: 0 },
      { id: 2, revision: 1 },
      { id: 3, revision: 1 },
    ]);
    expect(
      db
        .prepare("SELECT * FROM review_logs ORDER BY id")
        .all()
        .map((value) => {
          const { action, ...original } = value as Record<string, unknown>;
          expect(action).toBe("review");
          return original;
        }),
    ).toEqual(before);
    expect(
      db
        .prepare(
          "SELECT count(*) AS count FROM sqlite_schema WHERE name IN ('historical_batch_idx','historical_observer')",
        )
        .get(),
    ).toEqual({ count: 2 });
    expect((await withdraw(2)).status).toBe(200);
    expect(
      (await detail(2)).logs.map((log: { action: string }) => log.action),
    ).toEqual(["review", "withdraw"]);
    db.close();
    db = openDatabase(filename);
    expect((await detail(2)).status).toBe("pending");
    expect((await detail(2)).logs).toHaveLength(2);
    expect(db.pragma("foreign_key_check")).toEqual([]);
  });

  it("迁移中途失败会回滚，V1 数据和 schema 仍可读取", () => {
    const { filename, old } = legacyDatabase();
    old.exec("CREATE TABLE review_logs_v2 (existing_data TEXT)");
    old.close();
    expect(() => openDatabase(filename)).toThrow();
    const preserved = new Database(filename);
    try {
      expect(preserved.pragma("user_version", { simple: true })).toBe(1);
      expect(
        (
          preserved.pragma("table_info(submissions)") as { name: string }[]
        ).some((column) => column.name === "revision"),
      ).toBe(false);
      expect(
        preserved.prepare("SELECT count(*) AS count FROM submissions").get(),
      ).toEqual({ count: 3 });
      expect(
        preserved.prepare("SELECT count(*) AS count FROM review_logs").get(),
      ).toEqual({ count: 2 });
    } finally {
      preserved.close();
    }
  });
});
