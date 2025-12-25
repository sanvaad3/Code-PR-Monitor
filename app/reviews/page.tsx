// Reviews List Page - Phase 8
import { sql } from "@/lib/db";
import Link from "next/link";
import { FilterDropdownClient } from "./FilterDropdownClient";

type Review = {
  id: string;
  pr_number: number;
  repo_full_name: string;
  title: string;
  status: string;
  created_at: Date;
  completed_at: Date | null;
  token_count: number | null;
  files_analyzed: number | null;
  critical_count: number;
  warning_count: number;
  info_count: number;
};

async function getAllReviews(filters?: {
  status?: string;
  repo?: string;
}): Promise<Review[]> {
  let reviews;
  if (filters?.status && filters?.repo) {
    reviews = await sql`
      SELECT
        r.id,
        pr.pull_request_number as pr_number,
        pr.repo_full_name,
        pr.title,
        r.status,
        r.created_at,
        r.completed_at,
        r.token_count,
        r.files_analyzed,
        COUNT(*) FILTER (WHERE rc.severity = 'critical') as critical_count,
        COUNT(*) FILTER (WHERE rc.severity = 'warning') as warning_count,
        COUNT(*) FILTER (WHERE rc.severity = 'info') as info_count
      FROM reviews r
      JOIN pull_requests pr ON r.pull_request_id = pr.id
      LEFT JOIN review_comments rc ON r.id = rc.review_id
      WHERE r.status = ${filters.status} AND pr.repo_full_name = ${filters.repo}
      GROUP BY r.id, pr.pull_request_number, pr.repo_full_name, pr.title,
               r.status, r.created_at, r.completed_at, r.token_count, r.files_analyzed
      ORDER BY r.created_at DESC
    `;
  } else if (filters?.status) {
    reviews = await sql`
      SELECT
        r.id,
        pr.pull_request_number as pr_number,
        pr.repo_full_name,
        pr.title,
        r.status,
        r.created_at,
        r.completed_at,
        r.token_count,
        r.files_analyzed,
        COUNT(*) FILTER (WHERE rc.severity = 'critical') as critical_count,
        COUNT(*) FILTER (WHERE rc.severity = 'warning') as warning_count,
        COUNT(*) FILTER (WHERE rc.severity = 'info') as info_count
      FROM reviews r
      JOIN pull_requests pr ON r.pull_request_id = pr.id
      LEFT JOIN review_comments rc ON r.id = rc.review_id
      WHERE r.status = ${filters.status}
      GROUP BY r.id, pr.pull_request_number, pr.repo_full_name, pr.title,
               r.status, r.created_at, r.completed_at, r.token_count, r.files_analyzed
      ORDER BY r.created_at DESC
    `;
  } else if (filters?.repo) {
    reviews = await sql`
      SELECT
        r.id,
        pr.pull_request_number as pr_number,
        pr.repo_full_name,
        pr.title,
        r.status,
        r.created_at,
        r.completed_at,
        r.token_count,
        r.files_analyzed,
        COUNT(*) FILTER (WHERE rc.severity = 'critical') as critical_count,
        COUNT(*) FILTER (WHERE rc.severity = 'warning') as warning_count,
        COUNT(*) FILTER (WHERE rc.severity = 'info') as info_count
      FROM reviews r
      JOIN pull_requests pr ON r.pull_request_id = pr.id
      LEFT JOIN review_comments rc ON r.id = rc.review_id
      WHERE pr.repo_full_name = ${filters.repo}
      GROUP BY r.id, pr.pull_request_number, pr.repo_full_name, pr.title,
               r.status, r.created_at, r.completed_at, r.token_count, r.files_analyzed
      ORDER BY r.created_at DESC
    `;
  } else {
    reviews = await sql`
      SELECT
        r.id,
        pr.pull_request_number as pr_number,
        pr.repo_full_name,
        pr.title,
        r.status,
        r.created_at,
        r.completed_at,
        r.token_count,
        r.files_analyzed,
        COUNT(*) FILTER (WHERE rc.severity = 'critical') as critical_count,
        COUNT(*) FILTER (WHERE rc.severity = 'warning') as warning_count,
        COUNT(*) FILTER (WHERE rc.severity = 'info') as info_count
      FROM reviews r
      JOIN pull_requests pr ON r.pull_request_id = pr.id
      LEFT JOIN review_comments rc ON r.id = rc.review_id
      GROUP BY r.id, pr.pull_request_number, pr.repo_full_name, pr.title,
               r.status, r.created_at, r.completed_at, r.token_count, r.files_analyzed
      ORDER BY r.created_at DESC
    `;
  }

  return reviews as unknown as Review[];
}

