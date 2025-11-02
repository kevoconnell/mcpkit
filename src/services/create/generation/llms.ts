import { GoogleGenerativeAI } from "@google/generative-ai";
import {
  generateEnvExample,
  generateFixBuildErrorsPrompt,
  generateMCPServerCodePrompt,
  generatePackageJson,
  generateReadme,
  generateTsConfig,
} from "./templates.js";
import { DiscoveredAction } from "../schemas/index.js";
import fs from "fs/promises";
import path from "path";

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
  const envExample = generateEnvExample(domain);
  const readme = generateReadme(serviceName, domain, actions);
  const tsconfig = generateTsConfig();

  // Write all files
  await fs.writeFile(path.join(outputDir, "src", "index.ts"), serverCode);
  await fs.writeFile(path.join(outputDir, "package.json"), packageJson);
  await fs.writeFile(path.join(outputDir, ".env.example"), envExample);
  await fs.writeFile(path.join(outputDir, "README.md"), readme);
  await fs.writeFile(path.join(outputDir, "tsconfig.json"), tsconfig);

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
  //todo: this should be able to work with any provider, not just gemini
  const gemini = new GoogleGenerativeAI(
    process.env.GEMINI_API_KEY ?? process.env.GOOGLE_GENERATIVE_AI_API_KEY!
  );
  const model = gemini.getGenerativeModel({ model: "gemini-2.5-flash" });

  const prompt = await generateMCPServerCodePrompt(
    actions,
    domain,
    serviceName,
    url
  );

  const response = await model.generateContent(prompt);
  let generatedCode = response.response.text();

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
  const apiKey =
    process.env.GEMINI_API_KEY ?? process.env.GOOGLE_GENERATIVE_AI_API_KEY!;

  if (!apiKey) {
    throw new Error("modelApiKey environment variable is required");
  }
  // todo: use the same underlying model as the one used in the Stagehand instance
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

  const prompt = await generateFixBuildErrorsPrompt(
    originalCode,
    buildErrors,
    actions
  );

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

  // Write the fixed code
  await fs.writeFile(path.join(outputDir, "src", "index.ts"), response);

  return response;
}
