// Enhanced PR Context Builder - Integrates Phase 3 + Phase 4
import { Octokit } from "@octokit/rest";
import { ChangedFile } from "@/types";
import { buildPRContext, PRContext } from "./pr-context";
import {
  buildRelevanceScores,
  selectContextFiles,
  applyFileTypeWeights,
  explainSelection,
  ScoredFile,
} from "./relevance-ranking";
import { FileStructure } from "./code-parser";

export type EnhancedPRContext = PRContext & {
  relevanceScores: ScoredFile[];
  selectedContextFiles: ScoredFile[];
  selectionExplanation: string;
  tokenEstimate: number;
  contextStats: {
    totalAnalyzed: number;
    contextFilesSelected: number;
    byDistance: Record<number, number>;
    criticalFilesIncluded: number;
  };
};

/**
 * Build enhanced PR context with intelligent file selection
 * This is the main entry point for Phase 4
 */
export async function buildEnhancedPRContext(
  octokit: Octokit,
  owner: string,
  repo: string,
  prNumber: number,
  headSha: string,
  options: {
    maxContextFiles?: number;
    maxTokens?: number;
    maxDistance?: number;
  } = {}
): Promise<EnhancedPRContext> {
  const { maxContextFiles = 15, maxTokens = 8000, maxDistance = 3 } = options;

  console.log("=== Building Enhanced PR Context ===");
  console.log(`PR: ${owner}/${repo}#${prNumber}`);
  console.log(
    `Options: maxFiles=${maxContextFiles}, maxTokens=${maxTokens}, maxDistance=${maxDistance}\n`
  );

  // Step 1: Build base PR context (Phase 3)
  const baseContext = await buildPRContext(
    octokit,
    owner,
    repo,
    prNumber,
    headSha
  );

  console.log(`Base analysis complete:`);
  console.log(`  - Changed files: ${baseContext.changedFiles.length}`);
  console.log(`  - Analyzed structures: ${baseContext.fileStructures.size}`);
  console.log(`  - Critical files: ${baseContext.stats.criticalFiles}\n`);

  // Step 2: Build relevance scores (Phase 4)
  console.log("Building relevance scores...");
  let relevanceScores = buildRelevanceScores(
    baseContext.changedFiles,
    baseContext.fileStructures,
    maxDistance
  );

  console.log(`  - Found ${relevanceScores.length} related files`);

  // Step 3: Apply file type weights
  relevanceScores = applyFileTypeWeights(
    relevanceScores,
    baseContext.fileStructures
  );

  // Step 4: Select top files for context
  console.log("Selecting context files...");
  const { selectedFiles, estimatedTokens, stats } = selectContextFiles(
    relevanceScores,
    maxContextFiles,
    maxTokens
  );

  console.log(`  - Selected ${selectedFiles.length} files`);
  console.log(`  - Estimated tokens: ${estimatedTokens}`);
  console.log(`  - By distance:`, stats.byDistance);
  console.log(`  - Critical files: ${stats.criticalFilesIncluded}\n`);

  // Step 5: Generate explanation
  const explanation = explainSelection(selectedFiles);

  return {
    ...baseContext,
    relevanceScores,
    selectedContextFiles: selectedFiles,
    selectionExplanation: explanation,
    tokenEstimate: estimatedTokens,
    contextStats: {
      totalAnalyzed: stats.totalCandidates,
      contextFilesSelected: stats.selected,
      byDistance: stats.byDistance,
      criticalFilesIncluded: stats.criticalFilesIncluded,
    },
  };
}

/**
 * Get file content for selected context files
 * Returns Map of path -> content for files to include in AI review
 */
export function getContextFileContents(
  context: EnhancedPRContext
): Map<string, string> {
  const contents = new Map<string, string>();

  for (const scored of context.selectedContextFiles) {
    const content = context.fileContents.get(scored.path);
    if (content) {
      contents.set(scored.path, content);
    }
  }

  return contents;
}

/**
 * Generate summary for AI review prompt
 * This will be used in Phase 5 to give AI context about the PR
 */
