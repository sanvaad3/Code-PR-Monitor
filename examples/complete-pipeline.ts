/**
 * Complete Review Pipeline Example
 * Demonstrates Phases 5, 6, 7 in action
 */

import { getOctokitForInstallation } from "@/lib/github";
import {
  buildEnhancedPRContext,
  prepareReviewData,
} from "@/lib/enhanced-pr-context";
import {
  reviewArchitecture,
  reviewSecurity,
  reviewMaintainability,
} from "@/lib/ai-reviewer";
import {
  validateAndFilterComments,
  generateValidationReport,
} from "@/lib/validator";
import { formatAndPostReview, previewReview } from "@/lib/review-publisher";

/**
 * Example 1: Run complete review pipeline manually
 */
export async function runCompleteReview(
  installationId: number,
  owner: string,
  repo: string,
  prNumber: number,
  headSha: string
) {
  console.log("=== Complete Review Pipeline Example ===\n");

  // Step 1: Build context
  console.log("1. Building PR context...");
  const octokit = await getOctokitForInstallation(installationId);
  const context = await buildEnhancedPRContext(
    octokit,
    owner,
    repo,
    prNumber,
    headSha
  );
  console.log(`   ✓ Selected ${context.selectedContextFiles.length} files`);

  // Step 2: Prepare review data
  console.log("\n2. Preparing review data...");
  const reviewData = prepareReviewData(context);
  console.log(`   ✓ ${reviewData.changedFiles.length} changed files`);
  console.log(`   ✓ ${reviewData.contextFiles.length} context files`);

  // Step 3: Run AI reviews
  console.log("\n3. Running AI reviews...");
  const startTime = Date.now();

  const [architecture, security, maintainability] = await Promise.all([
    reviewArchitecture(reviewData),
    reviewSecurity(reviewData),
    reviewMaintainability(reviewData),
  ]);

  const reviewTime = Date.now() - startTime;
  console.log(`   ✓ Completed in ${reviewTime}ms`);
  console.log(`   Architecture: ${architecture.comments.length} comments`);
  console.log(`   Security: ${security.comments.length} comments`);
  console.log(
    `   Maintainability: ${maintainability.comments.length} comments`
  );

  // Step 4: Validate comments
  console.log("\n4. Validating comments...");
  const allComments = [
    ...architecture.comments,
    ...security.comments,
    ...maintainability.comments,
  ];

  const validation = validateAndFilterComments(allComments, reviewData);
  console.log(generateValidationReport(validation));

  // Step 5: Format and preview
  console.log("\n5. Formatting review...");
  const review = {
    architecture: {
      comments: validation.validatedComments.filter((c) =>
        architecture.comments.some((ac) => ac.file_path === c.file_path)
      ),
      overallAssessment: architecture.overallAssessment,
    },
    security: {
      comments: validation.validatedComments.filter((c) =>
        security.comments.some((sc) => sc.file_path === c.file_path)
      ),
      overallAssessment: security.overallAssessment,
    },
    maintainability: {
      comments: validation.validatedComments.filter((c) =>
        maintainability.comments.some((mc) => mc.file_path === c.file_path)
      ),
      overallAssessment: maintainability.overallAssessment,
    },
  };

  const metadata = {
    filesAnalyzed: context.selectedContextFiles.length,
    tokensUsed:
      architecture.tokensUsed +
      security.tokensUsed +
      maintainability.tokensUsed,
    reviewTime,
  };

  previewReview(review, metadata);

  // Step 6: Post to GitHub
  console.log("\n6. Posting to GitHub...");
  const commentId = await formatAndPostReview(
    octokit,
    owner,
    repo,
    prNumber,
    review,
    metadata
  );
  console.log(`   ✓ Posted comment: ${commentId}`);

  return {
    commentId,
    stats: {
      filesAnalyzed: context.selectedContextFiles.length,
      commentsGenerated: allComments.length,
      commentsValid: validation.validatedComments.length,
      tokensUsed: metadata.tokensUsed,
      reviewTime,
    },
  };
}

/**
 * Example 2: Test AI review on sample code
 */
export async function testAIReview() {
  console.log("=== AI Review Test ===\n");

  // Mock review data
  const mockReviewData = {
    changedFiles: [
      {
        path: "src/auth/login.ts",
        content: `
export async function login(username: string, password: string) {
  const user = await db.query('SELECT * FROM users WHERE username = ' + username);
  if (user.password === password) {
    return { token: generateToken(user) };
  }
  return null;
}
        `,
        patch: "",
        additions: 7,
        deletions: 0,
        isCritical: true,
        imports: ["db", "generateToken"],
        exports: ["login"],
      },
    ],
    contextFiles: [],
    summary: "Testing AI review",
  };

  console.log("Running security review on vulnerable code...\n");
  const security = await reviewSecurity(mockReviewData);

  console.log("Security Review Results:");
  console.log(`  Comments: ${security.comments.length}`);
  console.log(`  Tokens: ${security.tokensUsed}`);
  console.log("\nComments:");
  security.comments.forEach((comment) => {
    console.log(`  - ${comment.file_path}:${comment.line_start}`);
    console.log(`    Severity: ${comment.severity}`);
    console.log(`    Message: ${comment.message}\n`);
  });

  // Should detect:
  // 1. SQL injection vulnerability
  // 2. Plain text password comparison
  // 3. Missing error handling

  return security;
}

