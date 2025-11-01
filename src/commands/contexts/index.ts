import prompts from "prompts";
import {
  listSavedContexts,
  deleteContextId,
  loadContextId,
} from "../../services/session/index.js";
import chalk from "chalk";

/**
 * List all saved browser contexts
 */
export async function listContexts(): Promise<void> {
  const contexts = await listSavedContexts();

  if (contexts.length === 0) {
    console.log(chalk.yellow("\nNo saved browser contexts found.\n"));
    console.log(
      "Contexts are automatically created when you run 'mcpkit create' for a website."
    );
    return;
  }

  console.log(chalk.bold("\n📦 Saved Browser Contexts:\n"));
  contexts.forEach((ctx, index) => {
    console.log(`${index + 1}. ${chalk.cyan(ctx.domain)}`);
    console.log(`   Context ID: ${chalk.gray(ctx.contextId)}`);
  });
  console.log("");
}

/**
 * Delete a saved browser context
 */
export async function deleteContext(domain?: string): Promise<void> {
  // If domain not provided, show list and let user select
  if (!domain) {
    const contexts = await listSavedContexts();

    if (contexts.length === 0) {
      console.log(chalk.yellow("\nNo saved browser contexts to delete.\n"));
      return;
    }

    const response = await prompts({
      type: "select",
      name: "contextIndex",
      message: "Select a context to delete:",
      choices: contexts.map((ctx, index) => ({
        title: `${ctx.domain} (${ctx.contextId})`,
        value: index,
      })),
    });

    if (response.contextIndex === undefined) {
      console.log(chalk.yellow("\nOperation cancelled.\n"));
      return;
    }

    domain = contexts[response.contextIndex].domain;
  }

  // Confirm deletion
  const confirmResponse = await prompts({
    type: "confirm",
    name: "confirmed",
    message: `Are you sure you want to delete the context for ${chalk.cyan(
      domain
    )}?`,
    initial: false,
  });

  if (!confirmResponse.confirmed) {
    console.log(chalk.yellow("\nDeletion cancelled.\n"));
    return;
  }

  await deleteContextId(domain);
  console.log(
    chalk.green(`\n✅ Context for ${chalk.cyan(domain)} deleted successfully.\n`)
  );
  console.log(
    "Note: The next time you run 'mcpkit create' for this domain, a new context will be created and you'll need to log in again."
  );
}

/**
 * Show details of a specific context
 */
export async function showContext(domain?: string): Promise<void> {
  if (!domain) {
    const contexts = await listSavedContexts();

    if (contexts.length === 0) {
      console.log(chalk.yellow("\nNo saved browser contexts found.\n"));
      return;
    }

    const response = await prompts({
      type: "select",
      name: "contextIndex",
      message: "Select a context to view:",
      choices: contexts.map((ctx, index) => ({
        title: `${ctx.domain}`,
        value: index,
      })),
    });

    if (response.contextIndex === undefined) {
      console.log(chalk.yellow("\nOperation cancelled.\n"));
      return;
    }

    domain = contexts[response.contextIndex].domain;
  }

  const contextId = await loadContextId(domain);

  if (!contextId) {
    console.log(
      chalk.red(
        `\n❌ No context found for domain: ${chalk.cyan(domain)}\n`
      )
    );
    return;
  }

  console.log(chalk.bold(`\n📦 Context for ${chalk.cyan(domain)}:\n`));
  console.log(`Domain:     ${chalk.cyan(domain)}`);
  console.log(`Context ID: ${chalk.gray(contextId)}`);
  console.log(
    `\nThis context stores browser state (cookies, localStorage, etc.) for ${domain}.`
  );
  console.log(
    "It allows you to stay logged in across multiple mcpkit sessions.\n"
  );
}

/**
 * Main contexts command handler
 */
export async function manageContexts(
  subcommand?: string,
  domain?: string
): Promise<void> {
  switch (subcommand) {
    case "list":
      await listContexts();
      break;

    case "delete":
      await deleteContext(domain);
      break;

    case "show":
      await showContext(domain);
      break;

    default:
      // Interactive mode
      const response = await prompts({
        type: "select",
        name: "action",
        message: "What would you like to do?",
        choices: [
          { title: "List all contexts", value: "list" },
          { title: "Show context details", value: "show" },
          { title: "Delete a context", value: "delete" },
          { title: "Cancel", value: "cancel" },
        ],
      });

      if (response.action === "cancel" || !response.action) {
        console.log(chalk.yellow("\nOperation cancelled.\n"));
        return;
      }

      await manageContexts(response.action);
  }
}
