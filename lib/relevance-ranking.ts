// Relevance Ranking Algorithm - Step 7
// Uses BFS through import graph to find and rank contextually relevant files

import { ChangedFile } from "@/types";
import { FileStructure } from "./code-parser";
import { isCriticalFile, estimateChangeComplexity } from "./diff-analyzer";

export type ScoredFile = {
  path: string;
  score: number;
  distance: number; // 0 = changed, 1 = direct import, 2 = indirect, etc.
  reason: string; // Why this file is relevant
  isCritical: boolean;
  complexity: "low" | "medium" | "high";
};

/**
 * Core relevance scoring algorithm
 *
 * Uses BFS through the dependency graph to find related files
 * and assign scores based on:
 * - Distance from changed files (closer = higher score)
 * - File criticality (auth/security = higher score)
 * - Import direction (imported by changed file > imports changed file)
 * - File type (utils/hooks > tests)
 */
export function buildRelevanceScores(
  changedFiles: ChangedFile[],
  allFileStructures: Map<string, FileStructure>,
  maxDistance: number = 3 // How far to traverse the graph
): ScoredFile[] {
  const scores = new Map<string, ScoredFile>();
  const changedPaths = new Set(changedFiles.map((f) => f.path));

  // BFS queue: [filePath, distance, reason]
  const queue: Array<[string, number, string]> = [];
  const visited = new Set<string>();

  // Initialize: Start with changed files (distance 0)
  for (const file of changedFiles) {
    const complexity = estimateChangeComplexity(file);
    const isCrit = isCriticalFile(file.path);

    scores.set(file.path, {
      path: file.path,
      score: calculateBaseScore(0, isCrit, complexity),
      distance: 0,
      reason: "Changed in this PR",
      isCritical: isCrit,
      complexity,
    });

    queue.push([file.path, 0, "Changed in this PR"]);
    visited.add(file.path);
  }

  // BFS: Traverse dependency graph
  while (queue.length > 0) {
    const [currentPath, distance, parentReason] = queue.shift()!;

    // Stop if we've gone too far
    if (distance >= maxDistance) continue;

    const structure = allFileStructures.get(currentPath);
    if (!structure) continue;

    // Explore files that this file depends on (imports)
    for (const depPath of structure.dependencies) {
      if (visited.has(depPath)) continue;

      const depStructure = allFileStructures.get(depPath);
      if (!depStructure) continue;

      visited.add(depPath);

      const newDistance = distance + 1;
      const isCrit = isCriticalFile(depPath);
      const complexity = estimateComplexityFromStructure(depStructure);

      const score = calculateBaseScore(newDistance, isCrit, complexity);
      const reason = `Imported by ${currentPath.split("/").pop()}`;

      scores.set(depPath, {
        path: depPath,
        score,
        distance: newDistance,
        reason,
        isCritical: isCrit,
        complexity,
      });

      queue.push([depPath, newDistance, reason]);
    }

    // Explore files that depend on this file (reverse dependencies)
    for (const [filePath, fileStructure] of allFileStructures.entries()) {
      if (visited.has(filePath)) continue;
      if (changedPaths.has(filePath)) continue; // Already processed

      // Check if this file imports the current file
      const importsCurrent = fileStructure.dependencies.includes(currentPath);
      if (!importsCurrent) continue;

      visited.add(filePath);

      const newDistance = distance + 1;
      const isCrit = isCriticalFile(filePath);
      const complexity = estimateComplexityFromStructure(fileStructure);

      // Boost score for reverse dependencies (files that import changed code)
      const score = calculateBaseScore(newDistance, isCrit, complexity) * 1.2;
      const reason = `Imports ${currentPath.split("/").pop()} (changed)`;

      scores.set(filePath, {
        path: filePath,
        score,
        distance: newDistance,
        reason,
        isCritical: isCrit,
        complexity,
      });

      queue.push([filePath, newDistance, reason]);
    }
  }

  return Array.from(scores.values());
}

/**
 * Calculate base relevance score
 * Higher score = more relevant
 */
function calculateBaseScore(
  distance: number,
  isCritical: boolean,
  complexity: "low" | "medium" | "high"
): number {
  // Base score decreases with distance
  // distance 0: 1.0
  // distance 1: 0.5
  // distance 2: 0.33
  // distance 3: 0.25
  let score = 1 / (distance + 1);

  // Boost critical files (auth, security, etc.)
  if (isCritical) {
    score *= 1.5;
  }

  // Boost by complexity
  const complexityMultiplier = {
    low: 1.0,
    medium: 1.1,
    high: 1.2,
  };
  score *= complexityMultiplier[complexity];

  return score;
}

/**
 * Estimate complexity from file structure
 */
function estimateComplexityFromStructure(
  structure: FileStructure
): "low" | "medium" | "high" {
  const importCount = structure.imports.length;
  const exportCount = structure.exports.length;
  const complexity = importCount + exportCount;

  if (complexity < 5) return "low";
  if (complexity < 15) return "medium";
  return "high";
}

