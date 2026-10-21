import { Platform } from 'react-native';

// Build-time settings. Set these as environment variables when building
// (EXPO_PUBLIC_* values are baked into the app at build time).
//
//   EXPO_PUBLIC_SUPABASE_URL       production project URL
//   EXPO_PUBLIC_SUPABASE_ANON_KEY  production publishable (anon) key
//   EXPO_PUBLIC_APP_NAME           product name shown before sign-in
//   EXPO_PUBLIC_UPGRADE_URL        where "Upgrade to Pro" sends admins
//
// The publishable key is safe to ship in the app: every table is protected
// by row level security, and admin actions run in the calendar-admin
// server function.

export const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
export const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
export const APP_NAME = process.env.EXPO_PUBLIC_APP_NAME || 'Org Calendar';
/** Shown under the name on the sign-in screen and in the browser tab. */
export const APP_TAGLINE = 'Organization departments and sections';
export const APP_FULL_NAME = `${APP_NAME}: ${APP_TAGLINE}`;
export const UPGRADE_URL =
  process.env.EXPO_PUBLIC_UPGRADE_URL ||
  'mailto:business.excellence.eipico@gmail.com?subject=Upgrade%20to%20Pro';

/** Pro: US$ per active person per year. */
export const PRO_PRICE_PER_PERSON = 2.5;
export const PRIVACY_URL = 'https://bussiness-excellence.github.io/org-calendar/privacy.html';
export const formatUsd = (amount: number) => `$${amount.toFixed(2).replace(/\.00$/, '')}`;
export const PRO_PRICE = formatUsd(PRO_PRICE_PER_PERSON);
/** Yearly Pro price for a number of active people. */
export const proYearlyTotal = (people: number) => formatUsd(Math.max(1, people) * PRO_PRICE_PER_PERSON);
/**
 * Google Play and the App Store do not allow pointing to outside payment for
 * digital upgrades, so prices and the "Request Pro" button appear on the web only.
 */
export const SELL_IN_APP = Platform.OS === 'web';
export const FREE_USER_LIMIT = 10;

export const isConfigured = !!SUPABASE_URL && !!SUPABASE_ANON_KEY;
