# Mobile calendar settings

The user selected option B from the interactive comparison: a bottom sheet over the calendar. The goal is to reach games sooner on mobile while keeping account and saved-calendar actions accessible.

Keep the saved-calendar selector and Share visible. Move account actions and Save as / Manage into a Settings dialog. On mobile, anchor it to the bottom with a scrollable body, safe-area padding, and a visible Done button. Use a native modal dialog for keyboard focus, Escape, and background interaction blocking; allow backdrop dismissal. On desktop use a centered dialog. Close Settings before opening another calendar dialog so dialogs do not stack.

Compact the mobile heading and hide its tagline. Collapse temporary filters behind a single summary; retain existing filter controls and logic. Preserve all existing element IDs, storage, authentication, calendar selection, and sharing behavior. Keep storage failures visible outside Settings. Empty calendars retain the existing open team builder.

Alternatives: inline expansion is simpler but pushes games down while open. The selected bottom sheet preserves the calendar's scroll position and gives settings their own space. No dependencies, schedule changes, or new account behavior are needed.

Implementation choices: native HTML/CSS/JavaScript, existing theme, 44px minimum touch targets for the new controls. Check narrow screens, scrollable sheet content, keyboard dismissal, nested action handoff, and desktop layout.
