// AI Review Engine - Phase 5, Step 8: Structured Prompting
import OpenAI from "openai";
import { ReviewData } from "./enhanced-pr-context";
import { CategoryComment, CommentSeverity } from "@/types";

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export type ReviewCategory = "architecture" | "security" | "maintainability";

export type CategoryReviewResult = {
  category: ReviewCategory;
  comments: CategoryComment[];
  overallAssessment: string;
  tokensUsed: number;
};

/**
 * Generate architecture-focused review
 * Only comments on structure, design patterns, and modularity
 */
export async function reviewArchitecture(
  reviewData: ReviewData
): Promise<CategoryReviewResult> {
  const prompt = buildArchitecturePrompt(reviewData);

  const completion = await openai.chat.completions.create({
    model: "gpt-4-turbo-preview",
    messages: [
      {
        role: "system",
        content: ARCHITECTURE_SYSTEM_PROMPT,
      },
      {
        role: "user",
        content: prompt,
      },
    ],
    temperature: 0.3, // Lower temperature for more focused reviews
    max_tokens: 2000,
  });

  const response = completion.choices[0].message.content || "";
  const tokensUsed = completion.usage?.total_tokens || 0;

  // Parse response into structured comments
  const comments = parseReviewResponse(response, "architecture");

  return {
    category: "architecture",
    comments,
    overallAssessment: extractOverallAssessment(response),
    tokensUsed,
  };
}

/**
 * Generate security-focused review
 * Only comments on auth, validation, data exposure, and vulnerabilities
 */
export async function reviewSecurity(
  reviewData: ReviewData
): Promise<CategoryReviewResult> {
  const prompt = buildSecurityPrompt(reviewData);

  const completion = await openai.chat.completions.create({
    model: "gpt-4-turbo-preview",
    messages: [
      {
        role: "system",
        content: SECURITY_SYSTEM_PROMPT,
      },
      {
        role: "user",
        content: prompt,
      },
    ],
    temperature: 0.2, // Even lower for security (be conservative)
    max_tokens: 2000,
  });

  const response = completion.choices[0].message.content || "";
  const tokensUsed = completion.usage?.total_tokens || 0;

  const comments = parseReviewResponse(response, "security");

  return {
    category: "security",
    comments,
    overallAssessment: extractOverallAssessment(response),
    tokensUsed,
  };
}

/**
 * Generate maintainability-focused review
 * Comments on testability, readability, and code quality
 */
export async function reviewMaintainability(
  reviewData: ReviewData
): Promise<CategoryReviewResult> {
  const prompt = buildMaintainabilityPrompt(reviewData);

  const completion = await openai.chat.completions.create({
    model: "gpt-4-turbo-preview",
    messages: [
      {
        role: "system",
        content: MAINTAINABILITY_SYSTEM_PROMPT,
      },
      {
        role: "user",
        content: prompt,
      },
    ],
    temperature: 0.4,
    max_tokens: 2000,
  });

  const response = completion.choices[0].message.content || "";
  const tokensUsed = completion.usage?.total_tokens || 0;

  const comments = parseReviewResponse(response, "maintainability");

  return {
    category: "maintainability",
    comments,
    overallAssessment: extractOverallAssessment(response),
    tokensUsed,
  };
}

/**
 * System prompts for each category
 * These are critical - they constrain the AI to only comment on specific aspects
 */

const ARCHITECTURE_SYSTEM_PROMPT = `You are a senior software architect reviewing code changes.

RULES:
1. Only comment on architectural concerns:
   - Code organization and structure
   - Design patterns and their usage
   - Separation of concerns
   - Module coupling and cohesion
   - API design and interfaces
   - Data flow and state management

2. You MUST cite exact file paths and line numbers for every comment.
3. If you cannot determine the exact line number, DO NOT comment.
4. Format each comment as: FILE:LINE_START-LINE_END | SEVERITY | MESSAGE

5. Severity levels:
   - info: Suggestion for improvement
   - warning: Potential design issue
   - critical: Severe architectural problem

6. If there are no architectural issues, say "No architectural concerns found."

DO NOT comment on:
- Security issues (separate review)
- Code style or formatting
- Performance optimizations
- Testing approaches`;

const SECURITY_SYSTEM_PROMPT = `You are a security expert reviewing code for vulnerabilities.

RULES:
1. Only comment on security concerns:
   - Authentication and authorization
   - Input validation and sanitization
   - SQL injection, XSS, CSRF risks
   - Sensitive data exposure
   - Cryptography usage
   - Access control
   - API security

2. You MUST cite exact file paths and line numbers.
3. If you lack context to make a security judgment, say "Insufficient context to assess security at LINE X"
4. Format: FILE:LINE_START-LINE_END | SEVERITY | MESSAGE

5. Severity:
   - info: Security best practice suggestion
   - warning: Potential security risk
   - critical: Definite vulnerability

6. If code looks secure, say "No security issues found."

DO NOT comment on:
- Architecture or design
- Code quality or style
- Performance`;

const MAINTAINABILITY_SYSTEM_PROMPT = `You are a code quality expert reviewing for maintainability.

RULES:
1. Only comment on maintainability:
   - Function/class complexity
   - Code duplication
   - Naming clarity
   - Error handling
   - Testability
   - Documentation needs
   - Coupling between components

2. You MUST cite exact file paths and line numbers.
3. Format: FILE:LINE_START-LINE_END | SEVERITY | MESSAGE

4. Severity:
   - info: Code quality suggestion
   - warning: Maintainability concern
   - critical: Will make code hard to maintain

5. If code is maintainable, say "Code is well-structured and maintainable."

DO NOT comment on:
- Security (separate review)
- High-level architecture
- Performance unless it affects readability`;

