// GitHub Webhook Handler
// POST /api/webhooks/github
import { NextRequest, NextResponse } from "next/server";
import { verifyGitHubWebhookSignature } from "@/lib/github";
import { db, sql } from "@/lib/db";
import { enqueueReview } from "@/lib/queue";

// Webhook event types we handle
type PullRequestEvent = {
  action: "opened" | "synchronize" | "reopened" | "closed";
  pull_request: {
    number: number;
    title: string;
    body: string | null;
    merged: boolean;
    user: {
      login: string;
    };
    base: {
      ref: string;
    };
    head: {
      ref: string;
      sha: string;
    };
    html_url: string;
  };
  repository: {
    id: number;
    name: string;
    full_name: string;
    owner: {
      login: string;
    };
    private: boolean;
  };
  installation: {
    id: number;
  };
};

export async function POST(req: NextRequest) {
  try {
    // 1. Get raw body for signature verification
    const body = await req.text();
    const signature = req.headers.get("x-hub-signature-256");
    const event = req.headers.get("x-github-event");

    console.log("Webhook received:", {
      event,
      signature: signature ? "present" : "missing",
      bodyLength: body.length,
    });

    // 2. Verify webhook signature (CRITICAL for security)
    if (!verifyGitHubWebhookSignature(body, signature)) {
      console.error("Invalid webhook signature");
      console.error("Expected secret exists:", !!process.env.GITHUB_WEBHOOK_SECRET);
      console.error("Signature header:", signature);
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    // 3. Parse payload
    const payload = JSON.parse(body) as PullRequestEvent;

    // 4. Only handle pull_request events
    if (event !== "pull_request") {
      return NextResponse.json({ message: "Event ignored" });
    }

    // 5. Only handle specific actions
    const { action, pull_request, repository, installation } = payload;

    // Handle merged PRs (closed + merged)
    if (action === "closed" && pull_request.merged) {
      console.log(
        `PR merged: ${repository.full_name}#${pull_request.number}`
      );

      // Update PR status in database
      await sql`
        UPDATE pull_requests
        SET status = 'merged', updated_at = NOW()
        WHERE repo_full_name = ${repository.full_name}
        AND pull_request_number = ${pull_request.number}
      `;

      // Also update review status to 'completed' for this PR
      await sql`
        UPDATE reviews
        SET status = 'completed', completed_at = NOW()
        WHERE pull_request_id IN (
          SELECT id FROM pull_requests
          WHERE repo_full_name = ${repository.full_name}
          AND pull_request_number = ${pull_request.number}
        )
        AND status = 'pending'
      `;

      return NextResponse.json({
        success: true,
        message: "PR marked as merged",
      });
    }

    // Ignore closed (but not merged) PRs
    if (action === "closed") {
      return NextResponse.json({
        message: "Closed (unmerged) PR ignored",
      });
    }

    if (!["opened", "synchronize", "reopened"].includes(action)) {
      return NextResponse.json({
        message: `Action '${action}' ignored`,
      });
    }

    console.log(
      `Received PR ${action}: ${repository.full_name}#${pull_request.number}`
    );

    // 6. Store repository in database
    const repo = await db.findOrCreateRepository({
      github_id: repository.id,
      owner: repository.owner.login,
      name: repository.name,
      full_name: repository.full_name,
      is_private: repository.private,
      installation_id: installation.id,
    });

    // 7. Store/update pull request
    const pr = await db.upsertPullRequest({
      repository_id: repo.id,
      pull_request_number: pull_request.number,
      repo_full_name: repository.full_name,
      title: pull_request.title,
      description: pull_request.body || undefined,
      author: pull_request.user.login,
      base_branch: pull_request.base.ref,
      head_branch: pull_request.head.ref,
      commit_sha: pull_request.head.sha,
      github_url: pull_request.html_url,
    });

    // 8. Create review record
    const review = await db.createReview(pr.id);

    // 9. Enqueue background job for async processing
    await enqueueReview({
      pullRequestId: pr.id,
      repositoryFullName: repository.full_name,
      prNumber: pull_request.number,
      installationId: installation.id,
    });

    console.log(
      `Enqueued review for PR #${pull_request.number} (review_id: ${review.id})`
    );

    // 10. Return 200 OK immediately (don't block)
    return NextResponse.json({
      success: true,
      review_id: review.id,
      message: "Review queued",
    });
  } catch (error) {
    console.error("Webhook error:", error);

    // Still return 200 to avoid GitHub retries for our bugs
    return NextResponse.json(
      {
        error: "Internal error",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

// Health check endpoint
export async function GET() {
  return NextResponse.json({
    status: "ok",
    endpoint: "/api/webhooks/github",
    accepts: "POST with GitHub webhook signature",
  });
}
