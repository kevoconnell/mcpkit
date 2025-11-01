import { exec } from "child_process";
import { promisify } from "util";
import prompts from "prompts";
import {
  ensureGlobalConfigDir,
  getGlobalEnvPath,
  loadEnv,
} from "../../config/env.js";

const execAsync = promisify(exec);

interface VaultInfo {
  id: string;
  name: string;
}

export class SecretsManager {
  constructor() {}

  private ensureEnvLoaded() {
    loadEnv();
  }

  private async checkOpInstalled(): Promise<boolean> {
    try {
      await execAsync("which op");
      return true;
    } catch {
      return false;
    }
  }

  private async checkBrewInstalled(): Promise<boolean> {
    try {
      await execAsync("which brew");
      return true;
    } catch {
      return false;
    }
  }

  private async installOpCli(): Promise<void> {
    console.log("Installing 1Password CLI via Homebrew...");
    try {
      const { stdout, stderr } = await execAsync("brew install 1password-cli");
      if (stderr && !stderr.includes("Warning")) {
        console.error("Installation error:", stderr);
      }
      console.log("1Password CLI installed successfully!");
    } catch (error) {
      throw new Error(`Failed to install 1Password CLI: ${error}`);
    }
  }

  private async checkSignedIn(): Promise<boolean> {
    try {
      const { stdout, stderr } = await execAsync("op account list --format=json");

      // Check if the output contains the "No accounts configured" message
      const combinedOutput = stdout + stderr;
      if (combinedOutput.includes("No accounts configured")) {
        return false;
      }

      // Try to parse as JSON to see if we have valid account data
      try {
        const accounts = JSON.parse(stdout.trim());
        // Check if we have at least one account
        return Array.isArray(accounts) && accounts.length > 0;
      } catch {
        // If we can't parse JSON, assume not signed in
        return false;
      }
    } catch {
      return false;
    }
  }

  private async signIn(): Promise<void> {
    console.log("\n❌ No 1Password account configured.");
    console.log("\nPlease add your 1Password account by running:");
    console.log("  op account add");
    console.log("\nThen run this setup again.");
    throw new Error("No 1Password account configured. Please run 'op account add' first.");
  }

  private async listVaults(): Promise<VaultInfo[]> {
    try {
      const { stdout } = await execAsync("op vault list --format=json");
      const vaults = JSON.parse(stdout);
      return vaults.map((v: any) => ({
        id: v.id,
        name: v.name,
      }));
    } catch (error) {
      throw new Error(`Failed to list vaults: ${error}`);
    }
  }

  private async createNewVault(): Promise<string> {
    const response = await prompts({
      type: "text",
      name: "vaultName",
      message: "Enter a name for the new vault:",
      validate: (value) =>
        value.trim().length > 0 || "Vault name cannot be empty",
    });

    if (!response.vaultName) {
      throw new Error("Vault creation cancelled");
    }

    console.log(`\nCreating vault: ${response.vaultName}`);

    try {
      const { stdout, stderr } = await execAsync(
        `op vault create "${response.vaultName}" --format=json`
      );

      if (stderr) {
        console.error("Vault creation stderr:", stderr);
      }

      const vault = JSON.parse(stdout.trim());
      console.log(`✓ Vault "${response.vaultName}" created successfully!`);
      return vault.id;
    } catch (error: any) {
      console.error("\nVault creation failed:");
      console.error("Error:", error.message);
      if (error.stderr) {
        console.error("Details:", error.stderr);
      }
      throw new Error(`Failed to create vault: ${error.message}`);
    }
  }

  private async selectVault(vaults: VaultInfo[]): Promise<string> {
    const choices = [
      ...vaults.map((vault) => ({
        title: vault.name,
        value: vault.id,
      })),
      {
        title: "+ Create New Vault",
        value: "__CREATE_NEW__",
      },
    ];

    const response = await prompts({
      type: "select",
      name: "vaultId",
      message: "Select a vault (use arrow keys):",
      choices,
      initial: 0,
    });

    if (!response.vaultId) {
      throw new Error("Vault selection cancelled");
    }

    if (response.vaultId === "__CREATE_NEW__") {
      return await this.createNewVault();
    }

    return response.vaultId;
  }