/**
 * Build architecture review prompt
 */
function buildArchitecturePrompt(reviewData: ReviewData): string {
  const sections = ["# Architecture Review", "", "## Changed Files", ""];

  for (const file of reviewData.changedFiles) {
    sections.push(`### ${file.path}`);
    sections.push(`Changes: +${file.additions}/-${file.deletions}`);
    if (file.isCritical) {
      sections.push("⚠️ **CRITICAL FILE**");
    }
    sections.push("");
    sections.push("**Dependencies:**");
    sections.push(`- Imports: ${file.imports.join(", ") || "none"}`);
    sections.push(`- Exports: ${file.exports.join(", ") || "none"}`);
    sections.push("");
    sections.push("**Code:**");
    sections.push("```typescript");
    // Include only first 100 lines to stay within token limit
    sections.push(file.content.split("\n").slice(0, 100).join("\n"));
    if (file.content.split("\n").length > 100) {
      sections.push("... (truncated)");
    }
    sections.push("```");
    sections.push("");
  }

  if (reviewData.contextFiles.length > 0) {
    sections.push("## Context Files (for reference)");
    sections.push("");
    for (const file of reviewData.contextFiles) {
      sections.push(`### ${file.path}`);
      sections.push(`Relevance: ${file.reason}`);
      sections.push("");
    }
  }

  sections.push("");
  sections.push("## Your Task");
  sections.push("Review the architecture of the changed files. Focus on:");
  sections.push("- Are responsibilities properly separated?");
  sections.push("- Are the right abstractions being used?");
  sections.push("- Is there tight coupling that should be avoided?");
  sections.push("- Are there better design patterns for this use case?");
  sections.push("");
  sections.push(
    "Provide specific, actionable feedback with file paths and line numbers."
  );

  return sections.join("\n");
}

/**
 * Build security review prompt
 */
function buildSecurityPrompt(reviewData: ReviewData): string {
  const sections = ["# Security Review", "", "## Changed Files", ""];

  for (const file of reviewData.changedFiles) {
    sections.push(`### ${file.path}`);
    sections.push(`Changes: +${file.additions}/-${file.deletions}`);
    if (file.isCritical) {
      sections.push("⚠️ **CRITICAL FILE** - Extra security scrutiny required");
    }
    sections.push("");
    sections.push("**Code:**");
    sections.push("```typescript");
    sections.push(file.content.split("\n").slice(0, 100).join("\n"));
    if (file.content.split("\n").length > 100) {
      sections.push("... (truncated)");
    }
    sections.push("```");
    sections.push("");
  }

  sections.push("## Your Task");
  sections.push("Review for security vulnerabilities:");
  sections.push("- Input validation missing?");
  sections.push("- Authentication/authorization bypasses?");
  sections.push("- Data exposure risks?");
  sections.push("- Injection vulnerabilities (SQL, XSS, etc.)?");
  sections.push("- Insecure cryptography or secrets handling?");
  sections.push("");
  sections.push(
    'If you cannot determine security with the given context, state "Insufficient context".'
  );

  return sections.join("\n");
}

/**
 * Build maintainability review prompt
 */
function buildMaintainabilityPrompt(reviewData: ReviewData): string {
  const sections = ["# Maintainability Review", "", "## Changed Files", ""];

  for (const file of reviewData.changedFiles) {
    sections.push(`### ${file.path}`);
    sections.push(`Changes: +${file.additions}/-${file.deletions}`);
    sections.push("");
    sections.push("**Code:**");
    sections.push("```typescript");
    sections.push(file.content.split("\n").slice(0, 100).join("\n"));
    if (file.content.split("\n").length > 100) {
      sections.push("... (truncated)");
    }
    sections.push("```");
    sections.push("");
  }

  sections.push("## Your Task");
  sections.push("Review code quality and maintainability:");
  sections.push("- Are functions too long or complex?");
  sections.push("- Is there code duplication?");
  sections.push("- Are variable/function names clear?");
  sections.push("- Is error handling sufficient?");
  sections.push("- Is the code testable?");
  sections.push("- Would this be easy for another developer to understand?");

  return sections.join("\n");
}

/**
 * Parse AI response into structured comments
 * Expected format: FILE:LINE_START-LINE_END | SEVERITY | MESSAGE
 */
function parseReviewResponse(
  response: string,
  category: ReviewCategory
): CategoryComment[] {
  const comments: CategoryComment[] = [];
  const lines = response.split("\n");

  for (const line of lines) {
    // Look for pattern: path/to/file.ts:10-20 | warning | Message here
    const match = line.match(
      /^(.+?):(\d+)-(\d+)\s*\|\s*(info|warning|critical)\s*\|\s*(.+)$/
    );

    if (match) {
      const [, filePath, startLine, endLine, severity, message] = match;

      comments.push({
        file_path: filePath.trim(),
        line_start: parseInt(startLine, 10),
        line_end: parseInt(endLine, 10),
        severity: severity as CommentSeverity,
        message: message.trim(),
        reasoning: `AI ${category} review`,
      });
    }
  }

  return comments;
}

/**
 * Extract overall assessment from response
 */
function extractOverallAssessment(response: string): string {
  // Look for summary section or take first paragraph
  const lines = response.split("\n");
  const summaryIndex = lines.findIndex(
    (l) =>
      l.toLowerCase().includes("summary") || l.toLowerCase().includes("overall")
  );

  if (summaryIndex >= 0) {
    return lines.slice(summaryIndex, summaryIndex + 5).join("\n");
  }

  // Return first non-empty paragraph
  return lines
    .slice(0, 3)
    .filter((l) => l.trim())
    .join("\n");
}
