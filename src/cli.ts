#!/usr/bin/env node

import { createMCPServer } from "./commands/create/index.js";
import { manageContexts } from "./commands/contexts/index.js";
import { setupConfig, showConfig } from "./commands/config/index.js";
import prompts from "prompts";
import { loadEnv } from "./config/env.js";

loadEnv();

const COMMANDS = {
  config: "Set up global configuration (API keys)",
  create: "Create an MCP server by analyzing a website",
  contexts: "Manage saved browser contexts (list, delete, show)",
  help: "Show this help message",
  version: "Show version information",
};

async function showHelp() {
  console.log(`
mcpkit - Easy setup for MCPs with Browserbase

Usage:
  mcpkit [command] [options]

Commands:
  config      ${COMMANDS.config}
  create      ${COMMANDS.create}
  contexts    ${COMMANDS.contexts}
  help        ${COMMANDS.help}
  version     ${COMMANDS.version}


For more information, visit: https://github.com/kevoconnell/mcpkit
`);
}

async function showVersion() {
  // Read package.json from file system
  const fs = await import("fs/promises");
  const path = await import("path");
  const { fileURLToPath } = await import("url");

  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const packageJsonPath = path.join(__dirname, "../package.json");
  const packageJsonContent = await fs.readFile(packageJsonPath, "utf-8");
  const packageJson = JSON.parse(packageJsonContent) as { version: string };

  console.log(`${packageJson.version}`);
}

async function runCreate(url?: string, skipAuth?: boolean) {
  console.log("🔨 MCP Server Generator\n");

  // If URL not provided, prompt for it
  if (!url) {
    const response = await prompts({
      type: "text",
      name: "url",
      message: "Enter the URL of the website to create an MCP for:",
      validate: (value) => {
        try {
          new URL(value);
          return true;
        } catch {
          return "Please enter a valid URL (e.g., https://linear.app)";
        }
      },
    });

    if (!response.url) {
      console.log("❌ URL is required");
      process.exit(1);
    }

    url = response.url;
  }

  if (!url) {
    console.log("❌ URL is required");
    process.exit(1);
  }

  await createMCPServer(url, { skipAuth });
}

async function main() {
  try {
    const args = process.argv.slice(2);
    const command = args[0]?.toLowerCase() || "help";

    // Handle flags
    if (command === "--help" || command === "-h") {
      await showHelp();
      process.exit(0);
    }

    if (command === "--version" || command === "-v") {
      await showVersion();
      process.exit(0);
    }

    // Handle commands
    switch (command) {
      case "config":
        const configSubcommand = args[1];
        if (configSubcommand === "show") {
          await showConfig();
        } else {
          await setupConfig();
        }
        break;

      case "create":
        const url = args[1];
        const skipAuth = args.includes("--skip-auth");
        await runCreate(url, skipAuth);
        break;

      case "contexts":
        const subcommand = args[1];
        const domain = args[2];
        await manageContexts(subcommand, domain);
        break;

      case "help":
        await showHelp();
        break;

      case "version":
        await showVersion();
        break;

      default:
        console.error(`Unknown command: ${command}`);
        console.log('Run "mcpkit help" for usage information.');
        process.exit(1);
    }

    process.exit(0);
  } catch (error) {
    console.error(
      "\n❌ Error:",
      error instanceof Error ? error.message : error
    );
    process.exit(1);
  }
}

main();
