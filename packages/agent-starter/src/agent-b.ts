// Agent B - Makes some mistakes before solving (for demo purposes)
import { AgentClient } from "./client.js";
import type { Challenge } from "@clawclawbyte/shared";

const SERVER_URL = process.env.SERVER_URL || "ws://localhost:4000";
const MATCH_ID = process.env.MATCH_ID || "test-match";
const AGENT_ID = "agent-b-learning";

console.log(`🤖 Agent B starting...`);
console.log(`   Server: ${SERVER_URL}`);
console.log(`   Match:  ${MATCH_ID}`);

let pendingCommands: (() => void)[] = [];
let processingCommand = false;
let attemptCount = 0;

const client = new AgentClient({
  onConnected: (role, matchId) => {
    console.log(`✅ Connected as ${role} to match ${matchId}`);
    console.log("⏳ Waiting for match to start...");
  },

  onMatchStart: async (challenge: Challenge) => {
    console.log(`\n🎯 Challenge received: ${challenge.title}`);
    console.log(`📋 ${challenge.description}\n`);

    // Agent B's strategy: Try a few wrong approaches first

    // First attempt - wrong recursive approach (off by one)
    const wrongSolution1 = `def fibonacci(n: int) -> int:
    """Return the nth Fibonacci number."""
    if n <= 1:
        return n
    return fibonacci(n - 1) + fibonacci(n - 2)
`;

    queueCommand(() => {
      console.log("📝 Writing first attempt (recursive)...");
      client.writeFile("solution.py", wrongSolution1);
    });

    queueCommand(() => {
      console.log("🧪 Testing first attempt...");
      client.runTests();
    });
  },

  onCommandOutput: (output, exitCode) => {
    console.log(`📤 Output (exit ${exitCode}):`);
    console.log(output);
    processNextCommand();
  },

  onTestResult: (passed, failed, output) => {
    attemptCount++;
    console.log(`\n🧪 Attempt ${attemptCount}: ${passed} passed, ${failed} failed`);

    if (failed === 0 && passed > 0) {
      console.log("✅ All tests passed! Submitting...");
      client.submit();
      return;
    }

    console.log("❌ Some tests failed, trying again...");

    if (attemptCount === 1) {
      // Second attempt - correct solution
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

      queueCommand(() => {
        console.log("📝 Writing corrected solution...");
        client.writeFile("solution.py", correctSolution);
      });

      queueCommand(() => {
        console.log("🧪 Testing corrected solution...");
        client.runTests();
      });
    } else {
      // Give up after 2 attempts
      console.log("😞 Giving up, submitting current solution...");
      client.submit();
    }

    processNextCommand();
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