  private async createServiceAccount(vaultId: string): Promise<string> {
    try {
      const accountName = `mcp-stagehand-${Date.now()}`;
      console.log(`\nCreating service account: ${accountName}`);
      const { stdout } = await execAsync(
        `op service-account create "${accountName}" --vault ${vaultId} --format=json`
      );

      const result = JSON.parse(stdout);
      const token = result.token;

      if (!token) {
        throw new Error("No token returned from service account creation");
      }

      return token;
    } catch (error) {
      throw new Error(`Failed to create service account: ${error}`);
    }
  }

  private async saveTokenToEnv(token: string): Promise<void> {
    const fs = await import("fs/promises");
    this.ensureEnvLoaded();
    await ensureGlobalConfigDir();

    const envPath = getGlobalEnvPath();
    let envContent = "";

    try {
      envContent = await fs.readFile(envPath, "utf-8");
    } catch {
      // File doesn't exist, will create new
    }
    const lines = envContent.split("\n");
    const tokenLineIndex = lines.findIndex((line) =>
      line.startsWith("OP_SERVICE_ACCOUNT_TOKEN=")
    );

    if (tokenLineIndex >= 0) {
      // Replace existing token
      lines[tokenLineIndex] = `OP_SERVICE_ACCOUNT_TOKEN=${token}`;
      envContent = lines.join("\n");
    } else {
      // Add new token
      envContent += `${
        envContent && !envContent.endsWith("\n") ? "\n" : ""
      }OP_SERVICE_ACCOUNT_TOKEN=${token}\n`;
    }

    await fs.writeFile(envPath, envContent, "utf-8");
    process.env.OP_SERVICE_ACCOUNT_TOKEN = token;
    console.log(
      `\n✓ Service account token saved to global config (${envPath}) as OP_SERVICE_ACCOUNT_TOKEN`
    );
  }

  async setup(): Promise<void> {
    try {
      this.ensureEnvLoaded();
      // Check if OP_SERVICE_ACCOUNT_TOKEN already exists
      if (process.env.OP_SERVICE_ACCOUNT_TOKEN) {
        console.log("✓ OP_SERVICE_ACCOUNT_TOKEN is already set");
        console.log("\nYour 1Password service account is already configured.");
        console.log("You can proceed to use mcpkit commands.");
        return;
      }

      const isOpInstalled = await this.checkOpInstalled();

      if (!isOpInstalled) {
        console.log("1Password CLI is not installed.");

        const brewInstalled = await this.checkBrewInstalled();
        if (!brewInstalled) {
          throw new Error(
            "Homebrew is not installed. Please install Homebrew first: https://brew.sh"
          );
        }

        const response = await prompts({
          type: "confirm",
          name: "install",
          message: "Would you like to install 1Password CLI via Homebrew?",
          initial: true,
        });

        if (response.install) {
          await this.installOpCli();
        } else {
          throw new Error("1Password CLI is required. Installation cancelled.");
        }
      }

      // Step 2: Check if signed in
      const isSignedIn = await this.checkSignedIn();

      if (!isSignedIn) {
        await this.signIn();
        return;
      }

      console.log("✓ Signed in to 1Password CLI");

      // Step 3: List and select vault
      const vaults = await this.listVaults();

      let selectedVaultId: string;
      if (vaults.length === 0) {
        console.log("\nNo vaults found in your 1Password account.");
        const response = await prompts({
          type: "confirm",
          name: "createVault",
          message: "Would you like to create a new vault?",
          initial: true,
        });

        if (response.createVault) {
          selectedVaultId = await this.createNewVault();
        } else {
          throw new Error("No vault selected. Setup cancelled.");
        }
      } else {
        selectedVaultId = await this.selectVault(vaults);
      }

      // Step 4: Create service account
      const token = await this.createServiceAccount(selectedVaultId);

      // Step 5: Save to .env
      await this.saveTokenToEnv(token);

      console.log("\n✓ 1Password Service Account Setup complete!");
    } catch (error) {
      throw error;
    }
  }
}

export async function setupSecrets(): Promise<void> {
  const manager = new SecretsManager();
  await manager.setup();
}
