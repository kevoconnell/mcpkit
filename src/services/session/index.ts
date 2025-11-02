import { promises as fs } from "fs";
import * as path from "path";
import { homedir } from "os";
import { loadEnv } from "../../config/env.js";
import { getBrowserbaseInstance } from "../../initalizers/browserbase/index.js";

const CONTEXTS_DIR = path.join(homedir(), ".mcpkit", "contexts");

/**
 * Get the file path for storing a context ID for a domain
 */
function getContextFilePath(domain: string): string {
  return path.join(CONTEXTS_DIR, `${domain}.txt`);
}

/**
 * Save a context ID for a domain
 */
export async function saveContextId(
  domain: string,
  contextId: string
): Promise<void> {
  await fs.mkdir(CONTEXTS_DIR, { recursive: true });
  await fs.writeFile(getContextFilePath(domain), contextId);
}

/**
 * Load a context ID for a domain
 */
export async function loadContextId(domain: string): Promise<string | null> {
  try {
    const contextId = await fs.readFile(getContextFilePath(domain), "utf-8");
    return contextId.trim();
  } catch (error) {
    return null;
  }
}

/**
 * Delete a saved context for a domain
 */
export async function deleteContextId(domain: string): Promise<void> {
  try {
    await fs.unlink(getContextFilePath(domain));
  } catch (error) {
    // Ignore if file doesn't exist
  }
}

/**
 * Create a new Browserbase context for a domain
 */
export async function createContext(domain: string): Promise<string> {
  const browserbase = getBrowserbaseInstance();
  const { BROWSERBASE_PROJECT_ID } = loadEnv();
  const context = await browserbase.contexts.create({
    projectId: BROWSERBASE_PROJECT_ID,
  });
  console.log(`✅ Created new browser context for ${domain}: ${context.id}`);
  await saveContextId(domain, context.id);

  return context.id;
}

/**
 * Get or create a Browserbase context for a domain
 */
export async function getOrCreateContext(domain: string): Promise<string> {
  const existingContextId = await loadContextId(domain);

  if (existingContextId) {
    console.log(
      `♻️  Found existing context for ${domain}: ${existingContextId}`
    );
    return existingContextId;
  }

  return await createContext(domain);
}

/**
 * List all saved contexts
 */
export async function listSavedContexts(): Promise<
  Array<{ domain: string; contextId: string }>
> {
  try {
    await fs.mkdir(CONTEXTS_DIR, { recursive: true });
    const files = await fs.readdir(CONTEXTS_DIR);
    const contexts = await Promise.all(
      files
        .filter((file) => file.endsWith(".txt"))
        .map(async (file) => {
          const domain = file.replace(".txt", "");
          const contextId = await loadContextId(domain);
          return contextId ? { domain, contextId } : null;
        })
    );
    return contexts.filter(
      (ctx): ctx is { domain: string; contextId: string } => ctx !== null
    );
  } catch (error) {
    return [];
  }
}
