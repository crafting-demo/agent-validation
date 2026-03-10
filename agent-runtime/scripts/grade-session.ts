#!/usr/bin/env bun
/**
 * Grader script for customer support agent sessions.
 *
 * Usage:
 *   bun run scripts/grade-session.ts <path-to-session.jsonl> [output-path.json]
 *
 * If output-path is omitted, writes to <session-basename>.grade.json
 * in the same directory as the input file.
 */

import { readFileSync, writeFileSync } from "fs";
import { spawn } from "child_process";
import { resolve } from "path";

const CLAUDE_BIN = process.env.CLAUDE_BIN || "/root/.bun/bin/claude";
const PROJECT_ROOT =
  process.env.PROJECT_ROOT || "/home/owner/agent-validation";
const GRADER_PROMPT_PATH = resolve(
  PROJECT_ROOT,
  "prompts",
  "grader-system-prompt.md"
);

function usage() {
  console.error(
    "Usage: bun run scripts/grade-session.ts <session.jsonl> [output.json]"
  );
  process.exit(1);
}

const inputPath = process.argv[2];
if (!inputPath) usage();

const outputPath =
  process.argv[3] ||
  resolve(PROJECT_ROOT, "customer_support-output_grade.json");

// Read inputs
const sessionLog = readFileSync(inputPath, "utf-8");
const graderSystemPrompt = readFileSync(GRADER_PROMPT_PATH, "utf-8").trim();

// Build the user message: the session log itself
const userMessage = `Here is the full session log to grade:\n\n${sessionLog}`;

console.error(`Grading session: ${inputPath}`);
console.error(`Using grader prompt: ${GRADER_PROMPT_PATH}`);

// Run Claude as grader — no tools needed, just analysis
const args = [
  "-p",
  "--dangerously-skip-permissions",
  "--model", "sonnet",
  "--system-prompt", graderSystemPrompt,
];

const proc = spawn(CLAUDE_BIN, args, {
  cwd: "/",
  env: {
    ...process.env,
    HOME: "/home/owner",
    PATH: `/root/.bun/bin:${process.env.PATH}`,
  },
  stdio: ["pipe", "pipe", "pipe"],
});

proc.stdin.write(userMessage);
proc.stdin.end();

let stdout = "";
let stderr = "";

proc.stdout.on("data", (data: Buffer) => {
  stdout += data.toString();
});

proc.stderr.on("data", (data: Buffer) => {
  stderr += data.toString();
});

proc.on("close", (code: number | null) => {
  if (code !== 0 && !stdout.trim()) {
    console.error(`Grader failed (exit ${code}): ${stderr}`);
    process.exit(1);
  }

  const raw = stdout.trim();

  // Try to parse the JSON response — claude might wrap it in markdown fences
  let json: string;
  const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) {
    json = fenceMatch[1].trim();
  } else {
    json = raw;
  }

  try {
    const result = JSON.parse(json);

    // Add metadata
    result.metadata = {
      session_log: inputPath,
      graded_at: new Date().toISOString(),
      grader_prompt: GRADER_PROMPT_PATH,
    };

    const output = JSON.stringify(result, null, 2);
    writeFileSync(outputPath, output + "\n", "utf-8");
    console.log(output);
    console.error(`\nGrade written to: ${outputPath}`);
  } catch (e) {
    // If JSON parsing fails, dump the raw output and still write it
    console.error("Warning: could not parse grader output as JSON. Raw output:");
    console.log(raw);
    writeFileSync(outputPath, raw + "\n", "utf-8");
    console.error(`\nRaw output written to: ${outputPath}`);
    process.exit(1);
  }
});
