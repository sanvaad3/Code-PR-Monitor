// Dashboard Home Page - Phase 8
import { sql } from "@/lib/db";
import Link from "next/link";

type DashboardStats = {
  totalReviews: number;
  completedReviews: number;
  failedReviews: number;
  avgTokens: number;
  avgReviewTime: number;
  totalCommentsGenerated: number;
  criticalIssuesFound: number;
};

type RecentReview = {
  id: string;
  pr_number: number;
  repo_full_name: string;
  title: string;
  status: string;
  created_at: Date;
  completed_at: Date | null;
  token_count: number | null;
  github_url: string;
};

async function getDashboardStats(): Promise<DashboardStats> {
  // Get review stats
  const [stats] = await sql`
    SELECT 
      COUNT(*) as total_reviews,
      COUNT(*) FILTER (WHERE status = 'completed') as completed_reviews,
      COUNT(*) FILTER (WHERE status = 'failed') as failed_reviews,
      ROUND(AVG(token_count)) as avg_tokens,
      ROUND(AVG(EXTRACT(EPOCH FROM (completed_at - started_at)))) as avg_review_time
    FROM reviews
  `;

  // Get comment stats
  const [commentStats] = await sql`
    SELECT 
      COUNT(*) as total_comments,
      COUNT(*) FILTER (WHERE severity = 'critical') as critical_issues
    FROM review_comments
  `;

  return {
    totalReviews: parseInt(stats.total_reviews) || 0,
    completedReviews: parseInt(stats.completed_reviews) || 0,
    failedReviews: parseInt(stats.failed_reviews) || 0,
    avgTokens: parseInt(stats.avg_tokens) || 0,
    avgReviewTime: parseInt(stats.avg_review_time) || 0,
    totalCommentsGenerated: parseInt(commentStats.total_comments) || 0,
    criticalIssuesFound: parseInt(commentStats.critical_issues) || 0,
  };
}

async function getRecentReviews(): Promise<RecentReview[]> {
  const reviews = await sql`
    SELECT 
      r.id,
      pr.pull_request_number as pr_number,
      pr.repo_full_name,
      pr.title,
      r.status,
      r.created_at,
      r.completed_at,
      r.token_count,
      pr.github_url
    FROM reviews r
    JOIN pull_requests pr ON r.pull_request_id = pr.id
    ORDER BY r.created_at DESC
    LIMIT 10
  `;

  return reviews.map((row: any) => ({
    id: row.id,
    pr_number: row.pr_number,
    repo_full_name: row.repo_full_name,
    title: row.title,
    status: row.status,
    created_at: new Date(row.created_at),
    completed_at: row.completed_at ? new Date(row.completed_at) : null,
    token_count: row.token_count,
    github_url: row.github_url,
  }));
}

