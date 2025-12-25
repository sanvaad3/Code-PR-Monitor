// Review Worker - Phase 6, Step 10: Background Job System
// Orchestrates the complete review pipeline

// Load environment variables
import dotenv from "dotenv";
dotenv.config();

import { Job } from "bullmq";
import { ReviewJobData, createReviewWorker } from "../../lib/queue";
import { db, sql } from "../../lib/db";
import { getOctokitForInstallation } from "../../lib/github";
import {
  buildEnhancedPRContext,
  prepareReviewData,
} from "../../lib/enhanced-pr-context";
import {
  reviewArchitecture,
  reviewSecurity,
  reviewMaintainability,
  CategoryReviewResult,
} from "../../lib/ai-reviewer";
import {
  validateAndFilterComments,
  generateValidationReport,
  isAcceptableQuality,
} from "../../lib/validator";
import { formatAndPostReview } from "../../lib/review-publisher";
import { CategoryComment } from "../../types";

/**
 * Main review processor
 * This is what runs in the background worker
 */
export async function processReviewJob(job: Job<ReviewJobData>): Promise<void> {
  const { pullRequestId, repositoryFullName, prNumber, installationId } =
    job.data;

  console.log(`\n${"=".repeat(60)}`);
  console.log(`Processing review for PR #${prNumber}`);
  console.log(`Repository: ${repositoryFullName}`);
  console.log(`Job ID: ${job.id}`);
  console.log("=".repeat(60));

  try {
    // Step 1: Update review status to 'running'
    const [pr] = await sql`
      SELECT * FROM pull_requests WHERE id = ${pullRequestId}
    `;

    const [review] = await sql`
      SELECT * FROM reviews WHERE pull_request_id = ${pullRequestId}
      ORDER BY created_at DESC LIMIT 1
    `;

    if (!review) {
      throw new Error("Review record not found");
    }

    await db.updateReviewStatus(review.id, "running");
    console.log(`✓ Review status: running`);

    // Step 2: Get GitHub client
    const octokit = await getOctokitForInstallation(installationId);
    const [owner, repo] = repositoryFullName.split("/");
    console.log(`✓ GitHub client authenticated`);

    // Step 3: Build enhanced PR context
    console.log(`\nBuilding PR context...`);
    const context = await buildEnhancedPRContext(
      octokit,
      owner,
      repo,
      prNumber,
      pr.commit_sha
    );
    console.log(
      `✓ Context built: ${context.selectedContextFiles.length} files selected`
    );
    console.log(`  Estimated tokens: ${context.tokenEstimate}`);

    // Step 4: Prepare review data
    const reviewData = prepareReviewData(context);
    console.log(`✓ Review data prepared`);
    console.log(`  Changed files: ${reviewData.changedFiles.length}`);
    console.log(`  Context files: ${reviewData.contextFiles.length}`);

    // Step 5: Run AI reviews in parallel
    console.log(`\nRunning AI reviews...`);
    const startTime = Date.now();

    const [architectureResult, securityResult, maintainabilityResult] =
      await Promise.all([
        reviewArchitecture(reviewData),
        reviewSecurity(reviewData),
        reviewMaintainability(reviewData),
      ]);

    const reviewTime = Date.now() - startTime;
    const totalTokens =
      architectureResult.tokensUsed +
      securityResult.tokensUsed +
      maintainabilityResult.tokensUsed;

    console.log(`✓ AI reviews completed in ${reviewTime}ms`);
    console.log(
      `  Architecture: ${architectureResult.comments.length} comments`
    );
    console.log(`  Security: ${securityResult.comments.length} comments`);
    console.log(
      `  Maintainability: ${maintainabilityResult.comments.length} comments`
    );
    console.log(`  Total tokens: ${totalTokens}`);

    // Step 6: Validate and filter comments
    console.log(`\nValidating comments...`);
    const allComments = [
      ...architectureResult.comments,
      ...securityResult.comments,
      ...maintainabilityResult.comments,
    ];

    const validation = validateAndFilterComments(allComments, reviewData);
    console.log(generateValidationReport(validation));

    // Check if validation passed
    if (!isAcceptableQuality(validation.stats)) {
      throw new Error(
        `Review quality too low: ${validation.stats.final}/${validation.stats.total} valid comments`
      );
    }

    // Step 7: Store validated comments in database
    console.log(`\nStoring review results...`);
    for (const comment of validation.validatedComments) {
      await sql`
        INSERT INTO review_comments (
          review_id, category, severity, file_path,
          line_start, line_end, comment_text, is_valid
        ) VALUES (
          ${review.id},
          ${
            comment.file_path.includes("security")
              ? "security"
              : comment.file_path.includes("test")
              ? "maintainability"
              : "architecture"
          },
          ${comment.severity},
          ${comment.file_path},
          ${comment.line_start},
          ${comment.line_end},
          ${comment.message},
          true
        )
      `;
    }
    console.log(`✓ Stored ${validation.validatedComments.length} comments`);

    // Step 8: Group comments by category for final output
    const commentsByCategory = {
      architecture: validation.validatedComments.filter((c) =>
        architectureResult.comments.some(
          (ac) => ac.file_path === c.file_path && ac.line_start === c.line_start
        )
      ),
      security: validation.validatedComments.filter((c) =>
        securityResult.comments.some(
          (sc) => sc.file_path === c.file_path && sc.line_start === c.line_start
        )
      ),
      maintainability: validation.validatedComments.filter((c) =>
        maintainabilityResult.comments.some(
          (mc) => mc.file_path === c.file_path && mc.line_start === c.line_start
        )
      ),
    };

    // Step 9: Format and post review to GitHub
    console.log(`\nPosting review to GitHub...`);
    const commentId = await formatAndPostReview(
      octokit,
      owner,
      repo,
      prNumber,
      {
        architecture: {
          comments: commentsByCategory.architecture,
          overallAssessment: architectureResult.overallAssessment,
        },
        security: {
          comments: commentsByCategory.security,
          overallAssessment: securityResult.overallAssessment,
        },
        maintainability: {
          comments: commentsByCategory.maintainability,
          overallAssessment: maintainabilityResult.overallAssessment,
        },
      },
      {
        filesAnalyzed: context.selectedContextFiles.length,
        tokensUsed: totalTokens,
        reviewTime,
      }
    );

    console.log(`✓ Review posted: comment ID ${commentId}`);

    // Step 10: Update review status to 'completed'
    const reviewPayload = {
      architecture: {
        comments: commentsByCategory.architecture,
        overall_assessment: architectureResult.overallAssessment,
      },
      security: {
        comments: commentsByCategory.security,
        overall_assessment: securityResult.overallAssessment,
      },
      maintainability: {
        comments: commentsByCategory.maintainability,
        overall_assessment: maintainabilityResult.overallAssessment,
      },
      summary: `Analyzed ${context.selectedContextFiles.length} files, found ${validation.validatedComments.length} issues`,
      files_analyzed: reviewData.changedFiles.map((f) => f.path),
      context_files: reviewData.contextFiles.map((f) => f.path),
      token_usage: totalTokens,
    };

    await db.updateReviewStatus(review.id, "completed", {
      review_payload: reviewPayload,
      github_comment_id: commentId,
      token_count: totalTokens,
      files_analyzed: context.selectedContextFiles.length,
    });

    console.log(`\n✅ Review completed successfully!`);
    console.log(`${"=".repeat(60)}\n`);
  } catch (error) {
    console.error(`\n❌ Review failed:`, error);

    // Update review status to 'failed'
    const [review] = await sql`
      SELECT * FROM reviews WHERE pull_request_id = ${pullRequestId}
      ORDER BY created_at DESC LIMIT 1
    `;

    if (review) {
      await db.updateReviewStatus(review.id, "failed", {
        error_message: error instanceof Error ? error.message : "Unknown error",
      });
    }

    throw error; // Re-throw for BullMQ retry logic
  }
}

/**
 * Start the review worker
 * Call this in a separate process or in your main server
 */
export function startReviewWorker() {
  console.log("🚀 Starting review worker...");

  const worker = createReviewWorker(processReviewJob);

  console.log("✓ Worker started and listening for jobs");
  console.log("  Concurrency: 5");
  console.log("  Rate limit: 10 jobs/minute\n");

  return worker;
}

/**
 * Graceful shutdown handler
 */
export async function shutdownWorker(
  worker: ReturnType<typeof createReviewWorker>
) {
  console.log("\n🛑 Shutting down worker...");
  await worker.close();
  console.log("✓ Worker shut down gracefully");
}

// If running this file directly, start the worker
if (require.main === module) {
  const worker = startReviewWorker();

  // Handle graceful shutdown
  process.on("SIGTERM", () => shutdownWorker(worker));
  process.on("SIGINT", () => shutdownWorker(worker));
}
