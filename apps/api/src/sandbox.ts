import Docker from "dockerode";
import { v4 as uuidv4 } from "uuid";
import type { AgentRole } from "@clawclawbyte/shared";

const docker = new Docker();

export interface Sandbox {
  containerId: string;
  role: AgentRole;
  workDir: string;
}

const activeSandboxes = new Map<string, Sandbox>();

// Create a sandbox container for an agent
export async function createSandbox(
  matchId: string,
  role: AgentRole
): Promise<Sandbox> {
  const containerId = `sandbox-${matchId}-${role}-${uuidv4().slice(0, 8)}`;
  const workDir = "/workspace";

  // Create container with limited resources
  const container = await docker.createContainer({
    Image: "clawclawbyte-sandbox:latest",
    name: containerId,
    Cmd: ["sleep", "infinity"], // Keep container running
    WorkingDir: workDir,
    HostConfig: {
      Memory: 512 * 1024 * 1024, // 512MB
      CpuPeriod: 100000,
      CpuQuota: 50000, // 50% CPU
      NetworkMode: "none", // No network access
      AutoRemove: true,
    },
    Tty: true,
    OpenStdin: true,
  });

  await container.start();

  const sandbox: Sandbox = { containerId, role, workDir };
  activeSandboxes.set(`${matchId}-${role}`, sandbox);

  return sandbox;
}

// Execute a command in a sandbox
export async function execInSandbox(
  sandbox: Sandbox,
  command: string
): Promise<{ output: string; exitCode: number }> {
  const container = docker.getContainer(sandbox.containerId);

  const exec = await container.exec({
    Cmd: ["bash", "-c", command],
    AttachStdout: true,
    AttachStderr: true,
    WorkingDir: sandbox.workDir,
  });

  return new Promise((resolve, reject) => {
    exec.start({ hijack: true, stdin: false }, (err, stream) => {
      if (err || !stream) {
        reject(err || new Error("No stream"));
        return;
      }

      let output = "";

      stream.on("data", (chunk: Buffer) => {
        // Docker stream has 8-byte header per chunk
        // First byte: stream type (1=stdout, 2=stderr)
        // Bytes 4-7: payload size (big endian)
        // Remaining: payload
        let offset = 0;
        while (offset < chunk.length) {
          if (offset + 8 > chunk.length) break;
          const size = chunk.readUInt32BE(offset + 4);
          if (offset + 8 + size > chunk.length) break;
          output += chunk.slice(offset + 8, offset + 8 + size).toString();
          offset += 8 + size;
        }
      });

      stream.on("end", async () => {
        try {
          const inspect = await exec.inspect();
          resolve({ output, exitCode: inspect.ExitCode ?? 1 });
        } catch {
          resolve({ output, exitCode: 1 });
        }
      });

      stream.on("error", reject);
    });
  });
}

// Write a file in a sandbox
export async function writeFileInSandbox(
  sandbox: Sandbox,
  path: string,
  content: string
): Promise<{ output: string; exitCode: number }> {
  // Use base64 encoding to handle special characters
  const encoded = Buffer.from(content).toString("base64");
  const fullPath = path.startsWith("/") ? path : `${sandbox.workDir}/${path}`;
  const dir = fullPath.substring(0, fullPath.lastIndexOf("/"));

  const command = `mkdir -p "${dir}" && echo "${encoded}" | base64 -d > "${fullPath}"`;
  return execInSandbox(sandbox, command);
}

// Get sandbox for a match+role
export function getSandbox(
  matchId: string,
  role: AgentRole
): Sandbox | undefined {
  return activeSandboxes.get(`${matchId}-${role}`);
}

// Destroy a sandbox
export async function destroySandbox(
  matchId: string,
  role: AgentRole
): Promise<void> {
  const key = `${matchId}-${role}`;
  const sandbox = activeSandboxes.get(key);
  if (!sandbox) return;

  try {
    const container = docker.getContainer(sandbox.containerId);
    await container.stop({ t: 1 });
  } catch {
    // Container may already be stopped
  }

  activeSandboxes.delete(key);
}

// Destroy all sandboxes for a match
export async function destroyMatchSandboxes(matchId: string): Promise<void> {
  await Promise.all([
    destroySandbox(matchId, "agent-a"),
    destroySandbox(matchId, "agent-b"),
  ]);
}
