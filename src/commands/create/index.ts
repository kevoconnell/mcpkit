import * as fs from "fs/promises";
import * as path from "path";
import {
  authenticateToWebsite,
  discoverActions,
  generateMCPServerCode,
  fixBuildErrors,
} from "../../services/create/index.js";
import { getStagehandInstance } from "../../initalizers/stagehand/index.js";
import { getDebugUrl } from "../../services/create/authentication/helpers.js";

/**
 * Main create function
 */
export async function createMCPServer(
  url: string,
  options?: { skipAuth?: boolean }
): Promise<void> {
  const urlObj = new URL(url);
  const domain = urlObj.hostname;

  const stagehand = await getStagehandInstance(domain);

  // Skip authentication if requested
  if (!options?.skipAuth) {
    try {
      await authenticateToWebsite(stagehand, url, domain);
    } catch (error) {
      if (error instanceof Error) {
        if (
          error.message.includes("403") ||
          error.message.includes("Forbidden") ||
          error.message.includes("blocked") ||
          error.message.includes("captcha") ||
          error.message.includes("Cloudflare")
        ) {
          console.error("\n❌ Site appears to have anti-bot protection.\n");
          console.error("💡 Try these automation-friendly alternatives:\n");
          console.error("  • https://news.ycombinator.com (Hacker News)");
          console.error("  • https://lobste.rs (Tech news)");
          console.error("  • https://docs.github.com (Documentation)");
          console.error("  • Your own website or internal tools\n");
          console.error(`🔗 Debug session: ${getDebugUrl(stagehand)}\n`);
          throw error;
        }
      }
      throw error;
    }
  } else {
    console.log("⏭️  Skipping authentication as requested...");
    // Navigate to the URL without authentication
    const context = stagehand.context;
    const activePage = await context.awaitActivePage(10_000);
    await activePage.goto(url, { waitUntil: "domcontentloaded" });
  }

  // 3. Discover available actions
  const actions = await discoverActions(stagehand, domain);

  // Log discovered actions for debugging
  if (actions.length === 0) {
    console.log(
      "\n⚠️  Warning: No actions were discovered. Generating MCP server with placeholder tools.\n"
    );
  } else {
    console.log(
      `\n✅ Generating MCP server with ${actions.length} discovered actions\n`
    );
  }

  // 4. Generate MCP server repository
  const serviceName = domain.replace(/\./g, "_");
  const repoName = `${serviceName}_mcp_server`;
  const outputDir = path.join(process.cwd(), repoName);

  console.log(`\n📦 Creating MCP server repository at ${outputDir}...`);

  // Create directory structure
  await fs.mkdir(outputDir, { recursive: true });
  await fs.mkdir(path.join(outputDir, "src"), { recursive: true });

  // Generate all files
  let serverCode = await generateMCPServerCode(domain, url, actions, outputDir);

  console.log(`\n✅ MCP server repository generated!`);
  console.log(`📁 Location: ${outputDir}\n`);

  // Install dependencies and build to verify the generated code
  console.log("📦 Installing dependencies...");
  const { exec } = await import("child_process");
  const { promisify } = await import("util");
  const execAsync = promisify(exec);

  await execAsync("npm install", { cwd: outputDir });
  console.log("✅ Dependencies installed\n");

  // Try to build with retry logic if it fails
  const maxRetries = 2;
  let buildSuccessful = false;

  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    console.log(
      attempt === 1
        ? "🔨 Building project to verify generated code..."
        : `🔨 Retry ${attempt - 1}/${maxRetries}: Rebuilding with fixes...`
    );

    try {
      const buildResult = await execAsync("npm run build", { cwd: outputDir });

      if (buildResult.stderr && !buildResult.stderr.includes("warning")) {
        console.log(`⚠️  Build warnings:\n${buildResult.stderr}`);
      }

      console.log("✅ Build successful!\n");
      buildSuccessful = true;
      break;
    } catch (error) {
      const buildError =
        error instanceof Error && "stderr" in error
          ? (error as any).stderr
          : String(error);

      console.error(`❌ Build failed (attempt ${attempt}/${maxRetries + 1})`);
      console.error(`\nBuild errors:\n${buildError}\n`);

      // If we've exhausted retries, give up
      if (attempt > maxRetries) {
        console.error(
          "💡 Maximum retry attempts reached. The repository was created but has compilation errors."
        );
        console.error(
          "   Please review the generated code and fix the issues manually.\n"
        );
        throw error;
      }

      // Use AI to fix the errors
      console.log("🤖 Using AI to analyze and fix build errors...\n");

      try {
        const fixedCode = await fixBuildErrors(
          serverCode,
          buildError,
          actions,
          outputDir
        );

        if (fixedCode !== serverCode) {
          serverCode = fixedCode;
        } else {
          console.log("✅ No fixes applied, retrying build...\n");
        }

        console.log("✅ Generated fixes applied, retrying build...\n");
      } catch (fixError) {
        console.error(
          "⚠️  Failed to generate fixes:",
          fixError instanceof Error ? fixError.message : fixError
        );
        console.error("   Retrying with original approach...\n");
      }
    }
  }

  if (!buildSuccessful) {
    throw new Error("Build failed after all retry attempts");
  }

  console.log(`Next steps:`);
  console.log(`  cd ${repoName}`);
  console.log(`  npm start`);
  console.log(`\n💡 The server has been built with your global secrets and is ready to use!`);
  console.log(`\nTo add this MCP server to Claude Code:`);
  console.log(`  claude mcp add --transport stdio ${serviceName} -- node ${path.join(process.cwd(), repoName)}/dist/index.js`);
}
