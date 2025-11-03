#!/usr/bin/env node
/**
 * MCP Server for www.printed.trade
 *
 * This server uses Stagehand V3 for browser automation.
 *
 * Stagehand Reference:
 * - stagehand.act("instruction") - Perform atomic actions (click, type, etc.)
 * - stagehand.extract("instruction", schema) - Extract structured data
 * - stagehand.observe("instruction") - Get candidate actions before acting
 * - stagehand.agent({ ... }).execute() - Run multi-step autonomous tasks
 *
 * Key Tips:
 * - Act instructions should be atomic: "Click the button" not "Click button and submit"
 * - Extract with zod schemas for type safety
 * - Use observe + act pattern to cache DOM state
 * - Access pages via stagehand.context.pages()[0]
 *
 * For full API reference, see: https://docs.stagehand.dev
 */
import { Server } from "@modelcontextprotocol/sdk/server";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { Stagehand } from "@browserbasehq/stagehand";
import { z } from "zod";
import dotenv from "dotenv";
import os from "os";
import path from "path";
import { existsSync } from "fs";

// Load environment variables from standard locations
const GLOBAL_ENV_PATH = path.join(os.homedir(), ".mcpkit", ".env");
if (existsSync(GLOBAL_ENV_PATH)) {
  dotenv.config({ path: GLOBAL_ENV_PATH, override: false });
}

const LOCAL_ENV_PATH = path.join(process.cwd(), ".env");
if (existsSync(LOCAL_ENV_PATH)) {
  dotenv.config({ path: LOCAL_ENV_PATH, override: false });
}

// Define the target URL for www.printed.trade
const TARGET_URL = "https://www.printed.trade/";

