export const operators = [
  { id: "reviewer-a", name: "林晓" },
  { id: "reviewer-b", name: "陈舟" },
] as const;

export type Operator = (typeof operators)[number];
