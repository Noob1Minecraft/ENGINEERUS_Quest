import type { SupabaseClient } from "@supabase/supabase-js";
import type { ServerEnv } from "../config/env";
import { createSupabaseAdminClient } from "../lib/supabaseAdmin";
import { createSupabaseUserClient } from "../lib/supabaseUser";
import { PersistenceError } from "./errors";

export type ProfileVisibility = "public" | "authenticated" | "private";
export type ProfileLanguage = "ru" | "kk" | "en";

export type TaxonomyItem = {
  id: string;
  slug: string;
  label_ru: string;
  label_kk: string;
  label_en: string;
};

export type ProfileCapability = TaxonomyItem & { proficiency: number | null };
export type ProfileLanguageItem = { language_code: string; proficiency: number | null };

export type PublicProfile = {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  university_name: string | null;
  primary_discipline: TaxonomyItem | null;
  bio: string | null;
  portfolio_url: string | null;
  available_for_projects: boolean;
  skills: ProfileCapability[];
  tools: ProfileCapability[];
  interests: TaxonomyItem[];
  languages: ProfileLanguageItem[];
};

export type MyProfile = PublicProfile & {
  primary_discipline_id: string | null;
  profile_visibility: ProfileVisibility;
  portfolio_visibility: ProfileVisibility;
  created_at: string;
  updated_at: string;
};

export type ProfilePrivateSettings = {
  preferred_lang: ProfileLanguage;
  allow_project_invitations: boolean;
  allow_direct_messages: boolean;
  created_at: string;
  updated_at: string;
};

export type UserProgress = {
  total_xp: number;
  level: number;
  streak_days: number;
  requests_count: number;
  material_count: number;
  patent_count: number;
  modules_used: string[];
};

export type CanonicalUser = {
  profile: MyProfile;
  private_settings: ProfilePrivateSettings;
  progress: UserProgress;
  completed_quests: string[];
};

export type ProfileTaxonomies = {
  disciplines: TaxonomyItem[];
  skills: TaxonomyItem[];
  tools: TaxonomyItem[];
  interests: TaxonomyItem[];
};

export type CapabilityInput = { id: string; proficiency?: number | null };
export type LanguageInput = { language_code: string; proficiency?: number | null };

export type ProfileUpdate = {
  username?: string;
  display_name?: string | null;
  avatar_url?: string | null;
  university_name?: string | null;
  primary_discipline_id?: string | null;
  bio?: string | null;
  portfolio_url?: string | null;
  profile_visibility?: ProfileVisibility;
  portfolio_visibility?: ProfileVisibility;
  available_for_projects?: boolean;
  skills?: CapabilityInput[];
  tools?: CapabilityInput[];
  interests?: string[];
  languages?: LanguageInput[];
};

export type ProfileSettingsUpdate = Partial<Pick<
  ProfilePrivateSettings,
  "preferred_lang" | "allow_project_invitations" | "allow_direct_messages"
>>;

export type ProfileSearch = {
  query?: string;
  discipline?: string;
  skill?: string;
  available?: boolean;
  cursor?: string;
  limit: number;
};

type ProfileRow = {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  university_name: string | null;
  primary_discipline_id: string | null;
  bio: string | null;
  portfolio_url: string | null;
  profile_visibility: ProfileVisibility;
  portfolio_visibility: ProfileVisibility;
  available_for_projects: boolean;
  created_at: string;
  updated_at: string;
};

type RelationMaps = {
  disciplines: Map<string, TaxonomyItem>;
  skills: Map<string, ProfileCapability[]>;
  tools: Map<string, ProfileCapability[]>;
  interests: Map<string, TaxonomyItem[]>;
  languages: Map<string, ProfileLanguageItem[]>;
};

type EmbeddedTaxonomy = TaxonomyItem | TaxonomyItem[] | null;

const PROFILE_COLUMNS = [
  "id", "username", "display_name", "avatar_url", "university_name",
  "primary_discipline_id", "bio", "portfolio_url", "profile_visibility",
  "portfolio_visibility", "available_for_projects", "created_at", "updated_at",
].join(",");

const TAXONOMY_COLUMNS = "id,slug,label_ru,label_kk,label_en";
const DISCOVERABLE_VISIBILITIES: ProfileVisibility[] = ["public", "authenticated"];

function profileFailure(error: { code?: string } | null, fallbackCode: string, fallbackMessage: string): never {
  if (error?.code === "23505") {
    throw new PersistenceError(409, "username_taken", "That username is already in use.");
  }
  if (error?.code === "23503") {
    throw new PersistenceError(400, "invalid_taxonomy_id", "A selected profile taxonomy value is invalid.");
  }
  throw new PersistenceError(503, fallbackCode, fallbackMessage);
}

