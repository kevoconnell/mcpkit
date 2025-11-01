# mcpkit

Easy setup for MCPs with Browserbase and 1Password. Run browser automation anywhere with just an API key.

## Features

- ✅ Checks if 1Password CLI is installed
- ✅ Offers to install via Homebrew if not present
- ✅ Verifies user is signed in to 1Password CLI (automatically runs `op signin` if needed)
- ✅ Interactive vault selection with arrow key navigation
- ✅ Option to create a new vault from the selection menu
- ✅ Creates a service account with vault access
- ✅ Saves token to `.env` as `OP_SERVICE_ACCOUNT_TOKEN`

## Installation

```bash
npm install -g mcpkit
```

## Usage

### CLI (Recommended)

```bash
# Run the setup wizard
mcpkit
```

### Programmatic

```typescript
import { setupSecrets } from "mcpkit";

await setupSecrets();
```

### Local Development

```bash
npm run secrets:setup
```

## Flow

1. **Check 1Password CLI Installation**
   - If not installed, asks user if they want to install via Homebrew
   - Verifies Homebrew is available before attempting installation

2. **Verify Sign-In Status**
   - Checks if user is signed in with `op account list`
   - If not signed in, automatically launches `op signin` for the user
   - Waits for sign-in to complete before continuing

3. **Vault Selection**
   - Lists all available vaults in an interactive menu
   - User navigates with arrow keys (↑/↓) and selects with Enter
   - Includes "+ Create New Vault" option at the bottom of the list
   - If no vaults exist, prompts user to create one

4. **Service Account Creation**
   - Creates a new service account with a timestamped name
   - Grants access to the selected vault
   - Retrieves the service account token

5. **Save to Environment**
   - Saves token to `.env` file as `OP_SERVICE_ACCOUNT_TOKEN`
   - Updates existing token if already present

## Using Secret References

Once setup is complete, you can use 1Password secret references in your code:

```bash
# Reference format: op://vault/item/field
export API_KEY=$(op read "op://Private/API Keys/token")
```

Or use with the service account token:

```bash
OP_SERVICE_ACCOUNT_TOKEN=<your-token> op read "op://vault/item/field"
```

## Requirements

- macOS (for Homebrew installation)
- 1Password account
- 1Password CLI (`op`) - will be installed if not present
- Active 1Password CLI session (signed in)

## Environment Variables

- `OP_SERVICE_ACCOUNT_TOKEN` - Generated service account token (saved to `.env`)

## References

- [1Password CLI Documentation](https://developer.1password.com/docs/cli/)
- [Secret References](https://developer.1password.com/docs/cli/secret-references)
- [Service Accounts](https://developer.1password.com/docs/service-accounts/)
