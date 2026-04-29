# Model Switch Mobile Design

## Summary

Replace the current unavailable-model inline selector in `src/lib/components/chat/ModelSwitch.svelte`
with a cleaner banner that opens the same model picker entry point used by chat input. Keep the
existing anchored popover behavior on desktop, and use a true mobile modal or sheet presentation
on small screens so model switching works reliably in mobile view.

## Problem

The current `ModelSwitch` UI has two issues:

1. It looks rough compared to the rest of the chat UI because it uses a native inline `<select>`
   and separate accept button.
2. The model picker behavior does not translate correctly to mobile. The desktop popover works,
   but mobile needs a popup-style presentation instead of a constrained anchored dropdown.

This leaves users with an unavailable conversation model in a broken state, especially on mobile,
where the fallback UI is hard to use or does not open correctly.

### Confirmed reproduction

The issue was reproduced in a mobile viewport using the running app in a browser session.

Observed behavior:

1. Tapping the chat input model button does open the picker.
2. The picker still renders as the desktop-style anchored popover.
3. On mobile, that popover is positioned above the bottom model chip row and overlaps the
   composer area instead of becoming a dedicated popup.

Confirmed root cause:

1. The current picker is not failing to open.
2. It is using the wrong presentation mode for mobile.
3. The active container is an absolutely positioned popover attached to the inline trigger, which is
   appropriate for desktop but not for mobile.

## Goals

1. Make the unavailable-model state visually consistent with the rest of the chat interface.
2. Let users switch models from the banner without maintaining a second independent model picker.
3. Preserve the current anchored picker experience on desktop.
4. Use a modal or sheet on mobile so the picker opens reliably and remains usable on small screens.
5. Switch the conversation model immediately when the user selects a new model.

## Non-Goals

1. Redesign the full chat input model picker beyond the responsive presentation change.
2. Change model search, favorites, provider tabs, or filtering behavior.
3. Introduce a separate unavailable-model-only picker implementation.

## Chosen Approach

Use a shared responsive picker flow for both entry points:

1. The existing chat input model button.
2. The unavailable-model banner in `ModelSwitch`.

The picker logic and content should stay unified. The difference should only be how it is
presented by viewport size:

1. Desktop: anchored popover, matching the current behavior shown in chat input.
2. Mobile: modal or bottom sheet, occupying enough space to be fully usable.

## Alternatives Considered

### 1. Self-contained `ModelSwitch` popup

Create a second picker only for unavailable models.

Rejected because it duplicates search, filtering, selection, and styling logic that already exists
in `ChatModelPicker.svelte`.

### 2. Keep the inline selector and only restyle it

Improve the banner visuals but retain the native select and accept button.

Rejected because it does not solve the core mobile interaction problem and still leaves two model
switching experiences in the chat UI.

### 3. Mobile-only special case in `ModelSwitch`

Keep desktop inline controls and add a mobile modal only for the banner.

Rejected because it preserves inconsistent behavior between desktop, mobile, and chat input.

## UX Design

### Banner

`ModelSwitch` should become a compact warning banner with:

1. A short message: `This model is no longer available. Choose another model to continue.`
2. A primary action button: `Change model`

The banner should not render the list of models inline.

### Picker behavior

1. Tapping `Change model` opens the same model picker used by the chat input button.
2. On desktop, it opens as the current anchored popover.
3. On mobile, it opens as a real modal or bottom sheet instead of the current absolute popover.
4. Picking a model immediately starts the conversation model update.
5. No extra confirm step is required.

### Mobile requirements

The mobile presentation must:

1. Avoid clipped or off-screen popover content.
2. Provide enough height for search and model list browsing.
3. Keep the search field accessible as soon as the popup opens.
4. Allow dismissal via close action, outside tap if appropriate, and Escape where applicable.

## Architecture

### Shared picker entry point

The current `ChatModelPicker.svelte` contains both trigger-specific behavior and picker internals.
To support `ModelSwitch`, the model picker should expose or extract a reusable entry point so two
triggers can open the same picker flow.

The responsive presentation decision should happen inside that shared picker flow so both triggers
inherit the same desktop and mobile behavior.

Likely shapes include:

1. Extracting the picker panel and open state into a shared component.
2. Moving open state into a small shared store or controller used by both triggers.

The preferred implementation is the smallest one that avoids duplication while preserving current
desktop behavior.

### Update flow

Model selection should continue to patch the active conversation through the existing
`PATCH /conversation/[id]` behavior.

Selection flow:

1. User opens picker from chat input or `ModelSwitch`.
2. User selects a model.
3. Client sends the patch request.
4. On success, invalidate relevant data.
5. Banner disappears once the conversation now points at an available model.

If there is an existing reusable model-switch path, prefer consolidating on it rather than keeping
one handler in `ChatModelPicker` and another in `ModelSwitch`.

## Error Handling

1. If the model update request fails, keep the banner visible.
2. Show a user-visible error instead of only logging to the console.
3. Reset loading or changing state so the user can retry.
4. Do not dismiss the picker as a successful change if the patch fails.

## Testing Strategy

### Functional

1. Desktop conversation with unavailable model: banner appears and opens anchored picker.
2. Mobile conversation with unavailable model: banner opens modal or sheet instead of popover.
3. Chat input model button on mobile uses the same modal or sheet presentation.
4. Selecting a model updates the conversation and removes the unavailable-model banner.
5. Failed patch leaves the banner visible and surfaces an error.

### Visual

1. Banner spacing and typography match nearby chat UI.
2. Mobile popup fits within the viewport without clipping.
3. Search and list are usable with touch scrolling.

## Risks

1. Extracting shared picker behavior could accidentally change desktop interaction timing or focus.
2. Mobile modal state could conflict with existing chat input focus or drawer behavior.
3. If the current picker assumes a single trigger anchor, responsive presentation work may require
   modest restructuring.

## Acceptance Criteria

1. `ModelSwitch` no longer renders a native inline `<select>`.
2. `ModelSwitch` provides a `Change model` action.
3. Desktop uses the existing popover-style picker.
4. Mobile uses a modal or bottom-sheet picker.
5. The same picker content and selection flow are used from both chat input and `ModelSwitch`.
6. Selecting a model updates the conversation immediately.
7. Errors are surfaced to the user and do not silently fail.
