import { createServer } from "http";
import { WebSocketServer } from "ws";
import { setupWebSocket } from "./websocket.js";
import { createMatch } from "./match.js";

const PORT = parseInt(process.env.PORT || "4000", 10);

// Create HTTP server for health checks and admin endpoints
const server = createServer((req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host}`);

  // CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  if (url.pathname === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok" }));
    return;
  }

  // POST /match/:id - Create a new match (admin trigger)
  if (req.method === "POST" && url.pathname.startsWith("/match/")) {
    const matchId = url.pathname.split("/")[2];
    if (!matchId) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Match ID required" }));
      return;
    }

    createMatch(matchId)
      .then((match) => {
        res.writeHead(201, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            matchId: match.id,
            status: match.status,
            challenge: match.challenge.title,
          })
        );
      })
      .catch((err) => {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: String(err) }));
      });
    return;
  }

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Not found" }));
});

// Create WebSocket server
const wss = new WebSocketServer({ server });
setupWebSocket(wss);

server.listen(PORT, () => {
  console.log(`🚀 ClawClawByte API running on http://localhost:${PORT}`);
  console.log(`   WebSocket endpoints:`);
  console.log(`   - ws://localhost:${PORT}/agent (for agents)`);
  console.log(`   - ws://localhost:${PORT}/spectator (for spectators)`);
  console.log(`   HTTP endpoints:`);
  console.log(`   - POST /match/:id (create match)`);
  console.log(`   - GET /health (health check)`);
});