/**
 * Example 3: Benchmark review performance
 */
export async function benchmarkReview(
  installationId: number,
  owner: string,
  repo: string,
  prNumbers: number[]
) {
  console.log("=== Review Performance Benchmark ===\n");

  const results = [];

  for (const prNumber of prNumbers) {
    console.log(`\nBenchmarking PR #${prNumber}...`);

    const startTime = Date.now();

    try {
      const octokit = await getOctokitForInstallation(installationId);

      // Get PR details
      const { data: pr } = await octokit.pulls.get({
        owner,
        repo,
        pull_number: prNumber,
      });

      const result = await runCompleteReview(
        installationId,
        owner,
        repo,
        prNumber,
        pr.head.sha
      );

      const totalTime = Date.now() - startTime;

      results.push({
        prNumber,
        success: true,
        totalTime,
        ...result.stats,
      });

      console.log(`✓ Completed in ${totalTime}ms`);
    } catch (error) {
      console.error(`✗ Failed: ${error}`);
      results.push({
        prNumber,
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  // Summary
  console.log("\n" + "=".repeat(60));
  console.log("BENCHMARK RESULTS");
  console.log("=".repeat(60));

  const successful = results.filter((r) => r.success);
  console.log(`\nSuccessful: ${successful.length}/${results.length}`);

  if (successful.length > 0) {
    const avgTime =
      successful.reduce((sum, r: any) => sum + (r.totalTime || 0), 0) /
      successful.length;
    const avgTokens =
      successful.reduce((sum, r: any) => sum + (r.tokensUsed || 0), 0) /
      successful.length;
    const avgComments =
      successful.reduce((sum, r: any) => sum + (r.commentsValid || 0), 0) /
      successful.length;

    console.log(`\nAverage Metrics:`);
    console.log(`  Time: ${avgTime.toFixed(0)}ms`);
    console.log(`  Tokens: ${avgTokens.toFixed(0)}`);
    console.log(`  Comments: ${avgComments.toFixed(1)}`);
    console.log(
      `  Cost per review: $${((avgTokens * 0.03) / 1000).toFixed(4)}`
    );
  }

  return results;
}

/**
 * Example 4: Compare review strategies
 */
export async function compareReviewStrategies(
  installationId: number,
  owner: string,
  repo: string,
  prNumber: number,
  headSha: string
) {
  console.log("=== Review Strategy Comparison ===\n");

  const octokit = await getOctokitForInstallation(installationId);

  // Strategy 1: Conservative (fast, cheap)
  console.log("1. Conservative Strategy...");
  const conservative = await buildEnhancedPRContext(
    octokit,
    owner,
    repo,
    prNumber,
    headSha,
    { maxContextFiles: 8, maxTokens: 4000, maxDistance: 2 }
  );

  // Strategy 2: Balanced (recommended)
  console.log("2. Balanced Strategy...");
  const balanced = await buildEnhancedPRContext(
    octokit,
    owner,
    repo,
    prNumber,
    headSha,
    { maxContextFiles: 15, maxTokens: 8000, maxDistance: 3 }
  );

  // Strategy 3: Aggressive (thorough, expensive)
  console.log("3. Aggressive Strategy...");
  const aggressive = await buildEnhancedPRContext(
    octokit,
    owner,
    repo,
    prNumber,
    headSha,
    { maxContextFiles: 25, maxTokens: 12000, maxDistance: 4 }
  );

  console.log("\nComparison:");
  console.log("\n| Metric | Conservative | Balanced | Aggressive |");
  console.log("|--------|--------------|----------|------------|");
  console.log(
    `| Files Selected | ${conservative.selectedContextFiles.length} | ${balanced.selectedContextFiles.length} | ${aggressive.selectedContextFiles.length} |`
  );
  console.log(
    `| Token Estimate | ${conservative.tokenEstimate} | ${balanced.tokenEstimate} | ${aggressive.tokenEstimate} |`
  );
  console.log(
    `| Critical Files | ${conservative.contextStats.criticalFilesIncluded} | ${balanced.contextStats.criticalFilesIncluded} | ${aggressive.contextStats.criticalFilesIncluded} |`
  );

  // Estimate costs (GPT-4 pricing: $0.03/1k input tokens)
  const costConservative = (conservative.tokenEstimate * 0.03) / 1000;
  const costBalanced = (balanced.tokenEstimate * 0.03) / 1000;
  const costAggressive = (aggressive.tokenEstimate * 0.03) / 1000;

  console.log(
    `| Est. Cost | $${costConservative.toFixed(4)} | $${costBalanced.toFixed(
      4
    )} | $${costAggressive.toFixed(4)} |`
  );

  return { conservative, balanced, aggressive };
}

// Example usage (commented to avoid execution)
/*
async function main() {
  const installationId = 12345;
  const owner = 'your-org';
  const repo = 'your-repo';
  const prNumber = 42;
  const headSha = 'abc123';

  // Run complete review
  await runCompleteReview(installationId, owner, repo, prNumber, headSha);

  // Test on sample code
  await testAIReview();

  // Benchmark multiple PRs
  await benchmarkReview(installationId, owner, repo, [1, 2, 3, 4, 5]);

  // Compare strategies
  await compareReviewStrategies(installationId, owner, repo, prNumber, headSha);
}
*/
