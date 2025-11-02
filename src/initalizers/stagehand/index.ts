import { Stagehand } from "@browserbasehq/stagehand";
import { getOrCreateContext } from "../../services/session/index.js";
import { loadEnv } from "../../config/env.js";

let stagehandInstance: Stagehand | null = null;

export const getStagehandInstance = async (
  domain: string,
  options?: {
    persistContext?: boolean;
  }
) => {
  if (!stagehandInstance) {
    const env = loadEnv();

    const persistContext = options?.persistContext ?? true;

    let contextId: string | undefined;
    if (persistContext) {
      contextId = await getOrCreateContext(domain);
    }

    stagehandInstance = new Stagehand({
      env: "BROWSERBASE",
      browserbaseSessionCreateParams: {
        projectId: env.BROWSERBASE_PROJECT_ID,
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
        modelName: env.MODEL_PROVIDER,
        apiKey: env.MODEL_API_KEY,
      },
    });
    await stagehandInstance.init();
  }
  return stagehandInstance;
};
