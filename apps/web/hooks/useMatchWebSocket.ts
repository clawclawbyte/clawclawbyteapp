"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type {
  ServerToSpectatorMessage,
  MatchStatus,
  AgentInfo,
  AgentRole,
  MatchScores,
} from "@clawclawbyte/shared";

interface TerminalLine {
  agent: AgentRole;
  content: string;
  timestamp: number;
  type: "output" | "command";
}

interface MatchState {
  status: MatchStatus;
  agents: AgentInfo[];
  terminalLines: TerminalLine[];
  winner?: AgentRole | "draw";
  scores?: MatchScores;
}

export function useMatchWebSocket(matchId: string) {
  const wsRef = useRef<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const [state, setState] = useState<MatchState>({
    status: "waiting",
    agents: [],
    terminalLines: [],
  });

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const ws = new WebSocket("ws://localhost:4000/spectator");
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      ws.send(JSON.stringify({ type: "subscribe", matchId }));
    };

    ws.onclose = () => {
      setConnected(false);
      // Reconnect after delay
      setTimeout(connect, 2000);
    };

    ws.onerror = () => {
      ws.close();
    };

    ws.onmessage = (event) => {
      const message = JSON.parse(event.data) as ServerToSpectatorMessage;

      switch (message.type) {
        case "match_state":
          setState((prev) => ({
            ...prev,
            status: message.status,
            agents: message.agents,
          }));
          break;

        case "terminal_output":
          setState((prev) => ({
            ...prev,
            terminalLines: [
              ...prev.terminalLines,
              {
                agent: message.agent,
                content: message.output,
                timestamp: message.timestamp,
                type: "output",
              },
            ],
          }));
          break;

        case "agent_command":
          setState((prev) => ({
            ...prev,
            terminalLines: [
              ...prev.terminalLines,
              {
                agent: message.agent,
                content: formatCommand(message.command),
                timestamp: message.timestamp,
                type: "command",
              },
            ],
          }));
          break;

        case "match_end":
          setState((prev) => ({
            ...prev,
            status: "complete",
            winner: message.winner,
            scores: message.scores,
          }));
          break;
      }
    };
  }, [matchId]);

  useEffect(() => {
    connect();

    return () => {
      wsRef.current?.close();
    };
  }, [connect]);

  return { connected, ...state };
}

function formatCommand(command: unknown): string {
  const cmd = command as Record<string, unknown>;
  switch (cmd.type) {
    case "write_file":
      return `$ write ${cmd.path}`;
    case "run_command":
      return `$ ${cmd.command}`;
    case "run_tests":
      return "$ pytest test_solution.py -v";
    case "submit":
      return "$ [SUBMIT]";
    default:
      return `$ ${JSON.stringify(cmd)}`;
  }
}
