export type RecaptchaVerifier = (
  token: string,
  action: string,
) => Promise<boolean>;

/** Scores a token with reCAPTCHA Enterprise; the API key stays server-side. */
export function recaptchaVerifier(
  projectId: string,
  apiKey: string,
  siteKey: string,
  minScore = 0.5,
): RecaptchaVerifier {
  return async (token, action) => {
    const response = await fetch(
      `https://recaptchaenterprise.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/assessments?key=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event: { token, siteKey, expectedAction: action },
        }),
      },
    );
    if (!response.ok) return false;
    const result = (await response.json()) as {
      tokenProperties?: { valid?: boolean; action?: string };
      riskAnalysis?: { score?: number };
    };
    return (
      result.tokenProperties?.valid === true &&
      result.tokenProperties.action === action &&
      (result.riskAnalysis?.score ?? 0) >= minScore
    );
  };
}
