#!/usr/bin/env node
/**
 * MCP Server for news.ycombinator.com
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
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
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

// Define the target URL for news.ycombinator.com
const TARGET_URL = "https://news.ycombinator.com/";

// MCP Server for news.ycombinator.com
const server = new Server(
  {
    name: "news_ycombinator_com",
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
const ViewArticleArgsSchema = z.object({
  articleTitle: z.string().min(1),
});

const ViewCommentsArgsSchema = z.object({
  articleTitle: z.string().min(1),
});

const NavigateSectionArgsSchema = z.object({
  sectionName: z.string().min(1),
});

const SearchPostsArgsSchema = z.object({
  query: z.string().min(1),
});

const SubmitPostArgsSchema = z.object({
  title: z.string().min(1),
  url: z.string().optional(),
  text: z.string().optional(),
});

const ViewUserProfileArgsSchema = z.object({
  username: z.string().min(1),
});

// List available tools for the news.ycombinator.com server
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "view_article",
        description: "View a specific article from the homepage",
        inputSchema: {
          type: "object",
          properties: {
            articleTitle: {
              type: "string",
              description: "The title of the article to view",
            },
          },
          required: ["articleTitle"],
        },
      },
      {
        name: "view_comments",
        description: "View the comments for a specific article",
        inputSchema: {
          type: "object",
          properties: {
            articleTitle: {
              type: "string",
              description: "The title of the article whose comments to view",
            },
          },
          required: ["articleTitle"],
        },
      },
      {
        name: "navigate_section",
        description:
          "Navigate to a specific section of Hacker News (e.g., 'new', 'past', 'ask', 'show', 'jobs', 'submit')",
        inputSchema: {
          type: "object",
          properties: {
            sectionName: {
              type: "string",
              description: "The name of the section to navigate to",
            },
          },
          required: ["sectionName"],
        },
      },
      {
        name: "search_posts",
        description: "Search Hacker News for posts matching a specific query",
        inputSchema: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "The search query",
            },
          },
          required: ["query"],
        },
      },
      {
        name: "submit_post",
        description: "Submit a new post to Hacker News",
        inputSchema: {
          type: "object",
          properties: {
            title: {
              type: "string",
              description: "The title of the post",
            },
            url: {
              type: "string",
              description: "The URL of the post (optional)",
            },
            text: {
              type: "string",
              description: "The text content of the post (optional, if no URL)",
            },
          },
          required: ["title"],
        },
      },
      {
        name: "view_user_profile",
        description: "View the profile of a specific user",
        inputSchema: {
          type: "object",
          properties: {
            username: {
              type: "string",
              description: "The username of the profile to view",
            },
          },
          required: ["username"],
        },
      },
    ],
  };
});

// Handle incoming tool call requests
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const stagehand = await initStagehand();
  const page = stagehand.context.pages()[0];

  try {
    // Ensure we start from a consistent page state for each tool call
    // Only navigate if the current URL is not already the target or a sub-path
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
      case "view_article": {
        const args = ViewArticleArgsSchema.parse(request.params.arguments);
        const { articleTitle } = args;

        // Click on the link with the title {articleTitle}
        await stagehand.act(
          `Click on the link with the title "${articleTitle}"`
        );

        // Extract article content
        result = await stagehand.extract(
          "Extract the main text content of the article page",
          {
            article_content: "text content of the article page",
          } as any
        );

        const screenshot = await page.screenshot({ fullPage: true });
        screenshotBase64 = screenshot.toString("base64");
        break;
      }

      case "view_comments": {
        const args = ViewCommentsArgsSchema.parse(request.params.arguments);
        const { articleTitle } = args;

        // Find the article with the title {articleTitle}
        await stagehand.act(
          `Find the article with the title "${articleTitle}"`
        );
        // Click on the 'comments' link associated with that article
        await stagehand.act(
          `Click on the 'comments' link associated with the article titled "${articleTitle}"`
        );

        // Extract comments
        result = await stagehand.extract(
          "Extract an array of comment objects, each with 'author' (string) and 'text' (string)",
          {
            comments: "array of comment objects with author and text",
          } as any
        );

        const screenshot = await page.screenshot({ fullPage: true });
        screenshotBase64 = screenshot.toString("base64");
        break;
      }

      case "navigate_section": {
        const args = NavigateSectionArgsSchema.parse(request.params.arguments);
        const { sectionName } = args;

        // Click on the '{sectionName}' link in the top navigation bar
        await stagehand.act(
          `Click on the "${sectionName}" link in the top navigation bar`
        );

        // Extract page summary (no specific extractionSchema)
        result = await stagehand.extract(
          `Extract a brief summary of the content on the current page after navigating to the "${sectionName}" section.`,
          {
            summary: "string describing the current page's main content",
          } as any
        );

        const screenshot = await page.screenshot({ fullPage: true });
        screenshotBase64 = screenshot.toString("base64");
        break;
      }

      case "search_posts": {
        const args = SearchPostsArgsSchema.parse(request.params.arguments);
        const { query } = args;

        // Click on the 'Search' link or button to reveal the search input if not visible
        try {
          await stagehand.act("Click the 'Search' link or button");
        } catch (e) {
          // If the search input is already visible or directly accessible, this might fail, which is okay.
          // Continue if the search input is expected to be present without clicking a toggle.
          console.error(
            "Could not find a 'Search' link/button, assuming input is always visible or implicit.",
            e
          );
        }

        // Type {query} into the search input field at the bottom of the page
        // Hacker News usually has a search input at the bottom or via a link to algolia search.
        // Assuming a search link on the top bar or a search input is always present.
        await stagehand.act(`Type "${query}" into the search input field`);
        // Press enter or click the search button next to the input
        await stagehand.act("Press Enter or click the search button");

        // Extract search results
        result = await stagehand.extract(
          "Extract an array of search result objects, each with 'title' (string), 'url' (string), and 'points' (number or string)",
          {
            results:
              "array of search result objects with title, url, and points",
          } as any
        );

        const screenshot = await page.screenshot({ fullPage: true });
        screenshotBase64 = screenshot.toString("base64");
        break;
      }

      case "submit_post": {
        const args = SubmitPostArgsSchema.parse(request.params.arguments);
        const { title, url, text } = args;

        // Click on the 'submit' link in the top navigation bar
        await stagehand.act(
          "Click on the 'submit' link in the top navigation bar"
        );
        // Type {title} into the 'title' input field
        await stagehand.act(`Type "${title}" into the 'title' input field`);

        // If a URL is provided, type {url} into the 'url' input field
        if (url) {
          await stagehand.act(`Type "${url}" into the 'url' input field`);
        }
        // If text is provided and no URL, type {text} into the 'text' textarea
        else if (text) {
          await stagehand.act(`Type "${text}" into the 'text' textarea`);
        }
        // Click on the 'submit' button
        await stagehand.act("Click on the 'submit' button");

        // Extract page summary (no specific extractionSchema) - e.g., success message or form state
        result = await stagehand.extract(
          "Extract a brief summary confirming the post submission or describing the current page state after submission attempt",
          {
            summary:
              "string describing the post submission status or next steps",
          } as any
        );

        const screenshot = await page.screenshot({ fullPage: true });
        screenshotBase64 = screenshot.toString("base64");
        break;
      }

      case "view_user_profile": {
        const args = ViewUserProfileArgsSchema.parse(request.params.arguments);
        const { username } = args;

        // To view a user profile, typically one clicks on the username link associated with a post or comment.
        // If we are directly linking to a user profile, the instruction might be different.
        // Assuming the task implies navigating from a page where the username is visible.
        await stagehand.act(
          `Click on the link with the username "${username}"`
        );

        // Extract user profile information
        result = await stagehand.extract(
          "Extract user profile information including username, karma, and about text",
          {
            user_profile:
              "object with username (string), karma (number), and about (string, can be empty)",
          } as any
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

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(result, null, 2),
        },
        {
          type: "image",
          data: screenshotBase64!, // screenshotBase64 will be assigned in each case block
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
        }`,
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
  console.error("news_ycombinator_com MCP server running on stdio");
}

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});
