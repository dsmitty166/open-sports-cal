# Optional account sync implementation plan

Goal: Optional GitHub sign-in with cross-device named calendar libraries; preserve anonymous device storage and public share links.

Architecture: Supabase Auth with its browser SDK, owner-only calendar_libraries table, revision-checked writes. Each account has an isolated browser cache containing its last server baseline and pending local library. Merge unrelated edits; stop on conflicting edits without replacing either copy. Export works offline. Account switches never copy private records into anonymous storage.

Approach: Retain the existing device library and add a separate account library. Replacing anonymous storage or automatically uploading all device records would obscure ownership; instead offer an explicit import action.

Tasks:
- [x] Add tested cloud state engine: durable offline changes, account separation, optimistic revisions, concurrent edit conflicts, request failures and retry.
- [x] Integrate SDK, public config, sign-in/out, scope switching, explicit device import, sync status/retry and conflict recovery in the existing page.
- [x] Document OAuth URLs and database setup; verify anonymous denial, browser behavior and tests; publish.

Review focus: rapid sign-out during requests; corrupted cache; failed storage writes; two-device edits/deletes; import deduplication; OAuth callback query preservation; SDK/network failure must leave anonymous use available.

Ruling: Continue in the established checkout to preserve the already prepared migration and user's active workspace; no ICS changes needed.

Verification: 29 JS tests, 1519 calendars valid. Anonymous REST denied with 42501. Mock browser account save and corrupt-storage signout passed. Full real OAuth/two-user validation pending provider setup.
