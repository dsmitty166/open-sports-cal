# Temporary Calendar Filters Implementation Plan

**Goal:** Temporarily show a league's full team schedule, with optional team filtering, without changing saved calendars.

**Architecture:** Keep league and hidden-team state in memory. League mode loads all team feeds in the league, including unsaved teams, with at most eight concurrent downloads. Default mode loads saved team selections. Derive visible events from loaded events, retaining a merged game when any visible team participates. Use the same derived events for Month, Agenda, Next up, and jump navigation.

**Tech Stack:** Existing static HTML, CSS, JavaScript, Node test runner.

**Approved design:** League selector plus team toggles, Clear filters and visible-team count. Reset on reopening or switching saved calendars. Share links and backups retain the full selection.

**Clarification:** The league selector lists every available league. Selecting one shows every team's published schedule for that league. Clear filters restores the user's original calendar teams.

- [x] Add regression coverage for combined league/team filtering, empty results, merged events and source immutability.
- [x] Add controls and in-memory state; reset on saved-calendar switching and selection edits.
- [x] Apply filters consistently to all views and next-game navigation, including empty states.
- [x] Run calendar tests, JavaScript syntax checks and full ICS validation.
