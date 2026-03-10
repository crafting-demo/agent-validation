# Agent Validation Demo

A demo project showcasing a multi-agent architecture using MCP (Model Context Protocol) for e-commerce customer support.

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

## Quick Start

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
