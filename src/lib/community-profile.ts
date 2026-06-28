/**
 * Community Profile — Phase 18: Privacy-first client-side community preferences.
 * Complements the server-side PublicLearnerProfile (community-career.ts).
 * Everything defaults to private. Student must explicitly opt in to each feature.
 */

export const COMMUNITY_PROFILE_KEY = "tecpey-community-profile";

export interface CommunityPrivacySettings {
  leaderboardVisible: boolean;       // default: false — show in leaderboards
  journalSharingEnabled: boolean;    // default: false — share sanitized journal
  mentorReviewConsent: boolean;      // default: false — allow instructor view
  challengeParticipation: boolean;   // default: true — participate in weekly challenges
  studyGroupInterest: boolean;       // default: false — show group suggestions
}

export interface CommunityProfile {
  displayName: string;         // public pseudonym (student-chosen)
  anonymousId: string;         // non-reversible system ID shown on leaderboards
  avatarInitials: string;      // first 2 chars of displayName
  privacy: CommunityPrivacySettings;
  groupInterests: string[];    // study group IDs the student expressed interest in
  createdAt: number;
  updatedAt: number;
}

const DEFAULT_PRIVACY: CommunityPrivacySettings = {
  leaderboardVisible: false,
  journalSharingEnabled: false,
  mentorReviewConsent: false,
  challengeParticipation: true,
  studyGroupInterest: false,
};

function generateAnonymousId(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let id = "T-";
  for (let i = 0; i < 6; i++) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  return id;
}

export function loadCommunityProfile(): CommunityProfile | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(COMMUNITY_PROFILE_KEY);
    if (raw) return JSON.parse(raw) as CommunityProfile;
  } catch { /* ignore */ }
  return null;
}

export function saveCommunityProfile(profile: CommunityProfile): void {
  if (typeof window === "undefined") return;
  try {
    profile.updatedAt = Date.now();
    localStorage.setItem(COMMUNITY_PROFILE_KEY, JSON.stringify(profile));
  } catch { /* quota */ }
}

export function createCommunityProfile(displayName: string): CommunityProfile {
  const initials = displayName.trim().slice(0, 2).toUpperCase() || "؟";
  const profile: CommunityProfile = {
    displayName: displayName.trim(),
    anonymousId: generateAnonymousId(),
    avatarInitials: initials,
    privacy: { ...DEFAULT_PRIVACY },
    groupInterests: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  saveCommunityProfile(profile);
  return profile;
}

export function updatePrivacy(
  profile: CommunityProfile,
  updates: Partial<CommunityPrivacySettings>,
): CommunityProfile {
  const updated: CommunityProfile = {
    ...profile,
    privacy: { ...profile.privacy, ...updates },
  };
  saveCommunityProfile(updated);
  return updated;
}

export function addGroupInterest(profile: CommunityProfile, groupId: string): CommunityProfile {
  if (profile.groupInterests.includes(groupId)) return profile;
  const updated: CommunityProfile = {
    ...profile,
    groupInterests: [...profile.groupInterests, groupId],
  };
  saveCommunityProfile(updated);
  return updated;
}

export function removeGroupInterest(profile: CommunityProfile, groupId: string): CommunityProfile {
  const updated: CommunityProfile = {
    ...profile,
    groupInterests: profile.groupInterests.filter((id) => id !== groupId),
  };
  saveCommunityProfile(updated);
  return updated;
}

/** Sanitize a display name for public use — strip PII patterns. */
export function sanitizeDisplayName(name: string): string {
  return name.replace(/\b\d{4,}\b/g, "****").trim().slice(0, 30);
}
