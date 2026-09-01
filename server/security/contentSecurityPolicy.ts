export const CONTENT_SECURITY_POLICY_HEADER = "Content-Security-Policy-Report-Only";
export const PRODUCTION_API_ORIGIN = "https://api.equest.kz";
export const PREVIEW_API_ORIGIN = "https://engineerus-quest-supabase.onrender.com";

const createDirectiveEntries = (apiOrigin: string) => [
  ["default-src", ["'self'"]],
  ["script-src", ["'self'"]],
  // React currently renders two progress indicators with style attributes.
  // Keep this exception limited to styles; scripts do not allow unsafe-inline.
  ["style-src", ["'self'", "'unsafe-inline'"]],
  // Profile v2 accepts HTTPS avatar URLs. data: and blob: remain disallowed.
  ["img-src", ["'self'", "https:"]],
  ["font-src", ["'self'"]],
  ["connect-src", [
    "'self'",
    apiOrigin,
    "https://gsudtcyoaknehfixaxha.supabase.co",
    "wss://gsudtcyoaknehfixaxha.supabase.co",
  ]],
  ["frame-ancestors", ["'none'"]],
  ["object-src", ["'none'"]],
  ["base-uri", ["'self'"]],
  ["form-action", ["'self'"]],
] as const;

const serializeDirectives = (entries: ReturnType<typeof createDirectiveEntries>) => entries
  .map(([directive, values]) => `${directive} ${values.join(" ")}`)
  .join("; ");

export const PRODUCTION_CSP_VALUE = serializeDirectives(
  createDirectiveEntries(PRODUCTION_API_ORIGIN),
);

export const PREVIEW_CSP_VALUE = serializeDirectives(
  createDirectiveEntries(PREVIEW_API_ORIGIN),
);

export function createFrontendContentSecurityPolicyDirectives(
  environment: "production" | "preview",
): Record<string, string[]> {
  const apiOrigin = environment === "production" ? PRODUCTION_API_ORIGIN : PREVIEW_API_ORIGIN;
  return Object.fromEntries(
    createDirectiveEntries(apiOrigin).map(([directive, values]) => [directive, [...values]]),
  ) as Record<string, string[]>;
}

export function createContentSecurityPolicyDirectives(nodeEnv: string): Record<string, string[]> {
  const directives = createFrontendContentSecurityPolicyDirectives("production");

  if (nodeEnv !== "production") {
    directives["connect-src"].push(
      "http://localhost:*",
      "http://127.0.0.1:*",
      "ws://localhost:*",
      "ws://127.0.0.1:*",
    );
  }

  return directives;
}
