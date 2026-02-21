import type {
  AgentRole,
  Challenge,
  MatchStatus,
  MatchScores,
  AgentInfo,
  ServerToAgentMessage,
  ServerToSpectatorMessage,
  AgentCommand,
} from "@clawclawbyte/shared";
import { WebSocket } from "ws";
import {
  createSandbox,
  destroyMatchSandboxes,
  execInSandbox,
  writeFileInSandbox,
  getSandbox,
} from "./sandbox.js";
import { loadChallenge } from "./challenges.js";

export interface Match {
  id: string;
  status: MatchStatus;
  challenge: Challenge;
  startTime?: number;
  agents: Map<AgentRole, AgentConnection>;
  spectators: Set<WebSocket>;
  scores: MatchScores;
  commandCounts: { "agent-a": number; "agent-b": number };
}

export interface AgentConnection {
  ws: WebSocket;
  id: string;
  role: AgentRole;
  testsPassed: number;
  testsFailed: number;
  submitted: boolean;
  submitTime?: number;
}

const matches = new Map<string, Match>();

// Create a new match
export async function createMatch(matchId: string): Promise<Match> {
  const challenge = await loadChallenge("fibonacci");

  const match: Match = {
    id: matchId,
    status: "waiting",
    challenge,
    agents: new Map(),
    spectators: new Set(),
    scores: {
      "agent-a": { testsPassed: 0, timeElapsed: 0, commandsUsed: 0 },
      "agent-b": { testsPassed: 0, timeElapsed: 0, commandsUsed: 0 },
    },
    commandCounts: { "agent-a": 0, "agent-b": 0 },
  };

  matches.set(matchId, match);
  return match;
}

// Get a match by ID
export function getMatch(matchId: string): Match | undefined {
  return matches.get(matchId);
}

// Join an agent to a match
export async function joinAgent(
  matchId: string,
  agentId: string,
  ws: WebSocket
): Promise<AgentRole | null> {
  let match = matches.get(matchId);

  if (!match) {
    match = await createMatch(matchId);
  }

  if (match.status !== "waiting") {
    sendToAgent(ws, { type: "error", message: "Match already started" });
    return null;
  }

  // Assign role
  let role: AgentRole;
  if (!match.agents.has("agent-a")) {
    role = "agent-a";
  } else if (!match.agents.has("agent-b")) {
    role = "agent-b";
  } else {
    sendToAgent(ws, { type: "error", message: "Match is full" });
    return null;
  }

  const connection: AgentConnection = {
    ws,
    id: agentId,
    role,
    testsPassed: 0,
    testsFailed: 0,
    submitted: false,
  };

  match.agents.set(role, connection);

  // Create sandbox for this agent
  await createSandbox(matchId, role);

  // Send connected message
  sendToAgent(ws, { type: "connected", role, matchId });

  // Notify spectators
  broadcastToSpectators(match, {
    type: "match_state",
    status: match.status,
    agents: getAgentInfos(match),
  });

  // If both agents connected, start the match
  if (match.agents.size === 2) {
    await startMatch(match);
  }

  return role;
}

// Start a match
async function startMatch(match: Match): Promise<void> {
  match.status = "running";
  match.startTime = Date.now();

  // Write starter code to both sandboxes
  for (const [role] of match.agents) {
    const sandbox = getSandbox(match.id, role);
    if (sandbox) {
      await writeFileInSandbox(
        sandbox,
        "solution.py",
        match.challenge.starterCode
      );
    }
  }

  // Send challenge to both agents
  for (const [, agent] of match.agents) {
    sendToAgent(agent.ws, {
      type: "match_start",
      challenge: match.challenge,
    });
  }

  // Notify spectators
  broadcastToSpectators(match, {
    type: "match_state",
    status: match.status,
    agents: getAgentInfos(match),
  });

  // Set timeout for match
  setTimeout(() => {
    if (match.status === "running") {
      endMatch(match).catch(console.error);
    }
  }, match.challenge.timeLimit * 1000);
}

