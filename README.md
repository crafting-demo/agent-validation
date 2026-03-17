# Agent Validation Demo

A demo project showcasing how Crafting can be used to evaluate agents using multiple parallel runs inside of sandboxes.

## Demo Video
<div>
    <a href="https://www.loom.com/share/c548c766916f4ecebdfb997d55ab5fa0">
      <p>Agent Evals in Crafting - Watch Video</p>
    </a>
    <a href="https://www.loom.com/share/c548c766916f4ecebdfb997d55ab5fa0">
      <img style="max-width:300px;" src="https://cdn.loom.com/sessions/thumbnails/c548c766916f4ecebdfb997d55ab5fa0-a6a9b2300d59a6c0-full-play.gif#t=0.1">
    </a>
  </div>

## Single command setup in Claude Code

The easiest way to get this running is a single command. It clones the repo and launches an interactive setup wizard that walks you through everything.

**Prerequisites:** [Crafting Sandbox CLI (`cs`)](https://www.crafting.dev/) and [Claude Code](https://docs.anthropic.com/en/docs/claude-code) installed.

```bash
git clone https://github.com/crafting-demo/agent-validation.git && cd agent-validation
```

Then launch Claude Code and run the setup wizard:

```bash
cs claude
```

```
/setup
```

The wizard will:
- Verify your Crafting secrets are configured
- Let you choose how many parallel validation sandboxes to run (1–5)
- Launch the full test suite — sandbox creation, deployment, customer simulation, grading, and cleanup
- Print aggregate agent performance scores when done

## Architecture

```
Meta-Agent (Claude CLI)
  └── Customer Support Agent MCP (stdio)
        └── Sub-Agent (Claude CLI with session persistence)
              └── E-Commerce API MCP (stdio)
                    └── REST API (Bun + Hono)
                          └── MySQL
```

## Components

### 1. `ecommerce-api/` — REST API Server
A Bun + Hono REST API backed by MySQL with full CRUD for:
- **Products** — `/api/products`
- **Customers** — `/api/customers`
- **Orders** — `/api/orders` (with stock validation and transactional creation)

Includes seed data with 10 products and 3 customers.

### 2. `ecommerce-mcp/` — E-Commerce API MCP Server
An MCP server (stdio transport) that wraps the REST API into 16 tools:
- Product management (list, get, create, update, delete)
- Customer management (list, get, create, update, delete)
- Order management (list, get, create, update status, delete)
- Health check

### 3. `customer-support-agent-mcp/` — Customer Support Agent MCP
An MCP server that wraps a Claude sub-agent specialized in customer support. Features:
- **Session persistence** — Maintains conversation context across calls using `session_key`
- **Disk-backed session map** — Session mappings survive MCP server restarts
- **Sub-agent orchestration** — Spawns `claude -p` with the e-commerce MCP tools

## Sandbox Setup

This project runs in a Crafting Sandbox with:
- **`app` workspace** — Hosts both MCP servers, Claude CLI (meta-agent)
- **`api` workspace** — Hosts the REST API server on port 3000
- **`mysql` dependency** — MySQL 8 with `ecommerce_db` database

### Environment Variables
- `ANTHROPIC_API_KEY` — Required for Claude CLI (mapped from `anthropic-api-key` secret)

## Manual Setup

### Start the API server (on `api` workspace):
```bash
cd ~/ecommerce-api
bun install
bun run start
```

### Install MCP dependencies (on `app` workspace):
```bash
cd ~/ecommerce-mcp && bun install
cd ~/customer-support-agent-mcp && bun install
```

### Configure Claude CLI with the Customer Support Agent MCP:
```bash
claude mcp add customer-support-agent -- bun run ~/customer-support-agent-mcp/src/index.ts
```

### Test with a headless Claude command:
```bash
echo "Ask the support agent what products are available. Use session_key test-session." \
  | claude -p --dangerously-skip-permissions --model sonnet \
    --allowedTools mcp__customer-support-agent__support_chat
```
