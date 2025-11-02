import dotenv from "dotenv";
import os from "os";
import path from "path";

import { mkdir } from "fs/promises";
import { existsSync } from "fs";
import { AvailableModel } from "@browserbasehq/stagehand";

const GLOBAL_CONFIG_DIR = path.join(os.homedir(), ".mcpkit");
const GLOBAL_ENV_FILENAME = ".env";
const GLOBAL_ENV_PATH = path.join(GLOBAL_CONFIG_DIR, GLOBAL_ENV_FILENAME);

export function getGlobalConfigDir(): string {
  return GLOBAL_CONFIG_DIR;
}

export function getGlobalEnvPath(): string {
  return GLOBAL_ENV_PATH;
}

export async function ensureGlobalConfigDir(): Promise<void> {
  await mkdir(GLOBAL_CONFIG_DIR, { recursive: true });
}

interface GlobalEnv {
  MODEL_API_KEY: string;
  MODEL_PROVIDER: AvailableModel;
  BROWSERBASE_PROJECT_ID: string;
  BROWSERBASE_API_KEY: string;
}

export function loadEnv(): GlobalEnv {
  //check if the file exists
  if (!existsSync(GLOBAL_ENV_PATH)) {
    throw new Error(
      `Global environment file not found, please run "mcpkit secrets" to set up your secrets`
    );
  }

  // Only load from the global path, explicitly preventing dotenv from
  // looking for .env in the current directory
  dotenv.config({
    path: GLOBAL_ENV_PATH,
    override: false,
  });

  if (!process.env.MODEL_API_KEY) {
    throw new Error(
      `MODEL_API_KEY is not set, please run "mcpkit secrets" to set up your secrets`
    );
  }

  if (!process.env.MODEL_PROVIDER) {
    throw new Error(
      `MODEL_PROVIDER is not set, please run "mcpkit secrets" to set up your secrets`
    );
  }

  if (!process.env.BROWSERBASE_PROJECT_ID) {
    throw new Error(
      `BROWSERBASE_PROJECT_ID is not set, please run "mcpkit secrets" to set up your secrets`
    );
  }

  if (!process.env.BROWSERBASE_API_KEY) {
    throw new Error(
      `BROWSERBASE_API_KEY is not set, please run "mcpkit secrets" to set up your secrets`
    );
  }

  return {
    MODEL_API_KEY: process.env.MODEL_API_KEY,
    MODEL_PROVIDER: process.env.MODEL_PROVIDER,
    BROWSERBASE_PROJECT_ID: process.env.BROWSERBASE_PROJECT_ID,
    BROWSERBASE_API_KEY: process.env.BROWSERBASE_API_KEY,
  };
}
