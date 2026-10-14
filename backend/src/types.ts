export type SubmissionStatus = "pending" | "approved" | "rejected";
export type Decision = "approve" | "reject";

export interface MediaAttachment {
  id: string;
  type: "image" | "video";
  url: string;
  mimeType?: string;
}

export interface SubmissionRow {
  id: number;
  title: string;
  body: string;
  author_name: string;
  status: SubmissionStatus;
  attachments_json: string;
  created_at: string;
  reviewed_by: string | null;
  reviewer_name: string | null;
  reviewed_at: string | null;
  rejection_reason: string | null;
}

export interface ReviewItem {
  submissionId: number;
  decision: Decision;
  reason?: string | null;
}

export interface ReviewRequest {
  operatorId: string;
  items: ReviewItem[];
}

export interface ReviewResult {
  submissionId: number;
  outcome: "success" | "conflict" | "not_found";
  status?: SubmissionStatus;
  message: string;
}
