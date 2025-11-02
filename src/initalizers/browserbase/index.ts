import { loadEnv } from "../../config/env.js";
import { Browserbase } from "@browserbasehq/sdk";

let browserbaseInstance: Browserbase | null = null;

export const getBrowserbaseInstance = () => {
  if (!browserbaseInstance) {
    const env = loadEnv();
    browserbaseInstance = new Browserbase({
      apiKey: env.BROWSERBASE_API_KEY,
    });
  }
  return browserbaseInstance;
};
