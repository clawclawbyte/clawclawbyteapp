---
name: clawclawbyte-team
description: >
  Use when you need expert guidance building ClawClawByte — the AI agent
  competition platform. Routes questions to specialists in Next.js, React,
  WebSocket/backend, or TypeScript who search the actual codebase and give
  grounded answers.
user-invocable: true
allowed-tools: Read, Task, Bash, Glob, Grep
---

# ClawClawByte Agent Team

Domain experts for the ClawClawByte stack. Ask a question, get an answer grounded in actual source code.

## Stack

- **Frontend** (`apps/web`): Next.js 15 App Router, React 19, Tailwind v4 → Vercel
- **Backend** (`apps/api`): Node.js + `ws` WebSocket server → DigitalOcean
- **Execution**: Docker sandboxes via `dockerode`
- **Shared types** (`packages/shared`): Protocol types consumed by frontend, backend, and agents
- **Agent reference** (`packages/agent-starter`): Reference agent implementation

## Team Members

| Expert | File | Use When |
|--------|------|----------|
| **Next.js Expert** | [members/nextjs-expert.md](members/nextjs-expert.md) | App Router, layouts, Server vs Client Components, routing, page structure, Vercel deployment |
| **React Expert** | [members/react-expert.md](members/react-expert.md) | Components, hooks, real-time state, `useMatchWebSocket`, `Terminal`, re-render patterns |
| **WebSocket Expert** | [members/websocket-expert.md](members/websocket-expert.md) | Match state machine, sandbox lifecycle, agent/spectator protocol, `ws` server |
| **TypeScript Expert** | [members/typescript-expert.md](members/typescript-expert.md) | Shared protocol types, strict mode, type guards, cross-package type safety |

## Routing Guide

| Question | Expert |
|----------|--------|
| "How should I structure the new page?" | Next.js |
| "Should this be a Server Component?" | Next.js |
| "How do I add a new route?" | Next.js |
| "How do I fix this hydration error?" | Next.js + React |
| "How do I manage this state?" | React |
| "Why is `useEffect` firing twice?" | React |
| "How do I optimize re-renders in the terminal?" | React |
| "How do I add a new agent command?" | WebSocket |
| "How does the match lifecycle work?" | WebSocket |
| "How do I extend the sandbox?" | WebSocket |
| "How do I type this new message?" | TypeScript |
| "Why is the shared type not resolving?" | TypeScript |

## Spawn Protocol

1. Pick the expert from the routing table.
2. Read the member definition:
   ```
   Read .claude/skills/clawclawbyte-team/members/{expert}.md
   ```
3. Spawn via Task tool:
   ```
   subagent_type: general-purpose
   prompt: {full member definition} + {question} + {relevant files to search}
   ```

Spawn two experts in parallel when a question crosses domains (e.g., "how do I type the new WebSocket message and consume it in the React hook?").

## Project Structure (reference for experts)

```
apps/
├── web/
│   ├── app/page.tsx                  # Homepage
│   ├── app/match/[id]/page.tsx       # Split-screen spectator view
│   ├── components/Terminal.tsx        # Per-agent terminal display
│   └── hooks/useMatchWebSocket.ts    # WebSocket state hook
└── api/
    ├── src/index.ts                  # HTTP + WS server entry
    ├── src/match.ts                  # Match state machine
    ├── src/sandbox.ts                # Docker container management
    ├── src/websocket.ts              # WS message routing
    └── src/challenges.ts             # Challenge loader

packages/
├── shared/src/protocol.ts            # All WebSocket message types
└── agent-starter/src/client.ts       # Reference agent WS client
```
