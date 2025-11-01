import prompts from "prompts";
import { get1PasswordClient } from "../../initalizers/1password/index.js";
import { AutofillBehavior, ItemCategory, ItemFieldType } from "@1password/sdk";

/**
 * Get the vault ID associated with the service account token
 */
async function getVaultId(): Promise<string> {
  const client = await get1PasswordClient();

  // List all vaults the service account has access to
  const vaults = await client.vaults.list();

  if (vaults.length === 0) {
    throw new Error("No vaults found for this service account");
  }

  // Use the first vault the service account has access to
  return vaults[0].id;
}

/**
 * Look up credentials in 1Password
 */
export async function lookupCredentialsIn1Password(
  domain: string
): Promise<{ username: string; password: string } | null> {
  console.log(`\n🔍 Checking 1Password for ${domain} credentials...`);

  try {
    const client = await get1PasswordClient();
    const vaultId = await getVaultId();

    // List all items in the vault
    const items = await client.items.list(vaultId);
    console.log("Items from 1Password:", items);
    console.log(`Found ${items.length} items in 1Password vault`);

    // Try to find an item that matches the domain
    const normalize = (value: string) =>
      value.toLowerCase().replace(/[^a-z0-9]/g, "");
    const extractHostname = (value: string): string => {
      if (!value) return "";
      const sanitized = value.replace(/^https?:\/\//i, "");
      const host = sanitized.split(/[/?#]/)[0];
      return host.toLowerCase();
    };
    const domainCandidates = new Set<string>();
    const addCandidate = (value?: string) => {
      if (!value) return;
      domainCandidates.add(value);
      domainCandidates.add(value.replace(/\./g, "_"));
    };

    addCandidate(domain);

    const host = extractHostname(domain);
    addCandidate(host);
    const hostWithoutWWW = host.replace(/^www\./, "");
    addCandidate(hostWithoutWWW);

    const labels = hostWithoutWWW.split(".").filter(Boolean);
    if (labels.length > 0) {
      addCandidate(labels[0]); // first label, often the brand name
    }
    if (labels.length > 1) {
      addCandidate(labels.slice(-2).join("."));
      addCandidate(labels[labels.length - 2]);
      addCandidate(labels.slice(0, -1).join("."));
    }

    const domainSignatures = Array.from(domainCandidates)
      .map((value) => normalize(value))
      .filter(Boolean);

    for (const item of items) {
      const titleSignature = normalize(item.title);
      const websiteSignatures =
        item.websites
          ?.map((website) => {
            const websiteHost = extractHostname(website.url);
            return normalize(websiteHost || website.url);
          })
          .filter(Boolean) ?? [];

      const searchable = [titleSignature, ...websiteSignatures];
      const matchesDomain = searchable.some((candidate) =>
        domainSignatures.some(
          (signature) =>
            candidate.includes(signature) || signature.includes(candidate)
        )
      );

      if (matchesDomain && item.category === ItemCategory.Login) {
        console.log(`Found matching login item: ${item.title}`);

        // Get the full item details
        const fullItem = await client.items.get(vaultId, item.id);

        // Extract username and password from fields, resolving secrets when needed
        const credentials: Record<"username" | "password", string | undefined> = {
          username: undefined,
          password: undefined,
        };
        const secretReferences: Partial<Record<"username" | "password", string>> =
          {};

        for (const field of fullItem.fields || []) {
          const isUsernameField =
            field.id === "username" || field.title?.toLowerCase() === "username";
          const isPasswordField =
            field.id === "password" || field.title?.toLowerCase() === "password";

          if (isUsernameField && field.value) {
            credentials.username = field.value;
          } else if (isUsernameField) {
            secretReferences.username = `op://${vaultId}/${fullItem.id}/${field.id}`;
          }

          if (isPasswordField && field.value) {
            credentials.password = field.value;
          } else if (isPasswordField) {
            secretReferences.password = `op://${vaultId}/${fullItem.id}/${field.id}`;
          }
        }

        const unresolved = Object.entries(credentials).filter(
          ([key, value]) => !value && secretReferences[key as "username" | "password"]
        );
        if (unresolved.length > 0) {
          const referencesToResolve = unresolved
            .map(([key]) => secretReferences[key as "username" | "password"])
            .filter((ref): ref is string => Boolean(ref));

          if (referencesToResolve.length > 0) {
            const resolution = await client.secrets.resolveAll(referencesToResolve);

            for (const [key] of unresolved) {
              const secretRef = secretReferences[key as "username" | "password"];
              if (!secretRef) {
                continue;
              }
              const response = resolution.individualResponses[secretRef];
              const secret = response?.content?.secret;

              if (secret) {
                credentials[key as "username" | "password"] = secret;
              } else {
                console.warn(
                  `⚠️  Unable to resolve ${key} for 1Password item "${fullItem.title}". Error:`,
                  response?.error
                );
              }
            }
          }
        }

        if (credentials.username && credentials.password) {
          console.log(`✅ Found credentials in 1Password for ${domain}`);
          return {
            username: credentials.username,
            password: credentials.password,
          };
        }
      }
    }

    console.log(`ℹ️  No credentials found in 1Password for ${domain}`);
    return null;
  } catch (error) {
    console.log(`⚠️  Could not connect to 1Password:`, error);
    return null;
  }
}

/**
 * Save credentials to 1Password
 */
export async function saveCredentialsTo1Password(
  domain: string,
  username: string,
  password: string
): Promise<void> {
  console.log(`\n💾 Saving credentials to 1Password...`);

  try {
    const client = await get1PasswordClient();
    const vaultId = await getVaultId();

    // Create a new login item in 1Password
    const item = await client.items.create({
      vaultId: vaultId,
      category: ItemCategory.Login,
      title: domain,
      fields: [
        {
          id: "username",
          fieldType: ItemFieldType.Text,
          title: "username",
          value: username,
        },
        {
          id: "password",
          fieldType: ItemFieldType.Concealed,
          title: "password",
          value: password,
        },
      ],
      websites: [
        {
          url: `https://${domain}`,
          label: "website",
          autofillBehavior: AutofillBehavior.AnywhereOnWebsite,
        },
      ],
    });

    console.log(`✅ Credentials saved to 1Password as "${domain}"`);
  } catch (error) {
    console.error(`❌ Failed to save to 1Password:`, error);
    throw error;
  }
}

/**
 * Prompt user for credentials
 */
export async function promptForCredentials(domain: string): Promise<{
  username: string;
  password: string;
}> {
  console.log(`\n🔐 Please provide credentials for ${domain}:`);

  const response = await prompts([
    {
      type: "text",
      name: "username",
      message: "Username or email:",
      validate: (value) => (value ? true : "Username is required"),
    },
    {
      type: "password",
      name: "password",
      message: "Password:",
      validate: (value) => (value ? true : "Password is required"),
    },
  ]);

  if (!response.username || !response.password) {
    throw new Error("Credentials are required");
  }

  return {
    username: response.username,
    password: response.password,
  };
}