async function getRepositories(): Promise<string[]> {
  const repos = await sql`
    SELECT DISTINCT repo_full_name 
    FROM pull_requests 
    ORDER BY repo_full_name
  `;
  return repos.map((r: any) => r.repo_full_name);
}

export default async function ReviewsListPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; repo?: string }>;
}) {
  const params = await searchParams;
  const reviews = await getAllReviews(params);
  const repositories = await getRepositories();

  const stats = {
    total: reviews.length,
    completed: reviews.filter((r) => r.status === "completed").length,
    pending: reviews.filter((r) => r.status === "pending").length,
    running: reviews.filter((r) => r.status === "running").length,
    failed: reviews.filter((r) => r.status === "failed").length,
  };

  return (
    <div className="min-h-screen bg-[var(--background)]">
      <div className="max-w-7xl mx-auto px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-6">
          <Link
            href="/"
            className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 flex items-center gap-1 mb-4 transition-colors"
          >
            ← Back to Dashboard
          </Link>
          <h1 className="text-3xl font-bold text-[var(--foreground)]">
            Review History
          </h1>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            Browse and filter all AI-generated code reviews
          </p>
        </div>

        {/* Stats Bar */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
          <QuickStat label="Total" value={stats.total} />
          <QuickStat label="Completed" value={stats.completed} color="green" />
          <QuickStat label="Running" value={stats.running} color="blue" />
          <QuickStat label="Pending" value={stats.pending} color="yellow" />
          <QuickStat label="Failed" value={stats.failed} color="red" />
        </div>

        {/* Filters */}
        <div className="bg-[var(--card-bg)] shadow-sm rounded-xl border border-[var(--border-color)] p-4 mb-6">
          <div className="flex flex-wrap gap-4">
            <FilterDropdown
              label="Status"
              options={[
                { value: "", label: "All Statuses" },
                { value: "completed", label: "Completed" },
                { value: "running", label: "Running" },
                { value: "pending", label: "Pending" },
                { value: "failed", label: "Failed" },
              ]}
              currentValue={params.status || ""}
              param="status"
            />
            <FilterDropdown
              label="Repository"
              options={[
                { value: "", label: "All Repositories" },
                ...repositories.map((repo) => ({ value: repo, label: repo })),
              ]}
              currentValue={params.repo || ""}
              param="repo"
            />
          </div>
        </div>

        {/* Reviews Table */}
        <div className="bg-[var(--card-bg)] shadow-sm rounded-xl border border-[var(--border-color)] overflow-hidden">
          <table className="min-w-full divide-y divide-[var(--border-color)]">
            <thead className="bg-gray-50 dark:bg-gray-800/50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Pull Request
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Issues
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Metrics
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Created
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-[var(--card-bg)] divide-y divide-[var(--border-color)]">
              {reviews.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-6 py-12 text-center text-gray-500 dark:text-gray-400"
                  >
                    No reviews found. Try adjusting your filters.
                  </td>
                </tr>
              ) : (
                reviews.map((review) => (
                  <ReviewTableRow key={review.id} review={review} />
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// Components

function QuickStat({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color?: "green" | "blue" | "yellow" | "red";
}) {
  const colorClasses = {
    green: "text-green-600 dark:text-green-400",
    blue: "text-blue-600 dark:text-blue-400",
    yellow: "text-yellow-600 dark:text-yellow-400",
    red: "text-red-600 dark:text-red-400",
  };

  return (
    <div className="bg-[var(--card-bg)] rounded-xl shadow-sm border border-[var(--border-color)] p-4">
      <div className="text-sm text-gray-500 dark:text-gray-400">{label}</div>
      <div
        className={`text-2xl font-bold ${
          color ? colorClasses[color] : "text-[var(--foreground)]"
        }`}
      >
        {value}
      </div>
    </div>
  );
}

function FilterDropdown({
  label,
  options,
  currentValue,
  param,
}: {
  label: string;
  options: { value: string; label: string }[];
  currentValue: string;
  param: string;
}) {
  return (
    <FilterDropdownClient
      label={label}
      options={options}
      currentValue={currentValue}
      param={param}
    />
  );
}

function ReviewTableRow({ review }: { review: Review }) {
  const statusColors = {
    pending: "bg-yellow-100 text-yellow-800",
    running: "bg-blue-100 text-blue-800",
    completed: "bg-green-100 text-green-800",
    failed: "bg-red-100 text-red-800",
  };

  const totalIssues =
    review.critical_count + review.warning_count + review.info_count;

  const timeAgo = getTimeAgo(review.created_at);
  const duration = review.completed_at
    ? Math.round(
        (new Date(review.completed_at).getTime() -
          new Date(review.created_at).getTime()) /
          1000
      )
    : null;

  return (
    <tr className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
      <td className="px-6 py-4 whitespace-nowrap">
        <div className="flex flex-col">
          <div className="text-sm font-medium text-[var(--foreground)]">
            {review.repo_full_name}#{review.pr_number}
          </div>
          <div className="text-sm text-gray-500 dark:text-gray-400 truncate max-w-md">
            {review.title}
          </div>
        </div>
      </td>
      <td className="px-6 py-4 whitespace-nowrap">
        <span
          className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
            statusColors[review.status as keyof typeof statusColors]
          }`}
        >
          {review.status}
        </span>
      </td>
      <td className="px-6 py-4 whitespace-nowrap">
        <div className="flex items-center gap-2 text-xs">
          {review.critical_count > 0 && (
            <span className="px-2 py-1 bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-400 rounded-full">
              🔴 {review.critical_count}
            </span>
          )}
          {review.warning_count > 0 && (
            <span className="px-2 py-1 bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-400 rounded-full">
              🟡 {review.warning_count}
            </span>
          )}
          {review.info_count > 0 && (
            <span className="px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-400 rounded-full">
              🔵 {review.info_count}
            </span>
          )}
          {totalIssues === 0 && review.status === "completed" && (
            <span className="text-green-600 dark:text-green-400">✓ Clean</span>
          )}
        </div>
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
        <div className="flex flex-col gap-1">
          {duration && <div>⚡ {duration}s</div>}
          {review.token_count && (
            <div>💰 {review.token_count.toLocaleString()}</div>
          )}
          {review.files_analyzed && <div>📁 {review.files_analyzed} files</div>}
        </div>
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
        {timeAgo}
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
        <Link
          href={`/reviews/${review.id}`}
          className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 transition-colors"
        >
          View Details
        </Link>
      </td>
    </tr>
  );
}

function getTimeAgo(date: Date): string {
  const seconds = Math.floor(
    (new Date().getTime() - new Date(date).getTime()) / 1000
  );

  const intervals = [
    { label: "year", seconds: 31536000 },
    { label: "month", seconds: 2592000 },
    { label: "day", seconds: 86400 },
    { label: "hour", seconds: 3600 },
    { label: "minute", seconds: 60 },
  ];

  for (const interval of intervals) {
    const count = Math.floor(seconds / interval.seconds);
    if (count >= 1) {
      return `${count} ${interval.label}${count !== 1 ? "s" : ""} ago`;
    }
  }

  return "just now";
}
