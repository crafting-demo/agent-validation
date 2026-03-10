import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { spawn } from "child_process";
import { randomUUID } from "crypto";
import { resolve } from "path";
import { readFileSync, writeFileSync, existsSync } from "fs";

const CLAUDE_BIN = process.env.CLAUDE_BIN || "/root/.bun/bin/claude";
const ECOMMERCE_MCP_DIR =
  process.env.ECOMMERCE_MCP_DIR || "/home/owner/ecommerce-mcp";
const WORKING_DIR = process.env.WORKING_DIR || "/";

// Persist session map to disk so it survives MCP server restarts
const SESSION_MAP_PATH =
  process.env.SESSION_MAP_PATH || "/home/owner/.customer-support-sessions.json";

function loadSessionMap(): Map<string, string> {
  try {
    if (existsSync(SESSION_MAP_PATH)) {
      const data = JSON.parse(readFileSync(SESSION_MAP_PATH, "utf-8"));
      return new Map(Object.entries(data));
    }
  } catch {}
  return new Map();
}

function saveSessionMap(map: Map<string, string>) {
  writeFileSync(
    SESSION_MAP_PATH,
    JSON.stringify(Object.fromEntries(map)),
    "utf-8"
  );
}

const sessionMap = loadSessionMap();

const SUPPORT_SYSTEM_PROMPT = `You are a friendly and helpful customer support agent for an e-commerce store.
You have access to tools that let you look up products, customers, and orders.
You can also create orders, update order statuses, and manage customer information.

When helping customers:
- Be polite and professional
- Look up relevant information before answering
- Confirm details with the customer before making changes
- Provide order totals and status updates clearly
- If you don't have enough information, ask clarifying questions via your response

You are having an ongoing conversation with the customer. Remember context from previous messages in this session.`;

// MCP config for the sub-agent
const mcpConfig = JSON.stringify({
  mcpServers: {
    "ecommerce-api": {
      type: "stdio",
      command: "bun",
      args: ["run", resolve(ECOMMERCE_MCP_DIR, "src/index.ts")],
    },
  },
});

const ALLOWED_TOOLS = [
  "mcp__ecommerce-api__health_check",
  "mcp__ecommerce-api__list_products",
  "mcp__ecommerce-api__get_product",
  "mcp__ecommerce-api__create_product",
  "mcp__ecommerce-api__update_product",
  "mcp__ecommerce-api__delete_product",
  "mcp__ecommerce-api__list_customers",
  "mcp__ecommerce-api__get_customer",
  "mcp__ecommerce-api__create_customer",
  "mcp__ecommerce-api__update_customer",
  "mcp__ecommerce-api__delete_customer",
  "mcp__ecommerce-api__list_orders",
  "mcp__ecommerce-api__get_order",
  "mcp__ecommerce-api__create_order",
  "mcp__ecommerce-api__update_order_status",
  "mcp__ecommerce-api__delete_order",
];

function runClaude(
  message: string,
  sessionId: string,
  isResume: boolean
): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    const args = [
      "-p",
      "--dangerously-skip-permissions",
      ...(isResume
        ? ["--resume", sessionId]
        : ["--session-id", sessionId]),
      "--system-prompt", SUPPORT_SYSTEM_PROMPT,
      "--mcp-config", mcpConfig,
      "--strict-mcp-config",
      "--allowedTools", ...ALLOWED_TOOLS,
      "--model", "sonnet",
    ];

    const proc = spawn(CLAUDE_BIN, args, {
      cwd: WORKING_DIR,
      env: {
        ...process.env,
        HOME: "/home/owner",
        PATH: `/root/.bun/bin:${process.env.PATH}`,
      },
      stdio: ["pipe", "pipe", "pipe"],
    });

    // Send the message via stdin to avoid shell argument parsing issues
    proc.stdin.write(message);
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
        reject(
          new Error(`claude exited with code ${code}: ${stderr}`)
        );
      } else {
        resolvePromise(stdout.trim());
      }
    });

    proc.on("error", (err: Error) => {
      reject(err);
    });
  });
}

const server = new McpServer({
  name: "customer-support-agent",
  version: "1.0.0",
});

server.tool(
  "support_chat",
  "Send a message to the customer support agent. The agent has access to the e-commerce store and can look up products, customers, orders, create orders, etc. Use a consistent session_key across related messages to maintain conversation context.",
  {
    message: z.string().describe("The customer's message or request"),
    session_key: z
      .string()
      .describe(
        "A stable key to identify this conversation session. Use the same key for follow-up messages to maintain context with the support agent."
      ),
  },
  async ({ message, session_key }) => {
    let sessionId = sessionMap.get(session_key);
    const isResume = sessionId !== undefined;
    if (!sessionId) {
      sessionId = randomUUID();
      sessionMap.set(session_key, sessionId);
      saveSessionMap(sessionMap);
    }

    try {
      const response = await runClaude(message, sessionId, isResume);
      return {
        content: [
          {
            type: "text",
            text: response,
          },
        ],
      };
    } catch (err: any) {
      return {
        content: [
          {
            type: "text",
            text: `Error from support agent: ${err.message}`,
          },
        ],
        isError: true,
      };
    }
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
