/**
 * Example: How to use Enhanced PR Context with Relevance Ranking
 *
 * This demonstrates Phase 4 functionality:
 * - Building relevance scores via BFS
 * - Selecting optimal context files
 * - Balancing token budget
 */

import { getOctokitForInstallation } from "@/lib/github";
import {
  buildEnhancedPRContext,
  calculatePRImpactScore,
  prepareReviewData,
} from "@/lib/enhanced-pr-context";
import { explainSelection } from "@/lib/relevance-ranking";

/**
 * Example 1: Analyze PR with default settings
 */
export async function analyzeWithDefaults(
  installationId: number,
  owner: string,
  repo: string,
  prNumber: number,
  headSha: string
) {
  console.log("=== Example 1: Default Analysis ===\n");

  const octokit = await getOctokitForInstallation(installationId);

  const context = await buildEnhancedPRContext(
    octokit,
    owner,
    repo,
    prNumber,
    headSha
  );

  // Show selection explanation
  console.log("\n" + context.selectionExplanation);

  // Calculate impact
  const impact = calculatePRImpactScore(context);
  console.log("\nPR Impact Assessment:");
  console.log(`  Level: ${impact.level.toUpperCase()}`);
  console.log(`  Score: ${impact.score}`);
  console.log(`  Factors: ${impact.factors.join(", ")}`);

  return context;
}

/**
 * Example 2: Conservative token budget (small context)
 */
export async function analyzeConservative(
  installationId: number,
  owner: string,
  repo: string,
  prNumber: number,
  headSha: string
) {
  console.log("=== Example 2: Conservative Budget ===\n");

  const octokit = await getOctokitForInstallation(installationId);

  const context = await buildEnhancedPRContext(
    octokit,
    owner,
    repo,
    prNumber,
    headSha,
    {
      maxContextFiles: 8, // Fewer files
      maxTokens: 4000, // Smaller token budget
      maxDistance: 2, // Closer dependencies only
    }
  );

  console.log("Selected files:", context.selectedContextFiles.length);
  console.log("Token estimate:", context.tokenEstimate);

  return context;
}

/**
 * Example 3: Aggressive context (deep analysis)
 */
export async function analyzeAggressive(
  installationId: number,
  owner: string,
  repo: string,
  prNumber: number,
  headSha: string
) {
  console.log("=== Example 3: Aggressive Analysis ===\n");

  const octokit = await getOctokitForInstallation(installationId);

  const context = await buildEnhancedPRContext(
    octokit,
    owner,
    repo,
    prNumber,
    headSha,
    {
      maxContextFiles: 25, // More files
      maxTokens: 12000, // Larger budget
      maxDistance: 4, // Deeper traversal
    }
  );

  console.log("Selected files:", context.selectedContextFiles.length);
  console.log("Token estimate:", context.tokenEstimate);

  // Show distance breakdown
  console.log("\nFiles by distance:");
  for (const [distance, count] of Object.entries(
    context.contextStats.byDistance
  )) {
    console.log(`  Distance ${distance}: ${count} files`);
  }

  return context;
}

/**
 * Example 4: Prepare data for AI review
 */
export async function prepareForAIReview(
  installationId: number,
  owner: string,
  repo: string,
  prNumber: number,
  headSha: string
) {
  console.log("=== Example 4: Prepare for AI Review ===\n");

  const octokit = await getOctokitForInstallation(installationId);

  const context = await buildEnhancedPRContext(
    octokit,
    owner,
    repo,
    prNumber,
    headSha
  );

  const reviewData = prepareReviewData(context);

  console.log("Review Data Prepared:");
  console.log(`  Changed files: ${reviewData.changedFiles.length}`);
  console.log(`  Context files: ${reviewData.contextFiles.length}`);
  console.log(`\nChanged files breakdown:`);

  for (const file of reviewData.changedFiles) {
    console.log(`\n  📄 ${file.path}`);
    console.log(`     Changes: +${file.additions}/-${file.deletions}`);
    console.log(`     Critical: ${file.isCritical ? "YES ⚠️" : "No"}`);
    console.log(`     Imports: ${file.imports.length}`);
    console.log(`     Exports: ${file.exports.length}`);
  }

  if (reviewData.contextFiles.length > 0) {
    console.log(`\n  Context files (for reference):`);
    for (const file of reviewData.contextFiles) {
      console.log(
        `    • ${file.path} (score: ${file.relevanceScore.toFixed(2)})`
      );
      console.log(`      Reason: ${file.reason}`);
    }
  }

  return reviewData;
}

