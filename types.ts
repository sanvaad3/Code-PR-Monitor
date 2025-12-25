// Database Types - matching schema.sql

export type User = {
  id: string;
  github_id: number;
  github_username: string;
  email?: string;
  avatar_url?: string;
  access_token?: string;
  created_at: Date;
  updated_at: Date;
};

export type Repository = {
  id: string;
  github_id: number;
  owner: string;
  name: string;
  full_name: string; // owner/repo
  is_private: boolean;
  installation_id?: number;
  created_at: Date;
  updated_at: Date;
};

export type PullRequestStatus = "pending" | "running" | "completed" | "failed";

export type PullRequest = {
  id: string;
  repository_id: string;
  pull_request_number: number;
  repo_full_name: string;
  title: string;
  description?: string;
  author: string;
  base_branch: string;
  head_branch: string;
  commit_sha: string;
  status: PullRequestStatus;
  github_url: string;
  created_at: Date;
  updated_at: Date;
};

export type ReviewStatus = "pending" | "running" | "completed" | "failed";

export type Review = {
  id: string;
  pull_request_id: string;
  status: ReviewStatus;
  started_at?: Date;
  completed_at?: Date;
  error_message?: string;
  review_payload?: ReviewPayload;
  github_comment_id?: number;
  token_count?: number;
  files_analyzed?: number;
  created_at: Date;
  updated_at: Date;
};

export type CommentCategory = "architecture" | "security" | "maintainability";
export type CommentSeverity = "info" | "warning" | "critical";

export type ReviewComment = {
  id: string;
  review_id: string;
  category: CommentCategory;
  severity: CommentSeverity;
  file_path: string;
  line_start: number;
  line_end: number;
  comment_text: string;
  is_valid: boolean;
  created_at: Date;
};

// Structured review payload stored in JSONB
export type ReviewPayload = {
  architecture: CategoryReview;
  security: CategoryReview;
  maintainability: CategoryReview;
  summary: string;
  files_analyzed: string[];
  context_files: string[];
  token_usage: number;
};

export type CategoryReview = {
  comments: CategoryComment[];
  overall_assessment: string;
};

export type CategoryComment = {
  file_path: string;
  line_start: number;
  line_end: number;
  severity: CommentSeverity;
  message: string;
  reasoning: string;
};

// API/Worker types
export type ChangedFile = {
  path: string;
  patch: string;
  additions: number;
  deletions: number;
  status: "added" | "modified" | "removed" | "renamed";
};

export type FileContext = {
  path: string;
  content: string;
  relevance_score: number;
  distance: number; // From changed files
};

// Code analysis types (Phase 3)
export type FileComplexity = "low" | "medium" | "high";

export type FileType = {
  isComponent: boolean;
  isHook: boolean;
  isUtil: boolean;
  isConfig: boolean;
  isTest: boolean;
  isAPI: boolean;
};

export type CodeSection = {
  startLine: number;
  endLine: number;
  code: string;
  isChanged: boolean;
};

// Relevance ranking types (Phase 4)
export type ScoredFile = {
  path: string;
  score: number;
  distance: number; // 0 = changed, 1 = direct dependency, etc.
  reason: string;
  isCritical: boolean;
  complexity: FileComplexity;
};

export type PRImpactLevel = "low" | "medium" | "high" | "critical";

export type ContextSelectionStats = {
  totalAnalyzed: number;
  contextFilesSelected: number;
  byDistance: Record<number, number>;
  criticalFilesIncluded: number;
};
