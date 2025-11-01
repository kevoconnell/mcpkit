import dotenv from "dotenv";
import os from "os";
import path from "path";
import { existsSync } from "fs";
import { mkdir } from "fs/promises";

const GLOBAL_CONFIG_DIR = path.join(os.homedir(), ".mcpkit");
const GLOBAL_ENV_FILENAME = ".env";
const GLOBAL_ENV_PATH = path.join(GLOBAL_CONFIG_DIR, GLOBAL_ENV_FILENAME);

let hasLoadedEnv = false;

export function getGlobalConfigDir(): string {
  return GLOBAL_CONFIG_DIR;
}

export function getGlobalEnvPath(): string {
  return GLOBAL_ENV_PATH;
}

export async function ensureGlobalConfigDir(): Promise<void> {
  await mkdir(GLOBAL_CONFIG_DIR, { recursive: true });
}

export interface LoadEnvOptions {
  /**
   * Whether to also load a local `.env` file from the current working directory.
   * Defaults to true so projects can override global values when needed.
   */
  includeLocal?: boolean;
  /**
   * Force reloading even if we've already attempted to load env files.
   */
  forceReload?: boolean;
}

export function loadEnv(options?: LoadEnvOptions): void {
  const { includeLocal = true, forceReload = false } = options ?? {};

  if (hasLoadedEnv && !forceReload) {
    return;
  }

  const envCandidates = new Set<string>();
  envCandidates.add(GLOBAL_ENV_PATH);

  if (includeLocal) {
    envCandidates.add(path.join(process.cwd(), ".env"));
  }

  for (const envPath of envCandidates) {
    if (!existsSync(envPath)) {
      continue;
    }

    dotenv.config({
      path: envPath,
      override: false,
    });
  }

  hasLoadedEnv = true;
}
