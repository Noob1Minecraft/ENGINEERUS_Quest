export function isEligibleTeammateProfile(
  profile: { id: string; profile_visibility: string; available_for_projects: boolean },
  excludedIds: ReadonlySet<string>,
  invitationEnabledIds: ReadonlySet<string>,
): boolean {
  return (profile.profile_visibility === "public" || profile.profile_visibility === "authenticated")
    && profile.available_for_projects
    && !excludedIds.has(profile.id)
    && invitationEnabledIds.has(profile.id);
}

export function isEligibleProjectRole(input: {
  requesterId: string;
  ownerId: string;
  projectStatus: string;
  projectVisibility: string;
  roleStatus: string;
  positionsTotal: number;
  positionsFilled: number;
  requesterIsMember: boolean;
  hasPendingApplication: boolean;
}): boolean {
  return input.projectStatus === "open"
    && (input.projectVisibility === "public" || input.projectVisibility === "authenticated")
    && input.roleStatus === "open"
    && input.positionsFilled < input.positionsTotal
    && input.ownerId !== input.requesterId
    && !input.requesterIsMember
    && !input.hasPendingApplication;
}
