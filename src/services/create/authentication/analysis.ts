import { Stagehand } from "@browserbasehq/stagehand";
import {
  AuthAnalysis,
  AuthAnalysisSchema,
  StagehandPage,
} from "../schemas/index.js";

/**
 * Analyze the authentication state of the current page
 */
export async function analyzeAuthenticationState(
  stagehand: Stagehand,
  page: StagehandPage
): Promise<AuthAnalysis> {
  stagehand.context.setActivePage(page);

  try {
    const result = await stagehand.extract(
      `Inspect the current page for authentication state.

Key questions to answer:
1. Does the user need to sign in? (requiresAuth: true/false)
2. If yes, what button/link should they click to start login? (loginButton: describe the action, e.g., "Click the Sign In button")
3. Can credentials be auto-filled? (canAutofill: true/false)
4. What's the recommended authentication strategy? (recommendedStrategy: "autofill", "manual", "passwordless", or "unknown")
5. Are there any blockers like MFA or SSO? (blockers: array of issues)

Return a complete analysis following the schema.`,
      AuthAnalysisSchema
    );
    return result;
  } catch (error) {
    const url = page.url();
    const requiresAuth = /login|signin|auth|sign-in|account/i.test(url);
    return {
      requiresAuth,
      summary:
        error instanceof Error
          ? `Heuristic result after extract error: ${error.message}`
          : "Heuristic result after extract error.",
    };
  }
}

/**
 * Log authentication analysis details
 */
export function logAuthenticationAnalysis(
  analysis: AuthAnalysis,
  domain: string
) {
  const summary = analysis.summary ?? `Sign-in required for ${domain}.`;
  console.log(`🔐 Login flow detected: ${summary}`);

  if (analysis.loginButton) {
    console.log(`   Login action: ${analysis.loginButton}`);
  }

  if (analysis.steps && analysis.steps.length > 0) {
    console.log("   Suggested steps:");
    analysis.steps.forEach((step, index) => {
      console.log(`   ${index + 1}. ${step}`);
    });
  }

  if (analysis.blockers && analysis.blockers.length > 0) {
    console.log("   Potential blockers:");
    analysis.blockers.forEach((blocker) => {
      console.log(`   - ${blocker}`);
    });
  }

  if (analysis.mfa?.required) {
    console.log(
      `   MFA required: ${
        analysis.mfa.description ?? "Complete MFA in the live session."
      }`
    );
  }
}
