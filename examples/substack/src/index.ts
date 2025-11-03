#!/usr/bin/env node
/**
 * MCP Server for substack.com
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
import fs from "fs/promises";
import https from "https";

// Load environment variables from standard locations
const GLOBAL_ENV_PATH = path.join(os.homedir(), ".mcpkit", ".env");
if (existsSync(GLOBAL_ENV_PATH)) {
  dotenv.config({ path: GLOBAL_ENV_PATH, override: false });
}

const LOCAL_ENV_PATH = path.join(process.cwd(), ".env");
if (existsSync(LOCAL_ENV_PATH)) {
  dotenv.config({ path: LOCAL_ENV_PATH, override: false });
}

// Define the target URL for substack.com
const TARGET_URL = "https://substack.com/";

// MCP Server for substack.com
const server = new Server(
  {
    name: "substack_com",
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
    const contextFilePath = path.join(
      os.homedir(),
      ".mcpkit",
      "contexts",
      `${domain}.txt`
    );
    const contextId = await fs.readFile(contextFilePath, "utf-8");
    console.error(
      `🔍 Using saved context from mcpkit: ${contextId} for domain: ${domain}`
    );
    return contextId.trim();
  } catch (error) {
    return null;
  }
}

/**
 * Create a new browser context
 */
async function createNewContext(): Promise<string> {
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
    console.error(
      `🔍 Using context ID from environment: ${process.env.BROWSERBASE_CONTEXT_ID} for domain: ${domain}`
    );
    return process.env.BROWSERBASE_CONTEXT_ID;
  }

  // Second, check if we have a saved context from mcpkit
  const savedContextId = await getSavedContextId(domain);
  if (savedContextId) {
    console.error(
      `♻️  Using saved context from mcpkit: ${savedContextId} for domain: ${domain}`
    );
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
    console.error(`🔍 Initializing Stagehand for domain: ${domain}`);

    // Get or create context ID
    const contextId = await getOrCreateContextId(domain);

    stagehand = new Stagehand({
      env: "BROWSERBASE",
      verbose: 2, // Set to 2 for detailed debugging (change back to 0 for production)
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
const SearchPostsArgsSchema = z.object({
  query: z
    .string()
    .min(1)
    .describe("The search query (e.g., topic, author, publication name)."),
});

const CreateNewPostArgsSchema = z.object({
  title: z.string().min(1).describe("The title of the post"),
  subtitle: z
    .string()
    .optional()
    .describe("The subtitle of the post (optional)"),
  bodyText: z
    .string()
    .optional()
    .describe("The body text content of the post (optional)"),
});

const NavigateToSectionArgsSchema = z.object({
  sectionName: z
    .string()
    .min(1)
    .describe(
      "The name of the section to navigate to (e.g., 'Home', 'Subscriptions', 'Chat', 'Activity', 'Explore', 'Dashboard', 'Profile')."
    )
    .refine(
      (name) =>
        [
          "Home",
          "Subscriptions",
          "Chat",
          "Activity",
          "Explore",
          "Dashboard",
          "Profile",
          "Sign up",
          "Log in",
        ].includes(name),
      {
        message:
          "Section name must be one of: 'Home', 'Subscriptions', 'Chat', 'Activity', 'Explore', 'Dashboard', 'Profile', 'Sign up', 'Log in'.",
      }
    ),
});

const FollowCreatorArgsSchema = z.object({
  creatorName: z.string().min(1).describe("The name of the creator to follow."),
});

const InteractWithPostArgsSchema = z.object({
  postTitleKeyword: z
    .string()
    .min(1)
    .describe("A keyword or phrase to identify the target post."),
  interactionType: z
    .enum(["like", "comment", "restack", "share"])
    .describe(
      "The type of interaction: 'like', 'comment', 'restack', or 'share'."
    ),
  commentContent: z
    .string()
    .optional()
    .describe(
      "Optional: The text to add if the interaction type is 'comment'."
    ),
});

const ReadPostArgsSchema = z.object({
  postTitle: z.string().min(1).describe("The full title of the post to read."),
});

// Define Zod schemas for extraction
const SearchResultsExtractionSchema = z.object({
  results: z
    .array(
      z.object({
        title: z.string().describe("Title of the post or publication."),
        author: z
          .string()
          .optional()
          .describe("Author of the post/publication, if available."),
        url: z.string().url().describe("URL to the post or publication."),
        description: z
          .string()
          .optional()
          .describe("Brief description or snippet."),
      })
    )
    .describe("An array of search result objects."),
});

const PostContentExtractionSchema = z.object({
  article_content: z
    .string()
    .min(1)
    .describe("The main text content of the post."),
});

const PageSummaryExtractionSchema = z.object({
  summary: z
    .string()
    .min(1)
    .describe("A brief summary of the current page's main content or state."),
});

// List available tools for the substack.com server
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "search_posts",
        description: "Search for posts and publications on Substack.",
        inputSchema: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description:
                "The search query (e.g., topic, author, publication name).",
            },
          },
          required: ["query"],
        },
      },
      {
        name: "create_new_post",
        description:
          "Create a new post on Substack with title, subtitle, and body text.",
        inputSchema: {
          type: "object",
          properties: {
            title: {
              type: "string",
              description: "The title of the post",
            },
            subtitle: {
              type: "string",
              description: "The subtitle of the post (optional)",
            },
            bodyText: {
              type: "string",
              description: "The body text content of the post (optional)",
            },
          },
          required: ["title"],
        },
      },
      {
        name: "navigate_to_section",
        description:
          "Navigate to a specific main section of the Substack website.",
        inputSchema: {
          type: "object",
          properties: {
            sectionName: {
              type: "string",
              description:
                "The name of the section to navigate to (e.g., 'Home', 'Subscriptions', 'Chat', 'Activity', 'Explore', 'Dashboard', 'Profile', 'Sign up', 'Log in').",
            },
          },
          required: ["sectionName"],
        },
      },
      {
        name: "follow_creator",
        description: "Follow a creator suggested on the platform.",
        inputSchema: {
          type: "object",
          properties: {
            creatorName: {
              type: "string",
              description: "The name of the creator to follow.",
            },
          },
          required: ["creatorName"],
        },
      },
      {
        name: "interact_with_post",
        description:
          "Perform an interaction (like, comment, restack, or share) on a specific post.",
        inputSchema: {
          type: "object",
          properties: {
            postTitleKeyword: {
              type: "string",
              description: "A keyword or phrase to identify the target post.",
            },
            interactionType: {
              type: "string",
              enum: ["like", "comment", "restack", "share"],
              description:
                "The type of interaction: 'like', 'comment', 'restack', or 'share'.",
            },
            commentContent: {
              type: "string",
              description:
                "Optional: The text to add if the interaction type is 'comment'.",
            },
          },
          required: ["postTitleKeyword", "interactionType"],
        },
      },
      {
        name: "read_post",
        description: "Open and read a specific post or article.",
        inputSchema: {
          type: "object",
          properties: {
            postTitle: {
              type: "string",
              description: "The full title of the post to read.",
            },
          },
          required: ["postTitle"],
        },
      },
    ],
  };
});

