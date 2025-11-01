import { createClient } from "@1password/sdk";
import type { Client } from "@1password/sdk";

let client: Client | null = null;

export const get1PasswordClient = async () => {
  if (!client) {
    client = await createClient({
      auth: process.env.OP_SERVICE_ACCOUNT_TOKEN!,
      integrationName: "My Browserbase and 1Password Integration",
      integrationVersion: "v1.0.0",
    });
  }
  return client;
};
