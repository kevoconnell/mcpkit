import {
  lookupCredentialsIn1Password,
  promptForCredentials,
  saveCredentialsTo1Password,
} from "../1password/index.js";
import { Stagehand } from "@browserbasehq/stagehand";
import { z } from "zod";
import { loadEnv } from "../../config/env.js";
import { GoogleGenerativeAI } from "@google/generative-ai";
import path from "path";

loadEnv();

// Zod schema for discovered actions
const DiscoveredActionSchema = z.object({
  name: z.string(),
  description: z.string(),
  steps: z.array(z.string()),
  parameters: z
    .array(
      z.object({
        name: z.string(),
        type: z.enum(["string", "number", "boolean"]),
        description: z.string(),
        required: z.boolean().optional(),
      })
    )
    .optional(),
  extractionSchema: z.record(z.string()).optional(),
});

const DiscoveredActionsResponseSchema = z.object({
  actions: z.array(DiscoveredActionSchema),
});

type DiscoveredAction = z.infer<typeof DiscoveredActionSchema>;

const AuthAnalysisSchema = z.object({
  requiresAuth: z.boolean(),
  loginButton: z.string().optional(), // The action to click to start login flow
  summary: z.string().optional(),
  canAutofill: z.boolean().optional(),
  recommendedStrategy: z
    .enum(["autofill", "manual", "passwordless", "unknown"])
    .optional(),
  steps: z.array(z.string()).optional(),
  blockers: z.array(z.string()).optional(),
  mfa: z
    .object({
      required: z.boolean(),
      description: z.string().optional(),
    })
    .optional(),
});

type AuthAnalysis = z.infer<typeof AuthAnalysisSchema>;

interface Credentials {
  username: string;
  password: string;
}

type StagehandPage = Awaited<
  ReturnType<Stagehand["context"]["awaitActivePage"]>
>;

/**
 * Get the Browserbase debug URL for user interaction
 */
