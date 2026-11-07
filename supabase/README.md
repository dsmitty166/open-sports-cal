# Account calendar setup

The website remains on GitHub Pages. Supabase provides optional GitHub login and
private saved libraries; sports schedules still come from the existing feeds.

1. Run `migrations/202611070001_calendar_libraries.sql` once in the Supabase SQL
   Editor. It creates the table, revision trigger and four owner-only policies.
2. Create a GitHub OAuth app. Its authorization callback URL is
   `https://mmrqhwxuasrxwajxulms.supabase.co/auth/v1/callback`.
3. In Supabase Authentication → Sign In / Providers → GitHub, enter that app's
   client ID and secret, enable GitHub, and save. Keep the secret in Supabase.
4. Under Authentication → URL Configuration, set Site URL to
   `https://dsmitty166.github.io/open-sports-cal/calendar.html` and add that exact
   address to Redirect URLs. The GitHub OAuth callback and the website redirect
   are different addresses and both must be configured.
5. Open the website, sign in and save a named calendar. Open another browser or
   device, sign in to the same account and confirm the calendar appears. Edit,
   press Sync now and confirm the other device updates after Sync now or refocus.
6. Sign out: device-only calendars should return. In a second account, the first
   account's calendars must not appear. Anonymous API access to this table is
   intentionally denied. Do not grant `anon` table access to silence that error.

## Storage and conflicts

Device-only saves use the existing `osc-saved-calendars` key. Accounts use separate
`osc-account-<user ID>` caches, retaining pending changes offline. Copy device
calendars to account is explicit; it leaves originals on the device. Account
preferences also have their own key. Cached account data remains in that browser
after sign-out for offline recovery; use a private browser on shared devices.

Writes compare the last server revision, and the database increments revisions.
Unrelated calendar changes merge. Conflicting edits to the same calendar stop
syncing and retain pending changes. Export a backup, then Load account copy to
resolve; imports can restore pending calendars as separate copies.

The public publishable key and project URL are in `docs/calendar-account.js`.
Authorization comes from Supabase Auth and RLS, not from hiding that key.
The vendored browser SDK is @supabase/supabase-js 2.119.0, retrieved from jsDelivr;
its MIT license is included in `docs/vendor/supabase-LICENSE`.

Run `node --test tests/calendar*.test.cjs` for local storage, parser and sync tests.
Full OAuth and cross-account RLS checks require configured GitHub login and two
real signed-in users; those cannot be replaced by an anonymous API probe.
