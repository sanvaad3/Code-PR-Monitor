// PR Context Builder - Combines diff analysis and code structure parsing
import { Octokit } from "@octokit/rest";
import { ChangedFile, FileContext } from "@/types";
import {
  fetchPRDiff,
  categorizeFilesByLanguage,
  estimateChangeComplexity,
  isCriticalFile,
  extractChangedLineNumbers,
} from "./diff-analyzer";
import {
  analyzeFileStructure,
  detectFileType,
  FileStructure,
} from "./code-parser";

export type PRContext = {
  changedFiles: ChangedFile[];
  fileStructures: Map<string, FileStructure>; // path -> structure
  fileContents: Map<string, string>; // path -> code
  stats: {
    totalFiles: number;
    reviewableFiles: number;
    criticalFiles: number;
    totalAdditions: number;
    totalDeletions: number;
    languageBreakdown: Record<string, number>;
  };
};

/**
 * Build complete PR context with code analysis
 * This is the main entry point for Phase 3
 */
export async function buildPRContext(
  octokit: Octokit,
  owner: string,
  repo: string,
  prNumber: number,
  headSha: string
): Promise<PRContext> {
  console.log(`Building PR context for ${owner}/${repo}#${prNumber}`);

  // Step 1: Fetch and filter PR diff
  const { changedFiles, stats: diffStats } = await fetchPRDiff(
    octokit,
    owner,
    repo,
    prNumber
  );

  console.log(
    `Found ${changedFiles.length} reviewable files out of ${diffStats.totalFiles} total`
  );

  // Step 2: Categorize files by language
  const categorized = categorizeFilesByLanguage(changedFiles);
  const languageBreakdown = {
    typescript: categorized.typescript.length,
    javascript: categorized.javascript.length,
    react: categorized.react.length,
    styles: categorized.styles.length,
    config: categorized.config.length,
    other: categorized.other.length,
  };

  // Step 3: Fetch file contents and build structures
  const fileStructures = new Map<string, FileStructure>();
  const fileContents = new Map<string, string>();

  // Only analyze code files (TS/JS/TSX/JSX)
  const codeFiles = [
    ...categorized.typescript,
    ...categorized.javascript,
    ...categorized.react,
  ];

  let criticalFilesCount = 0;

  for (const file of codeFiles) {
    try {
      // Fetch file content from GitHub
      const content = await fetchFileContent(
        octokit,
        owner,
        repo,
        file.path,
        headSha
      );

      if (!content) {
        console.warn(`Could not fetch content for ${file.path}`);
        continue;
      }

      fileContents.set(file.path, content);

      // Analyze file structure
      const structure = analyzeFileStructure(file.path, content);
      fileStructures.set(file.path, structure);

      // Check if critical
      if (isCriticalFile(file.path)) {
        criticalFilesCount++;
      }

      // Log complexity for high-complexity files
      const complexity = estimateChangeComplexity(file);
      if (complexity === "high") {
        console.log(
          `High complexity change in ${file.path}: +${file.additions}/-${file.deletions}`
        );
      }
    } catch (error) {
      console.error(`Error analyzing ${file.path}:`, error);
      // Continue with other files
    }
  }

  console.log(`Analyzed ${fileStructures.size} code files`);
  console.log(`Found ${criticalFilesCount} critical files`);

  return {
    changedFiles,
    fileStructures,
    fileContents,
    stats: {
      totalFiles: diffStats.totalFiles,
      reviewableFiles: diffStats.reviewableFiles,
      criticalFiles: criticalFilesCount,
      totalAdditions: diffStats.totalAdditions,
      totalDeletions: diffStats.totalDeletions,
      languageBreakdown,
    },
  };
}

/**
 * Fetch file content from GitHub repository
 */
async function fetchFileContent(
  octokit: Octokit,
  owner: string,
  repo: string,
  path: string,
  ref: string
): Promise<string | null> {
  try {
    const { data } = await octokit.repos.getContent({
      owner,
      repo,
      path,
      ref,
    });

    if ("content" in data && data.type === "file") {
      return Buffer.from(data.content, "base64").toString("utf-8");
    }

    return null;
  } catch (error: any) {
    if (error.status === 404) {
      // File might be deleted
      return null;
    }
    throw error;
  }
}

