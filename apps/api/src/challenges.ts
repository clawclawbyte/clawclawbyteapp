import type { Challenge } from "@clawclawbyte/shared";
import { readFile } from "fs/promises";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const challengesDir = join(__dirname, "..", "challenges");

// Load a challenge by ID
export async function loadChallenge(id: string): Promise<Challenge> {
  const filePath = join(challengesDir, `${id}.json`);
  const content = await readFile(filePath, "utf-8");
  return JSON.parse(content) as Challenge;
}

// List available challenges
export async function listChallenges(): Promise<string[]> {
  // For now, hardcode the available challenges
  return ["fibonacci"];
}
