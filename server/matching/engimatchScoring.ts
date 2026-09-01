export const ENGIMATCH_SCORING_VERSION = "engi-match-v1";

export type MatchSkill = { id: string; label: string };
export type MatchSignals = {
  profileSkills: MatchSkill[];
  requiredSkills: MatchSkill[];
  optionalSkills: MatchSkill[];
  profileDisciplineId: string | null;
  roleDisciplineId: string | null;
  profileTools: MatchSkill[];
  teamTools: MatchSkill[];
  profileInterests: MatchSkill[];
  teamInterests: MatchSkill[];
  profileLanguages: string[];
  teamLanguages: string[];
};

export type MatchScore = {
  score: number;
  scoring_version: typeof ENGIMATCH_SCORING_VERSION;
  matched_required_skills: string[];
  missing_required_skills: string[];
  matched_optional_skills: string[];
  discipline_match: boolean;
  shared_tools: string[];
  shared_interests: string[];
  shared_languages: string[];
  reasons: string[];
};

function overlap(source: MatchSkill[], target: MatchSkill[]): MatchSkill[] {
  const ids = new Set(target.map(({ id }) => id));
  return source.filter(({ id }) => ids.has(id));
}

function languageOverlap(source: string[], target: string[]): string[] {
  const values = new Set(target.map((value) => value.toLowerCase()));
  return [...new Set(source.map((value) => value.toLowerCase()).filter((value) => values.has(value)))].sort();
}

function weightedCoverage(matched: number, total: number, weight: number): number {
  return total === 0 ? 0 : weight * matched / total;
}

export function scoreEngiMatch(signals: MatchSignals): MatchScore {
  const matchedRequired = overlap(signals.requiredSkills, signals.profileSkills);
  const missingRequired = signals.requiredSkills.filter(({ id }) => !matchedRequired.some((item) => item.id === id));
  const matchedOptional = overlap(signals.optionalSkills, signals.profileSkills);
  const sharedTools = overlap(signals.profileTools, signals.teamTools);
  const sharedInterests = overlap(signals.profileInterests, signals.teamInterests);
  const sharedLanguages = languageOverlap(signals.profileLanguages, signals.teamLanguages);
  const disciplineMatch = Boolean(signals.roleDisciplineId && signals.profileDisciplineId === signals.roleDisciplineId);

  const raw = weightedCoverage(matchedRequired.length, signals.requiredSkills.length, 45)
    + (disciplineMatch ? 25 : 0)
    + weightedCoverage(matchedOptional.length, signals.optionalSkills.length, 10)
    + weightedCoverage(sharedTools.length, signals.teamTools.length, 8)
    + weightedCoverage(sharedInterests.length, signals.teamInterests.length, 5)
    + weightedCoverage(sharedLanguages.length, signals.teamLanguages.length, 7);
  const score = Math.round(Math.min(100, raw) * 100) / 100;
  const reasons: string[] = [];
  if (matchedRequired.length) reasons.push(`Required skills: ${matchedRequired.map(({ label }) => label).join(", ")}`);
  if (disciplineMatch) reasons.push("Engineering discipline matches the role.");
  if (matchedOptional.length) reasons.push(`Optional skills: ${matchedOptional.map(({ label }) => label).join(", ")}`);
  if (sharedTools.length) reasons.push(`Shared tools: ${sharedTools.map(({ label }) => label).join(", ")}`);
  if (sharedInterests.length) reasons.push(`Shared interests: ${sharedInterests.map(({ label }) => label).join(", ")}`);
  if (sharedLanguages.length) reasons.push(`Shared languages: ${sharedLanguages.join(", ")}`);
  if (!reasons.length) reasons.push("Eligible real profile; no configured matching signal overlaps yet.");

  return {
    score,
    scoring_version: ENGIMATCH_SCORING_VERSION,
    matched_required_skills: matchedRequired.map(({ label }) => label),
    missing_required_skills: missingRequired.map(({ label }) => label),
    matched_optional_skills: matchedOptional.map(({ label }) => label),
    discipline_match: disciplineMatch,
    shared_tools: sharedTools.map(({ label }) => label),
    shared_interests: sharedInterests.map(({ label }) => label),
    shared_languages: sharedLanguages,
    reasons,
  };
}

export function stableMatchSort<T extends { score: number; stable_id: string }>(rows: T[]): T[] {
  return [...rows].sort((left, right) => right.score - left.score || left.stable_id.localeCompare(right.stable_id));
}