/**
 * Get all files that import or are imported by changed files
 * This is prep for Phase 4 (dependency-aware context)
 */
export function findRelatedFiles(
  changedFilePaths: string[],
  allStructures: Map<string, FileStructure>
): Set<string> {
  const relatedFiles = new Set<string>();
  const changedSet = new Set(changedFilePaths);

  // For each file in the codebase
  for (const [filePath, structure] of allStructures.entries()) {
    // Skip if already in changed files
    if (changedSet.has(filePath)) continue;

    // Check if this file imports any changed file
    const importsSomethingChanged = structure.dependencies.some((dep) =>
      changedSet.has(dep)
    );

    if (importsSomethingChanged) {
      relatedFiles.add(filePath);
    }

    // Check if any changed file imports this file
    for (const changedPath of changedFilePaths) {
      const changedStructure = allStructures.get(changedPath);
      if (changedStructure?.dependencies.includes(filePath)) {
        relatedFiles.add(filePath);
      }
    }
  }

  return relatedFiles;
}

/**
 * Generate summary of PR changes for logging/display
 */
export function generatePRSummary(context: PRContext): string {
  const { stats, changedFiles } = context;

  const summary = [
    `PR Summary:`,
    `- Total files: ${stats.totalFiles}`,
    `- Reviewable files: ${stats.reviewableFiles}`,
    `- Critical files: ${stats.criticalFiles}`,
    `- Changes: +${stats.totalAdditions}/-${stats.totalDeletions}`,
    ``,
    `Language breakdown:`,
  ];

  for (const [lang, count] of Object.entries(stats.languageBreakdown)) {
    if (count > 0) {
      summary.push(`- ${lang}: ${count} files`);
    }
  }

  // List critical files
  const criticalFiles = changedFiles.filter((f) => isCriticalFile(f.path));
  if (criticalFiles.length > 0) {
    summary.push("");
    summary.push("Critical files requiring extra attention:");
    criticalFiles.forEach((f) => {
      summary.push(`- ${f.path}`);
    });
  }

  return summary.join("\n");
}

/**
 * Extract focused context for a specific file
 * Returns the code with line numbers for the changed sections
 */
export function extractFileContext(
  file: ChangedFile,
  fullContent: string
): {
  changedSections: Array<{
    startLine: number;
    endLine: number;
    code: string;
  }>;
  fullFilePreview: string;
} {
  const lines = fullContent.split("\n");
  const { addedLines, removedLines } = extractChangedLineNumbers(file.patch);

  // Get changed sections with context (5 lines before/after)
  const changedSections: Array<{
    startLine: number;
    endLine: number;
    code: string;
  }> = [];

  const allChangedLines = [...addedLines, ...removedLines].sort(
    (a, b) => a - b
  );

  // Group continuous changed lines into sections
  let currentSection: number[] = [];

  for (let i = 0; i < allChangedLines.length; i++) {
    const line = allChangedLines[i];

    if (currentSection.length === 0) {
      currentSection.push(line);
    } else if (line - currentSection[currentSection.length - 1] <= 5) {
      // Within 5 lines, add to current section
      currentSection.push(line);
    } else {
      // Start new section
      const startLine = Math.max(1, currentSection[0] - 5);
      const endLine = Math.min(
        lines.length,
        currentSection[currentSection.length - 1] + 5
      );

      changedSections.push({
        startLine,
        endLine,
        code: lines.slice(startLine - 1, endLine).join("\n"),
      });

      currentSection = [line];
    }
  }

  // Add last section
  if (currentSection.length > 0) {
    const startLine = Math.max(1, currentSection[0] - 5);
    const endLine = Math.min(
      lines.length,
      currentSection[currentSection.length - 1] + 5
    );

    changedSections.push({
      startLine,
      endLine,
      code: lines.slice(startLine - 1, endLine).join("\n"),
    });
  }

  // Full file preview (first 50 lines)
  const fullFilePreview = lines.slice(0, 50).join("\n");

  return {
    changedSections,
    fullFilePreview,
  };
}
