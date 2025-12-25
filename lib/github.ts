// GitHub integration utilities
import dotenv from "dotenv";
dotenv.config();

import { createHmac } from "crypto";
import { Octokit as RestOctokit } from "@octokit/rest";
import { timingSafeEqual } from "node:crypto";
import { createAppAuth } from "@octokit/auth-app";

// Environment validation
if (!process.env.GITHUB_APP_ID) {
  throw new Error("GITHUB_APP_ID is not set");
}
if (!process.env.GITHUB_APP_PRIVATE_KEY) {
  throw new Error("GITHUB_APP_PRIVATE_KEY is not set");
}
if (!process.env.GITHUB_WEBHOOK_SECRET) {
  throw new Error("GITHUB_WEBHOOK_SECRET is not set");
}

// Lazy load GitHub App to avoid module resolution issues
let _githubApp: any = null;
export const getGithubApp = async () => {
  if (!_githubApp) {
    const { App } = await import("@octokit/app");
    _githubApp = new App({
      appId: process.env.GITHUB_APP_ID!,
      privateKey: process.env.GITHUB_APP_PRIVATE_KEY!.replace(/\\n/g, "\n"),
    });
  }
  return _githubApp;
};

/**
 * Verify GitHub webhook signature
 * Critical for security - prevents webhook spoofing
 */
export function verifyGitHubWebhookSignature(
  payload: string,
  signature: string | null
): boolean {
  if (!signature) {
    return false;
  }

  const secret = process.env.GITHUB_WEBHOOK_SECRET!;
  const hmac = createHmac("sha256", secret);
  const digest = "sha256=" + hmac.update(payload).digest("hex");

  // Timing-safe comparison
  try {
    return timingSafeEqual(Buffer.from(signature), Buffer.from(digest));
  } catch {
    return false;
  }
}

/**
 * Get Octokit instance for a specific installation
 */
export async function getOctokitForInstallation(
  installationId: number
): Promise<RestOctokit> {
  const appId = Number(process.env.GITHUB_APP_ID);
  const privateKey = process.env.GITHUB_APP_PRIVATE_KEY;
  if (!appId || !privateKey) {
    throw new Error("GITHUB_APP_ID and GITHUB_APP_PRIVATE_KEY must be set");
  }

  const auth = createAppAuth({
    appId,
    privateKey,
    installationId,
  });

  const installationAuth = await auth({ type: "installation" });
  const token = installationAuth.token;

  return new RestOctokit({ auth: token });
}

/**
 * Fetch PR diff and changed files
 */
export async function fetchPRDiff(
  octokit: RestOctokit,
  owner: string,
  repo: string,
  prNumber: number
) {
  try {
    // Get PR details
    const { data: pr } = await octokit.pulls.get({
      owner,
      repo,
      pull_number: prNumber,
    });

    // Get list of files changed
    const { data: files } = await octokit.pulls.listFiles({
      owner,
      repo,
      pull_number: prNumber,
      per_page: 100, // Max files to analyze
    });

    // Filter out files we don't want to review
    const ignoredPatterns = [
      /package-lock\.json$/,
      /pnpm-lock\.yaml$/,
      /yarn\.lock$/,
      /^dist\//,
      /^build\//,
      /\.min\.js$/,
      /\.map$/,
    ];

    const relevantFiles = files.filter((file) => {
      return !ignoredPatterns.some((pattern) => pattern.test(file.filename));
    });

    return {
      pr: {
        number: pr.number,
        title: pr.title,
        body: pr.body || "",
        base: pr.base.ref,
        head: pr.head.ref,
        sha: pr.head.sha,
        author: pr.user.login,
        html_url: pr.html_url,
      },
      files: relevantFiles.map((file) => ({
        path: file.filename,
        patch: file.patch || "",
        additions: file.additions,
        deletions: file.deletions,
        status: file.status as "added" | "modified" | "removed" | "renamed",
      })),
    };
  } catch (error) {
    console.error("Error fetching PR diff:", error);
    throw error;
  }
}

/**
 * Post review comment to GitHub PR
 */
export async function postReviewComment(
  octokit: RestOctokit,
  owner: string,
  repo: string,
  prNumber: number,
  body: string
): Promise<number> {
  try {
    const { data: comment } = await octokit.issues.createComment({
      owner,
      repo,
      issue_number: prNumber,
      body,
    });
    return comment.id;
  } catch (error) {
    console.error("Error posting review comment:", error);
    throw error;
  }
}

/**
 * Get file contents from repository
 */
export async function getFileContent(
  octokit: RestOctokit,
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
      return null; // File doesn't exist
    }
    throw error;
  }
}
