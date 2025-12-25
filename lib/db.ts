// Database connection utility using postgres
import dotenv from "dotenv";
dotenv.config();

import postgres from "postgres";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL environment variable is not set");
}

// Create a connection pool
export const sql = postgres(process.env.DATABASE_URL, {
  max: 10, // Maximum number of connections
  idle_timeout: 20,
  connect_timeout: 10,
});

// Helper functions for common queries
export const db = {
  // Find or create repository
  async findOrCreateRepository(data: {
    github_id: number;
    owner: string;
    name: string;
    full_name: string;
    is_private: boolean;
    installation_id?: number;
  }) {
    const [repo] = await sql`
      INSERT INTO repositories (
        github_id, owner, name, full_name, is_private, installation_id
      ) VALUES (
        ${data.github_id}, ${data.owner}, ${data.name}, 
        ${data.full_name}, ${data.is_private}, ${data.installation_id || null}
      )
      ON CONFLICT (github_id) 
      DO UPDATE SET 
        installation_id = EXCLUDED.installation_id,
        updated_at = NOW()
      RETURNING *
    `;
    return repo;
  },

  // Create or update pull request
  async upsertPullRequest(data: {
    repository_id: string;
    pull_request_number: number;
    repo_full_name: string;
    title: string;
    description?: string;
    author: string;
    base_branch: string;
    head_branch: string;
    commit_sha: string;
    github_url: string;
  }) {
    const [pr] = await sql`
      INSERT INTO pull_requests (
        repository_id, pull_request_number, repo_full_name, title, 
        description, author, base_branch, head_branch, commit_sha, 
        github_url, status
      ) VALUES (
        ${data.repository_id}, ${data.pull_request_number}, 
        ${data.repo_full_name}, ${data.title}, ${data.description || null},
        ${data.author}, ${data.base_branch}, ${data.head_branch},
        ${data.commit_sha}, ${data.github_url}, 'pending'
      )
      ON CONFLICT (repo_full_name, pull_request_number)
      DO UPDATE SET
        commit_sha = EXCLUDED.commit_sha,
        status = 'pending',
        updated_at = NOW()
      RETURNING *
    `;
    return pr;
  },

  // Create review record
  async createReview(pull_request_id: string) {
    const [review] = await sql`
      INSERT INTO reviews (pull_request_id, status)
      VALUES (${pull_request_id}, 'pending')
      RETURNING *
    `;
    return review;
  },

  // Update review status
  async updateReviewStatus(
    review_id: string,
    status: "running" | "completed" | "failed",
    data?: {
      error_message?: string;
      review_payload?: any;
      github_comment_id?: number;
      token_count?: number;
      files_analyzed?: number;
    }
  ) {
    const updates: any = {
      status,
      updated_at: new Date(),
    };

    if (status === "running") {
      updates.started_at = new Date();
    } else if (status === "completed" || status === "failed") {
      updates.completed_at = new Date();
    }

    if (data) {
      Object.assign(updates, data);
    }

    const [review] = await sql`
      UPDATE reviews
      SET ${sql(updates)}
      WHERE id = ${review_id}
      RETURNING *
    `;
    return review;
  },

  // Get pull request with repository
  async getPullRequestWithRepo(pr_id: string) {
    const [result] = await sql`
      SELECT 
        pr.*,
        r.full_name as repo_full_name,
        r.installation_id
      FROM pull_requests pr
      JOIN repositories r ON pr.repository_id = r.id
      WHERE pr.id = ${pr_id}
    `;
    return result;
  },
};

// Graceful shutdown
process.on("SIGTERM", async () => {
  await sql.end();
});
