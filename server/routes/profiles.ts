import { Router, type RequestHandler } from "express";
import { z } from "zod";
import { PersistenceError, sendPersistenceError } from "../persistence/errors";
import type { ProfileRepository, ProfileSearch, ProfileUpdate } from "../persistence/profiles";

const uuid = z.string().uuid();
const nullableText = (max: number) => z.string().trim().min(1).max(max).nullable();
const visibility = z.enum(["public", "authenticated", "private"]);
const proficiency = z.number().int().min(1).max(5).nullable().optional();
const unique = <T>(values: readonly T[]) => new Set(values).size === values.length;

const profileUpdateSchema = z.object({
  username: z.string().trim().min(1).max(50).regex(/^[\p{L}\p{N}_.-]+$/u).optional(),
  display_name: nullableText(100).optional(),
  avatar_url: z.string().url().max(2048).nullable().optional(),
  university_name: nullableText(200).optional(),
  primary_discipline_id: uuid.nullable().optional(),
  bio: nullableText(2000).optional(),
  portfolio_url: z.string().url().max(2048).refine((value) => /^https?:\/\//i.test(value)).nullable().optional(),
  profile_visibility: visibility.optional(),
  portfolio_visibility: visibility.optional(),
  available_for_projects: z.boolean().optional(),
  skills: z.array(z.object({ id: uuid, proficiency })).max(50)
    .refine((values) => unique(values.map(({ id }) => id))).optional(),
  tools: z.array(z.object({ id: uuid, proficiency })).max(50)
    .refine((values) => unique(values.map(({ id }) => id))).optional(),
  interests: z.array(uuid).max(50).refine(unique).optional(),
  languages: z.array(z.object({
    language_code: z.string().regex(/^[a-z]{2,3}(-[A-Z]{2})?$/),
    proficiency,
  })).max(20).refine((values) => unique(values.map(({ language_code }) => language_code))).optional(),
}).strict();

const settingsUpdateSchema = z.object({
  preferred_lang: z.enum(["ru", "kk", "en"]).optional(),
  allow_project_invitations: z.boolean().optional(),
  allow_direct_messages: z.boolean().optional(),
}).strict();

const searchSchema = z.object({
  query: z.string().trim().min(1).max(100).regex(/^[\p{L}\p{N} _.-]+$/u).optional(),
  discipline: uuid.optional(),
  skill: uuid.optional(),
  available: z.enum(["true", "false"]).transform((value) => value === "true").optional(),
  cursor: uuid.optional(),
  limit: z.coerce.number().int().min(1).max(25).default(20),
}).strict();

function parseBody<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success || Object.keys(result.data as object).length === 0) {
    throw new PersistenceError(400, "invalid_profile_input", "Valid profile fields are required.");
  }
  return result.data;
}

function parseQuery(value: unknown) {
  const result = searchSchema.safeParse(value);
  if (!result.success) {
    throw new PersistenceError(400, "invalid_profile_search", "Profile search parameters are invalid.");
  }
  return result.data;
}

export function createProfilesRouter(
  authenticate: RequestHandler,
  rateLimiter: RequestHandler,
  repository: ProfileRepository,
): Router {
  const router = Router();

  router.patch("/api/me/profile", authenticate, rateLimiter, async (request, response) => {
    try {
      const update = parseBody(profileUpdateSchema, request.body) as ProfileUpdate;
      const { userId, accessToken } = response.locals.auth;
      response.json({ profile: await repository.updateProfile(userId, accessToken, update) });
    } catch (error) {
      sendPersistenceError(response, error);
    }
  });

  router.patch("/api/me/profile-settings", authenticate, rateLimiter, async (request, response) => {
    try {
      const update = parseBody(settingsUpdateSchema, request.body);
      const { userId, accessToken } = response.locals.auth;
      response.json({ private_settings: await repository.updateSettings(userId, accessToken, update) });
    } catch (error) {
      sendPersistenceError(response, error);
    }
  });

  router.get("/api/profiles", authenticate, rateLimiter, async (request, response) => {
    try {
      const search = parseQuery(request.query) as ProfileSearch;
      response.json(await repository.searchProfiles(response.locals.auth.userId, search));
    } catch (error) {
      sendPersistenceError(response, error);
    }
  });

  router.get("/api/profiles/:profileId", authenticate, rateLimiter, async (request, response) => {
    try {
      const profileId = uuid.safeParse(request.params.profileId);
      if (!profileId.success) {
        throw new PersistenceError(400, "invalid_profile_id", "A valid profile ID is required.");
      }
      const profile = await repository.getPublicProfile(response.locals.auth.userId, profileId.data);
      if (!profile) {
        response.status(404).json({ error: { code: "profile_not_found", message: "Profile not found." } });
        return;
      }
      response.json({ profile });
    } catch (error) {
      sendPersistenceError(response, error);
    }
  });

  router.get("/api/profile-taxonomies", authenticate, rateLimiter, async (_request, response) => {
    try {
      response.json(await repository.taxonomies(response.locals.auth.accessToken));
    } catch (error) {
      sendPersistenceError(response, error);
    }
  });

  return router;
}
