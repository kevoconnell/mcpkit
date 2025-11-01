#!/usr/bin/env node

import { Stagehand } from "@browserbasehq/stagehand";
import { Browserbase } from "@browserbasehq/sdk";
import chalk from "chalk";
import { promises as fs } from "fs";
import boxen from "boxen";
import {
  getOrCreateContext,
  saveContextId,
  loadContextId,
} from "../services/session/index.js";
import { loadEnv } from "../config/env.js";

loadEnv();

let BROWSERBASE_PROJECT_ID: string;
let BROWSERBASE_API_KEY: string;
try {
  BROWSERBASE_PROJECT_ID = process.env.BROWSERBASE_PROJECT_ID!;
  BROWSERBASE_API_KEY = process.env.BROWSERBASE_API_KEY!;
} catch (e) {
  throw new Error(
    "BROWSERBASE_PROJECT_ID and BROWSERBASE_API_KEY must be set in environment variables to run this example. Please check your .env file."
  );
}

const browserbase = new Browserbase({
  apiKey: BROWSERBASE_API_KEY,
});

// TODO: Change this to the URL you want to login to, default is GitHub
const URL_TO_LOGIN_TO = "https://github.com/login";

function announce(message: string, title?: string) {
  console.log(
    boxen(message, {
      padding: 1,
      margin: 3,
      title: title || "Stagehand",
    })
  );
}

/**
 * Extract domain from URL for context naming
 */
function getDomainFromUrl(url: string): string {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname.replace(/^www\./, "");
  } catch {
    return "default";
  }
}

/**
 * Creates a new session with a context ID and adds session cookies to the context
 * @param contextId - The ID of the context to persist
 */
async function persistContextSession(
  contextId: string,
  urlToLoginTo: string = URL_TO_LOGIN_TO
) {
  const stagehand = new Stagehand({
    env: "BROWSERBASE",
    browserbaseSessionCreateParams: {
      projectId: BROWSERBASE_PROJECT_ID,
      browserSettings: {
        context: {
          id: contextId,
          persist: true,
        },
      },
    },
  });
  await stagehand.init();

  const sessionId = stagehand.browserbaseSessionId;
  announce(
    `Session created with ID: ${sessionId}.\n\nSession URL: https://browserbase.com/sessions/${sessionId}`
  );

  const page = (await stagehand.context.pages())[0] || await stagehand.context.newPage();
  await page.goto(urlToLoginTo);

  announce(
    `Opening the debugger URL in your default browser. When you login, the following session will remember your authentication. Once you're logged in, press enter to continue...`
  );

  console.log(
    chalk.yellow("\n\nOnce you're logged in, press enter to continue...\n\n")
  );
  await openDebuggerUrl(sessionId!);
  await waitForEnter();
  await stagehand.close();
  console.log("Waiting 10 seconds for the context to be persisted...");
  await new Promise((resolve) => setTimeout(resolve, 10000));
  console.log(
    chalk.green("Ready to open a new session with the persisted context!")
  );
}

/**
 * Opens a new session with a context ID and uses the cookies from the context to automatically login
 * @param contextId - The ID of the persisted context
 */
async function openPersistedContextSession(
  contextId: string,
  urlToLoginTo: string = URL_TO_LOGIN_TO
) {
  const stagehand = new Stagehand({
    env: "BROWSERBASE",
    browserbaseSessionCreateParams: {
      projectId: BROWSERBASE_PROJECT_ID,
      browserSettings: {
        context: {
          id: contextId,
          persist: false, // We don't need to persist this context since we're already logged in
        },
      },
    },
  });
  await stagehand.init();

  const sessionId = stagehand.browserbaseSessionId;
  const page = (await stagehand.context.pages())[0] || await stagehand.context.newPage();

  // This will be logged in
  await page.goto(urlToLoginTo);
  announce(
    `Opening the debugger URL in your default browser. This session should take you to the logged in page if the context was persisted. ${chalk.red(
      "If not, the context may have expired or been deleted."
    )}`
  );
  await openDebuggerUrl(sessionId!);
  await waitForEnter();
  await stagehand.close();
}

/*
 * MAIN FUNCTION
 */
async function main() {
  const domain = getDomainFromUrl(URL_TO_LOGIN_TO);

  // Check for existing context ID using the session service
  const existingContextId = await loadContextId(domain);

  if (existingContextId) {
    console.log(`Found existing context ID for ${domain}:`, existingContextId);
    // Open the persisted context session directly
    await openPersistedContextSession(existingContextId);
    return;
  }

  // Create a new context if none exists
  const contextId = await getOrCreateContext(domain);
  console.log("Created new context:", contextId);

  // Create a new session with the context
  await persistContextSession(contextId);
  announce(
    "Waiting 10 seconds before opening the persisted context session..."
  );
  await new Promise((resolve) => setTimeout(resolve, 10000));

  // Open the persisted context session
  await openPersistedContextSession(contextId);
}

(async () => {
  await main();
})();

// Wait for enter key press
async function waitForEnter() {
  await new Promise<void>((resolve) => {
    process.stdin.once("data", () => resolve());
  });
}

// Open debugger URL in default browser
async function openDebuggerUrl(sessionId: string) {
  const { debuggerFullscreenUrl } = await browserbase.sessions.debug(sessionId);
  const { exec } = await import("child_process");
  const platform = process.platform;
  const command =
    platform === "win32"
      ? "start"
      : platform === "darwin"
      ? "open"
      : "xdg-open";
  exec(`${command} ${debuggerFullscreenUrl}`);
}
