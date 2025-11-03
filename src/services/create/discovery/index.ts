import { Stagehand } from "@browserbasehq/stagehand";
import {
  DiscoveredAction,
  DiscoveredActionsResponseSchema,
} from "../schemas/index.js";

/**
 * Discover available actions on the website
 */
export async function discoverActions(
  stagehand: Stagehand,
  domain: string
): Promise<DiscoveredAction[]> {
  console.log(`\n🔎 Discovering actions on ${domain}...`);

  const exampleJSON = JSON.stringify(
    {
      actions: [
        {
          name: "get_page_info",
          description:
            "Get information about the current page including title, main content summary, and available actions",
          parameters: [],
          steps: [],
          extractionSchema: {
            pageTitle: "string - the title of the current page",
            summary: "string - brief summary of the main content",
            availableActions:
              "array of strings - list of key actions visible on the page",
          },
        },
        {
          name: "execute_action",
          description:
            "Use an AI agent to execute any action on the current page. The agent can perform multi-step tasks, click elements, fill forms, navigate, etc.",
          parameters: [
            {
              name: "instruction",
              type: "string",
              description:
                "Natural language instruction for what action to perform (e.g., 'Click on the first post about AI', 'Find and click the share button', 'Navigate to settings and enable notifications')",
              required: true,
            },
            {
              name: "maxSteps",
              type: "number",
              description:
                "Maximum number of steps the agent can take (default: 10)",
              required: false,
            },
          ],
          steps: [
            "Initialize AI agent with the instruction: {instruction}",
            "Agent autonomously executes the task within {maxSteps} steps",
            "Return the result of the action",
          ],
        },
        {
          name: "search_content",
          description: "Search for content on the website",
          parameters: [
            {
              name: "query",
              type: "string",
              description: "The search query to look up",
              required: true,
            },
          ],
          steps: [
            "Click on the search input field",
            "Type {query} into the search field",
            "Press enter or click search button",
          ],
          extractionSchema: {
            results:
              "array of search result objects with title, url, and optional description",
          },
        },
        {
          name: "create_new_item",
          description:
            "Create a new item (post, page, document, etc.) with title and content",
          parameters: [
            {
              name: "title",
              type: "string",
              description: "The title of the new item",
              required: true,
            },
            {
              name: "content",
              type: "string",
              description: "The main content or body text",
              required: false,
            },
          ],
          steps: [
            "Click on the 'New' or 'Create' button",
            "Type {title} into the title field",
            "Type {content} into the content/body field",
            "Click save or publish button",
          ],
        },
        {
          name: "navigate_to_section",
          description: "Navigate to a specific section of the website",
          parameters: [
            {
              name: "sectionName",
              type: "string",
              description: "Name of the section to navigate to",
              required: true,
            },
          ],
          steps: [
            "Find the {sectionName} section in the navigation menu",
            "Click on the {sectionName} link",
          ],
        },
      ],
    },
    null,
    2
  );

  let result;
  try {
    console.log("🤖 Initializing AI agent for website exploration...");

    const agent = stagehand.agent({
      systemPrompt: `You are a meticulous web automation analyst. Your job is to DEEPLY explore this ENTIRE website and identify the most useful actions a user might want to automate.

EXPLORATION STRATEGY - TAKE YOUR TIME AND BE THOROUGH:
1. Start at the homepage and methodically explore EVERY major section
2. Click through ALL navigation links, menus, dropdowns, and buttons
3. Look for hidden features (settings, profile menus, admin sections, modals, etc.)
4. Test different user flows and explore nested navigation
5. Identify MULTI-STEP workflows (e.g., create → edit → publish, search → filter → select → interact)
6. Document CRUD operations (Create, Read, Update, Delete) in detail
7. Note data retrieval patterns and what information can be extracted
8. Explore 2-3 levels deep into the site structure, not just surface pages
9. Spend time understanding the site's full capabilities before finalizing your list

DO NOT RUSH - Use your available steps to thoroughly understand the website. Quality over speed.

========================================================================
CRITICAL OUTPUT FORMAT REQUIREMENT - READ THIS CAREFULLY
========================================================================

You MUST respond with ONLY valid JSON. NO explanatory text, NO commentary, NO markdown formatting.
Your ENTIRE response must be ONLY the JSON object starting with { and ending with }.

DO NOT write things like "I have completed..." or "Here is the JSON..." or any other text.
Your response should be PURE JSON that can be directly parsed by JSON.parse().

CORRECT FORMAT:
${exampleJSON}

INCORRECT FORMATS (DO NOT DO THIS):
- "I have completed the exploration. Here is the JSON: {...}"
- "\`\`\`json\\n{...}\\n\`\`\`"
- "Based on my exploration, I found: {...}"

START YOUR RESPONSE WITH { AND END WITH } - NOTHING ELSE.
========================================================================

IMPORTANT REQUIREMENTS:
- ALWAYS include a "get_page_info" action as the FIRST action (with empty parameters and steps arrays)
- ALWAYS include an "execute_action" action as the SECOND action (allows performing arbitrary actions on the website)
- Focus on MULTI-STEP workflows that combine multiple UI interactions
- Each action should have 4-8 steps minimum (not just 1-2 steps)
- Break down complex workflows into detailed, atomic steps
- Explore deeper sections of the site, not just surface-level features
- Look for advanced features that power users would want automated
- Don't stop at the first page - navigate through and explore thoroughly

RULES:
- Return ONLY the JSON object, nothing else
- Each action MUST have: name (snake_case), description, parameters (array), steps (array)
- parameters: REQUIRED field, array of parameter objects with name, type, description, required
  - Include parameters for ANY action that needs user input (search query, item name, etc.)
  - Use empty array [] only for "get_page_info" action
- steps: Use {parameterName} placeholder syntax in steps where parameters should be inserted
  - Example: "Type {query} into search field" or "Click on {sectionName} link"
  - Break workflows into detailed steps (click button, wait for dialog, type text, select options, click save, etc.)
  - Each step should be a single, atomic UI interaction
  - Include 4-10 steps per action for thorough coverage
- extractionSchema: REQUIRED for data retrieval actions, optional for create/update actions
- Focus on 5-8 most useful and realistic actions (including get_page_info)
- Make sure steps are specific, detailed, and actionable

EXAMPLE MULTI-STEP WORKFLOWS:
- Create & publish: Click create button → Wait for form → Type title → Type content → Select category → Add tags → Click publish → Confirm publication
- Advanced search: Click search → Type query → Press enter → Wait for results → Click filter dropdown → Select filter option → Apply filter → Extract results
- Edit & save: Navigate to item → Wait for load → Click edit button → Modify title → Modify content → Update settings → Click save → Wait for confirmation
- Complex interaction: Find item → Click item → Wait for details → Click action button → Fill form fields → Select options → Submit → Verify success

REMEMBER: You have 200 steps available. Use them to explore thoroughly. Click through all sections, test different paths, and take your time to understand the full scope of what users can do on this site.`,
    });

    console.log("🔍 Agent exploring website (this may take a minute)...");

    result = await agent.execute({
      instruction: `TAKE YOUR TIME and DEEPLY explore this ENTIRE website. You have 200 steps - use them wisely to understand the full scope of this site.

EXPLORATION APPROACH:
1. Start at the homepage and click through ALL major navigation sections
2. Explore 2-3 levels deep - don't just stay on surface pages
3. Look for hidden features (user menus, settings, admin sections, modals)
4. Test different user flows and nested navigation paths
5. Identify complete, multi-step workflows that users would want automated

FIRST: Include "get_page_info" action with empty parameters and steps arrays.
SECOND: Include "execute_action" action to allow performing arbitrary actions on the website.

THEN: Identify 5-8 most useful MULTI-STEP actions that users would want to automate. Focus on:
- Complete workflows (create → edit → publish, search → filter → select → interact)
- CRUD operations with detailed, atomic steps
- Data retrieval with comprehensive extraction schemas
- Real user workflows that combine multiple interactions
- Advanced features that power users would want automated

Each action should have 4-8 detailed steps minimum. Break down the workflow into atomic UI interactions.

DO NOT RUSH. Quality and thoroughness over speed. Explore deeply before finalizing your list.

Return ONLY the JSON object, no additional text.`,
      maxSteps: 200,
    });

    if (!result || typeof result !== "object") {
      throw new Error("Agent execution returned invalid result");
    }

    if (!result.message) {
      throw new Error(
        "Agent execution returned result without message property"
      );
    }

    const responseMessage = result.message;
    console.log(`\n📋 Raw agent response:\n${responseMessage}\n`);

    // Strip markdown code blocks if present
    let jsonString = responseMessage.trim();

    // Remove ```json or ``` wrapper
    jsonString = jsonString.replace(/^```json\s*/i, "").replace(/^```\s*/, "");
    jsonString = jsonString.replace(/\s*```$/, "");
    jsonString = jsonString.trim();

    if (!jsonString.startsWith("{")) {
      console.log(
        "⚠️  Agent response doesn't start with JSON, attempting to extract..."
      );

      const jsonMatch = jsonString.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        jsonString = jsonMatch[0];
        console.log("✓ Found JSON object in response");
      } else {
        throw new Error(
          `Agent returned non-JSON response. Response started with: "${jsonString.substring(
            0,
            100
          )}..."`
        );
      }
    }

    // Parse the cleaned JSON
    const parsed = JSON.parse(jsonString);

    // Validate with Zod schema
    const validated = DiscoveredActionsResponseSchema.parse(parsed);

    console.log(
      `✅ Successfully discovered ${validated.actions.length} actions:`
    );
    validated.actions.forEach((action, i) => {
      console.log(`  ${i + 1}. ${action.name} - ${action.description}`);
    });

    return validated.actions;
  } catch (error) {
    console.error("❌ Error during agent execution:", error);
    if (error instanceof Error) {
      console.error("   Error message:", error.message);
      if (error.stack) {
        console.error("   Stack trace:", error.stack);
      }
    }
    throw new Error(
      `Failed to discover actions: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}