/**
 * Select top N most relevant files for AI context
 *
 * Balances:
 * - Relevance score (higher = more important)
 * - Token budget (don't exceed max tokens)
 * - File diversity (don't select only one area)
 */
export function selectContextFiles(
  scoredFiles: ScoredFile[],
  maxFiles: number = 15,
  maxTokensEstimate: number = 8000
): {
  selectedFiles: ScoredFile[];
  estimatedTokens: number;
  stats: {
    totalCandidates: number;
    selected: number;
    byDistance: Record<number, number>;
    criticalFilesIncluded: number;
  };
} {
  // Sort by score (descending)
  const sorted = [...scoredFiles].sort((a, b) => b.score - a.score);

  const selected: ScoredFile[] = [];
  let estimatedTokens = 0;
  const byDistance: Record<number, number> = {};
  let criticalFilesIncluded = 0;

  for (const file of sorted) {
    // Stop if we've hit the max files limit
    if (selected.length >= maxFiles) break;

    // Estimate tokens for this file (rough: 1 token per 4 chars, ~500 lines average)
    const fileTokensEstimate = 500; // Conservative estimate per file

    // Stop if we'd exceed token budget
    if (estimatedTokens + fileTokensEstimate > maxTokensEstimate) break;

    selected.push(file);
    estimatedTokens += fileTokensEstimate;

    byDistance[file.distance] = (byDistance[file.distance] || 0) + 1;
    if (file.isCritical) criticalFilesIncluded++;
  }

  return {
    selectedFiles: selected,
    estimatedTokens,
    stats: {
      totalCandidates: scoredFiles.length,
      selected: selected.length,
      byDistance,
      criticalFilesIncluded,
    },
  };
}

/**
 * Apply file type weighting to scores
 * Some file types are more important for context than others
 */
export function applyFileTypeWeights(
  scoredFiles: ScoredFile[],
  fileStructures: Map<string, FileStructure>
): ScoredFile[] {
  return scoredFiles.map((scored) => {
    const structure = fileStructures.get(scored.path);
    if (!structure) return scored;

    let weight = 1.0;

    // Boost utility and helper files (often contain shared logic)
    if (/\/utils?\/|\/helpers?\/|\/lib\//i.test(scored.path)) {
      weight *= 1.3;
    }

    // Boost hooks (in React projects)
    if (/\/hooks?\/|use[A-Z]/i.test(scored.path)) {
      weight *= 1.2;
    }

    // Slightly reduce test files (still useful but less critical)
    if (/\.(test|spec)\.(ts|tsx|js|jsx)$/.test(scored.path)) {
      weight *= 0.8;
    }

    // Reduce config files (usually just context, not logic)
    if (/\.config\.(ts|js)$/.test(scored.path)) {
      weight *= 0.7;
    }

    // Boost API routes and middleware
    if (/\/api\/|\/routes?\/|middleware/i.test(scored.path)) {
      weight *= 1.2;
    }

    return {
      ...scored,
      score: scored.score * weight,
    };
  });
}

/**
 * Group files by module/directory for better organization
 */
export function groupFilesByModule(
  scoredFiles: ScoredFile[]
): Map<string, ScoredFile[]> {
  const groups = new Map<string, ScoredFile[]>();

  for (const file of scoredFiles) {
    // Extract module name (second-to-last directory)
    const parts = file.path.split("/");
    const module = parts.length > 2 ? parts[parts.length - 2] : "root";

    if (!groups.has(module)) {
      groups.set(module, []);
    }
    groups.get(module)!.push(file);
  }

  return groups;
}

/**
 * Generate explanation of why files were selected
 */
export function explainSelection(selectedFiles: ScoredFile[]): string {
  const lines = ["Context Selection Strategy:", ""];

  // Group by distance
  const byDistance = new Map<number, ScoredFile[]>();
  for (const file of selectedFiles) {
    if (!byDistance.has(file.distance)) {
      byDistance.set(file.distance, []);
    }
    byDistance.get(file.distance)!.push(file);
  }

  // Explain each distance level
  const distances = Array.from(byDistance.keys()).sort((a, b) => a - b);

  for (const distance of distances) {
    const files = byDistance.get(distance)!;
    const label =
      distance === 0
        ? "Changed Files"
        : `Distance ${distance} (${
            distance === 1 ? "direct" : "indirect"
          } dependencies)`;

    lines.push(`${label}: ${files.length} files`);
    files.forEach((f) => {
      lines.push(
        `  • ${f.path.split("/").pop()} (score: ${f.score.toFixed(2)}) - ${
          f.reason
        }`
      );
    });
    lines.push("");
  }

  // Summary stats
  const critical = selectedFiles.filter((f) => f.isCritical).length;
  const avgScore =
    selectedFiles.reduce((sum, f) => sum + f.score, 0) / selectedFiles.length;

  lines.push("Summary:");
  lines.push(`  • Total files: ${selectedFiles.length}`);
  lines.push(`  • Critical files: ${critical}`);
  lines.push(`  • Average relevance: ${avgScore.toFixed(2)}`);

  return lines.join("\n");
}
