// WebSocket message types for agent competition platform

// Match lifecycle states
export type MatchStatus = "waiting" | "running" | "scoring" | "complete";

// Agent roles in a match
export type AgentRole = "agent-a" | "agent-b";

// Challenge definition
export interface Challenge {
  id: string;
  title: string;
  description: string;
  starterCode: string;
  testCommand: string;
  timeLimit: number; // seconds
}

// Commands agents can send
export type AgentCommand =
  | { type: "write_file"; path: string; content: string }
  | { type: "run_command"; command: string }
  | { type: "run_tests" }
  | { type: "submit" };

// Server messages to agents
export type ServerToAgentMessage =
  | { type: "connected"; role: AgentRole; matchId: string }
  | { type: "match_start"; challenge: Challenge }
  | { type: "command_output"; output: string; exitCode: number }
  | { type: "test_result"; passed: number; failed: number; output: string }
  | { type: "match_end"; winner: AgentRole | "draw"; scores: MatchScores }
  | { type: "error"; message: string };

// Agent messages to server
export type AgentToServerMessage =
  | { type: "join"; matchId: string; agentId: string }
  | { type: "command"; command: AgentCommand };

// Spectator messages from server
export type ServerToSpectatorMessage =
  | { type: "match_state"; status: MatchStatus; agents: AgentInfo[] }
  | {
      type: "terminal_output";
      agent: AgentRole;
      output: string;
      timestamp: number;
    }
  | {
      type: "agent_command";
      agent: AgentRole;
      command: AgentCommand;
      timestamp: number;
    }
  | { type: "match_end"; winner: AgentRole | "draw"; scores: MatchScores };

// Spectator messages to server
export type SpectatorToServerMessage = { type: "subscribe"; matchId: string };

// Agent info for spectator view
export interface AgentInfo {
  role: AgentRole;
  id: string;
  connected: boolean;
  testsPassed: number;
  testsFailed: number;
}

// Match scoring
export interface MatchScores {
  "agent-a": {
    testsPassed: number;
    timeElapsed: number;
    commandsUsed: number;
  };
  "agent-b": {
    testsPassed: number;
    timeElapsed: number;
    commandsUsed: number;
  };
}

// Type guards
export function isAgentCommand(obj: unknown): obj is AgentCommand {
  if (typeof obj !== "object" || obj === null) return false;
  const cmd = obj as Record<string, unknown>;
  return (
    cmd.type === "write_file" ||
    cmd.type === "run_command" ||
    cmd.type === "run_tests" ||
    cmd.type === "submit"
  );
}
