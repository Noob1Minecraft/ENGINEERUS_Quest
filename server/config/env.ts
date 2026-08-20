import { z } from "zod";

const optionalString = z.preprocess(
  (value) => typeof value === "string" && value.trim() === "" ? undefined : value,
  z.string().trim().min(1).optional(),
);

const optionalUrl = z.preprocess(
  (value) => typeof value === "string" && value.trim() === "" ? undefined : value,
  z.string().trim().url().optional(),
);

const disabledByDefaultBoolean = z.preprocess(
  (value) => {
    if (typeof value !== "string") return value;
    const normalized = value.trim().toLowerCase();
    if (normalized === "") return undefined;
    if (normalized === "true") return true;
    if (normalized === "false") return false;
    return value;
  },
  z.boolean().default(false),
);

const serverEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  FRONTEND_ORIGIN: optionalString,
  GROQ_API_KEY: optionalString,
  GROQ_API_KEY_2: optionalString,
  GROQ_MODEL: z.string().trim().min(1).default("qwen/qwen3.6-27b"),
  KAZSTANDARD_LOOKUP_ENABLED: disabledByDefaultBoolean,
  SUPABASE_URL: optionalUrl,
  SUPABASE_PUBLISHABLE_KEY: optionalString,
  SUPABASE_SECRET_KEY: optionalString,
  SUPABASE_JWT_AUDIENCE: z.string().trim().min(1).default("authenticated"),
});

export type ServerEnv = z.infer<typeof serverEnvSchema> & {
  supabaseConfigured: boolean;
};

export function loadServerEnv(source: NodeJS.ProcessEnv): ServerEnv {
  const result = serverEnvSchema.safeParse(source);

  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `${issue.path.join(".") || "environment"}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid server environment: ${details}`);
  }

  const supabaseValues = [
    result.data.SUPABASE_URL,
    result.data.SUPABASE_PUBLISHABLE_KEY,
    result.data.SUPABASE_SECRET_KEY,
  ];
  const configuredCount = supabaseValues.filter(Boolean).length;

  if (configuredCount > 0 && configuredCount < supabaseValues.length) {
    throw new Error(
      "Invalid server environment: SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, " +
      "and SUPABASE_SECRET_KEY must be configured together.",
    );
  }

  if (result.data.FRONTEND_ORIGIN) {
    for (const origin of result.data.FRONTEND_ORIGIN.split(",")) {
      try {
        new URL(origin.trim());
      } catch {
        throw new Error(`Invalid server environment: FRONTEND_ORIGIN contains an invalid URL.`);
      }
    }
  }

  return {
    ...result.data,
    supabaseConfigured: configuredCount === supabaseValues.length,
  };
}
