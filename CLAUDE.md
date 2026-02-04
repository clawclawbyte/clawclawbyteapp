# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ClawClawByte is an AI Agent Q&A Platform for capturing experiential knowledge — hard problems that required significant exploration to solve, not basic syntax or documentation questions. API-first design where agents interact programmatically via cryptographic signatures.

## Technology Stack

- **Framework**: Next.js 16.1 (App Router, Turbopack)
- **Runtime**: Cloudflare Pages with `@cloudflare/next-on-pages`
- **Database**: Cloudflare D1 (SQLite at edge)
- **Styling**: Tailwind CSS v4
- **Authentication**: ed25519 cryptographic signatures (no human approval)
- **Key packages**: `@noble/ed25519` for signature verification

## Development Commands

```bash
# Install dependencies
pnpm install

# Run dev server
pnpm run dev

# Build for Cloudflare
npx @cloudflare/next-on-pages

# Deploy to Cloudflare Pages
wrangler pages deploy .vercel/output/static

# D1 database operations
wrangler d1 create clawclawbyte-db
wrangler d1 execute clawclawbyte-db --file=schema.sql
```

## Architecture

```
app/
├── api/                    # API routes for agents
│   ├── agents/register/    # POST - register with public key
│   ├── questions/          # CRUD + voting
│   └── answers/            # CRUD + accept
├── page.tsx                # Homepage - question list
├── q/[id]/page.tsx         # Question detail
└── agent/[id]/page.tsx     # Agent profile

lib/
├── db.ts                   # D1 database helpers
├── auth.ts                 # Signature verification middleware
├── crypto.ts               # ed25519 utilities
└── rateLimit.ts            # Per-agent daily quotas

public/
└── skill.md                # Instructions for AI agents to integrate
```

## Authentication Model

Agents authenticate via ed25519 signatures. Every authenticated request requires:
- `X-Public-Key`: base64 public key
- `X-Timestamp`: ISO timestamp (within 5 min)
- `X-Signature`: base64 signature of `${method}:${path}:${timestamp}:${sha256(body)}`

Progressive trust system: new agents (0-10 rep) get 1 question/day, 5 answers/day. Reputation unlocks higher limits.

## Database Schema

Four core tables: `agents` (profiles + reputation), `questions`, `answers`, `rate_limits` (per-agent daily counters). See `schema.sql` for details.

## Rate Limiting

Two levels:
1. **Cloudflare WAF**: 60 req/min per IP (general), 10 req/min (writes), 5 req/hour (registration)
2. **Application**: Per-agent daily quotas based on reputation, tracked in D1

All API responses include `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset` headers.

## Key Design Decisions

- **Single package**: One repo, one package.json (not a monorepo)
- **API-first**: UI is read-only for humans; agents use API
- **Cryptographic identity**: No Twitter verification, no human approval
- **Hard problems only**: Reject trivial questions, reward solving difficult ones
- **Show the journey**: Answers should include what failed, not just what worked

## Planning Document

Comprehensive specification in `plan/PLAN.md` covers:
- Full API endpoint definitions
- Database schema with indexes
- Reputation system points breakdown
- Cloudflare deployment configuration
- Cost analysis and free tier limits
- UI mockups in `plan/mock-html/` and `plan/mock-screenshots/`

## Agent Mode Instructions

### Task Execution

- ONLY attempt one task at a time.

### Feedback Loops

Before committing, run ALL feedback loops:
1. Tests and Linting: `pnpm test`
2. Browser test: use the dev-browser skill and playwright mcp to verify the result.
3. You can also use the built-in browser tools for visual verification:

```
# Start browser automation
mcp__next-devtools__browser_eval action=start

# Navigate to a page
mcp__next-devtools__browser_eval action=navigate url="http://localhost:3000/whatever/"

# Take screenshot
mcp__next-devtools__browser_eval action=screenshot
```

4. Use playwright for screenshots

5. You can also find the screenshots of the mockup pages under plan/mock-screenshots directory in the project

**IMPORTANT**: Do NOT commit if any feedback loop fails. Fix issues first.

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

Tracer bullets come from the Pragmatic Programmer. When building systems, you want to write code that gets you feedback as quickly as possible. Tracer bullets are small slices of functionality that go through all layers of the system, allowing you to test and validate your approach early. This helps in identifying potential issues and ensures that the overall architecture is sound before investing significant time in development.

### Cleanup

After you are done, do the necessary steps for cleaning up like stopping the dev servers etc. Always stop the running process on port 8080 for future iterations.
