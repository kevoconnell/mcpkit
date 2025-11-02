import type { DiscoveredAction } from "../schemas/index.js";

import path from "path";

/**
 * Generate .env.example
 */
export function generateEnvExample(domain: string): string {
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
export function generateReadme(
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
  🔗 Live view: https://browserbase.com/sessions/[session-id]
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
export function generateTsConfig(): string {
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
 * Generic function to load an example MCP server file
 */
async function loadExampleFile(exampleName: string): Promise<string> {
  const fs = await import("fs/promises");
  const exampleFilePath = path.join(
    process.cwd(),
    "examples",
    exampleName,
    "src",
    "index.ts"
  );

  try {
    return await fs.readFile(exampleFilePath, "utf-8");
  } catch (error) {
    console.warn(`⚠️  Could not read ${exampleName} example file`);
    return `// ${exampleName} example not available`;
  }
}

/**
 * Read the hackernews example MCP server file
 */
export async function getExampleMCPServer(): Promise<string> {
  return loadExampleFile("hackernews");
}

/**
 * Read the printed_trade example MCP server file
 */
export async function getPrintedTradeExample(): Promise<string> {
  return loadExampleFile("printed_trade");
}

/**
 * Read the substack example MCP server file
 */
export async function getSubstackExample(): Promise<string> {
  return loadExampleFile("substack");
}

/**
 * Generate package.json
 */
export function generatePackageJson(serviceName: string): string {
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

export async function generateMCPServerCodePrompt(
  actions: DiscoveredAction[],
  domain: string,
  serviceName: string,
  url: string
) {
  const hackernewsExample = await getExampleMCPServer();
  const printedTradeExample = await getPrintedTradeExample();
  const substackExample = await getSubstackExample();

  return `Generate a complete TypeScript MCP server file for ${domain} using the following example code:

EXAMPLE 1 - HackerNews MCP Server:
  \`\`\`typescript
  ${hackernewsExample}
  \`\`\`

EXAMPLE 2 - Printed.Trade MCP Server:
  \`\`\`typescript
  ${printedTradeExample}
  \`\`\`

EXAMPLE 3 - Substack.com MCP Server:
  \`\`\`typescript
  ${substackExample}
  \`\`\`

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

CRITICAL - Zod Schema Rules for Gemini Compatibility:
- NEVER use z.record() - it creates empty object schemas that Gemini rejects
- NEVER use z.any() in schemas
- NEVER create empty objects with z.object({})
- For flexible/dynamic data, use z.string() and describe it as "JSON string" or define specific fields
- All z.object() must have at least one property defined
- Use .optional() for optional fields, but ensure at least one required field exists
- Keep schemas SIMPLE and FLEXIBLE - complex nested arrays often fail
- When extracting data, prefer flat schemas with optional fields over complex nested structures
- Example CORRECT patterns:
  * z.object({ summary: z.string(), data: z.string().optional() })
  * z.object({ value: z.string() }).optional()
  * z.object({ items: z.array(z.object({ name: z.string() })) }) - simple array
- Example INCORRECT patterns (will cause errors):
  * z.record(z.string(), z.any()) ❌
  * z.object({}) ❌
  * z.object({ field: z.any() }) ❌
  * Complex nested arrays with many required fields ❌
- If extraction needs to handle varying data, use a flat schema with many optional fields rather than nested structures

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

These examples demonstrate best practices for MCP server implementation. Use them as references for structure, error handling, and patterns.

Generate ONLY the complete TypeScript code, no markdown formatting or explanations:`;
}

export async function generateFixBuildErrorsPrompt(
  originalCode: string,
  buildErrors: string,
  actions: DiscoveredAction[]
): Promise<string> {
  const exampleServerCode = await getExampleMCPServer();

  return `You are an expert TypeScript developer. I have an MCP server that failed to build with TypeScript compilation errors.

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
${exampleServerCode}
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
}
