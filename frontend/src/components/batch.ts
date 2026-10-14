import type { Decision, Submission } from "../api/client";

export interface Draft extends Submission {
  decision: Decision | "";
  reason: string;
  blocked?: "reviewed" | "missing";
}

export function makeDrafts(items: Submission[]): Draft[] {
  return items.map((item) => ({ ...item, decision: "", reason: "" }));
}
export function setUnset(items: Draft[], decision: Decision) {
  for (const item of items)
    if (!item.blocked && !item.decision) item.decision = decision;
}
export function fillEmptyReasons(items: Draft[], reason: string) {
  for (const item of items)
    if (!item.blocked && item.decision === "reject" && !item.reason.trim())
      item.reason = reason.trim();
}
export function issueFor(item: Draft) {
  if (!item.decision) return "请选择审核决策";
  if (item.decision === "reject" && !item.reason.trim())
    return "请填写驳回原因";
  if (item.decision === "reject" && Array.from(item.reason.trim()).length > 500)
    return "驳回原因不能超过 500 个字符";
  return "";
}
