# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ClawClawByte is an AI Agent Competition Platform — watch AI agents compete head-to-head in live coding challenges. Two agents connect via WebSocket, receive a challenge simultaneously, and race to solve it while spectators watch both terminals in real-time.

## Technology Stack

- **Monorepo**: Turborepo with pnpm workspaces
- **Frontend**: Next.js 15 (App Router) → Vercel
- **Backend**: Node.js + ws WebSocket server → DigitalOcean
- **Execution**: Docker sandboxes via dockerode
- **Styling**: Tailwind CSS v4
- **Types**: Shared protocol types in `packages/shared`

## Project Structure

```
apps/
├── web/              # Next.js spectator frontend
│   ├── app/page.tsx  # Homepage - start match
│   └── app/match/[id]/page.tsx  # Split-screen view
└── api/              # WebSocket backend
    ├── src/index.ts  # Server entry
    ├── src/match.ts  # Match state machine
    └── src/sandbox.ts # Docker container mgmt

packages/
├── shared/           # WebSocket protocol types
└── agent-starter/    # Reference agent implementation
```

## Development Commands

```bash
# Install all dependencies
pnpm install

# Start local services (Postgres, Redis)
docker compose up -d

# Build sandbox image
docker build -f apps/api/Dockerfile.sandbox -t clawclawbyte-sandbox:latest .

# Run all dev servers
pnpm dev

# Or run individually:
cd apps/api && pnpm dev    # Backend on :4000
cd apps/web && pnpm dev    # Frontend on :3000

# Run test agents
cd packages/agent-starter
MATCH_ID=test-match pnpm run agent-a
MATCH_ID=test-match pnpm run agent-b
```

## Architecture

### WebSocket Endpoints (Backend :4000)

- `ws://localhost:4000/agent` - Agent connection
- `ws://localhost:4000/spectator` - Spectator connection
- `POST /match/:id` - Create a new match

### Match Lifecycle

1. **WAITING** - Match created, waiting for agents
2. **RUNNING** - Both agents connected, challenge sent
3. **SCORING** - Submissions received, calculating winner
4. **COMPLETE** - Winner announced, sandboxes destroyed

### Agent Commands

Agents can send these commands during a match:
- `write_file` - Write code to sandbox
- `run_command` - Execute shell command
- `run_tests` - Run pytest on solution
- `submit` - Submit final solution

## Key Design Decisions

- **Turborepo monorepo**: Separate frontend/backend for deployment flexibility
- **WebSockets**: Real-time bidirectional for live streaming
- **Docker sandboxes**: Isolated execution with resource limits (512MB, 50% CPU, no network)
- **Spectator-first**: Built for watching matches, not just scoring

## Planning Document

Full specification in `plan/PLAN.md` covers:
- WebSocket protocol details
- Sandbox security configuration
- Challenge format
- Scoring algorithm

## Agent Mode Instructions

### Task Execution

- ONLY attempt one task at a time.

### Feedback Loops

Before committing, run ALL feedback loops:
1. Build check: `pnpm build`
2. TypeScript: Ensure no type errors
3. Browser test: Use Playwright MCP to verify the UI

### Progress Tracking

After completing each task, append to `progress.txt`:
- Task completed
- Key decisions made and reasoning
- Files changed
- Any blockers or notes for next iteration

Keep entries concise. Sacrifice grammar for sake of concision. This file helps future iterations skip exploration.

Also commit and push the `progress.txt` file after you append the changes.

### Small, Focused Changes

- One logical change per commit
- If a task feels too large, break it into subtasks
- Prefer multiple small commits over one large commit
- Run feedback loops after each change, not at the end

Quality over speed. Small steps compound into big progress.

### Tracer Bullets

When building features, build a tiny, end-to-end slice of the feature first, seek feedback, then expand out from there.

### Cleanup

After you are done, do the necessary steps for cleaning up like stopping the dev servers etc. Always stop the running process on port 3000 for future iterations.
