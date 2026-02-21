import WebSocket from "ws";
import type {
  AgentToServerMessage,
  ServerToAgentMessage,
  AgentCommand,
  Challenge,
  AgentRole,
  MatchScores,
} from "@clawclawbyte/shared";

export interface AgentCallbacks {
  onConnected: (role: AgentRole, matchId: string) => void;
  onMatchStart: (challenge: Challenge) => void;
  onCommandOutput: (output: string, exitCode: number) => void;
  onTestResult: (passed: number, failed: number, output: string) => void;
  onMatchEnd: (winner: AgentRole | "draw", scores: MatchScores) => void;
  onError: (message: string) => void;
}

export class AgentClient {
  private ws: WebSocket | null = null;
  private callbacks: AgentCallbacks;

  constructor(callbacks: AgentCallbacks) {
    this.callbacks = callbacks;
  }

  connect(serverUrl: string, matchId: string, agentId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(`${serverUrl}/agent`);

      this.ws.on("open", () => {
        this.send({ type: "join", matchId, agentId });
        resolve();
      });

      this.ws.on("error", (err) => {
        reject(err);
      });

      this.ws.on("message", (data) => {
        const message = JSON.parse(data.toString()) as ServerToAgentMessage;
        this.handleMessage(message);
      });

      this.ws.on("close", () => {
        console.log("Disconnected from server");
      });
    });
  }

  private handleMessage(message: ServerToAgentMessage): void {
    switch (message.type) {
      case "connected":
        this.callbacks.onConnected(message.role, message.matchId);
        break;
      case "match_start":
        this.callbacks.onMatchStart(message.challenge);
        break;
      case "command_output":
        this.callbacks.onCommandOutput(message.output, message.exitCode);
        break;
      case "test_result":
        this.callbacks.onTestResult(
          message.passed,
          message.failed,
          message.output
        );
        break;
      case "match_end":
        this.callbacks.onMatchEnd(message.winner, message.scores);
        break;
      case "error":
        this.callbacks.onError(message.message);
        break;
    }
  }

  sendCommand(command: AgentCommand): void {
    this.send({ type: "command", command });
  }

  writeFile(path: string, content: string): void {
    this.sendCommand({ type: "write_file", path, content });
  }

  runCommand(command: string): void {
    this.sendCommand({ type: "run_command", command });
  }

  runTests(): void {
    this.sendCommand({ type: "run_tests" });
  }

  submit(): void {
    this.sendCommand({ type: "submit" });
  }

  private send(message: AgentToServerMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  close(): void {
    this.ws?.close();
  }
}
