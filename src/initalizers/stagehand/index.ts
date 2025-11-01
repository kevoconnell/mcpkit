import { Stagehand } from "@browserbasehq/stagehand";
import { getOrCreateContext } from "../../services/session/index.js";
import { loadEnv } from "../../config/env.js";

loadEnv();

let stagehandInstance: Stagehand | null = null;

export const getStagehandInstance = async (
  domain: string,
  options?: {
    persistContext?: boolean;
  }
) => {
  if (!stagehandInstance) {
    const geminiApiKey =
      process.env.GEMINI_API_KEY ?? process.env.GOOGLE_GENERATIVE_AI_API_KEY;

    if (!geminiApiKey) {
      throw new Error(
        "Missing Gemini API key. Set GEMINI_API_KEY or GOOGLE_GENERATIVE_AI_API_KEY in your environment."
      );
    }

    const browserbaseProjectId = process.env.BROWSERBASE_PROJECT_ID;
    if (!browserbaseProjectId) {
      throw new Error(
        "Missing BROWSERBASE_PROJECT_ID in environment variables"
      );
    }

    const persistContext = options?.persistContext ?? true;

    let contextId: string | undefined;
    if (persistContext) {
      contextId = await getOrCreateContext(domain);
    }

    stagehandInstance = new Stagehand({
      env: "BROWSERBASE",
      browserbaseSessionCreateParams: {
        projectId: browserbaseProjectId,
        proxies: true,
        region: "us-east-1",
        browserSettings: contextId
          ? {
              context: {
                id: contextId,
                persist: true,
              },
            }
          : undefined,
      },
      cacheDir: `mcp-stagehand-${domain}`,
      model: {
        modelName: "google/gemini-2.5-flash",
        apiKey: geminiApiKey,
      },
    });
    await stagehandInstance.init();
  }
  return stagehandInstance;
};