export default async function DashboardPage() {
  const stats = await getDashboardStats();
  const recentReviews = await getRecentReviews();

  const successRate =
    stats.totalReviews > 0
      ? ((stats.completedReviews / stats.totalReviews) * 100).toFixed(1)
      : "0.0";

  const estimatedCost = (stats.avgTokens * 0.03) / 1000; // GPT-4 pricing

  return (
    <div className="min-h-screen bg-[var(--background)]">
      <div className="max-w-7xl mx-auto px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-[var(--foreground)]">Dashboard</h1>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            AI-powered pull request review analytics
          </p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4 mb-8">
          <StatCard
            title="Total Reviews"
            value={stats.totalReviews.toLocaleString()}
            icon="📊"
            trend={`${successRate}% success`}
          />
          <StatCard
            title="Issues Found"
            value={stats.totalCommentsGenerated.toLocaleString()}
            icon="🔍"
            subtitle={`${stats.criticalIssuesFound} critical`}
            critical={stats.criticalIssuesFound > 0}
          />
          <StatCard
            title="Avg Review Time"
            value={`${stats.avgReviewTime}s`}
            icon="⚡"
            subtitle="Fast and efficient"
          />
          <StatCard
            title="Avg Cost"
            value={`$${estimatedCost.toFixed(3)}`}
            icon="💰"
            subtitle={`${stats.avgTokens.toLocaleString()} tokens`}
          />
        </div>

        {/* Performance Metrics */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          <MetricCard title="Success Rate">
            <div className="flex items-center justify-between">
              <div className="text-3xl font-bold text-green-600">
                {successRate}%
              </div>
              <div className="text-sm text-gray-600">
                {stats.completedReviews} / {stats.totalReviews} completed
              </div>
            </div>
            <div className="mt-4 w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-green-600 h-2 rounded-full"
                style={{ width: `${successRate}%` }}
              />
            </div>
          </MetricCard>

          <MetricCard title="Quality Distribution">
            <div className="space-y-2">
              <QualityBar
                label="Completed"
                count={stats.completedReviews}
                color="green"
              />
              <QualityBar
                label="Failed"
                count={stats.failedReviews}
                color="red"
              />
            </div>
          </MetricCard>

          <MetricCard title="Monthly Projection">
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">Expected reviews:</span>
                <span className="font-semibold">
                  ~{Math.round(stats.totalReviews * 1.5)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Estimated cost:</span>
                <span className="font-semibold">
                  ${(estimatedCost * stats.totalReviews * 1.5).toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Issues to catch:</span>
                <span className="font-semibold text-green-600">
                  ~
                  {Math.round(
                    (stats.totalCommentsGenerated / stats.totalReviews) *
                      stats.totalReviews *
                      1.5
                  )}
                </span>
              </div>
            </div>
          </MetricCard>
        </div>

        {/* Recent Reviews */}
        <div className="bg-[var(--card-bg)] shadow-sm rounded-xl border border-[var(--border-color)]">
          <div className="px-6 py-4 border-b border-[var(--border-color)]">
            <h2 className="text-lg font-semibold text-[var(--foreground)]">
              Recent Reviews
            </h2>
          </div>
          <div className="divide-y divide-[var(--border-color)]">
            {recentReviews.length === 0 ? (
              <div className="px-6 py-12 text-center text-gray-500 dark:text-gray-400">
                No reviews yet. Open a PR to see AI reviews in action!
              </div>
            ) : (
              recentReviews.map((review) => (
                <ReviewRow key={review.id} review={review} />
              ))
            )}
          </div>
        </div>

        {/* Quick Actions */}
        <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-6">
          <QuickActionCard
            title="View All Reviews"
            description="Browse complete review history and filter by status"
            icon="📋"
            href="/reviews"
          />
        </div>
      </div>
    </div>
  );
}

// Components

function StatCard({
  title,
  value,
  icon,
  trend,
  subtitle,
  critical = false,
}: {
  title: string;
  value: string;
  icon: string;
  trend?: string;
  subtitle?: string;
  critical?: boolean;
}) {
  return (
    <div className="bg-[var(--card-bg)] overflow-hidden shadow-sm rounded-xl border border-[var(--border-color)] hover:shadow-md transition-shadow">
      <div className="p-6">
        <div className="flex items-center">
          <div className="text-3xl mr-3">{icon}</div>
          <div className="flex-1">
            <dt className="text-sm font-medium text-gray-500 dark:text-gray-400 truncate">
              {title}
            </dt>
            <dd className="mt-1 text-3xl font-semibold text-[var(--foreground)]">
              {value}
            </dd>
          </div>
        </div>
        {(trend || subtitle) && (
          <div className="mt-3">
            <div
              className={`text-sm ${
                critical ? "text-red-600 dark:text-red-400" : "text-gray-600 dark:text-gray-400"
              }`}
            >
              {trend || subtitle}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function MetricCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-[var(--card-bg)] overflow-hidden shadow-sm rounded-xl border border-[var(--border-color)] p-6">
      <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-4">{title}</h3>
      {children}
    </div>
  );
}

function QualityBar({
  label,
  count,
  color,
}: {
  label: string;
  count: number;
  color: "green" | "red";
}) {
  const colorClasses = {
    green: "bg-green-500",
    red: "bg-red-500",
  };

  return (
    <div className="flex items-center gap-2">
      <div className={`w-3 h-3 rounded-full ${colorClasses[color]}`} />
      <span className="text-sm text-gray-600 flex-1">{label}</span>
      <span className="text-sm font-semibold">{count}</span>
    </div>
  );
}

function ReviewRow({ review }: { review: RecentReview }) {
  const statusColors = {
    pending: "bg-yellow-100 text-yellow-800",
    running: "bg-blue-100 text-blue-800",
    completed: "bg-green-100 text-green-800",
    failed: "bg-red-100 text-red-800",
  };

  const timeAgo = getTimeAgo(review.created_at);
  const duration = review.completed_at
    ? Math.round(
        (new Date(review.completed_at).getTime() -
          new Date(review.created_at).getTime()) /
          1000
      )
    : null;

  return (
    <Link
      href={`/reviews/${review.id}`}
      className="block px-6 py-4 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
    >
      <div className="flex items-center justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-[var(--foreground)]">
              {review.repo_full_name}#{review.pr_number}
            </span>
            <span
              className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                statusColors[review.status as keyof typeof statusColors]
              }`}
            >
              {review.status}
            </span>
          </div>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400 truncate">{review.title}</p>
          <div className="mt-2 flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
            <span>🕐 {timeAgo}</span>
            {duration && <span>⚡ {duration}s</span>}
            {review.token_count && (
              <span>💰 {review.token_count.toLocaleString()} tokens</span>
            )}
          </div>
        </div>
        <div className="ml-4">
          <svg
            className="h-5 w-5 text-gray-400 dark:text-gray-500"
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path
              fillRule="evenodd"
              d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z"
              clipRule="evenodd"
            />
          </svg>
        </div>
      </div>
    </Link>
  );
}

function QuickActionCard({
  title,
  description,
  icon,
  href,
}: {
  title: string;
  description: string;
  icon: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="block p-6 bg-[var(--card-bg)] shadow-sm rounded-xl border border-[var(--border-color)] hover:shadow-md transition-all hover:border-blue-300 dark:hover:border-blue-700"
    >
      <div className="flex items-start gap-4">
        <div className="text-4xl">{icon}</div>
        <div>
          <h3 className="text-lg font-semibold text-[var(--foreground)]">{title}</h3>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">{description}</p>
        </div>
      </div>
    </Link>
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
    { label: "second", seconds: 1 },
  ];

  for (const interval of intervals) {
    const count = Math.floor(seconds / interval.seconds);
    if (count >= 1) {
      return `${count} ${interval.label}${count !== 1 ? "s" : ""} ago`;
    }
  }

  return "just now";
}
