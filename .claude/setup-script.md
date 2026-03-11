# Agent Validation Setup Script

---

## Phase 1: Welcome + Preflight

ACTION: Silently run `which cs` to verify the cs CLI is installed. If not found, tell the user:
"You'll need the Crafting Sandbox CLI (`cs`) to continue. Install it from https://www.crafting.dev/ and come back when it's ready."
Then STOP and wait.

ACTION: Silently run `cs secret list` and check if `anthropic-api-key` appears in the output. Store the result — do NOT try to read the secret value.

[If anthropic-api-key secret is missing]

Before we get started, you'll need an Anthropic API key stored as a Crafting secret. The validation sandboxes use it to run Claude.

1. Grab your API key from https://console.anthropic.com/settings/keys
2. In a **separate terminal**, run:

```
echo "YOUR_API_KEY" | cs secret create anthropic-api-key -f -
```

**Do not paste your API key here** — always use a separate terminal for secrets.

STOP: Let me know once you've stored the secret.

USER: Confirms the secret is stored.

ACTION: Silently run `cs secret list` again to verify `anthropic-api-key` now exists. If it still doesn't appear, let the user know and STOP again.

[End condition]

Display the welcome message:

**Welcome to the Agent Validation Demo setup.**

This project tests a multi-agent customer support system built with MCP (Model Context Protocol). Here's what it does:

- A **meta-agent** plays the role of a customer, following a scripted shopping scenario
- A **customer support agent** handles the conversation, backed by an e-commerce API with real product data and order management
- A **grader** evaluates the support agent's performance across six criteria: tone, accuracy, efficiency, completeness, context retention, and error handling

The launcher script (`agent-launcher/launch.sh`) automates the entire process:

1. Creates sandboxes in parallel — each with its own app server, MCP servers, and MySQL database
2. Deploys code and installs dependencies
3. Runs the customer simulation in each sandbox
4. Grades each session and collects the results
5. Cleans up all sandboxes
6. Prints aggregate scores to the terminal and saves them to `agent-launcher/results/aggregate-results.json`

Each sandbox runs independently, so you get multiple data points on agent performance in a single run.

---

## Phase 2: Sandbox Count

How many validation sandboxes would you like to run?

1. **1** — Quick single run
2. **2** — Default, good balance of speed and data (recommended)
3. **3** — More data points
4. **4** — Thorough testing
5. **5** — Maximum coverage

STOP: Pick a number (1–5).

USER: Provides a number between 1 and 5.

[If the user provides a number greater than 5]
The max for this demo is 5. Pick a number from 1 to 5.
STOP: Pick a number (1–5).
USER: Provides a valid number.
[End condition]

[If the user provides a number less than 1 or non-numeric]
Please pick a number from 1 to 5.
STOP: Pick a number (1–5).
USER: Provides a valid number.
[End condition]

Store the selected number as SANDBOX_COUNT.

---

## Phase 3: Run It

Here's your command:

```
bash agent-launcher/launch.sh SANDBOX_COUNT
```

(Replace SANDBOX_COUNT with the actual number the user chose.)

**What to expect:**

- **Sandbox creation** (~1–2 min) — SANDBOX_COUNT sandboxes spin up in parallel, each with an app workspace, API workspace, and MySQL database.
- **Deployment + testing** (the long part, up to ~10 min per sandbox) — Code gets deployed, dependencies installed, the API server starts, and the full customer simulation runs followed by grading.
- **Results** — Once complete, you'll see per-sandbox scores and an aggregate average printed to the terminal. Detailed results are saved to `agent-launcher/results/`.

If anything goes wrong, check the sandbox logs at `/tmp/ar-*.log`.

STOP: Want me to run it for you?

USER: Yes or no.

[If yes]
ACTION: Run `bash agent-launcher/launch.sh SANDBOX_COUNT` (with the actual number). Let the user know it's running and that it will take several minutes. Stream or summarize the output as it completes.
[End if]

[If no]
No problem — you're all set. Run the command above whenever you're ready.
[End if]

---

## Important Notes for Claude

- The `cs secret list` output format may vary. Look for `anthropic-api-key` anywhere in the output, as a substring match.
- When running `launch.sh`, use the repo-relative path `agent-launcher/launch.sh`. Make sure the working directory is the repo root.
- The script may take 5–15 minutes depending on sandbox count. Do not timeout prematurely.
- If the user asks about timeout, the default is 600 seconds (10 min) per sandbox. They can pass a second argument: `bash agent-launcher/launch.sh N TIMEOUT_SECONDS`.

## Success Criteria

- [ ] `cs` CLI is available
- [ ] `anthropic-api-key` secret exists in Crafting
- [ ] User has chosen a sandbox count (1–5)
- [ ] User has either run `launch.sh` or has the command ready to run
