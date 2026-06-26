'use server'

import { cookies } from 'next/headers';
import { type ActiveLocale, defaultLocale, isActiveLocale } from '@/i18n/config';

// Cookie that stores the user's explicit locale choice.
// maxAge: 1 year — sameSite: lax — secure in production.
export const LOCALE_COOKIE = 'tecpey_locale';

export async function getUserLocale(): Promise<ActiveLocale> {
  const raw = (await cookies()).get(LOCALE_COOKIE)?.value;
  // Only return an active (fully translated) locale — never a futureLocale stub.
  return isActiveLocale(raw) ? raw : defaultLocale;
}

export async function setUserLocale(locale: ActiveLocale): Promise<void> {
  (await cookies()).set(LOCALE_COOKIE, locale, {
    maxAge: 60 * 60 * 24 * 365, // 1 year
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
  });
}
