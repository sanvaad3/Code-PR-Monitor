// Review Detail Page - Phase 8
import { sql } from "@/lib/db";
import { notFound } from "next/navigation";
import Link from "next/link";

type ReviewDetail = {
  id: string;
  pr_number: number;
  repo_full_name: string;
  title: string;
  description: string | null;
  author: string;
  status: string;
  created_at: Date;
  started_at: Date | null;
  completed_at: Date | null;
  error_message: string | null;
  token_count: number | null;
  files_analyzed: number | null;
  github_url: string;
  review_payload: any;
};

type ReviewCommentDetail = {
  id: string;
  category: string;
  severity: string;
  file_path: string;
  line_start: number;
  line_end: number;
  comment_text: string;
  is_valid: boolean;
};

async function getReviewDetail(reviewId: string): Promise<ReviewDetail | null> {
  const [review] = await sql`
    SELECT 
      r.*,
      pr.pull_request_number as pr_number,
      pr.repo_full_name,
      pr.title,
      pr.description,
      pr.author,
      pr.github_url
    FROM reviews r
    JOIN pull_requests pr ON r.pull_request_id = pr.id
    WHERE r.id = ${reviewId}
  `;

  return review as ReviewDetail | null;
}

async function getReviewComments(
  reviewId: string
): Promise<ReviewCommentDetail[]> {
  const comments = await sql`
    SELECT *
    FROM review_comments
    WHERE review_id = ${reviewId}
    ORDER BY 
      CASE severity
        WHEN 'critical' THEN 1
        WHEN 'warning' THEN 2
        WHEN 'info' THEN 3
      END,
      file_path,
      line_start
  `;

  return comments as unknown as ReviewCommentDetail[];
}

