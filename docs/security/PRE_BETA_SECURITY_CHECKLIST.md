# Engineerus Quest pre-beta security checklist

Use this checklist before any production promotion. Preview evidence does not automatically prove production readiness. Unchecked items are unresolved or require a fresh environment-specific verification.

## Identity and authorization

- [x] Supabase JWT issuer/audience/signature validation is enforced by the backend.
- [x] Owner identity is derived from verified JWT `sub` / `auth.uid()`, not request bodies.
- [x] Profile, progress, Projects, recruitment, EngiMatch, AI persistence, and Direct Chat RLS/authorization have focused tests.
- [x] Trigger-only SECURITY DEFINER functions are not executable by API roles.
- [x] Authenticated SECURITY DEFINER RPCs use fixed empty `search_path`, `auth.uid()`, narrow ACLs, and focused tests.
- [ ] Re-run complete remote RLS/RPC/grant review immediately before production promotion.
- [ ] Enable and verify Supabase leaked-password protection.

## Application and abuse controls

- [x] Pre-auth, authenticated, endpoint-specific, AI concurrency, and Direct Chat rate controls exist.
- [x] CORS has explicit deployed origins, no wildcard, no production localhost, and no credentialed-cookie mode.
- [x] CSP remains Report-Only with restrictive framing, object, script, and base directives.
- [ ] Review CSP reports and approve enforcement policy before switching from Report-Only.
- [x] API request schemas reject malformed/oversized input and ignore unsupported identity/XP fields.
- [x] KazStandard metadata is bounded, verified, treated as untrusted, and guarded against invented identifiers.
- [ ] Complete production abuse thresholds/capacity review for the distributed rate-limit store.

## Secrets, dependencies, and CI

- [x] Repository environment files are ignored except the placeholder-only `.env.example`.
- [x] Security CI uses least-privilege `contents: read` and does not deploy or write repository content.
- [x] Gitleaks history scanning is configured with no broad allowlist.
- [x] Exact lockfile installation, TypeScript, production build, focused security tests, and critical production dependency audit are CI gates.
- [x] A CycloneDX production SBOM is generated as a short-retention CI artifact.
- [ ] Review the latest CI secret scan, dependency audit, and SBOM before each beta release.
- [ ] Configure repository branch protection to require the security workflow before merging to production.

## Logging and incident readiness

- [x] Backend operational logs are structured JSON with server-generated request correlation IDs.
- [x] Central redaction covers authorization, tokens, passwords, secrets, API keys, and cookies.
- [x] Prompts, AI responses, Direct Chat content, saved notes, and private profile fields are prohibited from logs.
- [x] Sanitized 5xx responses expose only a correlation ID, not stack traces or internal details.
- [x] Incident response and controlled rollback procedures are documented.
- [ ] Confirm log retention, access ownership, alert routing, and evidence-preservation policy for production.

## Data, recovery, and product readiness

- [x] Repository and remote migration histories can be compared before changes; destructive resets are prohibited remotely.
- [ ] Verify Supabase backup/recovery capability and document a tested restore procedure appropriate to the selected plan.
- [ ] Perform a final Preview security re-audit on the exact production candidate commit.
- [ ] Review production Vercel, Render, Supabase Auth, environment-variable names/scopes, domains, and auto-deploy settings.
- [ ] Complete privacy notice, data-retention, terms, and Kazakhstan legal/compliance review.
- [ ] Define Direct Chat moderation/report review ownership, response targets, and user appeal/escalation process.
- [ ] Confirm incident owner and release decision authority before public beta.
