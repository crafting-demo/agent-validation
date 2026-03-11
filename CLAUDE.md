# Agent Validation Demo

Multi-agent validation system using MCP (Model Context Protocol) for e-commerce customer support. Simulates customer interactions, then grades agent performance.

## Key Paths

- `agent-runtime/sandbox.yaml` — Crafting Sandbox definition (app + api workspaces, MySQL)
- `agent-runtime/ecommerce-api/` — Bun + Hono REST API with MySQL
- `agent-runtime/ecommerce-mcp/` — MCP server wrapping the REST API (16 tools)
- `agent-runtime/customer-support-agent-mcp/` — Session-aware customer support agent MCP
- `agent-runtime/prompts/` — System prompts for support agent, customer simulation, and grader
- `agent-launcher/launch.sh` — Multi-sandbox orchestration script
- `agent-launcher/results/` — Grade outputs and aggregate results

## Slash Commands

- `/setup` — Guided setup wizard for running agent validation on Crafting Sandbox
