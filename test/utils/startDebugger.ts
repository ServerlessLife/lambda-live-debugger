import { spawn } from "child_process";
import { setTimeout } from "timers/promises";
import { exec } from "child_process";
import { promisify } from "util";

export const execAsync = promisify(exec);

export async function startDebugger(folder: string, args: string[] = []) {
  try {
    return await startDebuggerInternal(folder, args);
  } catch (e: any) {
    console.log(`[LLD] Failed to start LLD: ${e.message}. Retrying...`);
    await setTimeout(1500);
    return await startDebuggerInternal(folder, args);
  }
}

async function startDebuggerInternal(folder: string, args: string[] = []) {
  console.log("Starting LLD...");

  if (process.env.OBSERVABLE_MODE === "true") {
    args.push("-o");
  }

  args.push("-v");

  let command = `node ../../dist/lldebugger.mjs ${args?.join(" ")}`;

  if (process.env.REAL_NPM === "true") {
    console.log("Running the debugger with the real NPM");
    command = `lld ${args?.join(" ")}`;
  }

  const lldProcess = spawn(command, {
    cwd: folder,
    shell: true,
  });

  // wait for the debugger to start
  await new Promise((resolve, reject) => {
    let errorWhileRunning = false;
    if (!lldProcess) {
      throw new Error("Failed to start LLD");
    }

    lldProcess.stdout?.on("data", (data) => {
      console.log("LLD: " + data.toString());
      const line = data.toString();
      if (line.includes("IoT connected")) {
        resolve(true);
      }
    });
    lldProcess.stderr?.on("data", (data) => {
      console.log("[LLD] ERROR: " + data.toString());
      errorWhileRunning = true;
    });
    lldProcess.on("close", (error) => {
      console.log(`[LLD] CLOSED: error=${errorWhileRunning}`);
      if (error) {
        reject(error);
      } else {
        resolve(true);
      }
    });
  });
  await setTimeout(5000);
  return lldProcess;
}
