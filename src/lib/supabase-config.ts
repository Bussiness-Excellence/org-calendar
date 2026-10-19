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
export const UPGRADE_URL =
  process.env.EXPO_PUBLIC_UPGRADE_URL ||
  'mailto:business.excellence.eipico@gmail.com?subject=Upgrade%20to%20Pro';

/** Shown in the app; translated where it is displayed. */
export const PRO_PRICE = '$50';
export const FREE_USER_LIMIT = 10;

export const isConfigured = !!SUPABASE_URL && !!SUPABASE_ANON_KEY;
