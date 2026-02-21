"use client";

import { use } from "react";
import { Terminal } from "@/components/Terminal";
import { useMatchWebSocket } from "@/hooks/useMatchWebSocket";

export default function MatchPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: matchId } = use(params);
  const { connected, status, agents, terminalLines, winner, scores } =
    useMatchWebSocket(matchId);

  const agentA = agents.find((a) => a.role === "agent-a");
  const agentB = agents.find((a) => a.role === "agent-b");

  return (
    <main className="flex flex-col h-screen p-4">
      {/* Header */}
      <header className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold">🤖 Match: {matchId}</h1>
          <p className="text-gray-400 text-sm">
            Status: {status} | WebSocket: {connected ? "connected" : "disconnected"}
          </p>
        </div>
        <StatusBadge status={status} />
      </header>

      {/* Winner announcement */}
      {winner && (
        <div className="mb-4 p-4 rounded-lg bg-gradient-to-r from-purple-900/50 to-blue-900/50 border border-purple-500">
          <h2 className="text-2xl font-bold text-center">
            {winner === "draw" ? (
              "🤝 It's a Draw!"
            ) : (
              <>
                🏆 Winner:{" "}
                <span className={winner === "agent-a" ? "text-cyan-400" : "text-yellow-400"}>
                  {winner === "agent-a" ? "Agent A" : "Agent B"}
                </span>
              </>
            )}
          </h2>
          {scores && (
            <div className="flex justify-center gap-8 mt-3 text-sm">
              <ScoreCard role="agent-a" scores={scores["agent-a"]} />
              <ScoreCard role="agent-b" scores={scores["agent-b"]} />
            </div>
          )}
        </div>
      )}

      {/* Split terminal view */}
      <div className="flex-1 grid grid-cols-2 gap-4 min-h-0">
        <Terminal
          role="agent-a"
          lines={terminalLines}
          agentId={agentA?.id ?? ""}
          connected={agentA?.connected ?? false}
          testsPassed={agentA?.testsPassed ?? 0}
          testsFailed={agentA?.testsFailed ?? 0}
        />
        <Terminal
          role="agent-b"
          lines={terminalLines}
          agentId={agentB?.id ?? ""}
          connected={agentB?.connected ?? false}
          testsPassed={agentB?.testsPassed ?? 0}
          testsFailed={agentB?.testsFailed ?? 0}
        />
      </div>
    </main>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    waiting: "bg-yellow-600",
    running: "bg-green-600 animate-pulse",
    scoring: "bg-blue-600",
    complete: "bg-purple-600",
  };

  return (
    <span className={`px-3 py-1 rounded-full text-sm font-medium ${colors[status] ?? "bg-gray-600"}`}>
      {status.toUpperCase()}
    </span>
  );
}

function ScoreCard({
  role,
  scores,
}: {
  role: "agent-a" | "agent-b";
  scores: { testsPassed: number; timeElapsed: number; commandsUsed: number };
}) {
  const labelColor = role === "agent-a" ? "text-cyan-400" : "text-yellow-400";

  return (
    <div className="text-center">
      <div className={`font-bold ${labelColor}`}>
        {role === "agent-a" ? "Agent A" : "Agent B"}
      </div>
      <div className="text-gray-300">
        {scores.testsPassed} tests | {Math.round(scores.timeElapsed / 1000)}s |{" "}
        {scores.commandsUsed} cmds
      </div>
    </div>
  );
}
