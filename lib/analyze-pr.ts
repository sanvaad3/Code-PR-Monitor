/**
 * Example: How to use PR Context Builder
 *
 * This demonstrates Phase 3 functionality:
 * - Fetching PR diffs
 * - Analyzing code structure
 * - Building complete context
 */

import { getOctokitForInstallation } from "@/lib/github";
import {
  buildPRContext,
  generatePRSummary,
  extractFileContext,
} from "@/lib/pr-context";
import {
  categorizeFilesByLanguage,
  estimateChangeComplexity,
} from "@/lib/diff-analyzer";
import { detectFileType } from "@/lib/code-parser";

/**
 * Example function showing complete PR analysis workflow
 */
export async function analyzePullRequest(
  installationId: number,
  owner: string,
  repo: string,
  prNumber: number,
  headSha: string
) {
  console.log("=== Starting PR Analysis ===\n");

  // 1. Get authenticated GitHub client
  const octokit = await getOctokitForInstallation(installationId);

  // 2. Build complete PR context
  const context = await buildPRContext(octokit, owner, repo, prNumber, headSha);

  // 3. Display summary
  console.log(generatePRSummary(context));
  console.log("\n");

  // 4. Analyze each changed file
  console.log("=== File Analysis ===\n");

  for (const file of context.changedFiles) {
    console.log(`📄 ${file.path}`);
    console.log(`   Status: ${file.status}`);
    console.log(`   Changes: +${file.additions}/-${file.deletions}`);

    // Estimate complexity
    const complexity = estimateChangeComplexity(file);
    console.log(`   Complexity: ${complexity}`);

    // Get file content and structure
    const content = context.fileContents.get(file.path);
    const structure = context.fileStructures.get(file.path);

    if (structure) {
      console.log(`   Imports: ${structure.imports.length}`);
      console.log(`   Exports: ${structure.exports.length}`);
      console.log(`   Dependencies: ${structure.dependencies.length}`);

      // Show dependencies
      if (structure.dependencies.length > 0) {
        console.log("   └─ Depends on:");
        structure.dependencies.slice(0, 3).forEach((dep) => {
          console.log(`      - ${dep}`);
        });
        if (structure.dependencies.length > 3) {
          console.log(
            `      ... and ${structure.dependencies.length - 3} more`
          );
        }
      }
    }

    if (content) {
      // Detect file type
      const fileType = detectFileType(file.path, content);
      const types = Object.entries(fileType)
        .filter(([_, value]) => value)
        .map(([key]) => key);

      if (types.length > 0) {
        console.log(`   Type: ${types.join(", ")}`);
      }

      // Extract changed sections
      const { changedSections } = extractFileContext(file, content);
      console.log(`   Changed sections: ${changedSections.length}`);
    }

    console.log("");
  }

  // 5. Language breakdown
  console.log("=== Language Breakdown ===\n");
  const categorized = categorizeFilesByLanguage(context.changedFiles);

  console.log(`TypeScript: ${categorized.typescript.length} files`);
  console.log(`JavaScript: ${categorized.javascript.length} files`);
  console.log(`React: ${categorized.react.length} files`);
  console.log(`Styles: ${categorized.styles.length} files`);
  console.log(`Config: ${categorized.config.length} files`);
  console.log(`Other: ${categorized.other.length} files`);

  // 6. Return context for next phase (AI review)
  return context;
}

/**
 * Example: Analyze a single file in detail
 */
export function analyzeFileInDetail(
  filePath: string,
  content: string,
  patch: string
) {
  console.log(`\n=== Detailed Analysis: ${filePath} ===\n`);

  // 1. Detect file type
  const fileType = detectFileType(filePath, content);
  console.log("File Type:");
  Object.entries(fileType).forEach(([key, value]) => {
    if (value) console.log(`  ✓ ${key}`);
  });

  // 2. Parse structure
  const { analyzeFileStructure } = require("@/lib/code-parser");
  const structure = analyzeFileStructure(filePath, content);

  console.log(`\nImports (${structure.imports.length}):`);
  structure.imports.slice(0, 5).forEach((imp: any) => {
    const type = imp.isDefault
      ? "default"
      : imp.isDynamic
      ? "dynamic"
      : "named";
    console.log(`  ${type}: ${imp.source}`);
    if (imp.specifiers.length > 0) {
      console.log(`    └─ ${imp.specifiers.join(", ")}`);
    }
  });

  console.log(`\nExports (${structure.exports.length}):`);
  structure.exports.slice(0, 5).forEach((exp: any) => {
    const defaultMarker = exp.isDefault ? "(default)" : "";
    console.log(`  ${exp.name} ${defaultMarker} - ${exp.type}`);
  });

  console.log(`\nDependencies (${structure.dependencies.length}):`);
  structure.dependencies.slice(0, 5).forEach((dep: any) => {
    console.log(`  → ${dep}`);
  });

  // 3. Extract definitions
  const { extractDefinitions } = require("@/lib/code-parser");
  const definitions = extractDefinitions(content);

  console.log(`\nDefinitions:`);
  console.log(`  Functions: ${definitions.functions.length}`);
  console.log(`  Classes: ${definitions.classes.length}`);
  console.log(`  Types: ${definitions.types.length}`);
}

// Example usage (commented out to avoid execution)
/*
async function main() {
  await analyzePullRequest(
    12345, // installation ID
    'owner',
    'repo',
    42, // PR number
    'abc123' // head SHA
  );
}
*/
