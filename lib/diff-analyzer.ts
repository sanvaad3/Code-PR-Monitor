// PR Diff Analysis - Step 5
import { Octokit } from "@octokit/rest";
import { ChangedFile } from "@/types";

/**
 * Patterns for files to ignore during review
 * These are typically generated or don't need human review
 */
const IGNORED_FILE_PATTERNS = [
  // Lock files
  /package-lock\.json$/,
  /yarn\.lock$/,
  /pnpm-lock\.yaml$/,
  /composer\.lock$/,
  /Gemfile\.lock$/,
  /poetry\.lock$/,

  // Build outputs
  /^dist\//,
  /^build\//,
  /^out\//,
  /^\.next\//,
  /^coverage\//,

  // Minified files
  /\.min\.(js|css)$/,
  /\.bundle\.js$/,

  // Source maps
  /\.map$/,

  // Generated files
  /^\.DS_Store$/,
  /^Thumbs\.db$/,
  /node_modules\//,

  // Binary files (shouldn't appear in diff, but just in case)
  /\.(png|jpg|jpeg|gif|ico|pdf|zip|tar|gz)$/,

  // Auto-generated code markers
  /\.generated\.(ts|js|tsx|jsx)$/,
  /\.g\.(ts|js)$/,
];

/**
 * Files that should be analyzed for context but not reviewed
 * (configuration files, etc.)
 */
const CONTEXT_ONLY_PATTERNS = [
  /^\.env/,
  /\.config\.(js|ts|json)$/,
  /^package\.json$/,
  /^tsconfig\.json$/,
];

/**
 * Check if a file should be completely ignored
 */
export function shouldIgnoreFile(filename: string): boolean {
  return IGNORED_FILE_PATTERNS.some((pattern) => pattern.test(filename));
}

/**
 * Check if a file should only be used for context, not reviewed
 */
export function isContextOnlyFile(filename: string): boolean {
  return CONTEXT_ONLY_PATTERNS.some((pattern) => pattern.test(filename));
}

/**
 * Fetch and analyze PR diff with intelligent filtering
 */
export async function fetchPRDiff(
  octokit: Octokit,
  owner: string,
  repo: string,
  prNumber: number
): Promise<{
  changedFiles: ChangedFile[];
  contextFiles: ChangedFile[];
  stats: {
    totalFiles: number;
    reviewableFiles: number;
    contextOnlyFiles: number;
    ignoredFiles: number;
    totalAdditions: number;
    totalDeletions: number;
  };
}> {
  try {
    // Fetch all changed files in the PR
    const { data: files } = await octokit.pulls.listFiles({
      owner,
      repo,
      pull_number: prNumber,
      per_page: 100,
    });

    const changedFiles: ChangedFile[] = [];
    const contextFiles: ChangedFile[] = [];
    let ignoredCount = 0;
    let totalAdditions = 0;
    let totalDeletions = 0;

    for (const file of files) {
      const fileData: ChangedFile = {
        path: file.filename,
        patch: file.patch || "",
        additions: file.additions,
        deletions: file.deletions,
        status: file.status as "added" | "modified" | "removed" | "renamed",
      };

      totalAdditions += file.additions;
      totalDeletions += file.deletions;

      // Filter files based on patterns
      if (shouldIgnoreFile(file.filename)) {
        ignoredCount++;
        continue;
      }

      if (isContextOnlyFile(file.filename)) {
        contextFiles.push(fileData);
        continue;
      }

      changedFiles.push(fileData);
    }

    return {
      changedFiles,
      contextFiles,
      stats: {
        totalFiles: files.length,
        reviewableFiles: changedFiles.length,
        contextOnlyFiles: contextFiles.length,
        ignoredFiles: ignoredCount,
        totalAdditions,
        totalDeletions,
      },
    };
  } catch (error) {
    console.error("Error fetching PR diff:", error);
    throw new Error(`Failed to fetch PR diff: ${error}`);
  }
}

/**
 * Extract line numbers from a patch hunk
 * Returns the lines that were actually changed (additions/modifications)
 */
export function extractChangedLineNumbers(patch: string): {
  addedLines: number[];
  removedLines: number[];
  contextLines: number[];
} {
  const addedLines: number[] = [];
  const removedLines: number[] = [];
  const contextLines: number[] = [];

  const lines = patch.split("\n");
  let currentLine = 0;

  for (const line of lines) {
    // Parse hunk header: @@ -old_start,old_count +new_start,new_count @@
    if (line.startsWith("@@")) {
      const match = line.match(/\+(\d+)/);
      if (match) {
        currentLine = parseInt(match[1], 10);
      }
      continue;
    }

    // Added line
    if (line.startsWith("+") && !line.startsWith("+++")) {
      addedLines.push(currentLine);
      currentLine++;
    }
    // Removed line
    else if (line.startsWith("-") && !line.startsWith("---")) {
      removedLines.push(currentLine);
      // Don't increment currentLine for deletions
    }
    // Context line
    else if (line.startsWith(" ")) {
      contextLines.push(currentLine);
      currentLine++;
    }
  }

  return { addedLines, removedLines, contextLines };
}

/**
 * Get files by language/extension for targeted analysis
 */
export function categorizeFilesByLanguage(files: ChangedFile[]): {
  typescript: ChangedFile[];
  javascript: ChangedFile[];
  react: ChangedFile[];
  styles: ChangedFile[];
  config: ChangedFile[];
  other: ChangedFile[];
} {
  return {
    typescript: files.filter((f) => /\.(ts)$/.test(f.path)),
    javascript: files.filter((f) => /\.(js|mjs|cjs)$/.test(f.path)),
    react: files.filter((f) => /\.(tsx|jsx)$/.test(f.path)),
    styles: files.filter((f) => /\.(css|scss|sass|less)$/.test(f.path)),
    config: files.filter((f) => /\.(json|yaml|yml|toml)$/.test(f.path)),
    other: files.filter(
      (f) =>
        !/\.(ts|tsx|js|jsx|mjs|cjs|css|scss|sass|less|json|yaml|yml|toml)$/.test(
          f.path
        )
    ),
  };
}

/**
 * Estimate complexity of changes based on additions/deletions
 * Used to prioritize which files need more careful review
 */
export function estimateChangeComplexity(
  file: ChangedFile
): "low" | "medium" | "high" {
  const totalChanges = file.additions + file.deletions;

  if (totalChanges < 20) return "low";
  if (totalChanges < 100) return "medium";
  return "high";
}

/**
 * Identify critical files that always need careful review
 */
export function isCriticalFile(filename: string): boolean {
  const criticalPatterns = [
    /auth/i,
    /security/i,
    /payment/i,
    /crypto/i,
    /password/i,
    /token/i,
    /api\/.*key/i,
    /middleware/i,
  ];

  return criticalPatterns.some((pattern) => pattern.test(filename));
}
