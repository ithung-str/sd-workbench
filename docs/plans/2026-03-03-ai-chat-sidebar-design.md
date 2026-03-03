# AI Chat as Right Sidebar Drawer

**Date:** 2026-03-03
**Status:** Approved

## Problem

The AI chat currently exists in two places: a floating panel overlaying the canvas and a full-page `/ai` tab. Neither allows users to see the canvas and chat simultaneously in a clean way. Settings/inspector panels are secondary to the canvas, so the AI chat should live where it doesn't compete with the primary workspace.

## Design

### Layout & Navigation

- The Mantine AppShell `aside` slot toggles between **Inspector** and **AI Chat** — never both at once.
- **Toggle control:** Two icon buttons in the right sidebar header (properties icon for Inspector, chat icon for AI Chat). Active icon is highlighted.
- **Sidebar width stays 300px.** No layout reflow when switching panels.
- **Collapse behavior preserved:** The existing collapse button collapses the entire right sidebar to 44px regardless of active panel.
- **Available on all views:** The aside is part of the AppShell, so AI Chat is accessible on `/formulas`, `/dashboard`, `/scenarios`, `/sensitivity`, and the canvas.
- **Default state:** Inspector shown by default.
- **Unread indicator:** Badge/dot on AI Chat icon when a new AI response arrives while Inspector is active.

### AI Response Display

- **Grouped component output:** When the AI returns model components, they are displayed as collapsible groups by type (e.g. "Stocks (3)", "Flows (2)"). Collapsed by default. Expanding shows individual component names.
- **Clickable components:** Each component in an expanded group is clickable to select/pan to it on the canvas.
- **Apply/Undo controls:** Each AI response shows an "Apply to model" button. After applying, an "Undo" button appears. Gives users explicit control over model changes.
- **Markdown rendering:** AI responses rendered with basic markdown (bold, lists, code blocks) for readability in the 300px space.

### Usability Features

- **Context-aware input hints:** Placeholder text adapts to current view — e.g. "Ask about your model..." on canvas, "Ask about scenarios..." on scenarios page.
- **Suggestion chips:** After each AI response, show 2-3 contextual follow-up suggestions as pill buttons (existing feature, made more prominent).

### State & Store Changes

- Replace `aiChatOpen: boolean` with `rightSidebarMode: 'inspector' | 'chat'` in editorStore.
- Reuse existing AI state: `aiChatHistory`, `aiCommand`, `isApplyingAi`, `aiStatusMessage`, `aiStreamingRaw`.
- Move unread badge logic from header button to sidebar toggle icon.

### Files Removed

- `AIChatPage.tsx` — full-page `/ai` tab
- `BuildPreviewPanel.tsx` — build preview (used only by AIChatPage)
- `ChunkCard.tsx` — chunk display (used only by AIChatPage)
- `/ai` route from `App.tsx` tab mapping
- Floating panel CSS (`.ai-chat-floating`)
- Header "AI Chat" toggle button

### Files Created/Modified

- **New:** `AIChatSidebar.tsx` — sidebar-mode chat panel (adapted from `AIChatPanel.tsx`)
- **Modified:** `WorkbenchLayoutMantine.tsx` — aside slot switches content based on `rightSidebarMode`
- **Modified:** `editorStore.ts` — replace `aiChatOpen` with `rightSidebarMode`
- **Modified:** `app.css` — remove floating panel styles

## Summary

Single access point for AI Chat in the right sidebar, toggled alongside the Inspector. Available on all views. Grouped and interactive component display. Apply/Undo controls for explicit user control. Removes all legacy AI chat surfaces (floating panel, full-page tab).
