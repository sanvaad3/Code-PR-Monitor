// Anti-Hallucination Validator - Phase 5, Step 9
// Validates AI output before posting to GitHub to prevent hallucinations

import { CategoryComment } from "@/types";
import { ReviewData } from "./enhanced-pr-context";

export type ValidationResult = {
  isValid: boolean;
  invalidComments: CategoryComment[];
  validComments: CategoryComment[];
  validationErrors: string[];
};

/**
 * Validate all comments from AI review
 * CRITICAL: This prevents posting hallucinated file paths or line numbers to GitHub
 */
export function validateReviewComments(
  comments: CategoryComment[],
  reviewData: ReviewData
): ValidationResult {
  const validComments: CategoryComment[] = [];
  const invalidComments: CategoryComment[] = [];
  const validationErrors: string[] = [];

  // Build file map for quick lookup
  const fileMap = new Map<string, string>();
  for (const file of reviewData.changedFiles) {
    fileMap.set(file.path, file.content);
  }
  for (const file of reviewData.contextFiles) {
    fileMap.set(file.path, file.content);
  }

  for (const comment of comments) {
    const validation = validateSingleComment(comment, fileMap);

    if (validation.isValid) {
      validComments.push(comment);
    } else {
      invalidComments.push(comment);
      validationErrors.push(
        `Invalid comment for ${comment.file_path}:${comment.line_start}-${comment.line_end}: ${validation.reason}`
      );
    }
  }

  return {
    isValid: invalidComments.length === 0,
    invalidComments,
    validComments,
    validationErrors,
  };
}

/**
 * Validate a single comment
 */
function validateSingleComment(
  comment: CategoryComment,
  fileMap: Map<string, string>
): { isValid: boolean; reason?: string } {
  // Check 1: File must exist in our review data
  const fileContent = fileMap.get(comment.file_path);
  if (!fileContent) {
    return {
      isValid: false,
      reason: `File not in review context: ${comment.file_path}`,
    };
  }

  // Check 2: Line numbers must be valid
  const lines = fileContent.split("\n");
  const totalLines = lines.length;

  if (comment.line_start < 1 || comment.line_start > totalLines) {
    return {
      isValid: false,
      reason: `line_start ${comment.line_start} is out of range (file has ${totalLines} lines)`,
    };
  }

  if (comment.line_end < comment.line_start || comment.line_end > totalLines) {
    return {
      isValid: false,
      reason: `line_end ${comment.line_end} is invalid (start: ${comment.line_start}, total: ${totalLines})`,
    };
  }

  // Check 3: Line range should be reasonable (not entire file)
  const rangeSize = comment.line_end - comment.line_start + 1;
  if (rangeSize > 100) {
    return {
      isValid: false,
      reason: `Line range too large (${rangeSize} lines). Comments should be specific.`,
    };
  }

  // Check 4: Comment should reference actual code (optional but good)
  const commentedLines = lines.slice(comment.line_start - 1, comment.line_end);
  const hasCode = commentedLines.some((line) => line.trim().length > 0);

  if (!hasCode) {
    return {
      isValid: false,
      reason: "Commented lines are all empty",
    };
  }

  return { isValid: true };
}

/**
 * Validate and filter comments by confidence
 * Removes low-quality or vague comments
 */
export function filterLowQualityComments(comments: CategoryComment[]): {
  highQuality: CategoryComment[];
  filtered: CategoryComment[];
  filterReasons: string[];
} {
  const highQuality: CategoryComment[] = [];
  const filtered: CategoryComment[] = [];
  const filterReasons: string[] = [];

  for (const comment of comments) {
    const quality = assessCommentQuality(comment);

    if (quality.isHighQuality) {
      highQuality.push(comment);
    } else {
      filtered.push(comment);
      filterReasons.push(
        `${comment.file_path}:${comment.line_start} - ${quality.reason}`
      );
    }
  }

  return { highQuality, filtered, filterReasons };
}

/**
 * Assess comment quality
 */
