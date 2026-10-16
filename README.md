# Org Calendar

A shared calendar for organizations. Any company signs up in the app with its
own name, logo and super admin, and starts with an empty calendar that only
its own people can see.

- **Free:** up to 10 people per organization; events are published straight away.
- **Pro ($50/year):** unlimited people and manager approval for events.

## Test links

- Web app: https://bussiness-excellence.github.io/org-calendar/
- Android APK (latest): https://github.com/Bussiness-Excellence/org-calendar/releases/latest/download/OrgCalendar-test.apk

Both are rebuilt automatically on every push to `main` (see `.github/workflows/`).

## How company data is kept apart

All organizations share one Supabase database, separated by four layers
(see `supabase/schema.sql`):

1. Every row has an `org_id` that the database stamps from the signed-in
   person; the app cannot choose or change it.
2. Row level security on every table: `org_id = my_org()`.
3. Composite foreign keys `(org_id, id)`, so records can only link to
   records of the same organization.
4. People are only created by the `calendar-admin` server function, always
   inside the creating admin's organization.

`supabase/tests/isolation.sql` contains 42 automated checks that try to read
or change another organization's data and confirm they are blocked.

## Project layout

| Path | What it is |
| --- | --- |
| `app/` | Screens (Expo Router): sign-in / sign-up, calendar, admin, account |
| `src/lib/` | Supabase client, data layer, settings |
| `supabase/schema.sql` | Full database: tables, rules, triggers |
| `supabase/functions/calendar-admin/` | Server function: sign-up, people, branding, owner console |
| `supabase/tests/isolation.sql` | Isolation and plan tests |
| `.env` | Which Supabase project the app talks to (public keys only) |

## Settings

`.env` holds the Supabase URL, the publishable key, the product name and
the "Request Pro" link. To move from the test database to production,
change the first two lines and push.

## Owner console

Add your own account to the `platform_admins` table (SQL editor:
`insert into platform_admins (user_id) select id from auth.users where email = 'you@example.com';`).
An **Owner console** then appears in Admin, listing every organization's
name, size, plan and contact, with buttons to switch a company to Pro.
It never shows any organization's calendar.

## Local development

```
npm install
npm run web        # browser
npm start          # Expo Go on a phone
npm run typecheck
```