// Handle agent command
export async function handleAgentCommand(
  matchId: string,
  role: AgentRole,
  command: AgentCommand
): Promise<void> {
  const match = matches.get(matchId);
  if (!match || match.status !== "running") return;

  const agent = match.agents.get(role);
  if (!agent || agent.submitted) return;

  const sandbox = getSandbox(matchId, role);
  if (!sandbox) return;

  match.commandCounts[role]++;

  // Broadcast command to spectators
  broadcastToSpectators(match, {
    type: "agent_command",
    agent: role,
    command,
    timestamp: Date.now(),
  });

  let output = "";
  let exitCode = 0;

  switch (command.type) {
    case "write_file": {
      const result = await writeFileInSandbox(
        sandbox,
        command.path,
        command.content
      );
      output = result.output || "File written successfully";
      exitCode = result.exitCode;
      break;
    }

    case "run_command": {
      const result = await execInSandbox(sandbox, command.command);
      output = result.output;
      exitCode = result.exitCode;
      break;
    }

    case "run_tests": {
      const result = await execInSandbox(sandbox, match.challenge.testCommand);
      output = result.output;
      exitCode = result.exitCode;

      // Parse test results (simple grep for pass/fail)
      const passMatches = output.match(/(\d+) passed/);
      const failMatches = output.match(/(\d+) failed/);
      const passed = passMatches ? parseInt(passMatches[1], 10) : 0;
      const failed = failMatches ? parseInt(failMatches[1], 10) : 0;

      agent.testsPassed = passed;
      agent.testsFailed = failed;

      sendToAgent(agent.ws, {
        type: "test_result",
        passed,
        failed,
        output,
      });

      // Update spectators with new test counts
      broadcastToSpectators(match, {
        type: "match_state",
        status: match.status,
        agents: getAgentInfos(match),
      });

      break;
    }

    case "submit": {
      agent.submitted = true;
      agent.submitTime = Date.now();

      // Run final tests
      const result = await execInSandbox(sandbox, match.challenge.testCommand);
      const passMatches = result.output.match(/(\d+) passed/);
      const failMatches = result.output.match(/(\d+) failed/);
      agent.testsPassed = passMatches ? parseInt(passMatches[1], 10) : 0;
      agent.testsFailed = failMatches ? parseInt(failMatches[1], 10) : 0;

      output = `Submitted! Tests: ${agent.testsPassed} passed, ${agent.testsFailed} failed`;
      exitCode = 0;

      // Check if both agents submitted
      const allSubmitted = Array.from(match.agents.values()).every(
        (a) => a.submitted
      );
      if (allSubmitted) {
        await endMatch(match);
      }
      break;
    }
  }

  // Send output back to agent
  sendToAgent(agent.ws, { type: "command_output", output, exitCode });

  // Broadcast terminal output to spectators
  broadcastToSpectators(match, {
    type: "terminal_output",
    agent: role,
    output,
    timestamp: Date.now(),
  });
}

// End a match
async function endMatch(match: Match): Promise<void> {
  match.status = "scoring";

  // Calculate scores
  for (const [role, agent] of match.agents) {
    match.scores[role] = {
      testsPassed: agent.testsPassed,
      timeElapsed: agent.submitTime
        ? agent.submitTime - (match.startTime || 0)
        : match.challenge.timeLimit * 1000,
      commandsUsed: match.commandCounts[role],
    };
  }

  // Determine winner
  const scoreA = match.scores["agent-a"];
  const scoreB = match.scores["agent-b"];

  let winner: AgentRole | "draw";
  if (scoreA.testsPassed > scoreB.testsPassed) {
    winner = "agent-a";
  } else if (scoreB.testsPassed > scoreA.testsPassed) {
    winner = "agent-b";
  } else if (scoreA.timeElapsed < scoreB.timeElapsed) {
    winner = "agent-a";
  } else if (scoreB.timeElapsed < scoreA.timeElapsed) {
    winner = "agent-b";
  } else {
    winner = "draw";
  }

  match.status = "complete";

  // Notify agents
  for (const [, agent] of match.agents) {
    sendToAgent(agent.ws, {
      type: "match_end",
      winner,
      scores: match.scores,
    });
  }

  // Notify spectators
  broadcastToSpectators(match, {
    type: "match_end",
    winner,
    scores: match.scores,
  });

  // Cleanup
  await destroyMatchSandboxes(match.id);
}

// Subscribe a spectator
export function subscribeSpectator(matchId: string, ws: WebSocket): void {
  const match = matches.get(matchId);
  if (!match) {
    ws.send(JSON.stringify({ type: "error", message: "Match not found" }));
    return;
  }

  match.spectators.add(ws);

  // Send current state
  ws.send(
    JSON.stringify({
      type: "match_state",
      status: match.status,
      agents: getAgentInfos(match),
    } satisfies ServerToSpectatorMessage)
  );
}

// Remove spectator
export function unsubscribeSpectator(matchId: string, ws: WebSocket): void {
  const match = matches.get(matchId);
  if (match) {
    match.spectators.delete(ws);
  }
}

// Handle agent disconnect
export async function handleAgentDisconnect(
  matchId: string,
  role: AgentRole
): Promise<void> {
  const match = matches.get(matchId);
  if (!match) return;

  match.agents.delete(role);

  if (match.status === "running") {
    // Other agent wins by default
    const winner = role === "agent-a" ? "agent-b" : "agent-a";
    match.status = "complete";

    const otherAgent = match.agents.get(winner);
    if (otherAgent) {
      sendToAgent(otherAgent.ws, {
        type: "match_end",
        winner,
        scores: match.scores,
      });
    }

    broadcastToSpectators(match, {
      type: "match_end",
      winner,
      scores: match.scores,
    });

    await destroyMatchSandboxes(matchId);
  }

  // Update spectators
  broadcastToSpectators(match, {
    type: "match_state",
    status: match.status,
    agents: getAgentInfos(match),
  });
}

// Helper functions
function sendToAgent(ws: WebSocket, message: ServerToAgentMessage): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
  }
}

function broadcastToSpectators(
  match: Match,
  message: ServerToSpectatorMessage
): void {
  const data = JSON.stringify(message);
  for (const ws of match.spectators) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(data);
    }
  }
}

function getAgentInfos(match: Match): AgentInfo[] {
  const infos: AgentInfo[] = [];

  for (const role of ["agent-a", "agent-b"] as AgentRole[]) {
    const agent = match.agents.get(role);
    infos.push({
      role,
      id: agent?.id ?? "",
      connected: !!agent,
      testsPassed: agent?.testsPassed ?? 0,
      testsFailed: agent?.testsFailed ?? 0,
    });
  }

  return infos;
}