export default async function ReviewDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const review = await getReviewDetail(id);

  if (!review) {
    notFound();
  }

  const comments = await getReviewComments(id);

  const commentsByCategory = {
    architecture: comments.filter((c) => c.category === "architecture"),
    security: comments.filter((c) => c.category === "security"),
    maintainability: comments.filter((c) => c.category === "maintainability"),
  };

  const severityCounts = {
    critical: comments.filter((c) => c.severity === "critical").length,
    warning: comments.filter((c) => c.severity === "warning").length,
    info: comments.filter((c) => c.severity === "info").length,
  };

  const duration =
    review.started_at && review.completed_at
      ? Math.round(
          (new Date(review.completed_at).getTime() -
            new Date(review.started_at).getTime()) /
            1000
        )
      : null;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-6">
          <Link
            href="/dashboard"
            className="text-sm text-blue-600 hover:text-blue-800 flex items-center gap-1 mb-4"
          >
            ← Back to Dashboard
          </Link>
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                {review.repo_full_name}#{review.pr_number}
              </h1>
              <p className="mt-1 text-sm text-gray-600">{review.title}</p>
            </div>
            <StatusBadge status={review.status} />
          </div>
        </div>

        {/* Metadata Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <MetadataCard label="Author" value={review.author} icon="👤" />
          <MetadataCard
            label="Duration"
            value={duration ? `${duration}s` : "N/A"}
            icon="⚡"
          />
          <MetadataCard
            label="Tokens"
            value={review.token_count?.toLocaleString() || "N/A"}
            icon="💰"
          />
          <MetadataCard
            label="Files"
            value={review.files_analyzed?.toString() || "N/A"}
            icon="📁"
          />
        </div>

        {/* Error Message (if failed) */}
        {review.status === "failed" && review.error_message && (
          <div className="mb-8 bg-red-50 border border-red-200 rounded-lg p-4">
            <h3 className="text-sm font-semibold text-red-800 mb-2">
              Review Failed
            </h3>
            <p className="text-sm text-red-700">{review.error_message}</p>
          </div>
        )}

        {/* Summary */}
        {review.status === "completed" && (
          <>
            <div className="bg-white shadow rounded-lg p-6 mb-8">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">
                Review Summary
              </h2>
              <div className="grid grid-cols-3 gap-4">
                <SeverityCount
                  label="Critical"
                  count={severityCounts.critical}
                  color="red"
                />
                <SeverityCount
                  label="Warning"
                  count={severityCounts.warning}
                  color="yellow"
                />
                <SeverityCount
                  label="Info"
                  count={severityCounts.info}
                  color="blue"
                />
              </div>
            </div>

            {/* Comments by Category */}
            <div className="space-y-6">
              {/* Architecture */}
              <CategorySection
                title="🏗️ Architecture"
                comments={commentsByCategory.architecture}
                emptyMessage="No architectural concerns found."
              />

              {/* Security */}
              <CategorySection
                title="🔐 Security"
                comments={commentsByCategory.security}
                emptyMessage="No security issues found."
              />

              {/* Maintainability */}
              <CategorySection
                title="🧹 Maintainability"
                comments={commentsByCategory.maintainability}
                emptyMessage="Code is well-structured and maintainable."
              />
            </div>

            {/* GitHub Link */}
            <div className="mt-8 flex justify-center">
              <a
                href={review.github_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors"
              >
                View on GitHub
                <svg
                  className="w-4 h-4"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path d="M11 3a1 1 0 100 2h2.586l-6.293 6.293a1 1 0 101.414 1.414L15 6.414V9a1 1 0 102 0V4a1 1 0 00-1-1h-5z" />
                  <path d="M5 5a2 2 0 00-2 2v8a2 2 0 002 2h8a2 2 0 002-2v-3a1 1 0 10-2 0v3H5V7h3a1 1 0 000-2H5z" />
                </svg>
              </a>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// Components

function StatusBadge({ status }: { status: string }) {
  const statusConfig = {
    pending: { bg: "bg-yellow-100", text: "text-yellow-800", label: "Pending" },
    running: { bg: "bg-blue-100", text: "text-blue-800", label: "Running" },
    completed: {
      bg: "bg-green-100",
      text: "text-green-800",
      label: "Completed",
    },
    failed: { bg: "bg-red-100", text: "text-red-800", label: "Failed" },
  };

  const config =
    statusConfig[status as keyof typeof statusConfig] || statusConfig.pending;

  return (
    <span
      className={`inline-flex px-3 py-1 text-sm font-semibold rounded-full ${config.bg} ${config.text}`}
    >
      {config.label}
    </span>
  );
}

function MetadataCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: string;
}) {
  return (
    <div className="bg-white shadow rounded-lg p-4">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-2xl">{icon}</span>
        <span className="text-xs text-gray-500 uppercase tracking-wide">
          {label}
        </span>
      </div>
      <div className="text-lg font-semibold text-gray-900">{value}</div>
    </div>
  );
}

function SeverityCount({
  label,
  count,
  color,
}: {
  label: string;
  count: number;
  color: "red" | "yellow" | "blue";
}) {
  const colorClasses = {
    red: "bg-red-100 text-red-800",
    yellow: "bg-yellow-100 text-yellow-800",
    blue: "bg-blue-100 text-blue-800",
  };

  return (
    <div className="text-center">
      <div
        className={`inline-flex px-4 py-2 rounded-full ${colorClasses[color]}`}
      >
        <span className="text-2xl font-bold">{count}</span>
      </div>
      <div className="mt-2 text-sm text-gray-600">{label}</div>
    </div>
  );
}

function CategorySection({
  title,
  comments,
  emptyMessage,
}: {
  title: string;
  comments: ReviewCommentDetail[];
  emptyMessage: string;
}) {
  return (
    <div className="bg-white shadow rounded-lg overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-200">
        <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
      </div>
      <div className="p-6">
        {comments.length === 0 ? (
          <p className="text-sm text-gray-600 italic">{emptyMessage}</p>
        ) : (
          <div className="space-y-4">
            {comments.map((comment) => (
              <CommentCard key={comment.id} comment={comment} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function CommentCard({ comment }: { comment: ReviewCommentDetail }) {
  const severityIcons = {
    critical: "🔴",
    warning: "🟡",
    info: "🔵",
  };

  const lineRef =
    comment.line_start === comment.line_end
      ? `L${comment.line_start}`
      : `L${comment.line_start}-L${comment.line_end}`;

  return (
    <div className="border border-gray-200 rounded-lg p-4 hover:border-gray-300 transition-colors">
      <div className="flex items-start gap-3">
        <span className="text-xl flex-shrink-0">
          {severityIcons[comment.severity as keyof typeof severityIcons]}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <code className="text-sm font-mono text-gray-900 bg-gray-100 px-2 py-1 rounded">
              {comment.file_path}
            </code>
            <span className="text-sm text-gray-500">{lineRef}</span>
          </div>
          <p className="text-sm text-gray-700">{comment.comment_text}</p>
        </div>
      </div>
    </div>
  );
}
