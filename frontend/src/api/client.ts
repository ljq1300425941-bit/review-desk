export type Status = "pending" | "approved" | "rejected";
export type Decision = "approve" | "reject";
export interface Operator {
  id: string;
  name: string;
}
export interface Submission {
  id: number;
  title: string;
  authorName: string;
  status: Status;
  revision: number;
  createdAt: string;
  reviewedBy: string | null;
  reviewerName: string | null;
  reviewedAt: string | null;
  rejectionReason: string | null;
}
export interface MediaAttachment {
  id: string;
  type: "image" | "video";
  url: string;
  mimeType?: string;
}
export interface ReviewLog {
  id: number;
  batchId: string;
  operatorId: string;
  operatorName: string;
  action: "review" | "withdraw";
  fromStatus: Status;
  toStatus: Status;
  reason: string | null;
  createdAt: string;
}
export interface Detail extends Submission {
  body: string;
  attachments: MediaAttachment[];
  logs: ReviewLog[];
}
export interface ListResponse {
  items: Submission[];
  total: number;
  page: number;
  pageSize: number;
}
export interface BatchRequest {
  operatorId: string;
  items: {
    submissionId: number;
    expectedRevision: number;
    decision: Decision;
    reason?: string;
  }[];
}
export interface BatchResponse {
  batchId: string;
  summary: {
    requested: number;
    success: number;
    conflict: number;
    notFound: number;
  };
  results: {
    submissionId: number;
    outcome: "success" | "conflict" | "not_found";
    status?: Status;
    message: string;
  }[];
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public details: { path: string; message: string }[] = [],
    public code = "",
  ) {
    super(message);
  }
}
export class UnconfirmedError extends Error {}

async function request<T>(url: string, options: RequestInit = {}): Promise<T> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: { "Content-Type": "application/json", ...options.headers },
    });
    const body = await response.json();
    if (!response.ok)
      throw new ApiError(
        response.status,
        body.message ?? "请求失败，请重试",
        body.details,
        body.code,
      );
    return body as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new UnconfirmedError("连接中断或请求超时，请核对最新状态后重试");
  } finally {
    window.clearTimeout(timeout);
  }
}

export const api = {
  operators: () => request<{ items: Operator[] }>("/api/operators"),
  list: (query: {
    status: Status | "all";
    q: string;
    page: number;
    pageSize: number;
  }) =>
    request<ListResponse>(
      "/api/submissions?" +
        new URLSearchParams({
          ...query,
          page: String(query.page),
          pageSize: String(query.pageSize),
        }),
    ),
  detail: (id: number) => request<Detail>(`/api/submissions/${id}`),
  review: (body: BatchRequest) =>
    request<BatchResponse>("/api/reviews/batch", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  withdraw: (
    id: number,
    body: { operatorId: string; expectedRevision: number },
  ) =>
    request<{
      submissionId: number;
      status: "pending";
      revision: number;
      message: string;
    }>(`/api/submissions/${id}/withdraw`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
};

export const statusLabels: Record<Status, string> = {
  pending: "待审核",
  approved: "已通过",
  rejected: "已驳回",
};
export function formatTime(value: string | null) {
  return value
    ? new Intl.DateTimeFormat("zh-CN", {
        timeZone: "Asia/Shanghai",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(new Date(value))
    : "—";
}