export function getDebugUrl(stagehand: Stagehand): string {
  const sessionId = stagehand.browserbaseSessionId;
  if (!sessionId) {
    throw new Error("No active Browserbase session");
  }
  return `https://www.browserbase.com/sessions/${sessionId}`;
}

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

  const credentials = await lookupCredentialsIn1Password(domain);
  console.log("Credentials from 1Password:", credentials);

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

  // Attempt automatic login if credentials are available
  if (credentials && analysis.canAutofill) {
    console.log(
      "\n🔐 Attempting automatic login with 1Password credentials..."
    );
    try {
      // Use Stagehand to fill in the login form
      await stagehand.act(
        `Type "${credentials.username}" into the username or email field`
      );
      await stagehand.act(
        `Type "${credentials.password}" into the password field`
      );
      await stagehand.act("Click the login or sign in button");

      // Wait for navigation/login to complete
      await activePage.waitForLoadState("networkidle", 10_000).catch(() => {});

      // Re-analyze to check if login succeeded
      analysis = await analyzeAuthenticationState(stagehand, activePage);

      if (!analysis.requiresAuth) {
        console.log("✅ Automatic login successful!");
        return;
      } else {
        console.log(
          "⚠️  Automatic login may have failed, falling back to manual authentication"
        );
      }
    } catch (error) {
      console.log(
        `⚠️  Automatic login failed: ${
          error instanceof Error ? error.message : error
        }`
      );
      console.log("Falling back to manual authentication...");
    }
  }

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
          name: "search_documentation",
          description: "Search the documentation for a specific query",
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
            results: "array of search result objects with title and url",
          },
        },
        {
          name: "navigate_to_section",
          description: "Navigate to a specific section of the documentation",
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

  // Use Stagehand agent to analyze the ENTIRE website
  let result;
  try {
    console.log("🤖 Initializing AI agent for website exploration...");

    const agent = stagehand.agent({
      model: {
        modelName: "google/gemini-2.5-flash",
        apiKey:
          process.env.GEMINI_API_KEY ??
          process.env.GOOGLE_GENERATIVE_AI_API_KEY,
      },
      systemPrompt: `You are a web automation analyst. Your job is to explore this ENTIRE website and identify the most useful actions a user might want to automate.

EXPLORATION STRATEGY:
1. Navigate through the main sections of the website
2. Click on navigation links, menus, and key areas
3. Identify patterns and common workflows
4. Focus on CRUD operations (Create, Read, Update, Delete) and data retrieval

CRITICAL: You MUST respond with ONLY valid JSON in this EXACT format, with no additional text:

${exampleJSON}

RULES:
- Return ONLY the JSON object, nothing else
- Each action MUST have: name (snake_case), description, parameters (array), steps (array)
- parameters: REQUIRED field, array of parameter objects with name, type, description, required
  - Include parameters for ANY action that needs user input (search query, item name, etc.)
  - Use empty array [] only if action truly needs no input
- steps: Use {parameterName} placeholder syntax in steps where parameters should be inserted
  - Example: "Type {query} into search field" or "Click on {sectionName} link"
  - This allows the generated code to interpolate the actual parameter values
- extractionSchema: optional but recommended for data retrieval actions
- Focus on 5-10 most useful and realistic actions
- Make sure steps are specific and actionable`,
    });

    console.log("🔍 Agent exploring website (this may take a minute)...");

    result = await agent.execute({
      instruction: `Explore this ENTIRE website thoroughly. Navigate through different pages, sections, and features. Identify the top 5-10 most useful actions a user might want to automate. Focus on CRUD operations and data retrieval. Return ONLY the JSON object, no additional text.`,
      maxSteps: 20,
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

async function analyzeAuthenticationState(
  stagehand: Stagehand,
  page: StagehandPage
): Promise<AuthAnalysis> {
  stagehand.context.setActivePage(page);

  try {
    const result = await stagehand.extract(
      `Inspect the current page for authentication state.

Key questions to answer:
1. Does the user need to sign in? (requiresAuth: true/false)
2. If yes, what button/link should they click to start login? (loginButton: describe the action, e.g., "Click the Sign In button")
3. Can credentials be auto-filled? (canAutofill: true/false)
4. What's the recommended authentication strategy? (recommendedStrategy: "autofill", "manual", "passwordless", or "unknown")
5. Are there any blockers like MFA or SSO? (blockers: array of issues)

Return a complete analysis following the schema.`,
      AuthAnalysisSchema
    );
    return result;
  } catch (error) {
    const url = page.url();
    const requiresAuth = /login|signin|auth|sign-in|account/i.test(url);
    return {
      requiresAuth,
      summary:
        error instanceof Error
          ? `Heuristic result after extract error: ${error.message}`
          : "Heuristic result after extract error.",
    };
  }
}

function logAuthenticationAnalysis(analysis: AuthAnalysis, domain: string) {
  const summary = analysis.summary ?? `Sign-in required for ${domain}.`;
  console.log(`🔐 Login flow detected: ${summary}`);

  if (analysis.loginButton) {
    console.log(`   Login action: ${analysis.loginButton}`);
  }

  if (analysis.steps && analysis.steps.length > 0) {
    console.log("   Suggested steps:");
    analysis.steps.forEach((step, index) => {
      console.log(`   ${index + 1}. ${step}`);
    });
  }

  if (analysis.blockers && analysis.blockers.length > 0) {
    console.log("   Potential blockers:");
    analysis.blockers.forEach((blocker) => {
      console.log(`   - ${blocker}`);
    });
  }

  if (analysis.mfa?.required) {
    console.log(
      `   MFA required: ${
        analysis.mfa.description ?? "Complete MFA in the live session."
      }`
    );
  }
}

/**
 * Wait for user input and return what they typed
 */
async function waitForUserInput(): Promise<string> {
  return new Promise<string>((resolve) => {
    process.stdin.once("data", (data) => {
      resolve(data.toString());
    });
  });
}

/**
 * Open the Browserbase debugger URL in the default browser
 */
async function openDebuggerUrl(sessionId: string): Promise<void> {
  const { Browserbase } = await import("@browserbasehq/sdk");
  const browserbase = new Browserbase({
    apiKey: process.env.BROWSERBASE_API_KEY!,
  });

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

/**
 * Generate all MCP server files
 */
export async function generateMCPServerCode(
  domain: string,
  url: string,
  actions: DiscoveredAction[]
): Promise<{
  serverCode: string;
  packageJson: string;
  envExample: string;
  readme: string;
  tsconfig: string;
}> {
  const serviceName = domain.replace(/\./g, "_");

  // Generate server code using LLM
  console.log("\n🤖 Generating MCP server code with AI...");
  const serverCode = await generateServerCodeWithLLM(
    domain,
    url,
    actions,
    serviceName
  );

  // Generate static template files
  const packageJson = generatePackageJson(serviceName);
  const envExample = generateEnvExample(domain);
  const readme = generateReadme(serviceName, domain, actions);
  const tsconfig = generateTsConfig();

  return {
    serverCode,
    packageJson,
    envExample,
    readme,
    tsconfig,
  };
}

/**
 * Generate server code using LLM for more flexible code generation
 */
async function generateServerCodeWithLLM(
  domain: string,
  url: string,
  actions: DiscoveredAction[],
  serviceName: string
): Promise<string> {
  // Read the example MCP server file
  const fs = await import("fs/promises");
  const exampleFilePath = path.join(
    process.cwd(),
    "examples",
    "hackernews",
    "src",
    "index.ts"
  );

  let exampleServerCode = "";
  try {
    exampleServerCode = await fs.readFile(exampleFilePath, "utf-8");
  } catch (error) {
    console.warn("⚠️  Could not read example file, using minimal example");
    exampleServerCode = "// Example not available";
  }

  const gemini = new GoogleGenerativeAI(
    process.env.GEMINI_API_KEY ?? process.env.GOOGLE_GENERATIVE_AI_API_KEY!
  );
  const model = gemini.getGenerativeModel({ model: "gemini-2.5-flash" });

  const prompt = `Generate a complete TypeScript MCP server file for ${domain}.

REQUIREMENTS:
1. Follow the EXACT structure and patterns from the example code provided below
2. Generate tool handlers for ALL ${actions.length} actions
3. For each action:
   - Extract parameters from request.params.arguments
   - Use template literals (\`\${paramName}\`) for parameter interpolation
   - IMPORTANT: Use the observe + act pattern for ALL actions (best practice to avoid DOM changes):
     const actions = await stagehand.observe("instruction here");
     if (!actions || actions.length === 0) {
       throw new Error("Could not find element for: instruction here");
     }
     await stagehand.act(actions[0]);
     await page.waitForLoadState('domcontentloaded'); // Wait for page to load after navigation
   - Execute ALL action steps in sequence using the observe + act pattern with error checking
   - For actions with extractionSchema: use Zod schemas for type-safe extraction
   - For actions without extractionSchema: extract page summary after steps
   - ALWAYS take a screenshot using page.screenshot() and convert to base64 with screenshot.toString("base64")
   - Validate result and screenshotBase64 before returning to catch extraction failures early
   - Return BOTH the extracted data AND the screenshot in the response
4. Use comprehensive error handling:
   - Wrap all tool handlers in try/catch
   - Log errors to console.error with stack traces for debugging
   - Include detailed error messages and stack traces in error responses
   - Take screenshots on error for debugging
5. Keep code clean, well-commented, and production-ready
6. Import and use Zod (z) for schema validation in extraction calls

ACTIONS TO IMPLEMENT:
${JSON.stringify(actions, null, 2)}

CRITICAL RULES:
- Server name: "${serviceName}"
- Target URL: "${url}" for page.goto()
- Import all required modules at the top (including 'z' from 'zod')
- Use template literals for parameter interpolation: \`Text with \${param}\`
- Always include screenshots in responses
- Return JSON data + screenshot for every tool
- DO NOT include outputSchema in tool definitions (causes MCP SDK validation errors)
- Use Zod schemas in stagehand.extract() for structured data extraction

IMPORTANT - Tool Definitions:
- Tool definitions should ONLY have:
  * name: string
  * description: string
  * inputSchema: JSON Schema object (converted from Zod using zodSchemaToJsonSchema helper)
- DO NOT include outputSchema field - it causes validation errors in the MCP SDK
- Example CORRECT tool definition:
  {
    name: "get_stories",
    description: "Get top stories from the site",
    inputSchema: zodSchemaToJsonSchema(GetStoriesArgsSchema)
    // NO outputSchema field!
  }

IMPORTANT - Response Format:
- Always return data as JSON string + screenshot:
  return {
    content: [
      { type: "text", text: JSON.stringify(result, null, 2) },
      { type: "image", data: screenshotBase64, mimeType: "image/png" }
    ]
  };
- Use Zod schemas in stagehand.extract() calls for structured extraction:
  const result = await stagehand.extract(
    "Extract stories with title and url",
    z.object({ stories: z.array(z.object({ title: z.string(), url: z.string() })) })
  );

zod llms text:

# Zod

> Zod is a TypeScript-first schema validation library with static type inference. This documentation provides comprehensive coverage of Zod 4's features, API, and usage patterns.

## Defining schemas

- [Defining schemas](https://zod.dev/api): Complete API reference for all Zod schema types, methods, and validation features

- [Primitives](https://zod.dev/api?id=primitives)
- [Coercion](https://zod.dev/api?id=coercion)
- [Literals](https://zod.dev/api?id=literals)
- [Strings](https://zod.dev/api?id=strings)
- [String formats](https://zod.dev/api?id=string-formats)
- [Emails](https://zod.dev/api?id=emails)
- [UUIDs](https://zod.dev/api?id=uuids)
- [URLs](https://zod.dev/api?id=urls)
- [ISO datetimes](https://zod.dev/api?id=iso-datetimes)
- [ISO dates](https://zod.dev/api?id=iso-dates)
- [ISO times](https://zod.dev/api?id=iso-times)
- [IP addresses](https://zod.dev/api?id=ip-addresses)
- [IP blocks (CIDR)](https://zod.dev/api?id=ip-blocks-cidr)
- [JWTs](https://zod.dev/api?id=jwts)
- [Hashes](https://zod.dev/api?id=hashes)
- [Custom formats](https://zod.dev/api?id=custom-formats)
- [Template literals](https://zod.dev/api?id=template-literals)
- [Numbers](https://zod.dev/api?id=numbers)
- [Integers](https://zod.dev/api?id=integers)
- [BigInts](https://zod.dev/api?id=bigints)
- [Booleans](https://zod.dev/api?id=booleans)
- [Dates](https://zod.dev/api?id=dates)
- [Enums](https://zod.dev/api?id=enums)
- [.enum](https://zod.dev/api?id=enum)
- [.exclude()](https://zod.dev/api?id=exclude)
- [.extract()](https://zod.dev/api?id=extract)
- [Stringbools](https://zod.dev/api?id=stringbool)
- [Optionals](https://zod.dev/api?id=optionals)
- [Nullables](https://zod.dev/api?id=nullables)
- [Nullish](https://zod.dev/api?id=nullish)
- [Unknown](https://zod.dev/api?id=unknown)
- [Never](https://zod.dev/api?id=never)
- [Objects](https://zod.dev/api?id=objects)
- [z.strictObject](https://zod.dev/api?id=zstrictobject)
- [z.looseObject](https://zod.dev/api?id=zlooseobject)
- [.catchall()](https://zod.dev/api?id=catchall)
- [.shape](https://zod.dev/api?id=shape)
- [.keyof()](https://zod.dev/api?id=keyof)
- [.extend()](https://zod.dev/api?id=extend)
- [.safeExtend()](https://zod.dev/api?id=safeextend)
- [.pick()](https://zod.dev/api?id=pick)
- [.omit()](https://zod.dev/api?id=omit)
- [.partial()](https://zod.dev/api?id=partial)
- [.required()](https://zod.dev/api?id=required)
- [Recursive objects](https://zod.dev/api?id=recursive-objects)
- [Circularity errors](https://zod.dev/api?id=circularity-errors)
- [Arrays](https://zod.dev/api?id=arrays)
- [Tuples](https://zod.dev/api?id=tuples)
- [Unions](https://zod.dev/api?id=unions)
- [Discriminated unions](https://zod.dev/api?id=discriminated-unions)
- [Intersections](https://zod.dev/api?id=intersections)
- [Records](https://zod.dev/api?id=records)
- [Maps](https://zod.dev/api?id=maps)
- [Sets](https://zod.dev/api?id=sets)
- [Files](https://zod.dev/api?id=files)
- [Promises](https://zod.dev/api?id=promises)
- [Instanceof](https://zod.dev/api?id=instanceof)
- [Property](https://zod.dev/api?id=property)
- [Refinements](https://zod.dev/api?id=refinements)
- [.refine()](https://zod.dev/api?id=refine)
- [error](https://zod.dev/api?id=error)
- [abort](https://zod.dev/api?id=abort)
- [path](https://zod.dev/api?id=path)
- [when](https://zod.dev/api?id=when)
- [.superRefine()](https://zod.dev/api?id=superrefine)
- [.check()](https://zod.dev/api?id=check)
- [Codecs](https://zod.dev/api?id=codecs)
- [Pipes](https://zod.dev/api?id=pipes)
- [Transforms](https://zod.dev/api?id=transforms)
- [.transform()](https://zod.dev/api?id=transform)
- [.preprocess()](https://zod.dev/api?id=preprocess)
- [Defaults](https://zod.dev/api?id=defaults)
- [Prefaults](https://zod.dev/api?id=prefaults)
- [Catch](https://zod.dev/api?id=catch)
- [Branded types](https://zod.dev/api?id=branded-types)
- [Readonly](https://zod.dev/api?id=readonly)
- [JSON](https://zod.dev/api?id=json)
- [Functions](https://zod.dev/api?id=functions)
- [Custom](https://zod.dev/api?id=custom)

## Basic usage

- [Basic usage](https://zod.dev/basics): Basic usage guide covering schema definition, parsing data, error handling, and type inference

- [Defining a schema](https://zod.dev/basics?id=defining-a-schema)
- [Parsing data](https://zod.dev/basics?id=parsing-data)
- [Handling errors](https://zod.dev/basics?id=handling-errors)
- [Inferring types](https://zod.dev/basics?id=inferring-types)

## Codecs

- [Codecs](https://zod.dev/codecs): Bidirectional transformations with encode and decode

- [Composability](https://zod.dev/codecs?id=composability)
- [Type-safe inputs](https://zod.dev/codecs?id=type-safe-inputs)
- [Async and safe variants](https://zod.dev/codecs?id=async-and-safe-variants)
- [How encoding works](https://zod.dev/codecs?id=how-encoding-works)
- [Codecs](https://zod.dev/codecs?id=codecs)
- [Pipes](https://zod.dev/codecs?id=pipes)
- [Refinements](https://zod.dev/codecs?id=refinements)
- [Defaults and prefaults](https://zod.dev/codecs?id=defaults-and-prefaults)
- [Catch](https://zod.dev/codecs?id=catch)
- [Stringbool](https://zod.dev/codecs?id=stringbool)
- [Transforms](https://zod.dev/codecs?id=transforms)
- [Useful codecs](https://zod.dev/codecs?id=useful-codecs)
- [stringToNumber](https://zod.dev/codecs?id=stringtonumber)
- [stringToInt](https://zod.dev/codecs?id=stringtoint)
- [stringToBigInt](https://zod.dev/codecs?id=stringtobigint)
- [numberToBigInt](https://zod.dev/codecs?id=numbertobigint)
- [isoDatetimeToDate](https://zod.dev/codecs?id=isodatetimetodate)
- [epochSecondsToDate](https://zod.dev/codecs?id=epochsecondstodate)
- [epochMillisToDate](https://zod.dev/codecs?id=epochmillistodate)
- [json(schema)](https://zod.dev/codecs?id=jsonschema)
- [utf8ToBytes](https://zod.dev/codecs?id=utf8tobytes)
- [bytesToUtf8](https://zod.dev/codecs?id=bytestoutf8)
- [base64ToBytes](https://zod.dev/codecs?id=base64tobytes)
- [base64urlToBytes](https://zod.dev/codecs?id=base64urltobytes)
- [hexToBytes](https://zod.dev/codecs?id=hextobytes)
- [stringToURL](https://zod.dev/codecs?id=stringtourl)
- [stringToHttpURL](https://zod.dev/codecs?id=stringtohttpurl)
- [uriComponent](https://zod.dev/codecs?id=uricomponent)

## Ecosystem

- [Ecosystem](https://zod.dev/ecosystem): Overview of the Zod ecosystem including integrations, tools, and community resources

- [Resources](https://zod.dev/ecosystem?id=resources)
- [API Libraries](https://zod.dev/ecosystem?id=api-libraries)
- [Form Integrations](https://zod.dev/ecosystem?id=form-integrations)
- [Zod to X](https://zod.dev/ecosystem?id=zod-to-x)
- [X to Zod](https://zod.dev/ecosystem?id=x-to-zod)
- [Mocking Libraries](https://zod.dev/ecosystem?id=mocking-libraries)
- [Powered by Zod](https://zod.dev/ecosystem?id=powered-by-zod)
- [Zod Utilities](https://zod.dev/ecosystem?id=zod-utilities)

## Customizing errors

- [Customizing errors](https://zod.dev/error-customization): Guide to customizing validation error messages and error handling patterns

- [The error param](https://zod.dev/error-customization?id=the-error-param)
- [Per-parse error customization](https://zod.dev/error-customization?id=per-parse-error-customization)
- [Include input in issues](https://zod.dev/error-customization?id=include-input-in-issues)
- [Global error customization](https://zod.dev/error-customization?id=global-error-customization)
- [Internationalization](https://zod.dev/error-customization?id=internationalization)
- [Locales](https://zod.dev/error-customization?id=locales)
- [Error precedence](https://zod.dev/error-customization?id=error-precedence)

## Formatting errors

- [Formatting errors](https://zod.dev/error-formatting): Utilities for formatting and displaying Zod errors

- [z.treeifyError()](https://zod.dev/error-formatting?id=ztreeifyerror)
- [z.prettifyError()](https://zod.dev/error-formatting?id=zprettifyerror)
- [z.formatError()](https://zod.dev/error-formatting?id=zformaterror)
- [z.flattenError()](https://zod.dev/error-formatting?id=zflattenerror)

## Intro

- [Intro](https://zod.dev/): Introduction to Zod - TypeScript-first schema validation library with static type inference

- [Introduction](https://zod.dev/?id=introduction)
- [Features](https://zod.dev/?id=features)
- [Installation](https://zod.dev/?id=installation)
- [Requirements](https://zod.dev/?id=requirements)
- ["strict"](https://zod.dev/?id=strict)
- [Ecosystem](https://zod.dev/?id=ecosystem)
- [Sponsors](https://zod.dev/?id=sponsors)
- [Platinum](https://zod.dev/?id=platinum)
- [Gold](https://zod.dev/?id=gold)
- [Silver](https://zod.dev/?id=silver)
- [Bronze](https://zod.dev/?id=bronze)

## JSON Schema

- [JSON Schema](https://zod.dev/json-schema): How to convert Zod schemas to JSON Schema

- [String formats](https://zod.dev/json-schema?id=string-formats)
- [Numeric types](https://zod.dev/json-schema?id=numeric-types)
- [Object schemas](https://zod.dev/json-schema?id=object-schemas)
- [File schemas](https://zod.dev/json-schema?id=file-schemas)
- [Nullability](https://zod.dev/json-schema?id=nullability)
- [Configuration](https://zod.dev/json-schema?id=configuration)
- [target](https://zod.dev/json-schema?id=target)
- [metadata](https://zod.dev/json-schema?id=metadata)
- [unrepresentable](https://zod.dev/json-schema?id=unrepresentable)
- [cycles](https://zod.dev/json-schema?id=cycles)
- [reused](https://zod.dev/json-schema?id=reused)
- [override](https://zod.dev/json-schema?id=override)
- [io](https://zod.dev/json-schema?id=io)
- [Registries](https://zod.dev/json-schema?id=registries)

## For library authors

- [For library authors](https://zod.dev/library-authors): Guidelines and best practices for library authors integrating with Zod

- [Do I need to depend on Zod?](https://zod.dev/library-authors?id=do-i-need-to-depend-on-zod)
- [How to configure peer dependencies?](https://zod.dev/library-authors?id=how-to-configure-peer-dependencies)
- [How to support Zod 4?](https://zod.dev/library-authors?id=how-to-support-zod-4)
- [Do I need to publish a new major version?](https://zod.dev/library-authors?id=do-i-need-to-publish-a-new-major-version)
- [How to support Zod 3 and Zod 4 simultaneously?](https://zod.dev/library-authors?id=how-to-support-zod-3-and-zod-4-simultaneously)
- [How to support Zod and Zod Mini simultaneously?](https://zod.dev/library-authors?id=how-to-support-zod-and-zod-mini-simultaneously)
- [How to accept user-defined schemas?](https://zod.dev/library-authors?id=how-to-accept-user-defined-schemas)

## Metadata and registries

- [Metadata and registries](https://zod.dev/metadata): Attaching and manipulatinvg metadata on Zod schemas

- [Registries](https://zod.dev/metadata?id=registries)
- [.register()](https://zod.dev/metadata?id=register)
- [Metadata](https://zod.dev/metadata?id=metadata)
- [z.globalRegistry](https://zod.dev/metadata?id=zglobalregistry)
- [.meta()](https://zod.dev/metadata?id=meta)
- [.describe()](https://zod.dev/metadata?id=describe)
- [Custom registries](https://zod.dev/metadata?id=custom-registries)
- [Referencing inferred types](https://zod.dev/metadata?id=referencing-inferred-types)
- [Constraining schema types](https://zod.dev/metadata?id=constraining-schema-types)

## Joining Clerk as an OSS Fellow to work on Zod 4

- [Joining Clerk as an OSS Fellow to work on Zod 4](https://zod.dev/blog/clerk-fellowship): Announcing my Clerk OSS Fellowship and what's coming in Zod 4.

- [On deck: Zod 4](https://zod.dev/blog/clerk-fellowship?id=on-deck-zod-4)
- [Zod's current funding story](https://zod.dev/blog/clerk-fellowship?id=zods-current-funding-story)
- [The Clerk fellowship](https://zod.dev/blog/clerk-fellowship?id=the-clerk-fellowship)
- [OSS, funding models, and trying new things](https://zod.dev/blog/clerk-fellowship?id=oss-funding-models-and-trying-new-things)

## Zod Core

- [Zod Core](https://zod.dev/packages/core): Zod Core package - minimal core functionality for custom implementations

- [Schemas](https://zod.dev/packages/core?id=schemas)
- [Internals](https://zod.dev/packages/core?id=internals)
- [Parsing](https://zod.dev/packages/core?id=parsing)
- [Checks](https://zod.dev/packages/core?id=checks)
- [Errors](https://zod.dev/packages/core?id=errors)
- [Issues](https://zod.dev/packages/core?id=issues)

## Zod Mini

- [Zod Mini](https://zod.dev/packages/mini): Zod Mini - a tree-shakable Zod

- [Tree-shaking](https://zod.dev/packages/mini?id=tree-shaking)
- [When (not) to use Zod Mini](https://zod.dev/packages/mini?id=when-not-to-use-zod-mini)
- [DX](https://zod.dev/packages/mini?id=dx)
- [Backend development](https://zod.dev/packages/mini?id=backend-development)
- [Internet speed](https://zod.dev/packages/mini?id=internet-speed)
- [ZodMiniType](https://zod.dev/packages/mini?id=zodminitype)
- [.parse](https://zod.dev/packages/mini?id=parse)
- [.check()](https://zod.dev/packages/mini?id=check)
- [.register()](https://zod.dev/packages/mini?id=register)
- [.brand()](https://zod.dev/packages/mini?id=brand)
- [.clone(def)](https://zod.dev/packages/mini?id=clonedef)
- [No default locale](https://zod.dev/packages/mini?id=no-default-locale)

## Zod

- [Zod](https://zod.dev/packages/zod): Internals and structure of the Zod library

## Migration guide

- [Migration guide](https://zod.dev/v4/changelog): Complete changelog and migration guide for upgrading from Zod 3 to Zod 4

- [Error customization](https://zod.dev/v4/changelog?id=error-customization)
- [deprecates message](https://zod.dev/v4/changelog?id=deprecates-message)
- [drops invalid_type_error and required_error](https://zod.dev/v4/changelog?id=drops-invalid_type_error-and-required_error)
- [drops errorMap](https://zod.dev/v4/changelog?id=drops-errormap)
- [ZodError](https://zod.dev/v4/changelog?id=zoderror)
- [updates issue formats](https://zod.dev/v4/changelog?id=updates-issue-formats)
- [changes error map precedence](https://zod.dev/v4/changelog?id=changes-error-map-precedence)
- [deprecates .format()](https://zod.dev/v4/changelog?id=deprecates-format)
- [deprecates .flatten()](https://zod.dev/v4/changelog?id=deprecates-flatten)
- [drops .formErrors](https://zod.dev/v4/changelog?id=drops-formerrors)
- [deprecates .addIssue() and .addIssues()](https://zod.dev/v4/changelog?id=deprecates-addissue-and-addissues)
- [z.number()](https://zod.dev/v4/changelog?id=znumber)
- [no infinite values](https://zod.dev/v4/changelog?id=no-infinite-values)
- [.safe() no longer accepts floats](https://zod.dev/v4/changelog?id=safe-no-longer-accepts-floats)
- [.int() accepts safe integers only](https://zod.dev/v4/changelog?id=int-accepts-safe-integers-only)
- [z.string() updates](https://zod.dev/v4/changelog?id=zstring-updates)
- [deprecates .email() etc](https://zod.dev/v4/changelog?id=deprecates-email-etc)
- [stricter .uuid()](https://zod.dev/v4/changelog?id=stricter-uuid)
- [no padding in .base64url()](https://zod.dev/v4/changelog?id=no-padding-in-base64url)
- [drops z.string().ip()](https://zod.dev/v4/changelog?id=drops-zstringip)
- [updates z.string().ipv6()](https://zod.dev/v4/changelog?id=updates-zstringipv6)
- [drops z.string().cidr()](https://zod.dev/v4/changelog?id=drops-zstringcidr)
- [z.coerce updates](https://zod.dev/v4/changelog?id=zcoerce-updates)
- [.default() updates](https://zod.dev/v4/changelog?id=default-updates)
- [z.object()](https://zod.dev/v4/changelog?id=zobject)
- [defaults applied within optional fields](https://zod.dev/v4/changelog?id=defaults-applied-within-optional-fields)
- [deprecates .strict() and .passthrough()](https://zod.dev/v4/changelog?id=deprecates-strict-and-passthrough)
- [deprecates .strip()](https://zod.dev/v4/changelog?id=deprecates-strip)
- [drops .nonstrict()](https://zod.dev/v4/changelog?id=drops-nonstrict)
- [drops .deepPartial()](https://zod.dev/v4/changelog?id=drops-deeppartial)
- [changes z.unknown() optionality](https://zod.dev/v4/changelog?id=changes-zunknown-optionality)
- [deprecates .merge()](https://zod.dev/v4/changelog?id=deprecates-merge)
- [z.nativeEnum() deprecated](https://zod.dev/v4/changelog?id=znativeenum-deprecated)
- [z.array()](https://zod.dev/v4/changelog?id=zarray)
- [changes .nonempty() type](https://zod.dev/v4/changelog?id=changes-nonempty-type)
- [z.promise() deprecated](https://zod.dev/v4/changelog?id=zpromise-deprecated)
- [z.function()](https://zod.dev/v4/changelog?id=zfunction)
- [adds .implementAsync()](https://zod.dev/v4/changelog?id=adds-implementasync)
- [.refine()](https://zod.dev/v4/changelog?id=refine)
- [ignores type predicates](https://zod.dev/v4/changelog?id=ignores-type-predicates)
- [drops ctx.path](https://zod.dev/v4/changelog?id=drops-ctxpath)
- [drops function as second argument](https://zod.dev/v4/changelog?id=drops-function-as-second-argument)
- [z.ostring(), etc dropped](https://zod.dev/v4/changelog?id=zostring-etc-dropped)
- [z.literal()](https://zod.dev/v4/changelog?id=zliteral)
- [drops symbol support](https://zod.dev/v4/changelog?id=drops-symbol-support)
- [static .create() factories dropped](https://zod.dev/v4/changelog?id=static-create-factories-dropped)
- [z.record()](https://zod.dev/v4/changelog?id=zrecord)
- [drops single argument usage](https://zod.dev/v4/changelog?id=drops-single-argument-usage)
- [improves enum support](https://zod.dev/v4/changelog?id=improves-enum-support)
- [z.intersection()](https://zod.dev/v4/changelog?id=zintersection)
- [throws Error on merge conflict](https://zod.dev/v4/changelog?id=throws-error-on-merge-conflict)
- [Internal changes](https://zod.dev/v4/changelog?id=internal-changes)
- [updates generics](https://zod.dev/v4/changelog?id=updates-generics)
- [adds z.core](https://zod.dev/v4/changelog?id=adds-zcore)
- [moves ._def](https://zod.dev/v4/changelog?id=moves-_def)
- [drops ZodEffects](https://zod.dev/v4/changelog?id=drops-zodeffects)
- [adds ZodTransform](https://zod.dev/v4/changelog?id=adds-zodtransform)
- [drops ZodPreprocess](https://zod.dev/v4/changelog?id=drops-zodpreprocess)
- [drops ZodBranded](https://zod.dev/v4/changelog?id=drops-zodbranded)

## Release notes

- [Release notes](https://zod.dev/v4): Zod 4 release notes and new features including performance improvements and breaking changes

- [Versioning](https://zod.dev/v4?id=versioning)
- [Why a new major version?](https://zod.dev/v4?id=why-a-new-major-version)
- [Benchmarks](https://zod.dev/v4?id=benchmarks)
- [14x faster string parsing](https://zod.dev/v4?id=14x-faster-string-parsing)
- [7x faster array parsing](https://zod.dev/v4?id=7x-faster-array-parsing)
- [6.5x faster object parsing](https://zod.dev/v4?id=65x-faster-object-parsing)
- [100x reduction in tsc instantiations](https://zod.dev/v4?id=100x-reduction-in-tsc-instantiations)
- [2x reduction in core bundle size](https://zod.dev/v4?id=2x-reduction-in-core-bundle-size)
- [Introducing Zod Mini](https://zod.dev/v4?id=introducing-zod-mini)
- [6.6x reduction in core bundle size](https://zod.dev/v4?id=66x-reduction-in-core-bundle-size)
- [Metadata](https://zod.dev/v4?id=metadata)
- [The global registry](https://zod.dev/v4?id=the-global-registry)
- [.meta()](https://zod.dev/v4?id=meta)
- [JSON Schema conversion](https://zod.dev/v4?id=json-schema-conversion)
- [Recursive objects](https://zod.dev/v4?id=recursive-objects)
- [File schemas](https://zod.dev/v4?id=file-schemas)
- [Internationalization](https://zod.dev/v4?id=internationalization)
- [Error pretty-printing](https://zod.dev/v4?id=error-pretty-printing)
- [Top-level string formats](https://zod.dev/v4?id=top-level-string-formats)
- [Custom email regex](https://zod.dev/v4?id=custom-email-regex)
- [Template literal types](https://zod.dev/v4?id=template-literal-types)
- [Number formats](https://zod.dev/v4?id=number-formats)
- [Stringbool](https://zod.dev/v4?id=stringbool)
- [Simplified error customization](https://zod.dev/v4?id=simplified-error-customization)
- [Upgraded z.discriminatedUnion()](https://zod.dev/v4?id=upgraded-zdiscriminatedunion)
- [Multiple values in z.literal()](https://zod.dev/v4?id=multiple-values-in-zliteral)
- [Refinements live inside schemas](https://zod.dev/v4?id=refinements-live-inside-schemas)
- [.overwrite()](https://zod.dev/v4?id=overwrite)
- [An extensible foundation: zod/v4/core](https://zod.dev/v4?id=an-extensible-foundation-zodv4core)
- [Wrapping up](https://zod.dev/v4?id=wrapping-up)

## Versioning

- [Versioning](https://zod.dev/v4/versioning): Versioning strategy and compatibility information for Zod 4

- [Update — July 8th, 2025](https://zod.dev/v4/versioning?id=update--july-8th-2025)
- [Versioning in Zod 4](https://zod.dev/v4/versioning?id=versioning-in-zod-4)
- [Why?](https://zod.dev/v4/versioning?id=why)
- [Why can't libraries just support v3 and v4 simultaneously?](https://zod.dev/v4/versioning?id=why-cant-libraries-just-support-v3-and-v4-simultaneously)

---

This documentation covers Zod v4, a TypeScript-first schema validation library. Use the URLs above to access specific pages and sections for detailed information about schema definition, validation, error handling, and advanced patterns.

stagehand llms.txt

# 🤘 Stagehand

## Docs

- [Act](https://docs.stagehand.dev/v3/basics/act.md): Interact with a web page
- [Agent](https://docs.stagehand.dev/v3/basics/agent.md): Automate complex workflows with AI powered browser agents
- [Evaluations & Metrics](https://docs.stagehand.dev/v3/basics/evals.md): Monitor performance, optimize costs, and evaluate LLM effectiveness
- [Extract](https://docs.stagehand.dev/v3/basics/extract.md): Extract structured data from a webpage
- [Observe](https://docs.stagehand.dev/v3/basics/observe.md): Discover and plan executable actions on any web page
- [Agent Fallbacks](https://docs.stagehand.dev/v3/best-practices/agent-fallbacks.md): A failsafe when unexpected page changes add extra steps
- [Caching Actions](https://docs.stagehand.dev/v3/best-practices/caching.md): Cache actions automatically to reduce costs and improve performance
- [Computer Use Agents](https://docs.stagehand.dev/v3/best-practices/computer-use.md): Incorporate Computer Use APIs from Google, Anthropic, and OpenAI with one line of code in Stagehand.
- [Cost Optimization](https://docs.stagehand.dev/v3/best-practices/cost-optimization.md): Minimize costs while maintaining automation performance
- [Deploying Stagehand](https://docs.stagehand.dev/v3/best-practices/deployments.md): Deploy your AI agents and automations to the cloud
- [Deterministic Agent Scripts](https://docs.stagehand.dev/v3/best-practices/deterministic-agent.md): Use auto-caching to convert agent workflows into fast, deterministic scripts
- [History Tracking](https://docs.stagehand.dev/v3/best-practices/history.md): Track and analyze Stagehand operations with the history API
- [MCP Integrations](https://docs.stagehand.dev/v3/best-practices/mcp-integrations.md): Using Model Context Protocol (MCP) integrations to enhance agent capabilities
- [Prompting Best Practices](https://docs.stagehand.dev/v3/best-practices/prompting-best-practices.md): Write effective prompts for reliable Stagehand automation
- [Speed Optimization](https://docs.stagehand.dev/v3/best-practices/speed-optimization.md): Optimize Stagehand performance for faster automation and reduced latency
- [Using Multiple Tabs](https://docs.stagehand.dev/v3/best-practices/using-multiple-tabs.md): Act on multiple tabs with Stagehand
- [Browser](https://docs.stagehand.dev/v3/configuration/browser.md): Configure Stagehand on Browserbase or locally
- [Logging](https://docs.stagehand.dev/v3/configuration/logging.md): Set up logging, debugging, and error tracking for Stagehand workflows
- [Models](https://docs.stagehand.dev/v3/configuration/models.md): Use any LLM model with Stagehand for optimal performance
- [Observability](https://docs.stagehand.dev/v3/configuration/observability.md): Track Stagehand automation with session visibility and analytics
- [AI Rules](https://docs.stagehand.dev/v3/first-steps/ai-rules.md): Using AI to write Stagehand code faster, and better.
- [Installation](https://docs.stagehand.dev/v3/first-steps/installation.md): Integrate Stagehand into an existing project.
- [Introducing Stagehand](https://docs.stagehand.dev/v3/first-steps/introduction.md): Developers use Stagehand to reliably automate the web.
- [Quickstart](https://docs.stagehand.dev/v3/first-steps/quickstart.md): Stagehand allows you to build web automations with natural language and code.
- [Use CrewAI to Automate Browser Tasks](https://docs.stagehand.dev/v3/integrations/crew-ai/configuration.md): Create intelligent agents that can interact with websites and automate browser tasks using natural language instructions
- [CrewAI Introduction](https://docs.stagehand.dev/v3/integrations/crew-ai/introduction.md): Automate browser tasks using natural language instructions with CrewAI
- [LangChain JS Configuration](https://docs.stagehand.dev/v3/integrations/langchain/configuration.md): Set up Stagehand with LangChain JS to create intelligent web automation agents
- [Langchain JS Introduction](https://docs.stagehand.dev/v3/integrations/langchain/introduction.md): Integrate Stagehand with Langchain JS for intelligent web automation
- [Browserbase MCP Server Configuration](https://docs.stagehand.dev/v3/integrations/mcp/configuration.md): Configure your browser automation with command-line flags, environment variables, and advanced options
- [Browserbase MCP Server](https://docs.stagehand.dev/v3/integrations/mcp/introduction.md): AI-powered browser automation through Model Context Protocol integration with Stagehand
- [Browserbase MCP Server Setup](https://docs.stagehand.dev/v3/integrations/mcp/setup.md): Add the Browserbase MCP Server to Claude
- [Browserbase MCP Server Tools](https://docs.stagehand.dev/v3/integrations/mcp/tools.md): This guide covers the specialized tools available in the Browserbase MCP server for browser automation and interaction.
- [Playwright](https://docs.stagehand.dev/v3/integrations/playwright.md): Use Stagehand with Playwright for browser automation
- [Puppeteer](https://docs.stagehand.dev/v3/integrations/puppeteer.md): Use Stagehand with Puppeteer for browser automation
- [Selenium](https://docs.stagehand.dev/v3/integrations/selenium.md): Use Stagehand with Selenium to operate the same browser in tandem
- [Use Stagehand in Next.js](https://docs.stagehand.dev/v3/integrations/vercel/configuration.md): Next.js is a popular framework for developing web-based applications in production. It powers Stagehand apps like [Director](https://director.ai), [Brainrot](https://brainrot.run) and [Open Operator](https://operator.browserbase.com).
- [Next.js + Vercel](https://docs.stagehand.dev/v3/integrations/vercel/introduction.md): Build and deploy a Stagehand‑powered Next.js app to Vercel
- [Migrate Stagehand v2 to v3](https://docs.stagehand.dev/v3/migrations/v2.md): Complete migration guide from Stagehand v2 to v3
- [act()](https://docs.stagehand.dev/v3/references/act.md): Complete API reference for the act() method
- [agent()](https://docs.stagehand.dev/v3/references/agent.md): Complete API reference for the agent() method
- [context](https://docs.stagehand.dev/v3/references/context.md): Complete API reference for the browser context
- [deepLocator](https://docs.stagehand.dev/v3/references/deeplocator.md): Complete API reference for the deepLocator method
- [extract()](https://docs.stagehand.dev/v3/references/extract.md): Complete API reference for the extract() method
- [locator](https://docs.stagehand.dev/v3/references/locator.md): Complete API reference for the Locator class
- [observe()](https://docs.stagehand.dev/v3/references/observe.md): Complete API reference for the observe() method
- [page](https://docs.stagehand.dev/v3/references/page.md): Complete API reference for the Stagehand Page object
- [Stagehand](https://docs.stagehand.dev/v3/references/stagehand.md): Complete API reference for the Stagehand class


## Optional

- [Changelog](https://github.com/browserbase/stagehand/releases)
- [Stagehand by Browserbase](https://docs.stagehand.dev/v3/first-steps/introduction)


- The extraction result should be returned directly as the 'result' variable

EXAMPLE MCP SERVER (follow this structure exactly):
${exampleServerCode}

Generate ONLY the complete TypeScript code, no markdown formatting or explanations:`;

  const response = await model.generateContent(prompt);
  let generatedCode = response.response.text();

  // Clean up markdown code blocks if present
  generatedCode = generatedCode
    .replace(/^```typescript\s*/i, "")
    .replace(/^```\s*/, "");
  generatedCode = generatedCode.replace(/\s*```$/, "");
  generatedCode = generatedCode.trim();

  return generatedCode;
}

/**
 * Generate package.json
 */
function generatePackageJson(serviceName: string): string {
  return JSON.stringify(
    {
      name: `mcp-stagehand-${serviceName}`,
      version: "1.0.0",
      type: "module",
      bin: {
        [`mcp-stagehand-${serviceName}`]: "dist/index.js",
      },
      scripts: {
        build: "tsc",
        dev: "tsx src/index.ts",
        start: "node dist/index.js",
      },
      dependencies: {
        "@browserbasehq/stagehand": "^3.0.1",
        "@modelcontextprotocol/sdk": "^1.0.0",
        dotenv: "^16.0.0",
        zod: "^3.22.4",
      },
      devDependencies: {
        "@types/node": "^20.0.0",
        tsx: "^4.0.0",
        typescript: "^5.0.0",
      },
    },
    null,
    2
  );
}

/**
 * Generate .env.example
 */
function generateEnvExample(domain: string): string {
  return `# Browserbase Configuration
BROWSERBASE_PROJECT_ID=your_project_id_here
BROWSERBASE_API_KEY=your_api_key_here

# Optional: Use saved browser context for ${domain}
# Get this from: mcpkit contexts show ${domain}
# BROWSERBASE_CONTEXT_ID=your_context_id_here

# AI Model Configuration (Gemini)
GEMINI_API_KEY=your_gemini_api_key_here
GOOGLE_GENERATIVE_AI_API_KEY=your_gemini_api_key_here
`;
}

/**
 * Generate README.md
 */
function generateReadme(
  serviceName: string,
  domain: string,
  actions: DiscoveredAction[]
): string {
  const actionsList = actions
    .map((action, i) => `${i + 1}. **${action.name}**: ${action.description}`)
    .join("\n");

  return `# MCP Server for ${domain}

This MCP server provides browser automation tools for ${domain} using Stagehand.

## Available Tools

${actionsList}

## Setup

1. Install dependencies:
   \`\`\`bash
   npm install
   \`\`\`

2. Create a \`.env\` file with your API keys:
   \`\`\`bash
   cp .env.example .env
   \`\`\`

3. Add your API keys to the \`.env\` file:
   - Get a Browserbase API key from https://browserbase.com
   - Get a Gemini API key from https://ai.google.dev

4. (Optional) Use saved browser context with authentication:
   - If you already authenticated to ${domain} using mcpkit, you can reuse that session:
   \`\`\`bash
   mcpkit contexts show ${domain}
   \`\`\`
   - Copy the context ID and add it to your \`.env\` file:
   \`\`\`
   BROWSERBASE_CONTEXT_ID=your_context_id_here
   \`\`\`
   - This will preserve your login session and cookies across runs!

5. Build the project:
   \`\`\`bash
   npm run build
   \`\`\`

## Usage

### Running the server

\`\`\`bash
npm start
\`\`\`

When the server starts, it will output a live view URL that you can use to watch the browser automation in real-time:

\`\`\`
🔗 Live view: https://app.browserbase.com/sessions/[session-id]
\`\`\`

### Development mode

\`\`\`bash
npm run dev
\`\`\`

### Using with Claude Desktop

Add this to your Claude Desktop config file:

**MacOS**: \`~/Library/Application Support/Claude/claude_desktop_config.json\`
**Windows**: \`%APPDATA%/Claude/claude_desktop_config.json\`

\`\`\`json
{
  "mcpServers": {
    "${serviceName}": {
      "command": "node",
      "args": ["${process.cwd()}/mcp-stagehand-${serviceName}/dist/index.js"],
      "env": {
        "BROWSERBASE_PROJECT_ID": "your_project_id",
        "BROWSERBASE_API_KEY": "your_api_key",
        "GEMINI_API_KEY": "your_gemini_key"
      }
    }
  }
}
\`\`\`

## License

MIT
`;
}

/**
 * Generate tsconfig.json
 */
function generateTsConfig(): string {
  return JSON.stringify(
    {
      compilerOptions: {
        target: "ES2022",
        module: "Node16",
        moduleResolution: "Node16",
        outDir: "./dist",
        rootDir: "./src",
        strict: true,
        esModuleInterop: true,
        skipLibCheck: true,
        forceConsistentCasingInFileNames: true,
        resolveJsonModule: true,
        declaration: true,
      },
      include: ["src/**/*"],
      exclude: ["node_modules", "dist"],
    },
    null,
    2
  );
}

/**
 * Read the example MCP server file
 */
async function getExampleMCPServer(): Promise<string> {
  const fs = await import("fs/promises");
  const exampleFilePath = path.join(
    process.cwd(),
    "examples",
    "hackernews",
    "src",
    "index.ts"
  );

  try {
    return await fs.readFile(exampleFilePath, "utf-8");
  } catch (error) {
    console.warn("⚠️  Could not read example file");
    return "// Example not available";
  }
}

/**
 * Fix build errors using AI
 */
export async function fixBuildErrors(
  originalCode: string,
  buildErrors: string,
  domain: string,
  url: string,
  actions: DiscoveredAction[]
): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY environment variable is required");
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-exp" });

  const exampleFile = await getExampleMCPServer();

  const prompt = `You are an expert TypeScript developer. I have an MCP server that failed to build with TypeScript compilation errors.

Your task is to analyze the build errors and fix them while maintaining the exact same functionality.

ORIGINAL CODE:
\`\`\`typescript
${originalCode}
\`\`\`

BUILD ERRORS:
\`\`\`
${buildErrors}
\`\`\`

REFERENCE EXAMPLE (working MCP server):
\`\`\`typescript
${exampleFile}
\`\`\`

ACTIONS THIS SERVER IMPLEMENTS:
${JSON.stringify(actions, null, 2)}

REQUIREMENTS:
1. Fix ALL TypeScript compilation errors
2. Maintain the exact same functionality - all ${
    actions.length
  } tools must work identically
3. Keep the same structure and patterns as the reference example
4. Ensure all parameter extraction and usage is correct
5. Return ONLY the fixed TypeScript code, no explanation

Generate the complete fixed code now:`;

  const result = await model.generateContent(prompt);
  const response = result.response.text();

  // Extract code from markdown code blocks if present
  const codeBlockMatch = response.match(/```typescript\n([\s\S]*?)\n```/);
  if (codeBlockMatch) {
    return codeBlockMatch[1];
  }

  // If no code block, try to find code starting with #!/usr/bin/env node
  const shebangMatch = response.match(/(#!\/usr\/bin\/env node[\s\S]*)/);
  if (shebangMatch) {
    return shebangMatch[1];
  }

  // Otherwise return the whole response
  return response;
}
