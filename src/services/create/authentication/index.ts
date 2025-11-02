import { Stagehand } from "@browserbasehq/stagehand";

import { StagehandPage } from "../schemas/index.js";

import {
  analyzeAuthenticationState,
  logAuthenticationAnalysis,
} from "./analysis.js";
import { waitForUserInput, openDebuggerUrl, getDebugUrl } from "./helpers.js";

/**
 * Authenticate into the website
 */
export async function authenticateToWebsite(
  stagehand: Stagehand,
  url: string,
  domain: string
): Promise<void> {
  const context = stagehand.context;
  let activePage: StagehandPage;

  try {
    activePage = await context.awaitActivePage(10_000);
  } catch {
    throw new Error(
      "Unable to locate an active browser page for authentication."
    );
  }

  await activePage.goto(url, { waitUntil: "domcontentloaded" });

  let analysis = await analyzeAuthenticationState(stagehand, activePage);

  if (!analysis.requiresAuth) {
    console.log("🔓 No authentication required.");
    return;
  }

  logAuthenticationAnalysis(analysis, domain);

  // If there's a login button to click, click it first
  if (analysis.loginButton) {
    console.log(`🖱️  Clicking login button: "${analysis.loginButton}"`);
    try {
      await stagehand.act(analysis.loginButton);
      await activePage.waitForLoadState("networkidle", 5_000).catch(() => {});
      // Re-analyze after clicking the button
      analysis = await analyzeAuthenticationState(stagehand, activePage);
    } catch (error) {
      console.log(
        `⚠️  Failed to click login button: ${
          error instanceof Error ? error.message : error
        }`
      );
    }
  }

  //todo: add automatic login functionality, need to think of a way to do this efficiently with 1password

  console.log("\n🌐 Opening browser session for authentication...");
  console.log(`🔗 Debug URL: ${getDebugUrl(stagehand)}`);
  console.log(
    "\n👉 Please log in to the website in the browser window that just opened."
  );

  // Open the debugger URL in the default browser
  await openDebuggerUrl(stagehand.browserbaseSessionId!);

  console.log(
    "\n⏳ Once you're logged in, press Enter to continue (or type 'skip' to skip authentication)...\n"
  );
  const userInput = await waitForUserInput();

  if (userInput.toLowerCase().trim() === "skip") {
    console.log("⏭️  Skipping authentication, returning to original page...");
    await activePage.goto(url, { waitUntil: "domcontentloaded" });
    return;
  }

  // Re-analyze to confirm authentication succeeded
  analysis = await analyzeAuthenticationState(stagehand, activePage);

  if (analysis.requiresAuth) {
    throw new Error(
      "Authentication still required after manual verification. Please sign in and re-run the command."
    );
  }

  console.log("✅ Authentication confirmed.");
}
