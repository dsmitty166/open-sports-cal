# Temporary Calendar Filters Implementation Plan

**Goal:** Filter selected calendars by league and team without changing saved calendars.

**Architecture:** Keep league and hidden-team state in memory. Derive visible events from loaded events, retaining a merged game when any visible team participates. Use the same derived events for Month, Agenda, Next up, and jump navigation.

**Tech Stack:** Existing static HTML, CSS, JavaScript, Node test runner.

**Approved design:** League selector plus team toggles, Clear filters and visible-team count. Reset on reopening or switching saved calendars. Share links and backups retain the full selection.

- [x] Add regression coverage for combined league/team filtering, empty results, merged events and source immutability.
- [x] Add controls and in-memory state; reset on saved-calendar switching and selection edits.
- [x] Apply filters consistently to all views and next-game navigation, including empty states.
- [x] Run calendar tests, JavaScript syntax checks and full ICS validation.
