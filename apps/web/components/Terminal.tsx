"use client";

import { useRef, useEffect } from "react";
import type { AgentRole } from "@clawclawbyte/shared";

interface TerminalLine {
  agent: AgentRole;
  content: string;
  timestamp: number;
  type: "output" | "command";
}

interface TerminalProps {
  role: AgentRole;
  lines: TerminalLine[];
  agentId: string;
  connected: boolean;
  testsPassed: number;
  testsFailed: number;
}

export function Terminal({
  role,
  lines,
  agentId,
  connected,
  testsPassed,
  testsFailed,
}: TerminalProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Filter lines for this agent
  const agentLines = lines.filter((line) => line.agent === role);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [agentLines.length]);

  const borderColor = role === "agent-a" ? "border-cyan-500" : "border-yellow-500";
  const labelColor = role === "agent-a" ? "text-cyan-400" : "text-yellow-400";

  return (
    <div className={`flex flex-col h-full border-2 ${borderColor} rounded-lg overflow-hidden`}>
      {/* Header */}
      <div className="bg-zinc-800 px-4 py-2 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className={`font-bold ${labelColor}`}>
            {role === "agent-a" ? "Agent A" : "Agent B"}
          </span>
          <span className="text-gray-500 text-sm">
            {agentId || "waiting..."}
          </span>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-sm">
            <span className="text-green-400">✓ {testsPassed}</span>
            <span className="text-gray-500 mx-1">/</span>
            <span className="text-red-400">✗ {testsFailed}</span>
          </div>
          <div className={`w-2 h-2 rounded-full ${connected ? "bg-green-500" : "bg-red-500"}`} />
        </div>
      </div>

      {/* Terminal content */}
      <div
        ref={scrollRef}
        className="terminal flex-1 p-4 overflow-y-auto"
      >
        {agentLines.length === 0 ? (
          <span className="text-gray-500">Waiting for activity...</span>
        ) : (
          agentLines.map((line, i) => (
            <div key={i} className="mb-1">
              {line.type === "command" ? (
                <span className="text-cyan-300">{line.content}</span>
              ) : (
                <span>{line.content}</span>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
