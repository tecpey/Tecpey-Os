/**
 * Legacy Community UI compatibility model.
 *
 * This module is deliberately ephemeral and preview-only. It performs no
 * browser persistence, never hydrates canonical consent, and cannot authorize
 * public profile, leaderboard, journal, instructor, challenge or group access.
 * Canonical profile/privacy authority lives in community-profile-authority.ts.
 */

export const COMMUNITY_PROFILE_AUTHORITY = "preview-only" as const;

export interface CommunityPrivacySettings {
  leaderboardVisible: boolean;
  journalSharingEnabled: boolean;
  mentorReviewConsent: boolean;
  challengeParticipation: boolean;
  studyGroupInterest: boolean;
}

export interface CommunityProfile {
  displayName: string;
  anonymousId: string;
  avatarInitials: string;
  privacy: CommunityPrivacySettings;
  groupInterests: string[];
  createdAt: number;
  updatedAt: number;
  authority: typeof COMMUNITY_PROFILE_AUTHORITY;
}

const DEFAULT_PRIVACY: Readonly<CommunityPrivacySettings> = Object.freeze({
  leaderboardVisible: false,
  journalSharingEnabled: false,
  mentorReviewConsent: false,
  challengeParticipation: false,
  studyGroupInterest: false,
});

function previewAnonymousId(): string {
  const random = globalThis.crypto?.randomUUID?.() ?? "unavailable";
  return `PREVIEW-${random.slice(0, 8).toUpperCase()}`;
}

/** Browser records are intentionally discarded and never loaded as authority. */
export function loadCommunityProfile(): CommunityProfile | null {
  return null;
}

/** Creates an in-memory preview object only; nothing is persisted. */
export function createCommunityProfile(displayName: string): CommunityProfile {
  const safeName = sanitizeDisplayName(displayName);
  const now = Date.now();
  return {
    displayName: safeName,
    anonymousId: previewAnonymousId(),
    avatarInitials: safeName.slice(0, 2).toUpperCase() || "؟",
    privacy: { ...DEFAULT_PRIVACY },
    groupInterests: [],
    createdAt: now,
    updatedAt: now,
    authority: COMMUNITY_PROFILE_AUTHORITY,
  };
}

/** Pure preview transform. It cannot update canonical server consent. */
export function updatePrivacy(
  profile: CommunityProfile,
  updates: Partial<CommunityPrivacySettings>,
): CommunityProfile {
  return {
    ...profile,
    privacy: { ...profile.privacy, ...updates },
    updatedAt: Date.now(),
  };
}

export function addGroupInterest(
  profile: CommunityProfile,
  groupId: string,
): CommunityProfile {
  const safeId = groupId.trim().slice(0, 80);
  if (!safeId || profile.groupInterests.includes(safeId)) return profile;
  return {
    ...profile,
    groupInterests: [...profile.groupInterests, safeId],
    updatedAt: Date.now(),
  };
}

export function removeGroupInterest(
  profile: CommunityProfile,
  groupId: string,
): CommunityProfile {
  return {
    ...profile,
    groupInterests: profile.groupInterests.filter((id) => id !== groupId),
    updatedAt: Date.now(),
  };
}

export function sanitizeDisplayName(name: string): string {
  return name.replace(/\b\d{4,}\b/g, "****").trim().slice(0, 30);
}