export function generateContextSummary(context: EnhancedPRContext): string {
  const summary = [
    "# Pull Request Context",
    "",
    "## Changed Files",
    `Total: ${context.changedFiles.length} files changed`,
    `Additions: +${context.stats.totalAdditions}`,
    `Deletions: -${context.stats.totalDeletions}`,
    "",
    "## Files to Review",
  ];

  // List changed files
  for (const file of context.changedFiles) {
    const scored = context.selectedContextFiles.find(
      (s) => s.path === file.path
    );
    const criticalMarker = scored?.isCritical ? " [CRITICAL]" : "";
    summary.push(
      `- ${file.path} (+${file.additions}/-${file.deletions})${criticalMarker}`
    );
  }

  summary.push("");
  summary.push("## Context Files (for reference)");

  // List context-only files (not changed but relevant)
  const contextOnly = context.selectedContextFiles.filter(
    (s) => !context.changedFiles.find((c) => c.path === s.path)
  );

  if (contextOnly.length > 0) {
    for (const file of contextOnly) {
      summary.push(
        `- ${file.path} (distance: ${
          file.distance
        }, score: ${file.score.toFixed(2)})`
      );
      summary.push(`  Reason: ${file.reason}`);
    }
  } else {
    summary.push("(none - reviewing only changed files)");
  }

  summary.push("");
  summary.push("## Analysis Stats");
  summary.push(`- Total files analyzed: ${context.contextStats.totalAnalyzed}`);
  summary.push(
    `- Context files selected: ${context.contextStats.contextFilesSelected}`
  );
  summary.push(
    `- Critical files: ${context.contextStats.criticalFilesIncluded}`
  );
  summary.push(`- Estimated tokens: ${context.tokenEstimate}`);

  return summary.join("\n");
}

/**
 * Prepare focused review data for AI
 * Returns only the information needed for review, trimmed to essentials
 */
export type ReviewData = {
  changedFiles: Array<{
    path: string;
    content: string;
    patch: string;
    additions: number;
    deletions: number;
    isCritical: boolean;
    imports: string[];
    exports: string[];
  }>;
  contextFiles: Array<{
    path: string;
    content: string;
    relevanceScore: number;
    reason: string;
  }>;
  summary: string;
};

export function prepareReviewData(context: EnhancedPRContext): ReviewData {
  const changedFiles = context.changedFiles.map((file) => {
    const structure = context.fileStructures.get(file.path);
    const scored = context.selectedContextFiles.find(
      (s) => s.path === file.path
    );
    const content = context.fileContents.get(file.path) || "";

    return {
      path: file.path,
      content,
      patch: file.patch,
      additions: file.additions,
      deletions: file.deletions,
      isCritical: scored?.isCritical || false,
      imports: structure?.imports.map((i) => i.source) || [],
      exports: structure?.exports.map((e) => e.name) || [],
    };
  });

  // Get context-only files (not changed but relevant)
  const contextFiles = context.selectedContextFiles
    .filter((s) => !context.changedFiles.find((c) => c.path === s.path))
    .map((scored) => ({
      path: scored.path,
      content: context.fileContents.get(scored.path) || "",
      relevanceScore: scored.score,
      reason: scored.reason,
    }));

  return {
    changedFiles,
    contextFiles,
    summary: generateContextSummary(context),
  };
}

/**
 * Calculate impact score for the PR
 * Used to prioritize which PRs need more careful review
 */
export function calculatePRImpactScore(context: EnhancedPRContext): {
  score: number;
  level: "low" | "medium" | "high" | "critical";
  factors: string[];
} {
  let score = 0;
  const factors: string[] = [];

  // Factor 1: Number of critical files
  const criticalCount = context.stats.criticalFiles;
  if (criticalCount > 0) {
    score += criticalCount * 10;
    factors.push(`${criticalCount} critical files`);
  }

  // Factor 2: Total lines changed
  const totalChanges =
    context.stats.totalAdditions + context.stats.totalDeletions;
  if (totalChanges > 500) {
    score += 15;
    factors.push("Large changeset");
  } else if (totalChanges > 200) {
    score += 10;
  }

  // Factor 3: Number of files touched
  if (context.changedFiles.length > 10) {
    score += 10;
    factors.push("Many files modified");
  }

  // Factor 4: Dependency breadth (how many other files are affected)
  const contextFilesCount =
    context.selectedContextFiles.length - context.changedFiles.length;
  if (contextFilesCount > 10) {
    score += 15;
    factors.push("Wide-reaching changes");
  } else if (contextFilesCount > 5) {
    score += 10;
  }

  // Determine level
  let level: "low" | "medium" | "high" | "critical";
  if (score >= 40) level = "critical";
  else if (score >= 25) level = "high";
  else if (score >= 15) level = "medium";
  else level = "low";

  return { score, level, factors };
}
