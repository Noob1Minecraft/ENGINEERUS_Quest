# Engineerus Quest incident response

This playbook is for defensive handling of security incidents affecting Engineerus code, accounts, data, AI providers, dependencies, or Preview/production deployments. Never paste credentials, tokens, private messages, prompts, or personal data into tickets, chat, screenshots, or logs.

## Triage and severity

Treat active unauthorized access, exposed server credentials, an RLS/API authorization bypass, private-data disclosure, or an unauthorized deployment as critical. Treat confirmed abuse, compromised user accounts, malicious Direct Chat content, dependency vulnerabilities, and availability attacks according to current user/data impact and exploitability.

For every incident, record the discovery time, affected environment and feature, reporter, current impact, evidence locations, decisions, and owner. Restrict evidence access to people who need it.

## Response sequence

1. **Identify:** verify the signal without retrieving or reproducing secrets/private content unnecessarily. Correlate sanitized logs with `X-Request-ID`, deployment ID, commit, and timestamps.
2. **Preserve evidence:** retain relevant Render/Vercel/Supabase/GitHub audit logs and deployment metadata. Do not edit original evidence or enable verbose credential-bearing logs.
3. **Contain:** disable the smallest affected feature, credential, account, integration, or deployment path. Human approval is required for cloud changes and credential rotation.
4. **Assess scope:** determine affected users, records, time window, permissions, downstream services, persistence, and whether data was read, modified, or deleted.
5. **Eradicate:** fix the root cause through reviewed code/configuration or an additive migration. Do not improvise destructive SQL or history rewrites.
6. **Recover:** deploy a reviewed commit, validate health/auth/RLS/API boundaries, and monitor for recurrence before restoring normal access.
7. **Notify:** inform the project owner and, when applicable, affected users or service providers using verified facts and minimum necessary personal data.
8. **Review:** document cause, timeline, impact, control failures, remediation owner/deadline, and evidence that the fix works.

## Incident-specific containment

### Leaked Groq, Supabase, GitHub, Vercel, or Render credential

- Stop using the credential and rotate/revoke it in the owning provider console with explicit human approval.
- Update only the intended encrypted environment entry; never copy the replacement into source, CI output, chat, or a ticket.
- Review provider access/audit logs for the exposure window and invalidate related sessions where supported.
- A public Supabase publishable key is not a secret, but RLS and authorization still require review if it was involved in abuse.

### Compromised user account

- Revoke affected sessions using the approved Supabase Auth workflow.
- Preserve authentication audit evidence and review profile, project, application/invitation, Direct Chat, and AI activity for unauthorized changes.
- Do not expose OAuth metadata, email, or token material during investigation.

### Abusive AI/API usage

- Use request IDs, rate-limit events, endpoint, status, duration, and provider category—not prompt or response bodies—to assess the event.
- Contain with existing feature/rate controls. Avoid broad account or network blocking without confirming impact.
- Rotate provider credentials only when exposure is suspected, not for ordinary quota exhaustion.

### Unauthorized data access or RLS/API bypass

- Restrict the affected endpoint/RPC or temporarily disable the feature.
- Preserve database and API audit evidence. Determine the exact table/row scope without broad data exports.
- Remediate with reviewed RLS, grants, backend authorization, or additive migrations. Never reset or destructively rewrite the database as an incident shortcut.

### Malicious Direct Chat content or harassment

- Preserve minimal message IDs, conversation IDs, timestamps, report/block state, and moderation decisions.
- Avoid copying message content into general-purpose logs or tickets.
- Use existing block/report/abuse controls and rate limits; escalate credible safety threats to the appropriate human owner.

### Dependency or CI compromise

- Stop affected builds/releases, preserve workflow logs and the SBOM artifact, and identify impacted versions and deployed commits.
- Pin or replace the compromised component through a reviewed change. Do not mass-upgrade unrelated dependencies during containment.
- Review workflow token permissions, action revisions, artifacts, caches, and whether untrusted PR code had access to secrets.

### Unauthorized deployment

- Preserve deployment ID, actor, commit, environment, and platform audit history.
- Redeploy the last known-good reviewed commit. Do not promote Preview or alter production without explicit approval.
- For database changes, prefer a new controlled remediation migration; do not run a destructive rollback ad hoc.

## Recovery verification

- Authentication/JWT issuer and audience checks pass.
- RLS, grants, and SECURITY DEFINER ACL tests pass.
- API authorization, CORS, CSP, rate limits, request IDs, and redaction tests pass.
- Direct Chat, Projects, EngiMatch, Profile, AI persistence, XP/streak, and privacy smoke tests pass where relevant.
- Supabase Security Advisor and dependency/secret gates have no new actionable critical finding.
- Monitoring shows no recurrence during the agreed observation window.

## Post-incident review

Complete a blameless timeline, root cause, user impact assessment, control-gap analysis, assigned remediations, due dates, and follow-up validation. Retain the report according to project policy without embedding credentials or unnecessary private data.
