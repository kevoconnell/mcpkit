import { loadEnv } from "../../config/env.js";
import { openai } from "@ai-sdk/openai";
import { anthropic } from "@ai-sdk/anthropic";
import { google } from "@ai-sdk/google";
import { LanguageModel } from "ai";

let cachedModel: LanguageModel | null = null;

/**
 * Get the configured LLM model based on MODEL_PROVIDER env var
 * Supports: openai/, anthropic/, google/ prefixes
 *
 * Examples:
 * - openai/gpt-4o
 * - anthropic/claude-3-5-sonnet-20241022
 * - google/gemini-2.0-flash
 */
export function getModel(): LanguageModel {
  if (cachedModel) {
    return cachedModel;
  }

  const { MODEL_PROVIDER } = loadEnv();

  console.error(`Using model: ${MODEL_PROVIDER}`);

  // Parse provider and model name
  if (MODEL_PROVIDER.startsWith("openai/")) {
    const modelName = MODEL_PROVIDER.replace("openai/", "");
    cachedModel = openai(modelName);
  } else if (MODEL_PROVIDER.startsWith("anthropic/")) {
    const modelName = MODEL_PROVIDER.replace("anthropic/", "");
    cachedModel = anthropic(modelName);
  } else if (MODEL_PROVIDER.startsWith("google/")) {
    const modelName = MODEL_PROVIDER.replace("google/", "");
    cachedModel = google(modelName);
  } else {
    throw new Error(
      `Unsupported model provider: ${MODEL_PROVIDER}. Must start with openai/, anthropic/, or google/`
    );
  }

  return cachedModel;
}