function assessCommentQuality(comment: CategoryComment): {
  isHighQuality: boolean;
  reason?: string;
} {
  // Filter 1: Message must be substantial
  if (comment.message.length < 20) {
    return {
      isHighQuality: false,
      reason: "Comment too short (less than 20 chars)",
    };
  }

  // Filter 2: Avoid generic comments
  const genericPhrases = [
    "consider refactoring",
    "could be improved",
    "might want to",
    "you may want to",
    "looks good",
    "no issues",
  ];

  const isGeneric = genericPhrases.some((phrase) =>
    comment.message.toLowerCase().includes(phrase)
  );

  if (isGeneric && comment.message.length < 100) {
    return {
      isHighQuality: false,
      reason: "Comment is too generic",
    };
  }

  // Filter 3: Should have specific actionable advice
  const hasActionableWords =
    /\b(should|must|need to|add|remove|change|update|fix|implement)\b/i.test(
      comment.message
    );

  if (!hasActionableWords) {
    return {
      isHighQuality: false,
      reason: "Comment lacks actionable advice",
    };
  }

  return { isHighQuality: true };
}

/**
 * Deduplicate similar comments
 * Sometimes AI produces multiple comments about the same issue
 */
export function deduplicateComments(comments: CategoryComment[]): {
  unique: CategoryComment[];
  duplicates: CategoryComment[];
} {
  const unique: CategoryComment[] = [];
  const duplicates: CategoryComment[] = [];
  const seen = new Set<string>();

  for (const comment of comments) {
    // Create signature: file + approximate line range + first 50 chars of message
    const signature = [
      comment.file_path,
      Math.floor(comment.line_start / 10) * 10, // Group by ~10 line chunks
      comment.message.substring(0, 50).toLowerCase(),
    ].join("::");

    if (seen.has(signature)) {
      duplicates.push(comment);
    } else {
      seen.add(signature);
      unique.push(comment);
    }
  }

  return { unique, duplicates };
}

/**
 * Complete validation pipeline
 * Runs all validation and filtering steps
 */
export function validateAndFilterComments(
  comments: CategoryComment[],
  reviewData: ReviewData
): {
  validatedComments: CategoryComment[];
  stats: {
    total: number;
    invalidFiles: number;
    lowQuality: number;
    duplicates: number;
    final: number;
  };
  errors: string[];
} {
  const errors: string[] = [];
  let stats = {
    total: comments.length,
    invalidFiles: 0,
    lowQuality: 0,
    duplicates: 0,
    final: 0,
  };

  // Step 1: Validate file paths and line numbers
  const validation = validateReviewComments(comments, reviewData);
  stats.invalidFiles = validation.invalidComments.length;
  errors.push(...validation.validationErrors);

  console.log(
    `Validation: ${validation.validComments.length}/${comments.length} comments have valid file/line references`
  );

  // Step 2: Filter low quality comments
  const { highQuality, filtered, filterReasons } = filterLowQualityComments(
    validation.validComments
  );
  stats.lowQuality = filtered.length;

  if (filterReasons.length > 0) {
    console.log(`Filtered ${filterReasons.length} low-quality comments`);
  }

  // Step 3: Deduplicate
  const { unique, duplicates } = deduplicateComments(highQuality);
  stats.duplicates = duplicates.length;

  if (duplicates.length > 0) {
    console.log(`Removed ${duplicates.length} duplicate comments`);
  }

  stats.final = unique.length;

  return {
    validatedComments: unique,
    stats,
    errors,
  };
}

/**
 * Generate validation report for logging
 */
export function generateValidationReport(
  validationResult: ReturnType<typeof validateAndFilterComments>
): string {
  const { stats, errors } = validationResult;

  const report = [
    "=== Comment Validation Report ===",
    `Total comments from AI: ${stats.total}`,
    `Invalid (bad file/lines): ${stats.invalidFiles}`,
    `Low quality (filtered): ${stats.lowQuality}`,
    `Duplicates (removed): ${stats.duplicates}`,
    `Final valid comments: ${stats.final}`,
    "",
    `Pass rate: ${((stats.final / stats.total) * 100).toFixed(1)}%`,
  ];

  if (errors.length > 0) {
    report.push("");
    report.push("Validation Errors:");
    errors.forEach((err) => report.push(`  - ${err}`));
  }

  return report.join("\n");
}

/**
 * Check if validation passed with acceptable quality
 */
export function isAcceptableQuality(
  stats: ReturnType<typeof validateAndFilterComments>["stats"]
): boolean {
  // Allow 0 comments (code is clean!)
  if (stats.total === 0 && stats.final === 0) return true;

  // If AI generated comments but all were filtered, that's suspicious
  if (stats.total > 0 && stats.final === 0) return false;

  // Pass rate should be at least 50%
  const passRate = stats.final / stats.total;
  if (passRate < 0.5) return false;

  return true;
}
