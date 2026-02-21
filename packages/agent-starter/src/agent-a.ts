// Agent A - Solves the Fibonacci challenge correctly
import { AgentClient } from "./client.js";
import type { Challenge } from "@clawclawbyte/shared";

const SERVER_URL = process.env.SERVER_URL || "ws://localhost:4000";
const MATCH_ID = process.env.MATCH_ID || "test-match";
const AGENT_ID = "agent-a-smart";

console.log(`🤖 Agent A starting...`);
console.log(`   Server: ${SERVER_URL}`);
console.log(`   Match:  ${MATCH_ID}`);

let pendingCommands: (() => void)[] = [];
let processingCommand = false;

const client = new AgentClient({
  onConnected: (role, matchId) => {
    console.log(`✅ Connected as ${role} to match ${matchId}`);
    console.log("⏳ Waiting for match to start...");
  },

  onMatchStart: async (challenge: Challenge) => {
    console.log(`\n🎯 Challenge received: ${challenge.title}`);
    console.log(`📋 ${challenge.description}\n`);

    // Agent A's strategy: Write a correct solution immediately
    const correctSolution = `def fibonacci(n: int) -> int:
    """Return the nth Fibonacci number."""
    if n <= 0:
        return 0
    elif n == 1:
        return 1

    a, b = 0, 1
    for _ in range(2, n + 1):
        a, b = b, a + b
    return b
`;

    // Queue up commands
    queueCommand(() => {
      console.log("📝 Writing solution...");
      client.writeFile("solution.py", correctSolution);
    });

    queueCommand(() => {
      console.log("🧪 Running tests...");
      client.runTests();
    });
  },

  onCommandOutput: (output, exitCode) => {
    console.log(`📤 Output (exit ${exitCode}):`);
    console.log(output);
    processNextCommand();
  },

  onTestResult: (passed, failed, output) => {
    console.log(`\n🧪 Test Results: ${passed} passed, ${failed} failed`);

    if (failed === 0 && passed > 0) {
      console.log("✅ All tests passed! Submitting...");
      client.submit();
    } else {
      console.log("❌ Some tests failed. Output:");
      console.log(output);
      processNextCommand();
    }
  },

  onMatchEnd: (winner, scores) => {
    console.log("\n🏁 Match ended!");
    console.log(`Winner: ${winner}`);
    console.log("Scores:", JSON.stringify(scores, null, 2));
    process.exit(0);
  },

  onError: (message) => {
    console.error(`❌ Error: ${message}`);
  },
});

function queueCommand(fn: () => void) {
  pendingCommands.push(fn);
  if (!processingCommand) {
    processNextCommand();
  }
}

function processNextCommand() {
  if (pendingCommands.length === 0) {
    processingCommand = false;
    return;
  }
  processingCommand = true;
  const cmd = pendingCommands.shift()!;
  cmd();
}

// Connect and start
client.connect(SERVER_URL, MATCH_ID, AGENT_ID).catch((err) => {
  console.error("Failed to connect:", err);
  process.exit(1);
});
