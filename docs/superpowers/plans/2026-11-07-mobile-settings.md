# Mobile Settings Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Reduce mobile chrome using the selected Settings bottom sheet.

**Architecture:** Move existing controls into a native dialog, retain IDs and controller behavior, and use responsive CSS for bottom anchoring. Collapse filters using native details.

**Tech Stack:** HTML, CSS, browser JavaScript, Node test runner.

**Spec:** `docs/superpowers/specs/2026-11-07-mobile-settings-design.md`

## Global Constraints

- Preserve existing storage, authentication, selection, and sharing behavior.
- No dependencies or schedule changes.
- Keep storage failures visible outside Settings.

## Review Focus

- Settings dismissal restores focus and scroll position.
- Save and Manage close Settings before opening their dialogs.
- Small screens and large text keep Done and every action reachable.
- Signed-out and signed-in controls remain available.
- Desktop controls remain usable without horizontal overflow.

## Task 1: Settings dialog and compact mobile layout

**Files:** `docs/calendar.html`, `docs/calendar.css`, `docs/calendar.js`, `tests/calendar-account-ui.test.cjs`.

- [x] Extend the existing controller test to check open, Done, backdrop dismissal, and Save/Manage handoff. Run it and confirm failure before implementing.
- [x] Move account actions and saved-library actions to a labelled dialog, add Settings and Done controls, and collapse the filters.
- [x] Wire dialog interactions and close Settings before opening Save or Manage.
- [x] Add responsive sheet, safe-area, compact heading, and filter styles. Increment changed asset versions.
- [x] Run all calendar Node tests and `python validate.py`; inspect mobile and desktop in the collaborative preview.

## Execution notes

User selection B authorizes implementation of the shown design. Execute inline in this existing worktree. No commit or publish requested.

Verification: 34 Node tests pass. `python -X utf8 validate.py` passes all 1,519 files (plain invocation hits the Windows console encoding when printing the success checkmark). `git diff --check` is clean.

Ruling: collaborative preview navigation failed with `ERR_EMPTY_RESPONSE`, so use `html_preview` with the actual page markup, CSS, and controller inlined, an empty catalog, and simulated signed-in UI. Replace viewport-relative height only in the preview copy because that tool disallows viewport units. Checked widths 320, 390, and 1100; no horizontal overflow, modal focus and Save/Manage handoff pass. A constrained 350px sheet with larger text scrolls its body and retains Done. Live authentication/network behavior is covered by existing tests, not these visual checks.