function appendToMap<T>(map: Map<string, T[]>, key: string, value: T): void {
  map.set(key, [...(map.get(key) ?? []), value]);
}

function embeddedTaxonomy(value: EmbeddedTaxonomy): TaxonomyItem | null {
  return Array.isArray(value) ? value[0] ?? null : value;
}

async function loadRelationMaps(client: SupabaseClient, profileIds: readonly string[]): Promise<RelationMaps> {
  const disciplines = new Map<string, TaxonomyItem>();
  const skills = new Map<string, ProfileCapability[]>();
  const tools = new Map<string, ProfileCapability[]>();
  const interests = new Map<string, TaxonomyItem[]>();
  const languages = new Map<string, ProfileLanguageItem[]>();
  if (profileIds.length === 0) return { disciplines, skills, tools, interests, languages };

  const [profileResult, skillsResult, toolsResult, interestsResult, languagesResult] = await Promise.all([
    client.from("profiles").select("id,primary_discipline_id").in("id", [...profileIds]),
    client.from("profile_skills").select(`profile_id,proficiency,item:skills(${TAXONOMY_COLUMNS})`).in("profile_id", [...profileIds]),
    client.from("profile_tools").select(`profile_id,proficiency,item:tools(${TAXONOMY_COLUMNS})`).in("profile_id", [...profileIds]),
    client.from("profile_interests").select(`profile_id,item:interests(${TAXONOMY_COLUMNS})`).in("profile_id", [...profileIds]),
    client.from("profile_languages").select("profile_id,language_code,proficiency").in("profile_id", [...profileIds]),
  ]);
  if (profileResult.error || skillsResult.error || toolsResult.error || interestsResult.error || languagesResult.error) {
    profileFailure(null, "profile_relations_unavailable", "Profile details are temporarily unavailable.");
  }

  const disciplineIds = [...new Set((profileResult.data as Array<{ primary_discipline_id: string | null }>)
    .map(({ primary_discipline_id }) => primary_discipline_id)
    .filter((id): id is string => Boolean(id)))];
  if (disciplineIds.length > 0) {
    const result = await client.from("engineering_disciplines").select(TAXONOMY_COLUMNS).in("id", disciplineIds);
    if (result.error) profileFailure(result.error, "profile_relations_unavailable", "Profile details are temporarily unavailable.");
    for (const item of result.data as TaxonomyItem[]) disciplines.set(item.id, item);
  }

  for (const row of skillsResult.data as unknown as Array<{ profile_id: string; proficiency: number | null; item: EmbeddedTaxonomy }>) {
    const item = embeddedTaxonomy(row.item);
    if (item) appendToMap(skills, row.profile_id, { ...item, proficiency: row.proficiency });
  }
  for (const row of toolsResult.data as unknown as Array<{ profile_id: string; proficiency: number | null; item: EmbeddedTaxonomy }>) {
    const item = embeddedTaxonomy(row.item);
    if (item) appendToMap(tools, row.profile_id, { ...item, proficiency: row.proficiency });
  }
  for (const row of interestsResult.data as unknown as Array<{ profile_id: string; item: EmbeddedTaxonomy }>) {
    const item = embeddedTaxonomy(row.item);
    if (item) appendToMap(interests, row.profile_id, item);
  }
  for (const row of languagesResult.data as Array<{ profile_id: string; language_code: string; proficiency: number | null }>) {
    appendToMap(languages, row.profile_id, {
      language_code: row.language_code,
      proficiency: row.proficiency,
    });
  }
  return { disciplines, skills, tools, interests, languages };
}

function mapPublicProfile(row: ProfileRow, relations: RelationMaps, requesterId: string): PublicProfile {
  const portfolioVisible = row.id === requesterId || DISCOVERABLE_VISIBILITIES.includes(row.portfolio_visibility);
  return {
    id: row.id,
    username: row.username,
    display_name: row.display_name,
    avatar_url: row.avatar_url,
    university_name: row.university_name,
    primary_discipline: row.primary_discipline_id
      ? relations.disciplines.get(row.primary_discipline_id) ?? null
      : null,
    bio: row.bio,
    portfolio_url: portfolioVisible ? row.portfolio_url : null,
    available_for_projects: row.available_for_projects,
    skills: relations.skills.get(row.id) ?? [],
    tools: relations.tools.get(row.id) ?? [],
    interests: relations.interests.get(row.id) ?? [],
    languages: relations.languages.get(row.id) ?? [],
  };
}

