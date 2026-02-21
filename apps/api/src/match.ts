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

export interface TerminalEvent {
  type: "terminal_output" | "agent_command";
  agent: AgentRole;
  output?: string;
  command?: AgentCommand;
  timestamp: number;
}

export interface Match {
  id: string;
  status: MatchStatus;
  challenge: Challenge;
  startTime?: number;
  agents: Map<AgentRole, AgentConnection>;
  spectators: Set<WebSocket>;
  scores: MatchScores;
  commandCounts: { "agent-a": number; "agent-b": number };
  terminalHistory: TerminalEvent[];
  winner?: AgentRole | "draw";
}

export interface AgentConnection {
  ws: WebSocket;
  id: string;
  role: AgentRole;
  connected: boolean;
  testsPassed: number;
  testsFailed: number;
  submitted: boolean;
  submitTime?: number;
}

const matches = new Map<string, Match>();
const pendingSpectators = new Map<string, Set<WebSocket>>();

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
    terminalHistory: [],
  };

  matches.set(matchId, match);

  // Attach any spectators that subscribed before the match was created
  const pending = pendingSpectators.get(matchId);
  if (pending) {
    for (const ws of pending) {
      if (ws.readyState === WebSocket.OPEN) {
        match.spectators.add(ws);
        ws.send(JSON.stringify({
          type: "match_state",
          status: match.status,
          agents: getAgentInfos(match),
        } satisfies ServerToSpectatorMessage));
      }
    }
    pendingSpectators.delete(matchId);
  }

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
  const agentA = match.agents.get("agent-a");
  const agentB = match.agents.get("agent-b");
  if (!agentA || !agentA.connected) {
    role = "agent-a";
  } else if (!agentB || !agentB.connected) {
    role = "agent-b";
  } else {
    sendToAgent(ws, { type: "error", message: "Match is full" });
    return null;
  }

  const connection: AgentConnection = {
    ws,
    id: agentId,
    role,
    connected: true,
    testsPassed: 0,
    testsFailed: 0,
    submitted: false,
  };

  match.agents.set(role, connection);

  // Create sandbox for this agent
  try {
    await createSandbox(matchId, role);
  } catch (err) {
    match.agents.delete(role);
    sendToAgent(ws, { type: "error", message: `Failed to create sandbox: ${String(err)}` });
    return null;
  }

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

  const commandTimestamp = Date.now();

  // Store in history and broadcast to spectators
  match.terminalHistory.push({ type: "agent_command", agent: role, command, timestamp: commandTimestamp });
  broadcastToSpectators(match, {
    type: "agent_command",
    agent: role,
    command,
    timestamp: commandTimestamp,
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

  // Store in history and broadcast terminal output to spectators
  const outputTimestamp = Date.now();
  match.terminalHistory.push({ type: "terminal_output", agent: role, output, timestamp: outputTimestamp });
  broadcastToSpectators(match, {
    type: "terminal_output",
    agent: role,
    output,
    timestamp: outputTimestamp,
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
  match.winner = winner;

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
    // Match doesn't exist yet — hold this spectator until it's created
    if (!pendingSpectators.has(matchId)) {
      pendingSpectators.set(matchId, new Set());
    }
    pendingSpectators.get(matchId)!.add(ws);

    // Clean up if this spectator disconnects while pending
    ws.once("close", () => {
      pendingSpectators.get(matchId)?.delete(ws);
    });
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

  // Replay terminal history for late-joining spectators
  for (const event of match.terminalHistory) {
    if (event.type === "terminal_output") {
      ws.send(JSON.stringify({
        type: "terminal_output",
        agent: event.agent,
        output: event.output ?? "",
        timestamp: event.timestamp,
      } satisfies ServerToSpectatorMessage));
    } else if (event.type === "agent_command") {
      ws.send(JSON.stringify({
        type: "agent_command",
        agent: event.agent,
        command: event.command!,
        timestamp: event.timestamp,
      } satisfies ServerToSpectatorMessage));
    }
  }

  // If match is already complete, send the final result
  if (match.status === "complete" && match.winner !== undefined) {
    ws.send(JSON.stringify({
      type: "match_end",
      winner: match.winner,
      scores: match.scores,
    } satisfies ServerToSpectatorMessage));
  }
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

  const agent = match.agents.get(role);
  if (agent) agent.connected = false;

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
      connected: agent?.connected ?? false,
      testsPassed: agent?.testsPassed ?? 0,
      testsFailed: agent?.testsFailed ?? 0,
    });
  }

  return infos;
}
