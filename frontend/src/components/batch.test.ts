import { describe, expect, it } from "vitest";
import type { Submission } from "../api/client";
import { fillEmptyReasons, issueFor, makeDrafts, setUnset } from "./batch";

const submissions = [1, 2, 3].map((id) => ({
  id,
  title: `投稿 ${id}`,
  status: "pending",
})) as Submission[];
describe("批量草稿的安全边界", () => {
  it("初始不默认通过，没有明确决策时不能提交", () => {
    const drafts = makeDrafts(submissions);
    expect(drafts.every((item) => item.decision === "")).toBe(true);
    expect(drafts.every((item) => !!issueFor(item))).toBe(true);
  });
  it("统一设置只改未设置项，公共原因不覆盖手工原因", () => {
    const drafts = makeDrafts(submissions);
    drafts[0].decision = "approve";
    drafts[1].decision = "reject";
    drafts[1].reason = "独立原因";
    setUnset(drafts, "reject");
    fillEmptyReasons(drafts, "  公共原因  ");
    expect(drafts.map((item) => item.decision)).toEqual([
      "approve",
      "reject",
      "reject",
    ]);
    expect(drafts.map((item) => item.reason)).toEqual([
      "",
      "独立原因",
      "公共原因",
    ]);
    expect(drafts.every((item) => !issueFor(item))).toBe(true);
  });
  it("驳回原因拒绝空白和超长，采用 Unicode 字符计数", () => {
    const item = makeDrafts(submissions)[0];
    item.decision = "reject";
    item.reason = "\t\n";
    expect(issueFor(item)).toContain("填写");
    item.reason = "😀".repeat(500);
    expect(issueFor(item)).toBe("");
    item.reason = "😀".repeat(501);
    expect(issueFor(item)).toContain("500");
  });
  it("状态核对后已被处理项不参与统一设置或公共原因填充", () => {
    const drafts = makeDrafts(submissions);
    drafts[0].blocked = "reviewed";
    setUnset(drafts, "reject");
    fillEmptyReasons(drafts, "原因");
    expect(drafts[0].decision).toBe("");
    expect(drafts[0].reason).toBe("");
    expect(drafts[1].decision).toBe("reject");
  });
});