function mapMyProfile(row: ProfileRow, relations: RelationMaps): MyProfile {
  return {
    ...mapPublicProfile(row, relations, row.id),
    primary_discipline_id: row.primary_discipline_id,
    profile_visibility: row.profile_visibility,
    portfolio_visibility: row.portfolio_visibility,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

async function validateIds(
  client: SupabaseClient,
  table: "engineering_disciplines" | "skills" | "tools" | "interests",
  ids: readonly string[],
): Promise<void> {
  const uniqueIds = [...new Set(ids)];
  if (uniqueIds.length === 0) return;
  const result = await client.from(table).select("id").in("id", uniqueIds).eq("is_active", true);
  if (result.error) profileFailure(result.error, "profile_update_failed", "The profile could not be updated.");
  if ((result.data?.length ?? 0) !== uniqueIds.length) {
    throw new PersistenceError(400, "invalid_taxonomy_id", "A selected profile taxonomy value is invalid.");
  }
}

async function replaceRelation(
  client: SupabaseClient,
  table: "profile_skills" | "profile_tools" | "profile_interests" | "profile_languages",
  profileId: string,
  rows: Array<Record<string, unknown>>,
): Promise<void> {
  const removed = await client.from(table).delete().eq("profile_id", profileId);
  if (removed.error) profileFailure(removed.error, "profile_update_failed", "The profile could not be updated.");
  if (rows.length === 0) return;
  const inserted = await client.from(table).insert(rows);
  if (inserted.error) profileFailure(inserted.error, "profile_update_failed", "The profile could not be updated.");
}

export function createProfileRepository(env: ServerEnv) {
  async function loadMyProfile(userId: string, accessToken: string): Promise<{ profile: MyProfile; private_settings: ProfilePrivateSettings }> {
    const client = createSupabaseUserClient(env, accessToken);
    const [profileResult, settingsResult] = await Promise.all([
      client.from("profiles").select(PROFILE_COLUMNS).eq("id", userId).single(),
      client.from("profile_private_settings")
        .select("preferred_lang,allow_project_invitations,allow_direct_messages,created_at,updated_at")
        .eq("profile_id", userId)
        .single(),
    ]);
    if (profileResult.error || settingsResult.error) {
      profileFailure(null, "profile_unavailable", "Profile data is temporarily unavailable.");
    }
    const relations = await loadRelationMaps(client, [userId]);
    return {
      profile: mapMyProfile(profileResult.data as unknown as ProfileRow, relations),
      private_settings: settingsResult.data as ProfilePrivateSettings,
    };
  }

  return {
    async loadCanonicalUser(userId: string, accessToken: string): Promise<CanonicalUser> {
      const client = createSupabaseUserClient(env, accessToken);
      const [{ profile, private_settings }, progressResult, questsResult] = await Promise.all([
        loadMyProfile(userId, accessToken),
        client.from("user_progress")
          .select("total_xp,level,streak_days,requests_count,material_count,patent_count,modules_used")
          .eq("user_id", userId)
          .single(),
        client.from("user_quests").select("quest_id").eq("user_id", userId).eq("status", "completed"),
      ]);
      if (progressResult.error || questsResult.error) {
        profileFailure(null, "profile_unavailable", "Profile data is temporarily unavailable.");
      }
      return {
        profile,
        private_settings,
        progress: progressResult.data as UserProgress,
        completed_quests: (questsResult.data as Array<{ quest_id: string }>).map(({ quest_id }) => quest_id),
      };
    },

    async updateProfile(userId: string, accessToken: string, update: ProfileUpdate): Promise<MyProfile> {
      const client = createSupabaseUserClient(env, accessToken);
      const skillIds = update.skills?.map(({ id }) => id) ?? [];
      const toolIds = update.tools?.map(({ id }) => id) ?? [];
      await Promise.all([
        validateIds(client, "engineering_disciplines", update.primary_discipline_id ? [update.primary_discipline_id] : []),
        validateIds(client, "skills", skillIds),
        validateIds(client, "tools", toolIds),
        validateIds(client, "interests", update.interests ?? []),
      ]);

      const scalarFields = [
        "username", "display_name", "avatar_url", "university_name", "primary_discipline_id",
        "bio", "portfolio_url", "profile_visibility", "portfolio_visibility", "available_for_projects",
      ] as const;
      const scalarUpdate: Record<string, unknown> = {};
      for (const field of scalarFields) {
        if (field in update) scalarUpdate[field] = update[field];
      }
      if (Object.keys(scalarUpdate).length > 0) {
        const result = await client.from("profiles").update(scalarUpdate).eq("id", userId);
        if (result.error) profileFailure(result.error, "profile_update_failed", "The profile could not be updated.");
      }

      if (update.skills) {
        await replaceRelation(client, "profile_skills", userId, update.skills.map(({ id, proficiency }) => ({
          profile_id: userId,
          skill_id: id,
          proficiency: proficiency ?? null,
        })));
      }
      if (update.tools) {
        await replaceRelation(client, "profile_tools", userId, update.tools.map(({ id, proficiency }) => ({
          profile_id: userId,
          tool_id: id,
          proficiency: proficiency ?? null,
        })));
      }
      if (update.interests) {
        await replaceRelation(client, "profile_interests", userId, update.interests.map((interestId) => ({
          profile_id: userId,
          interest_id: interestId,
        })));
      }
      if (update.languages) {
        await replaceRelation(client, "profile_languages", userId, update.languages.map(({ language_code, proficiency }) => ({
          profile_id: userId,
          language_code,
          proficiency: proficiency ?? null,
        })));
      }
      return (await loadMyProfile(userId, accessToken)).profile;
    },

    async updateSettings(userId: string, accessToken: string, update: ProfileSettingsUpdate): Promise<ProfilePrivateSettings> {
      const client = createSupabaseUserClient(env, accessToken);
      const result = await client.from("profile_private_settings")
        .update(update)
        .eq("profile_id", userId)
        .select("preferred_lang,allow_project_invitations,allow_direct_messages,created_at,updated_at")
        .single();
      if (result.error) profileFailure(result.error, "profile_settings_update_failed", "Profile settings could not be updated.");
      return result.data as ProfilePrivateSettings;
    },

    async getPublicProfile(requesterId: string, profileId: string): Promise<PublicProfile | null> {
      const client = createSupabaseAdminClient(env);
      let query = client.from("profiles").select(PROFILE_COLUMNS).eq("id", profileId);
      if (requesterId !== profileId) query = query.in("profile_visibility", DISCOVERABLE_VISIBILITIES);
      const result = await query.maybeSingle();
      if (result.error) profileFailure(result.error, "profiles_unavailable", "Profiles are temporarily unavailable.");
      if (!result.data) return null;
      const relations = await loadRelationMaps(client, [profileId]);
      return mapPublicProfile(result.data as unknown as ProfileRow, relations, requesterId);
    },

    async searchProfiles(requesterId: string, search: ProfileSearch): Promise<{ profiles: PublicProfile[]; next_cursor: string | null }> {
      const client = createSupabaseAdminClient(env);
      const select = search.skill ? `${PROFILE_COLUMNS},profile_skills!inner(skill_id)` : PROFILE_COLUMNS;
      let query = client.from("profiles")
        .select(select)
        .in("profile_visibility", DISCOVERABLE_VISIBILITIES)
        .order("id", { ascending: true })
        .limit(search.limit + 1);
      if (search.query) {
        const pattern = `*${search.query}*`;
        query = query.or(`username.ilike.${pattern},display_name.ilike.${pattern}`);
      }
      if (search.discipline) query = query.eq("primary_discipline_id", search.discipline);
      if (search.skill) query = query.eq("profile_skills.skill_id", search.skill);
      if (search.available !== undefined) query = query.eq("available_for_projects", search.available);
      if (search.cursor) query = query.gt("id", search.cursor);
      const result = await query;
      if (result.error) profileFailure(result.error, "profiles_unavailable", "Profiles are temporarily unavailable.");
      const rows = (result.data as unknown as ProfileRow[]).slice(0, search.limit);
      const relations = await loadRelationMaps(client, rows.map(({ id }) => id));
      return {
        profiles: rows.map((row) => mapPublicProfile(row, relations, requesterId)),
        next_cursor: (result.data?.length ?? 0) > search.limit ? rows.at(-1)?.id ?? null : null,
      };
    },

    async taxonomies(accessToken: string): Promise<ProfileTaxonomies> {
      const client = createSupabaseUserClient(env, accessToken);
      const [disciplines, skills, tools, interests] = await Promise.all([
        client.from("engineering_disciplines").select(TAXONOMY_COLUMNS).eq("is_active", true).order("slug"),
        client.from("skills").select(TAXONOMY_COLUMNS).eq("is_active", true).order("slug"),
        client.from("tools").select(TAXONOMY_COLUMNS).eq("is_active", true).order("slug"),
        client.from("interests").select(TAXONOMY_COLUMNS).eq("is_active", true).order("slug"),
      ]);
      if (disciplines.error || skills.error || tools.error || interests.error) {
        profileFailure(null, "profile_taxonomies_unavailable", "Profile taxonomies are temporarily unavailable.");
      }
      return {
        disciplines: disciplines.data as TaxonomyItem[],
        skills: skills.data as TaxonomyItem[],
        tools: tools.data as TaxonomyItem[],
        interests: interests.data as TaxonomyItem[],
      };
    },
  };
}

export type ProfileRepository = ReturnType<typeof createProfileRepository>;