// MCP Server for www.printed.trade
const server = new Server(
  {
    name: "www_printed_trade", // Updated server name
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Initialize Stagehand instance
let stagehand: Stagehand;

/**
 * Get saved context ID from mcpkit contexts
 */
async function getSavedContextId(domain: string): Promise<string | null> {
  try {
    const fs = await import("fs/promises");
    const contextFilePath = path.join(
      os.homedir(),
      ".mcpkit",
      "contexts",
      `${domain}.txt`
    );
    const contextId = await fs.readFile(contextFilePath, "utf-8");
    return contextId.trim();
  } catch (error) {
    return null;
  }
}

/**
 * Create a new browser context
 */
async function createNewContext(): Promise<string> {
  const https = await import("https");
  const apiKey = process.env.BROWSERBASE_API_KEY!;
  const projectId = process.env.BROWSERBASE_PROJECT_ID!;

  return new Promise((resolve, reject) => {
    const data = JSON.stringify({ projectId });
    const options = {
      hostname: "api.browserbase.com",
      path: "/v1/contexts",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-BB-API-Key": apiKey,
        "Content-Length": Buffer.byteLength(data),
      },
    };

    const req = https.request(options, (res) => {
      let responseData = "";
      res.on("data", (chunk) => {
        responseData += chunk;
      });
      res.on("end", () => {
        try {
          const response = JSON.parse(responseData);
          resolve(response.id);
        } catch (error) {
          reject(new Error(`Failed to parse response: ${responseData}`));
        }
      });
    });

    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

/**
 * Get or create a browser context ID for this domain
 */
async function getOrCreateContextId(
  domain: string
): Promise<string | undefined> {
  // First, check if context ID is set in environment
  if (process.env.BROWSERBASE_CONTEXT_ID) {
    return process.env.BROWSERBASE_CONTEXT_ID;
  }

  // Second, check if we have a saved context from mcpkit
  const savedContextId = await getSavedContextId(domain);
  if (savedContextId) {
    console.error(`♻️  Using saved context from mcpkit: ${savedContextId}`);
    return savedContextId;
  }

  // Third, create a new context automatically
  try {
    const newContextId = await createNewContext();
    console.error(`✅ Created new browser context: ${newContextId}`);
    console.error(`💡 Add this to your .env file to reuse this session:`);
    console.error(`   BROWSERBASE_CONTEXT_ID=${newContextId}\n`);
    return newContextId;
  } catch (error) {
    console.error(`⚠️  Failed to create browser context:`, error);
    console.error(`   Continuing without persistent context.\n`);
    return undefined;
  }
}

/**
 * Initializes the Stagehand browser automation instance if it hasn't been already.
 * Ensures that the browser and model are ready for use.
 * @returns The initialized Stagehand instance.
 */
async function initStagehand(): Promise<Stagehand> {
  if (!stagehand) {
    // Extract domain from TARGET_URL
    const domain = new URL(TARGET_URL).hostname;

    // Get or create context ID
    const contextId = await getOrCreateContextId(domain);

    stagehand = new Stagehand({
      env: "BROWSERBASE",
      verbose: 0, // Disable logging for MCP stdio compatibility
      browserbaseSessionCreateParams: {
        projectId: process.env.BROWSERBASE_PROJECT_ID!,
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
      model: {
        modelName: process.env.MODEL_PROVIDER || "google/gemini-2.5-flash",
        apiKey: process.env.MODEL_API_KEY!,
      },
    });
    await stagehand.init();

    // Log the live view URL for debugging
    if (stagehand.browserbaseSessionId) {
      console.error(
        `🔗 Live view: https://browserbase.com/sessions/${stagehand.browserbaseSessionId}`
      );
    }
  }
  return stagehand;
}

// Define Zod schemas for tool arguments
const GetLeaderboardDataArgsSchema = z.object({});

const GetTopNUsersArgsSchema = z.object({
  numUsers: z
    .number()
    .int()
    .min(1)
    .describe("The number of top users to retrieve (e.g., 3 for top 3)."),
  timePeriod: z
    .string()
    .min(1)
    .default("1D")
    .refine((timePeriod) => ["1D", "7D", "30D"].includes(timePeriod), {
      message: "Time period must be one of: 1D, 7D, 30D",
    })
    .describe("The time period to filter by (e.g., '1D', '7D', '30D')."),
  category: z
    .string()
    .min(1)
    .default("Realized P&L")
    .refine(
      (category) =>
        [
          "Realized P&L",
          "Number of Trades",
          "Win Rate",
          "Average Trade Size",
        ].includes(category),
      {
        message:
          "Drop Down Category must be one of: Realized P&L, Number of Trades, Win Rate, Average Trade Size",
      }
    )
    .describe(
      "The Drop Down Category to filter by (e.g., 'Realized P&L', 'Number of Trades', 'Win Rate', 'Average Trade Size')."
    ),
});

const JoinLeaderboardArgsSchema = z.object({});

const ViewUserProfileArgsSchema = z.object({
  username: z.string().min(1).describe("The username of the profile to view."),
});

// Define Zod schemas for extraction
const LeaderboardEntrySchema = z.object({
  rank: z.number(),
  username: z.string(),
  wallet_address: z.string(),
  trades_count: z.string(), // e.g., "2 Trades this week"
  pnl_usd: z.string(), // e.g., "+$75.20"
  pnl_sol: z.string(), // e.g., "0.40 SOL"
  win_rate: z.string(), // e.g., "100.0%"
});

const GetLeaderboardDataResponseSchema = z.object({
  leaderboard: z.array(LeaderboardEntrySchema),
});

// List available tools for the www.printed.trade server
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "get_leaderboard_data",
        description:
          "Retrieve the full leaderboard data including rank, username, trades, and realized P&L for all displayed users.",
        inputSchema: {
          type: "object",
          properties: {},
          required: [],
        },
      },
      {
        name: "get_top_n_users_for_time_period",
        description:
          "Retrieve the data for the top N users on the leaderboard for a specific time period.",
        inputSchema: {
          type: "object",
          properties: {
            numUsers: {
              type: "number",
              description:
                "The number of top users to retrieve (e.g., 3 for top 3).",
            },
            timePeriod: {
              type: "string",
              description:
                "The time period to filter by (e.g., '1D', '7D', '30D').",
            },
            category: {
              type: "string",
              description:
                "The Drop Down Category to filter by (e.g., 'Realized P&L', 'Number of Trades', 'Win Rate', 'Average Trade Size').",
            },
          },
          required: ["numUsers", "timePeriod", "category"],
        },
      },
      {
        name: "join_leaderboard",
        description: "Initiate the process to join the leaderboard.",
        inputSchema: {
          type: "object",
          properties: {},
          required: [],
        },
      },
      {
        name: "view_user_profile",
        description: "Navigate to a specific user's profile page.",
        inputSchema: {
          type: "object",
          properties: {
            username: {
              type: "string",
              description: "The username of the profile to view.",
            },
          },
          required: ["username"],
        },
      },
    ],
  };
});