/**
 * Example 5: Compare different selection strategies
 */
export async function compareStrategies(
  installationId: number,
  owner: string,
  repo: string,
  prNumber: number,
  headSha: string
) {
  console.log("=== Example 5: Strategy Comparison ===\n");

  const octokit = await getOctokitForInstallation(installationId);

  // Strategy 1: Minimal
  const minimal = await buildEnhancedPRContext(
    octokit,
    owner,
    repo,
    prNumber,
    headSha,
    { maxContextFiles: 5, maxTokens: 2000, maxDistance: 1 }
  );

  // Strategy 2: Balanced
  const balanced = await buildEnhancedPRContext(
    octokit,
    owner,
    repo,
    prNumber,
    headSha,
    { maxContextFiles: 15, maxTokens: 8000, maxDistance: 3 }
  );

  // Strategy 3: Comprehensive
  const comprehensive = await buildEnhancedPRContext(
    octokit,
    owner,
    repo,
    prNumber,
    headSha,
    { maxContextFiles: 30, maxTokens: 15000, maxDistance: 4 }
  );

  console.log("Strategy Comparison:");
  console.log("\nMinimal:");
  console.log(`  Files: ${minimal.selectedContextFiles.length}`);
  console.log(`  Tokens: ${minimal.tokenEstimate}`);
  console.log(`  Critical: ${minimal.contextStats.criticalFilesIncluded}`);

  console.log("\nBalanced:");
  console.log(`  Files: ${balanced.selectedContextFiles.length}`);
  console.log(`  Tokens: ${balanced.tokenEstimate}`);
  console.log(`  Critical: ${balanced.contextStats.criticalFilesIncluded}`);

  console.log("\nComprehensive:");
  console.log(`  Files: ${comprehensive.selectedContextFiles.length}`);
  console.log(`  Tokens: ${comprehensive.tokenEstimate}`);
  console.log(
    `  Critical: ${comprehensive.contextStats.criticalFilesIncluded}`
  );

  // Cost comparison (assume GPT-4 pricing: $0.03/1k input tokens)
  const costPerToken = 0.03 / 1000;
  console.log("\nEstimated Cost per Review:");
  console.log(
    `  Minimal: $${(minimal.tokenEstimate * costPerToken).toFixed(4)}`
  );
  console.log(
    `  Balanced: $${(balanced.tokenEstimate * costPerToken).toFixed(4)}`
  );
  console.log(
    `  Comprehensive: $${(comprehensive.tokenEstimate * costPerToken).toFixed(
      4
    )}`
  );

  return { minimal, balanced, comprehensive };
}

/**
 * Example 6: Analyze dependency chains
 */
export async function analyzeDependencyChains(
  installationId: number,
  owner: string,
  repo: string,
  prNumber: number,
  headSha: string
) {
  console.log("=== Example 6: Dependency Chain Analysis ===\n");

  const octokit = await getOctokitForInstallation(installationId);

  const context = await buildEnhancedPRContext(
    octokit,
    owner,
    repo,
    prNumber,
    headSha
  );

  // Group files by distance to show dependency levels
  const byDistance = new Map<number, typeof context.selectedContextFiles>();

  for (const file of context.selectedContextFiles) {
    if (!byDistance.has(file.distance)) {
      byDistance.set(file.distance, []);
    }
    byDistance.get(file.distance)!.push(file);
  }

  console.log("Dependency Chain:");

  for (const [distance, files] of Array.from(byDistance.entries()).sort(
    (a, b) => a[0] - b[0]
  )) {
    const label =
      distance === 0
        ? "Level 0 - Changed Files"
        : `Level ${distance} - ${
            distance === 1 ? "Direct" : "Indirect"
          } Dependencies`;

    console.log(`\n${label} (${files.length} files):`);

    for (const file of files) {
      const indent = "  " + "  ".repeat(distance);
      console.log(`${indent}${file.path.split("/").pop()}`);
      console.log(
        `${indent}  └─ Score: ${file.score.toFixed(2)} | ${file.reason}`
      );
    }
  }

  return context;
}

// Example runner (commented to avoid execution)
/*
async function main() {
  const installationId = 12345;
  const owner = 'your-org';
  const repo = 'your-repo';
  const prNumber = 42;
  const headSha = 'abc123';

  // Run different examples
  await analyzeWithDefaults(installationId, owner, repo, prNumber, headSha);
  await compareStrategies(installationId, owner, repo, prNumber, headSha);
  await analyzeDependencyChains(installationId, owner, repo, prNumber, headSha);
}
*/
