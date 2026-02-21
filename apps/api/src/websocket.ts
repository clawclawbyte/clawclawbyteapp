import { WebSocketServer, WebSocket } from "ws";
import type { IncomingMessage } from "http";
import type {
  AgentToServerMessage,
  SpectatorToServerMessage,
  AgentRole,
} from "@clawclawbyte/shared";
import { isAgentCommand } from "@clawclawbyte/shared";
import {
  joinAgent,
  handleAgentCommand,
  handleAgentDisconnect,
  subscribeSpectator,
  unsubscribeSpectator,
} from "./match.js";

// Track which match/role each websocket belongs to
const wsToMatch = new WeakMap<
  WebSocket,
  { matchId: string; role?: AgentRole; isSpectator: boolean }
>();

export function setupWebSocket(wss: WebSocketServer): void {
  wss.on("connection", (ws: WebSocket, req: IncomingMessage) => {
    const url = new URL(req.url || "/", `http://${req.headers.host}`);
    const path = url.pathname;

    console.log(`WebSocket connection: ${path}`);

    if (path.startsWith("/agent")) {
      handleAgentConnection(ws);
    } else if (path.startsWith("/spectator")) {
      handleSpectatorConnection(ws);
    } else {
      ws.close(4000, "Invalid path");
    }
  });
}

function handleAgentConnection(ws: WebSocket): void {
  ws.on("message", async (data) => {
    try {
      const message = JSON.parse(data.toString()) as AgentToServerMessage;

      if (message.type === "join") {
        const role = await joinAgent(message.matchId, message.agentId, ws);
        if (role) {
          wsToMatch.set(ws, { matchId: message.matchId, role, isSpectator: false });
        }
      } else if (message.type === "command") {
        const info = wsToMatch.get(ws);
        if (info?.role && isAgentCommand(message.command)) {
          await handleAgentCommand(info.matchId, info.role, message.command);
        }
      }
    } catch (err) {
      console.error("Agent message error:", err);
      ws.send(JSON.stringify({ type: "error", message: "Invalid message" }));
    }
  });

  ws.on("close", async () => {
    const info = wsToMatch.get(ws);
    if (info?.role) {
      await handleAgentDisconnect(info.matchId, info.role);
    }
  });
}

function handleSpectatorConnection(ws: WebSocket): void {
  ws.on("message", (data) => {
    try {
      const message = JSON.parse(data.toString()) as SpectatorToServerMessage;

      if (message.type === "subscribe") {
        wsToMatch.set(ws, {
          matchId: message.matchId,
          isSpectator: true,
        });
        subscribeSpectator(message.matchId, ws);
      }
    } catch (err) {
      console.error("Spectator message error:", err);
    }
  });

  ws.on("close", () => {
    const info = wsToMatch.get(ws);
    if (info?.isSpectator) {
      unsubscribeSpectator(info.matchId, ws);
    }
  });
}