// Handle incoming tool call requests
server.setRequestHandler(CallToolRequestSchema, async (request: any) => {
  const stagehand = await initStagehand();
  const page = stagehand.context.pages()[0];

  try {
    // Ensure we start from a consistent page state for each tool call
    if (!page.url().startsWith(TARGET_URL)) {
      await page.goto(TARGET_URL, { waitUntil: "domcontentloaded" });
    }
  } catch (initialGotoError) {
    return {
      content: [
        {
          type: "text",
          text: `❌ Error navigating to initial page: ${
            initialGotoError instanceof Error
              ? initialGotoError.message
              : String(initialGotoError)
          }`,
        },
      ],
      isError: true,
    };
  }

  try {
    let result: any;
    let screenshotBase64: string;

    switch (request.params.name) {
      case "get_leaderboard_data": {
        GetLeaderboardDataArgsSchema.parse(request.params.arguments);

        // Step 1: Scroll down to ensure all leaderboard entries are loaded (if applicable)
        const scrollInstruction =
          "Scroll down the page to ensure all leaderboard entries are loaded (if applicable).";
        try {
          const scrollActions = await stagehand.observe(scrollInstruction);
          if (scrollActions && scrollActions.length > 0) {
            await stagehand.act(scrollActions[0]);
            await page.waitForLoadState("domcontentloaded"); // Wait for page to load new content
          } else {
            console.warn(
              "Could not find scroll action or page is not scrollable. Proceeding with visible entries."
            );
          }
        } catch (e) {
          // Log error but don't fail, as page might not have scrollable content or all is loaded
          console.warn(
            `Error during initial scroll attempt for get_leaderboard_data: ${
              e instanceof Error ? e.message : String(e)
            }`
          );
        }

        // Step 2: Extract data from all visible leaderboard entries
        result = await stagehand.extract(
          "Extract all leaderboard entries. For each user, get: rank number, username, wallet address (the code like 'GEpM1S...UXL4'), number of trades (like '2 Trades this week'), P&L in USD (like '+$75.20'), P&L in SOL (like '0.40 SOL'), and win rate percentage (like '100.0%').",
          GetLeaderboardDataResponseSchema
        );

        const screenshot = await page.screenshot({ fullPage: true });
        screenshotBase64 = screenshot.toString("base64");
        break;
      }

      case "get_top_n_users_for_time_period": {
        const args = GetTopNUsersArgsSchema.parse(request.params.arguments);
        const { numUsers, timePeriod, category } = args;

        // For time period
        const timePeriodActions = await stagehand.observe(
          `Click the button on the right side of the page that says "${timePeriod}"`
        );
        if (!timePeriodActions || timePeriodActions.length === 0) {
          throw new Error(`Could not find time period button: ${timePeriod}`);
        }
        await stagehand.act(timePeriodActions[0]);

        // Wait for any updates
        await page.waitForLoadState("domcontentloaded");

        // For category - click the dropdown
        const categoryActions = await stagehand.observe(
          `Click the dropdown menu on the left side of the page that is visible and says "Realized P&L"`
        );
        if (!categoryActions || categoryActions.length === 0) {
          throw new Error(`Could not find category dropdown: ${category}`);
        }
        await stagehand.act(categoryActions[0]);

        // For category - select the option
        const categoryOptionActions = await stagehand.observe(
          `Select the "${category}" option`
        );
        if (!categoryOptionActions || categoryOptionActions.length === 0) {
          throw new Error(`Could not find category option: ${category}`);
        }
        await stagehand.act(categoryOptionActions[0]);
        //wait for it to load
        await page.waitForLoadState("domcontentloaded");

        // Step 2: Extract data from the first {numUsers} entries on the leaderboard
        const extractedData = await stagehand.extract(
          `Extract the top ${numUsers} leaderboard entries. For each user, get: rank number, username, wallet address (the code like 'GEpM1S...UXL4'), number of trades (like '2 Trades this week'), P&L in USD (like '+$75.20'), P&L in SOL (like '0.40 SOL'), and win rate percentage (like '100.0%'). Only return the first ${numUsers} entries.`,
          z.object({
            top_users: z.array(LeaderboardEntrySchema),
          })
        );

        // Post-processing to ensure only top N are returned if the LLM extracts more
        result = {
          top_users: extractedData.top_users.slice(0, numUsers),
          time_period: timePeriod,
        };

        const screenshot = await page.screenshot({ fullPage: true });
        screenshotBase64 = screenshot.toString("base64");
        break;
      }

      case "join_leaderboard": {
        JoinLeaderboardArgsSchema.parse(request.params.arguments);

        // Step 1: Click the 'Join Leaderboard' button
        const instruction = "Click the 'Join Leaderboard' button";
        const actions = await stagehand.observe(instruction);
        if (!actions || actions.length === 0) {
          throw new Error(`Could not find element for: ${instruction}`);
        }
        await stagehand.act(actions[0]);
        await page.waitForLoadState("domcontentloaded"); // Wait for page to load after navigation/interaction

        // Extract a brief summary of the page after attempting to join
        result = await stagehand.extract(
          "Extract a brief summary describing the outcome of attempting to join the leaderboard (e.g., success message, popup, form asking for wallet connection).",
          z.object({
            summary: z
              .string()
              .describe(
                "A summary of the page state after attempting to join the leaderboard."
              ),
          })
        );

        const screenshot = await page.screenshot({ fullPage: true });
        screenshotBase64 = screenshot.toString("base64");
        break;
      }

      case "view_user_profile": {
        const args = ViewUserProfileArgsSchema.parse(request.params.arguments);
        const { username } = args;

        // Step 1: Click on the link associated with the username '{username}'
        const instruction = `Click on the link associated with the username "${username}" to navigate to their profile page.`;
        const actions = await stagehand.observe(instruction);
        if (!actions || actions.length === 0) {
          throw new Error(`Could not find element for: ${instruction}`);
        }
        await stagehand.act(actions[0]);
        await page.waitForLoadState("domcontentloaded"); // Wait for page to load after navigation/interaction

        // Extract a brief summary of the user profile page
        result = await stagehand.extract(
          `Extract a brief summary of the user profile page for "${username}", including visible details like their trades, P&L, or activity.`,
          z.object({
            summary: z
              .string()
              .describe("A summary of the user's profile page content."),
          })
        );

        const screenshot = await page.screenshot({ fullPage: true });
        screenshotBase64 = screenshot.toString("base64");
        break;
      }

      default:
        return {
          content: [
            {
              type: "text",
              text: `Unknown tool: ${request.params.name}`,
            },
          ],
          isError: true,
        };
    }

    // Validate result and screenshotBase64 before returning
    if (!result) {
      throw new Error(
        `Tool '${request.params.name}' completed without producing a result.`
      );
    }
    if (!screenshotBase64) {
      throw new Error(
        `Tool '${request.params.name}' completed but failed to capture a screenshot.`
      );
    }

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(result, null, 2),
        },
        {
          type: "image",
          data: screenshotBase64,
          mimeType: "image/png",
        },
      ],
    };
  } catch (error) {
    // Take a screenshot on error for debugging purposes if possible
    let errorScreenshotBase64: string | undefined;
    try {
      const errorScreenshot = await page.screenshot({ fullPage: true });
      errorScreenshotBase64 = errorScreenshot.toString("base64");
    } catch (screenshotError) {
      console.error("Failed to take screenshot on error:", screenshotError);
    }

    const errorContent: Array<{
      type: "text" | "image";
      text?: string;
      data?: string;
      mimeType?: string;
    }> = [
      {
        type: "text",
        text: `❌ Error executing tool '${request.params.name}': ${
          error instanceof Error ? error.message : String(error)
        }\nStack: ${error instanceof Error ? error.stack : "N/A"}`,
      },
    ];

    if (errorScreenshotBase64) {
      errorContent.push({
        type: "image",
        data: errorScreenshotBase64,
        mimeType: "image/png",
      });
    }

    return {
      content: errorContent,
      isError: true,
    };
  }
});

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("www_printed_trade MCP server running on stdio"); // Updated server name
}

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});
