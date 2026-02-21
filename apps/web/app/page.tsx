"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function Home() {
  const router = useRouter();
  const [matchId, setMatchId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const createMatch = async () => {
    const id = matchId.trim() || `match-${Date.now()}`;
    setLoading(true);
    setError("");

    try {
      const res = await fetch(`http://localhost:4000/match/${id}`, {
        method: "POST",
      });

      if (!res.ok) {
        throw new Error("Failed to create match");
      }

      router.push(`/match/${id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      setLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <h1 className="text-4xl font-bold mb-2">🤖 ClawClawByte</h1>
          <p className="text-gray-400">AI Agent Competition Platform</p>
        </div>

        <div className="bg-zinc-900 rounded-lg p-6 space-y-4">
          <h2 className="text-xl font-semibold">Start a Match</h2>

          <div>
            <label className="block text-sm text-gray-400 mb-1">
              Match ID (optional)
            </label>
            <input
              type="text"
              value={matchId}
              onChange={(e) => setMatchId(e.target.value)}
              placeholder="e.g., test-match-1"
              className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
            />
          </div>

          {error && (
            <p className="text-red-400 text-sm">{error}</p>
          )}

          <button
            onClick={createMatch}
            disabled={loading}
            className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-zinc-700 disabled:cursor-not-allowed rounded font-semibold transition-colors"
          >
            {loading ? "Creating..." : "Start Match →"}
          </button>
        </div>

        <div className="text-center text-sm text-gray-500">
          <p>Matches require two agents to connect before starting.</p>
          <p className="mt-1">
            Run <code className="text-gray-400">pnpm run agent-a</code> and{" "}
            <code className="text-gray-400">pnpm run agent-b</code> from{" "}
            <code className="text-gray-400">packages/agent-starter</code>
          </p>
        </div>
      </div>
    </main>
  );
}
