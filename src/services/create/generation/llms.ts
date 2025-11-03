import {
  generateEnvExample,
  generateEnvFromGlobalSecrets,
  generateFixBuildErrorsPrompt,
  generateMCPServerCodePrompt,
  generatePackageJson,
  generateReadme,
  generateTsConfig,
} from "./templates.js";
import { DiscoveredAction } from "../schemas/index.js";
import fs from "fs/promises";
import path from "path";
import { generateText } from "ai";
import { getModel } from "../../../initalizers/llm/index.js";

/**
 * Generate all MCP server files
 */
export async function generateMCPServerCode(
  domain: string,
  url: string,
  actions: DiscoveredAction[],
  outputDir: string
): Promise<string> {
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
  const envExample = await generateEnvExample(domain);
  const envFile = await generateEnvFromGlobalSecrets(domain);
  const readme = generateReadme(serviceName, domain, actions);
  const tsconfig = generateTsConfig();

  // Write all files
  await fs.writeFile(path.join(outputDir, "src", "index.ts"), serverCode);
  await fs.writeFile(path.join(outputDir, "package.json"), packageJson);
  await fs.writeFile(path.join(outputDir, ".env.example"), envExample);
  await fs.writeFile(path.join(outputDir, ".env"), envFile);
  await fs.writeFile(path.join(outputDir, "README.md"), readme);
  await fs.writeFile(path.join(outputDir, "tsconfig.json"), tsconfig);

  console.log("✅ Created .env file with values from global secrets");

  return serverCode;
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
  const model = getModel();

  const prompt = await generateMCPServerCodePrompt(
    actions,
    domain,
    serviceName,
    url
  );

  const { text } = await generateText({
    model,
    prompt,
  });

  let generatedCode = text;

  // Clean up markdown code blocks if present
  generatedCode = generatedCode
    .replace(/^```typescript\s*/i, "")
    .replace(/^```\s*/, "");
  generatedCode = generatedCode.replace(/\s*```$/, "");
  generatedCode = generatedCode.trim();

  return generatedCode;
}

/**
 * Fix build errors using AI
 */
export async function fixBuildErrors(
  originalCode: string,
  buildErrors: string,
  actions: DiscoveredAction[],
  outputDir: string
): Promise<string> {
  const model = getModel();

  const prompt = await generateFixBuildErrorsPrompt(
    originalCode,
    buildErrors,
    actions
  );

  const { text } = await generateText({
    model,
    prompt,
  });

  // Extract code from markdown code blocks if present
  const codeBlockMatch = text.match(/```typescript\n([\s\S]*?)\n```/);
  if (codeBlockMatch) {
    return codeBlockMatch[1];
  }

  // If no code block, try to find code starting with #!/usr/bin/env node
  const shebangMatch = text.match(/(#!\/usr\/bin\/env node[\s\S]*)/);
  if (shebangMatch) {
    return shebangMatch[1];
  }

  // Write the fixed code
  await fs.writeFile(path.join(outputDir, "src", "index.ts"), text);

  return text;
}