// Handle incoming tool call requests
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  // Check if stagehand needs to be reinitialized
  let needsReinit = false;
  if (!stagehand) {
    needsReinit = true;
  } else {
    try {
      // Check if context and pages are accessible
      if (
        !stagehand.context ||
        !stagehand.context.pages ||
        stagehand.context.pages().length === 0
      ) {
        needsReinit = true;
        console.error("⚠️  Stagehand context is invalid, reinitializing...");
      }
    } catch (error) {
      needsReinit = true;
      console.error(
        "⚠️  Error accessing stagehand context, reinitializing...",
        error
      );
    }
  }

  if (needsReinit) {
    // Reset the stagehand instance to force reinitialization
    stagehand = null as any;
  }

  const stagehandInstance = await initStagehand();
  const page = stagehandInstance.context.pages()[0];

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

  let result: any;
  let screenshotBase64: string | undefined;

  try {
    switch (request.params.name) {
      case "search_posts": {
        const args = SearchPostsArgsSchema.parse(request.params.arguments);
        const { query } = args;

        // Step 1: Click the global search box
        const searchBoxInstruction = "Click the global search box";
        const searchBoxActions = await stagehandInstance.observe(
          searchBoxInstruction
        );
        if (!searchBoxActions || searchBoxActions.length === 0) {
          throw new Error(
            `Could not find element for: ${searchBoxInstruction}`
          );
        }
        await stagehandInstance.act(searchBoxActions[0]);
        await page.waitForLoadState("domcontentloaded");

        // Step 2: Type {query} into the search input
        const typeQueryInstruction = `Type "${query}" into the search input`;
        const typeQueryActions = await stagehandInstance.observe(
          typeQueryInstruction
        );
        if (!typeQueryActions || typeQueryActions.length === 0) {
          throw new Error(
            `Could not find element for: ${typeQueryInstruction}`
          );
        }
        await stagehandInstance.act(typeQueryActions[0]);
        await page.waitForLoadState("domcontentloaded");

        // Step 3: Press enter
        const pressEnterInstruction = "Press Enter";
        const pressEnterActions = await stagehandInstance.observe(
          pressEnterInstruction
        );
        if (!pressEnterActions || pressEnterActions.length === 0) {
          throw new Error(
            `Could not find element for: ${pressEnterInstruction}`
          );
        }
        await stagehandInstance.act(pressEnterActions[0]);
        await page.waitForLoadState("domcontentloaded");

        // Extract search results
        result = await stagehandInstance.extract(
          "Extract an array of objects with title, author (if present), url, and a short description for each post/publication listed in the search results.",
          SearchResultsExtractionSchema
        );
        break;
      }

      case "create_new_post": {
        const args = CreateNewPostArgsSchema.parse(request.params.arguments);
        const { title, subtitle, bodyText } = args;

        // Step 1: Click the 'New post' button.
        const newPostInstruction = "Click the 'Create' button";
        const newPostActions = await stagehandInstance.observe(
          newPostInstruction
        );
        if (!newPostActions || newPostActions.length === 0) {
          throw new Error(`Could not find element for: ${newPostInstruction}`);
        }
        await stagehandInstance.act(newPostActions[0]);
        await page.waitForLoadState("domcontentloaded");
        //click the 'Post' button in the dropdown
        const pageButtonInstruction = "Click the 'Post' button in the dropdown";
        const pageButtonActions = await stagehandInstance.observe(
          pageButtonInstruction
        );
        if (!pageButtonActions || pageButtonActions.length === 0) {
          throw new Error(
            `Could not find element for: ${pageButtonInstruction}`
          );
        }
        await stagehandInstance.act(pageButtonActions[0]);
        await page.waitForLoadState("domcontentloaded");

        // Step 2: Click the title field to focus it
        const clickTitleInstruction = `Click the "Title" field, and type "${title}", it is above the "Subtitle" field`;
        const clickTitleActions = await stagehandInstance.observe(
          clickTitleInstruction
        );
        if (!clickTitleActions || clickTitleActions.length === 0) {
          throw new Error(
            `Could not find element for: ${clickTitleInstruction}`
          );
        }
        for (const action of clickTitleActions) {
          await stagehandInstance.act(action);
        }
        await page.waitForLoadState("domcontentloaded");

        // Step 4: If subtitle is provided, type it into the subtitle field
        if (subtitle) {
          const typeSubtitleInstruction = `Click the subtitle field, and type "${subtitle}"`;
          const typeSubtitleActions = await stagehandInstance.observe(
            typeSubtitleInstruction
          );
          if (!typeSubtitleActions || typeSubtitleActions.length === 0) {
            throw new Error(
              `Could not find element for: ${typeSubtitleInstruction}`
            );
          }
          for (const action of typeSubtitleActions) {
            await stagehandInstance.act(action);
          }
          await page.waitForLoadState("domcontentloaded");
        }

        // Step 5: If bodyText is provided, type it into the body text field
        if (bodyText) {
          const typeBodyInstruction = `Click the 'Start writing...' field, and type "${bodyText}"`;
          const typeBodyActions = await stagehandInstance.observe(
            typeBodyInstruction
          );
          if (!typeBodyActions || typeBodyActions.length === 0) {
            throw new Error(
              `Could not find element for: ${typeBodyInstruction}`
            );
          }
          for (const action of typeBodyActions) {
            await stagehandInstance.act(action);
          }
          await page.waitForLoadState("domcontentloaded");
        }

        //now hit continue button
        const continueButtonInstruction = "Click the 'Continue' button";
        const continueButtonActions = await stagehandInstance.observe(
          continueButtonInstruction
        );
        if (!continueButtonActions || continueButtonActions.length === 0) {
          throw new Error(
            `Could not find element for: ${continueButtonInstruction}`
          );
        }
        await stagehandInstance.act(continueButtonActions[0]);
        await page.waitForLoadState("domcontentloaded");

        //now hit "send to everyone now" button
        const sendToEveryoneNowButtonInstruction =
          "Click the 'Send to everyone now' button";
        const sendToEveryoneNowButtonActions = await stagehandInstance.observe(
          sendToEveryoneNowButtonInstruction
        );
        if (
          !sendToEveryoneNowButtonActions ||
          sendToEveryoneNowButtonActions.length === 0
        ) {
          throw new Error(
            `Could not find element for: ${sendToEveryoneNowButtonInstruction}`
          );
        }
        await stagehandInstance.act(sendToEveryoneNowButtonActions[0]);
        await page.waitForLoadState("domcontentloaded");

        //click publish without buttons
        const publishWithoutButtonInstruction =
          "Click the 'Publish without' button";
        const publishWithoutButtonActions = await stagehandInstance.observe(
          publishWithoutButtonInstruction
        );
        if (
          !publishWithoutButtonActions ||
          publishWithoutButtonActions.length === 0
        ) {
          throw new Error(
            `Could not find element for: ${publishWithoutButtonInstruction}`
          );
        }
        await stagehandInstance.act(publishWithoutButtonActions[0]);

        await page.waitForLoadState("domcontentloaded");

        // Try to extract the link, with error handling to see raw response
        try {
          result = await stagehandInstance.extract(
            "Extract the link to the post in the 'Share your link' section within the input field",
            z.object({
              link: z
                .string()
                .url()
                .describe(
                  "The link to the post in the 'Share your link' section within the input field"
                ),
            })
          );
          console.error(`🔍 Link to the new post: ${result.link}`);
        } catch (extractError) {
          console.error(`⚠️  Extract error:`, extractError);

          // Fallback: try extracting without strict schema to see what we get
          const fallbackResult = await stagehandInstance.extract(
            "Extract the URL or link to the newly published post that appears on this page"
          );
          console.error(
            `🔍 Fallback extraction result:`,
            JSON.stringify(fallbackResult, null, 2)
          );

          // Set result to the fallback
          result = {
            link: fallbackResult.extraction || page.url(),
            note: "Extracted using fallback method - link may need verification",
          };
        }
        break;
      }

      case "navigate_to_section": {
        const args = NavigateToSectionArgsSchema.parse(
          request.params.arguments
        );
        const { sectionName } = args;

        // Step 1: Click the '{sectionName}' button in the main navigation menu.
        const navigateInstruction = `Click the "${sectionName}" link or button in the main navigation menu`;
        const navigateActions = await stagehandInstance.observe(
          navigateInstruction
        );
        if (!navigateActions || navigateActions.length === 0) {
          throw new Error(`Could not find element for: ${navigateInstruction}`);
        }
        await stagehandInstance.act(navigateActions[0]);
        await page.waitForLoadState("domcontentloaded");

        // Extract page summary
        result = await stagehandInstance.extract(
          `Extract a brief summary of the content on the current page after navigating to the "${sectionName}" section.`,
          PageSummaryExtractionSchema
        );
        break;
      }

      case "follow_creator": {
        const args = FollowCreatorArgsSchema.parse(request.params.arguments);
        const { creatorName } = args;

        // Step 1: Scroll to the 'Suggestions' section
        // Stagehand's act is smart enough to find and scroll to elements
        const scrollInstruction =
          "Scroll to the 'Suggestions' section or similar creator recommendation area";
        const scrollActions = await stagehandInstance.observe(
          scrollInstruction
        );
        if (!scrollActions || scrollActions.length === 0) {
          // It's possible there are no suggestions or the section is not visible.
          // Try to proceed, or throw if essential. For now, log and continue to next step.
          console.warn(
            `Could not find a specific scroll action for suggestions. Attempting to proceed with follow if creator is visible.`
          );
        } else {
          await stagehandInstance.act(scrollActions[0]);
          await page.waitForLoadState("domcontentloaded");
        }

        // Step 2 & 3: Find the creator named {creatorName} and Click the 'Follow' button next to {creatorName}
        const followInstruction = `Click the 'Follow' button next to the creator named "${creatorName}"`;
        const followActions = await stagehandInstance.observe(
          followInstruction
        );
        if (!followActions || followActions.length === 0) {
          throw new Error(`Could not find element for: ${followInstruction}`);
        }
        await stagehandInstance.act(followActions[0]);
        await page.waitForLoadState("domcontentloaded");

        // Extract page summary
        result = await stagehandInstance.extract(
          `Extract a brief summary confirming the follow action or describing the current page state after attempting to follow "${creatorName}".`,
          PageSummaryExtractionSchema
        );
        break;
      }

      case "interact_with_post": {
        const args = InteractWithPostArgsSchema.parse(request.params.arguments);
        const { postTitleKeyword, interactionType, commentContent } = args;

        // Step 1: Locate the post containing '{postTitleKeyword}'
        const locatePostInstruction = `Locate the post containing "${postTitleKeyword}"`;
        const locatePostActions = await stagehandInstance.observe(
          locatePostInstruction
        );
        if (!locatePostActions || locatePostActions.length === 0) {
          throw new Error(
            `Could not find element for: ${locatePostInstruction}`
          );
        }
        // No direct act here, as we are just locating. The next step will act on the found post.
        // Stagehand's intelligence will carry the context of the located post to the next instruction.

        // Step 2: Click the '{interactionType}' button associated with that post
        const interactInstruction = `Click the '${interactionType}' button associated with the post containing "${postTitleKeyword}"`;
        const interactActions = await stagehandInstance.observe(
          interactInstruction
        );
        if (!interactActions || interactActions.length === 0) {
          throw new Error(`Could not find element for: ${interactInstruction}`);
        }
        await stagehandInstance.act(interactActions[0]);
        await page.waitForLoadState("domcontentloaded");

        // Step 3: If '{interactionType}' is 'comment', type '{commentContent}' into the comment field and press enter
        if (interactionType === "comment" && commentContent) {
          const typeCommentInstruction = `Type "${commentContent}" into the comment field and press Enter`;
          const typeCommentActions = await stagehandInstance.observe(
            typeCommentInstruction
          );
          if (!typeCommentActions || typeCommentActions.length === 0) {
            throw new Error(
              `Could not find element for: ${typeCommentInstruction}`
            );
          }
          await stagehandInstance.act(typeCommentActions[0]);
          await page.waitForLoadState("domcontentloaded");
        }

        // Extract page summary
        result = await stagehandInstance.extract(
          `Extract a brief summary confirming the "${interactionType}" interaction on the post "${postTitleKeyword}" or describing the current page state.`,
          PageSummaryExtractionSchema
        );
        break;
      }

      case "read_post": {
        const args = ReadPostArgsSchema.parse(request.params.arguments);
        const { postTitle } = args;

        // Step 1 & 2: Locate the link for the post with title '{postTitle}' and Click on the post title link
        const readPostInstruction = `Click on the link for the post with title "${postTitle}"`;
        const readPostActions = await stagehandInstance.observe(
          readPostInstruction
        );
        if (!readPostActions || readPostActions.length === 0) {
          throw new Error(`Could not find element for: ${readPostInstruction}`);
        }
        await stagehandInstance.act(readPostActions[0]);
        await page.waitForLoadState("domcontentloaded");

        // Extract article content
        result = await stagehandInstance.extract(
          "Extract the main text content of the article page.",
          PostContentExtractionSchema
        );
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

    // Take screenshot after successful operation
    const screenshot = await page.screenshot({ fullPage: true });
    screenshotBase64 = screenshot.toString("base64");

    // Validate result and screenshotBase64 before returning
    if (result === undefined) {
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
  console.error("substack_com MCP server running on stdio");
  const stagehandInstance = await initStagehand();
  console.error(`🔍 Stagehand initialized: ${stagehandInstance}`);
}

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});
