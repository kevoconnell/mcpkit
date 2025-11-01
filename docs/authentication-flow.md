# Authentication Flow

## Overview

mcpkit uses a streamlined authentication flow that combines manual browser-based login with optional credential storage in 1Password.

## Flow Diagram

```
1. User runs: mcpkit create https://example.com
   ↓
2. Load or create persistent browser context for example.com
   ↓
3. Navigate to example.com
   ↓
4. Analyze authentication state with AI
   ↓
5. If login button detected → Click it
   ↓
6. Open Browserbase debugger URL in browser
   ↓
7. User logs in manually in browser
   ↓
8. User presses Enter when done
   ↓
9. Verify authentication succeeded
   ↓
10. Prompt to save credentials to 1Password (optional)
   ↓
11. Continue with action discovery
```

## Key Features

### 1. AI-Powered Login Button Detection

The `analyzeAuthenticationState` function uses AI to:
- Determine if authentication is required
- Identify the login button/link to click (e.g., "Click the Sign In button")
- Assess whether auto-fill would work
- Detect blockers like MFA or SSO

Example schema:
```typescript
{
  requiresAuth: boolean,
  loginButton?: string,  // "Click the Sign In button"
  canAutofill?: boolean,
  recommendedStrategy?: "autofill" | "manual" | "passwordless" | "unknown",
  steps?: string[],
  blockers?: string[],
  mfa?: { required: boolean, description?: string }
}
```

### 2. Manual Browser-Based Login

Instead of trying to automate credentials entry (which often fails with MFA, CAPTCHA, etc.):

1. **Opens Browserbase debugger URL** in the user's default browser
2. **User logs in manually** - they can handle MFA, CAPTCHA, OAuth, etc.
3. **Session state persists** via Browserbase contexts
4. **No need to log in again** on subsequent runs

Benefits:
- ✅ Works with any auth flow (MFA, OAuth, SAML, etc.)
- ✅ User stays in control
- ✅ More reliable than automation
- ✅ Session persists across runs

### 3. Optional 1Password Storage

After successful login, users are prompted:
```
Would you like to save your login credentials to 1Password for future use? (Y/n)
```

If they choose yes:
- Username and password are collected
- Stored in 1Password using the service account
- Can be used for documentation or future reference

Note: Credentials are stored but NOT used for automatic login (manual login is always used).

## Code Example

```typescript
// 1. Analyze auth state
const analysis = await analyzeAuthenticationState(stagehand, page);

// 2. Click login button if detected
if (analysis.loginButton) {
  console.log(`🖱️  Clicking: "${analysis.loginButton}"`);
  await stagehand.act(analysis.loginButton);
}

// 3. Open browser for manual login
console.log("🌐 Opening browser session...");
await openDebuggerUrl(stagehand.browserbaseSessionId);

console.log("⏳ Press Enter after logging in...");
await waitForEnter();

// 4. Verify authentication
const verified = await analyzeAuthenticationState(stagehand, page);
if (verified.requiresAuth) {
  throw new Error("Authentication failed");
}

// 5. Optionally save to 1Password
await promptToSaveCredentials(domain);
```

## Session Persistence

Sessions are automatically persisted using Browserbase contexts:

- **First run**: User logs in once
- **Subsequent runs**: Context is reused, no login needed
- **Storage**: `.mcpkit/contexts/{domain}.txt` contains context ID
- **Management**: Use `mcpkit contexts` to view/delete saved sessions

Example:
```bash
# First time
$ mcpkit create https://linear.app
🌐 Opening browser session for authentication...
👉 Please log in in the browser window...
✅ Authentication confirmed.

# Second time (uses saved context)
$ mcpkit create https://linear.app
♻️  Found existing context for linear.app
🔓 No authentication required.
```

## Why This Approach?

### Problems with Automated Login:
- ❌ Fails with MFA/2FA
- ❌ Fails with CAPTCHA
- ❌ Fails with OAuth/SAML
- ❌ Requires credential storage
- ❌ Different login flows per site
- ❌ Security concerns

### Benefits of Manual Login:
- ✅ Works with ALL auth methods
- ✅ User handles MFA/CAPTCHA naturally
- ✅ More secure (user stays in control)
- ✅ Session persists via browser context
- ✅ Simpler implementation
- ✅ Credentials optional

## Future Enhancements

Potential improvements:
- [ ] Detect when context has expired and prompt re-auth
- [ ] Support for multiple accounts per domain
- [ ] Integration with browser extensions
- [ ] Automatic session refresh
