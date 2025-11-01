import prompts from "prompts";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";

const GLOBAL_CONFIG_DIR = path.join(os.homedir(), ".mcpkit");
const GLOBAL_ENV_PATH = path.join(GLOBAL_CONFIG_DIR, ".env");

/**
 * Setup global configuration
 */
export async function setupConfig(): Promise<void> {
  console.log("🔧 mcpkit Global Configuration Setup\n");
  console.log(
    "This will create a global config file at: ~/.mcpkit/.env\n"
  );
  console.log(
    "All generated MCP servers will use these credentials by default.\n"
  );

  // Check if config already exists
  let existingConfig: Record<string, string> = {};
  try {
    const existing = await fs.readFile(GLOBAL_ENV_PATH, "utf-8");
    existing.split("\n").forEach((line) => {
      const [key, ...valueParts] = line.split("=");
      if (key && valueParts.length > 0) {
        existingConfig[key.trim()] = valueParts.join("=").trim();
      }
    });
  } catch {
    // File doesn't exist yet
  }

  const hasExisting = Object.keys(existingConfig).length > 0;
  if (hasExisting) {
    console.log("⚠️  Existing configuration found:\n");
    Object.entries(existingConfig).forEach(([key, value]) => {
      const displayValue = key.includes("KEY") || key.includes("TOKEN")
        ? value.substring(0, 8) + "..."
        : value;
      console.log(`  ${key}=${displayValue}`);
    });
    console.log();

    const { overwrite } = await prompts({
      type: "confirm",
      name: "overwrite",
      message: "Do you want to update the existing configuration?",
      initial: true,
    });

    if (!overwrite) {
      console.log("✅ Keeping existing configuration");
      return;
    }
  }

  // Prompt for configuration values
  const response = await prompts([
    {
      type: "text",
      name: "browserbaseProjectId",
      message: "Browserbase Project ID:",
      initial: existingConfig["BROWSERBASE_PROJECT_ID"] || "",
      validate: (value) => (value ? true : "Project ID is required"),
    },
    {
      type: "text",
      name: "browserbaseApiKey",
      message: "Browserbase API Key:",
      initial: existingConfig["BROWSERBASE_API_KEY"] || "",
      validate: (value) => (value ? true : "API Key is required"),
    },
    {
      type: "text",
      name: "geminiApiKey",
      message: "Gemini API Key:",
      initial:
        existingConfig["GEMINI_API_KEY"] ||
        existingConfig["GOOGLE_GENERATIVE_AI_API_KEY"] ||
        "",
      validate: (value) => (value ? true : "Gemini API Key is required"),
    },
  ]);

  if (
    !response.browserbaseProjectId ||
    !response.browserbaseApiKey ||
    !response.geminiApiKey
  ) {
    console.log("❌ Configuration cancelled");
    process.exit(1);
  }

  // Create config directory if it doesn't exist
  await fs.mkdir(GLOBAL_CONFIG_DIR, { recursive: true });

  // Write config file
  const envContent = `# mcpkit Global Configuration
# This file is used by all generated MCP servers

# Browserbase Configuration
BROWSERBASE_PROJECT_ID=${response.browserbaseProjectId}
BROWSERBASE_API_KEY=${response.browserbaseApiKey}

# AI Model Configuration (Gemini)
GEMINI_API_KEY=${response.geminiApiKey}
GOOGLE_GENERATIVE_AI_API_KEY=${response.geminiApiKey}
`;

  await fs.writeFile(GLOBAL_ENV_PATH, envContent, "utf-8");

  console.log(`\n✅ Global configuration saved to: ${GLOBAL_ENV_PATH}`);
  console.log(
    "\n💡 All generated MCP servers will automatically use these credentials."
  );
  console.log(
    "   You can still override them with local .env files in each server directory.\n"
  );
}

/**
 * Show current global configuration
 */
export async function showConfig(): Promise<void> {
  console.log("🔧 mcpkit Global Configuration\n");
  console.log(`Configuration file: ${GLOBAL_ENV_PATH}\n`);

  try {
    const content = await fs.readFile(GLOBAL_ENV_PATH, "utf-8");
    const config: Record<string, string> = {};

    content.split("\n").forEach((line) => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith("#")) {
        const [key, ...valueParts] = trimmed.split("=");
        if (key && valueParts.length > 0) {
          config[key.trim()] = valueParts.join("=").trim();
        }
      }
    });

    if (Object.keys(config).length === 0) {
      console.log("⚠️  No configuration found");
      console.log('   Run "mcpkit config" to set up global configuration\n');
      return;
    }

    console.log("Current configuration:");
    Object.entries(config).forEach(([key, value]) => {
      const displayValue =
        key.includes("KEY") || key.includes("TOKEN")
          ? value.substring(0, 8) + "..." + value.substring(value.length - 4)
          : value;
      console.log(`  ${key}=${displayValue}`);
    });
    console.log();
  } catch (error) {
    console.log("⚠️  No configuration found");
    console.log('   Run "mcpkit config" to set up global configuration\n');
  }
}
