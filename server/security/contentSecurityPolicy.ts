export const CONTENT_SECURITY_POLICY_HEADER = "Content-Security-Policy-Report-Only";

const productionDirectiveEntries = [
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
    "https://engineerus-quest-supabase.onrender.com",
    "https://gsudtcyoaknehfixaxha.supabase.co",
    "wss://gsudtcyoaknehfixaxha.supabase.co",
  ]],
  ["frame-ancestors", ["'none'"]],
  ["object-src", ["'none'"]],
  ["base-uri", ["'self'"]],
  ["form-action", ["'self'"]],
] as const;

export const PRODUCTION_CSP_VALUE = productionDirectiveEntries
  .map(([directive, values]) => `${directive} ${values.join(" ")}`)
  .join("; ");

export function createContentSecurityPolicyDirectives(nodeEnv: string): Record<string, string[]> {
  const directives = Object.fromEntries(
    productionDirectiveEntries.map(([directive, values]) => [directive, [...values]]),
  ) as Record<string, string[]>;

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
