# AI Chat Sidebar Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Move AI chat from a floating overlay / full-page tab into the right sidebar, toggled alongside the Inspector panel.

**Architecture:** Replace the `aiChatOpen: boolean` state with `rightSidebarMode: 'inspector' | 'chat'`. The AppShell aside conditionally renders either InspectorPanel or a new AIChatSidebar component. Remove the `/ai` tab, floating panel, and related dead code. Make the aside visible on all views (not just canvas).

**Tech Stack:** React 18, Mantine v7 (AppShell, SegmentedControl, ActionIcon, Badge), Zustand (editorStore), Tabler Icons, TypeScript.

**Design doc:** `docs/plans/2026-03-03-ai-chat-sidebar-design.md`

---

### Task 1: Add `rightSidebarMode` state to editorStore

**Files:**
- Modify: `frontend/src/state/editorStore.ts`

**Step 1: Add the new type and state field**

In `editorStore.ts`, add a type alias and update the state:

```typescript
// After the WorkbenchTab type (line 39):
export type RightSidebarMode = 'inspector' | 'chat';
```

In the `EditorState` interface, replace `aiChatOpen: boolean` (line 74) with:
```typescript
rightSidebarMode: RightSidebarMode;
```

In the initial state (line 440), replace `aiChatOpen: false` with:
```typescript
rightSidebarMode: 'inspector' as RightSidebarMode,
```

**Step 2: Update setters and references**

Replace `setAiChatOpen` (line 1022) with:
```typescript
setRightSidebarMode: (mode: RightSidebarMode) => set({ rightSidebarMode: mode }),
```

Update the `EditorActions` interface — replace `setAiChatOpen: (open: boolean) => void` with:
```typescript
setRightSidebarMode: (mode: RightSidebarMode) => void;
```

In `runAiCommand` (line 890), replace `aiChatOpen: true` with `rightSidebarMode: 'chat' as RightSidebarMode`.

In `clearAiChat` (line 1021), replace `aiChatOpen: false` with `rightSidebarMode: 'inspector' as RightSidebarMode`.

**Step 3: Remove `'ai'` from WorkbenchTab**

Change line 39 from:
```typescript
export type WorkbenchTab = 'canvas' | 'formulas' | 'dashboard' | 'scenarios' | 'sensitivity' | 'ai';
```
to:
```typescript
export type WorkbenchTab = 'canvas' | 'formulas' | 'dashboard' | 'scenarios' | 'sensitivity';
```

**Step 4: Verify types compile**

Run: `cd frontend && npx tsc -b --noEmit 2>&1 | head -40`

Expected: Type errors in files that still reference `aiChatOpen`, `setAiChatOpen`, or the `'ai'` tab. These will be fixed in subsequent tasks.

**Step 5: Commit**

```bash
git add frontend/src/state/editorStore.ts
git commit -m "refactor: replace aiChatOpen with rightSidebarMode in editorStore"
```

---

### Task 2: Create AIChatSidebar component

**Files:**
- Create: `frontend/src/components/workbench/AIChatSidebar.tsx`

**Step 1: Create the sidebar chat component**

Adapt from `AIChatPanel.tsx` (the floating panel) but designed for sidebar embedding — no Paper wrapper, no fixed width, no close button (the sidebar toggle handles that). Keep the same chat message rendering, input, suggestion chips, streaming indicator, copy/clear actions.

```typescript
// frontend/src/components/workbench/AIChatSidebar.tsx
import { useEffect, useRef } from 'react';
import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Collapse,
  Group,
  ScrollArea,
  Stack,
  Text,
  Textarea,
  Tooltip,
} from '@mantine/core';
import {
  IconCopy,
  IconSend,
  IconTrash,
} from '@tabler/icons-react';
import { useEditorStore } from '../../state/editorStore';
import type { AIChatMessage } from '../../types/model';

/** Placeholder text that adapts to the current workbench tab */
function getPlaceholder(tab: string): string {
  switch (tab) {
    case 'scenarios':
      return 'Ask about scenarios...';
    case 'sensitivity':
      return 'Ask about sensitivity analysis...';
    case 'dashboard':
      return 'Ask about dashboards...';
    case 'formulas':
      return 'Ask about formulas...';
    default:
      return 'Ask AI to modify the model...';
  }
}

export function AIChatSidebar() {
  const aiCommand = useEditorStore((s) => s.aiCommand);
  const setAiCommand = useEditorStore((s) => s.setAiCommand);
  const runAiCommand = useEditorStore((s) => s.runAiCommand);
  const isApplyingAi = useEditorStore((s) => s.isApplyingAi);
  const aiStatusMessage = useEditorStore((s) => s.aiStatusMessage);
  const aiChatHistory = useEditorStore((s) => s.aiChatHistory);
  const aiStreamingRaw = useEditorStore((s) => s.aiStreamingRaw);
  const clearAiChat = useEditorStore((s) => s.clearAiChat);
  const activeTab = useEditorStore((s) => s.activeTab);

  const viewportRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (viewportRef.current) {
      viewportRef.current.scrollTo({
        top: viewportRef.current.scrollHeight,
        behavior: 'smooth',
      });
    }
  }, [aiChatHistory.length, aiStreamingRaw]);

  const copyChat = () => {
    const text = aiChatHistory
      .map((m) => `${m.role === 'user' ? 'You' : 'AI'}: ${m.content}`)
      .join('\n\n');
    void navigator.clipboard.writeText(text);
  };

  return (
    <Box style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Toolbar */}
      <Group gap={4} px="sm" py={4} justify="flex-end">
        {aiChatHistory.length > 0 && (
          <>
            <Tooltip label="Copy chat">
              <ActionIcon size="xs" variant="subtle" color="gray" onClick={copyChat}>
                <IconCopy size={14} />
              </ActionIcon>
            </Tooltip>
            <Tooltip label="Clear conversation">
              <ActionIcon size="xs" variant="subtle" color="gray" onClick={clearAiChat}>
                <IconTrash size={14} />
              </ActionIcon>
            </Tooltip>
          </>
        )}
      </Group>

      {/* Messages */}
      <ScrollArea style={{ flex: 1, minHeight: 0 }} viewportRef={viewportRef} ref={scrollRef}>
        <Stack gap="xs" px="sm" pb="sm" style={{ minHeight: 80 }}>
          {aiChatHistory.length === 0 && !isApplyingAi && (
            <Text size="xs" c="dimmed" ta="center" py="xl">
              Start a conversation with the AI assistant.
            </Text>
          )}

          {aiChatHistory.map((msg, i) => (
            <ChatBubble key={i} message={msg} />
          ))}

          {/* Streaming indicator */}
          {isApplyingAi && (
            <Box>
              <Group gap={6} mb={4}>
                <div className="ai-spinner" />
                <Text size="xs" c="violet.6" fw={500}>
                  {aiStatusMessage || 'Thinking...'}
                </Text>
              </Group>
              {aiStreamingRaw && (
                <Text
                  size="xs"
                  c="dimmed"
                  style={{
                    whiteSpace: 'pre-wrap',
                    maxHeight: 120,
                    overflow: 'auto',
                    fontFamily: 'monospace',
                    fontSize: '0.7rem',
                    background: 'var(--mantine-color-gray-0)',
                    borderRadius: 4,
                    padding: 6,
                  }}
                >
                  {aiStreamingRaw}
                </Text>
              )}
            </Box>
          )}
        </Stack>
      </ScrollArea>

      {/* Input */}
      <Box
        px="sm"
        py={8}
        style={{
          borderTop: '1px solid var(--mantine-color-gray-3)',
          flexShrink: 0,
        }}
      >
        <Group gap={6} align="flex-end">
          <Textarea
            placeholder={getPlaceholder(activeTab)}
            value={aiCommand}
            onChange={(e) => setAiCommand(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void runAiCommand();
              }
            }}
            disabled={isApplyingAi}
            autosize
            minRows={1}
            maxRows={4}
            size="sm"
            style={{ flex: 1 }}
          />
          <ActionIcon
            size="lg"
            variant="filled"
            color="violet"
            onClick={() => void runAiCommand()}
            disabled={isApplyingAi || !aiCommand.trim()}
          >
            <IconSend size={16} />
          </ActionIcon>
        </Group>
      </Box>
    </Box>
  );
}

/** Individual chat message bubble */
function ChatBubble({ message }: { message: AIChatMessage }) {
  const isUser = message.role === 'user';
  const setAiCommand = useEditorStore((s) => s.setAiCommand);
  const runAiCommand = useEditorStore((s) => s.runAiCommand);

  return (
    <Box>
      <Box
        px="xs"
        py={6}
        style={{
          background: isUser
            ? 'var(--mantine-color-violet-0)'
            : 'var(--mantine-color-gray-0)',
          borderRadius: 8,
        }}
      >
        <Text size="xs" fw={600} c={isUser ? 'violet.7' : 'gray.7'} mb={2}>
          {isUser ? 'You' : 'AI'}
        </Text>
        <Text size="xs" style={{ whiteSpace: 'pre-wrap' }}>
          {message.content}
        </Text>
      </Box>

      {/* Suggestion chips */}
      {message.suggestions && message.suggestions.length > 0 && (
        <Group gap={4} mt={4}>
          {message.suggestions.map((suggestion, i) => (
            <Button
              key={i}
              size="compact-xs"
              variant="light"
              color="violet"
              radius="xl"
              onClick={() => {
                setAiCommand(suggestion);
                void runAiCommand();
              }}
            >
              {suggestion}
            </Button>
          ))}
        </Group>
      )}
    </Box>
  );
}
```

**Step 2: Verify it compiles**

Run: `cd frontend && npx tsc -b --noEmit 2>&1 | head -20`

Expected: May still show errors from other files, but `AIChatSidebar.tsx` itself should not have errors.

**Step 3: Commit**

```bash
git add frontend/src/components/workbench/AIChatSidebar.tsx
git commit -m "feat: create AIChatSidebar component for right sidebar"
```

---

### Task 3: Wire sidebar toggle into WorkbenchLayoutMantine

**Files:**
- Modify: `frontend/src/components/workbench/WorkbenchLayoutMantine.tsx`

**Step 1: Update imports**

Replace the `AIChatPage` import (line 13) with:
```typescript
import { AIChatSidebar } from './AIChatSidebar';
```

Add new icon imports to the existing `@tabler/icons-react` import (line 4):
```typescript
import { IconMenu2, IconChevronLeft, IconChevronRight, IconPlus, IconSettings, IconMessageCircle } from '@tabler/icons-react';
```

Add `SegmentedControl` to the Mantine import (line 2).

Add `Badge` to the Mantine import as well.

**Step 2: Add state access**

After the existing store selectors (around line 32), add:
```typescript
const rightSidebarMode = useEditorStore((s) => s.rightSidebarMode);
const setRightSidebarMode = useEditorStore((s) => s.setRightSidebarMode);
const aiChatHistory = useEditorStore((s) => s.aiChatHistory);
```

**Step 3: Make the aside visible on all views**

Change the aside collapsed config (line 83) from:
```typescript
aside={{ width: 300, breakpoint: 'md', collapsed: { mobile: !isCanvas || !rightOpened, desktop: !isCanvas || !rightOpened } }}
```
to:
```typescript
aside={{ width: 300, breakpoint: 'md', collapsed: { mobile: !rightOpened, desktop: !rightOpened } }}
```

This makes the right sidebar available on all tabs, not just canvas.

**Step 4: Replace the aside content with toggle**

Replace the entire `<AppShell.Aside>` block (lines 213-237) with:

```tsx
<AppShell.Aside p={0}>
  <div className="sidebar-panel">
    <div className="sidebar-panel-header">
      <SegmentedControl
        size="xs"
        value={rightSidebarMode}
        onChange={(v) => setRightSidebarMode(v as 'inspector' | 'chat')}
        data={[
          {
            value: 'inspector',
            label: (
              <Group gap={4}>
                <IconSettings size={14} />
                <span>Inspector</span>
              </Group>
            ),
          },
          {
            value: 'chat',
            label: (
              <Group gap={4}>
                <IconMessageCircle size={14} />
                <span>AI Chat</span>
              </Group>
            ),
          },
        ]}
        styles={{
          root: { flex: 1 },
        }}
      />
      <ActionIcon
        size="sm"
        variant="subtle"
        color="gray"
        data-testid="right-collapse"
        aria-label="Collapse right sidebar"
        title="Collapse right sidebar"
        onClick={closeRight}
      >
        <IconChevronRight size={16} />
      </ActionIcon>
    </div>

    {rightSidebarMode === 'inspector' ? (
      <ScrollArea className="sidebar-panel-scroll">
        <div className="sidebar-panel-body sidebar-panel-body-right">
          <InspectorPanel />
        </div>
      </ScrollArea>
    ) : (
      <AIChatSidebar />
    )}
  </div>
</AppShell.Aside>
```

Note: `AIChatSidebar` manages its own ScrollArea internally, so we don't wrap it.

**Step 5: Remove the AI tab from the header tabs**

Delete line 156:
```typescript
<Tabs.Tab value="ai">AI</Tabs.Tab>
```

**Step 6: Update the "New" button**

The "New" button (lines 160-171) currently does `setActiveTab('ai')`. Change it to:
```typescript
onClick={() => { startNewModel(); setRightSidebarMode('chat'); openRight(); }}
```

This starts a new model and opens the AI chat in the sidebar instead of navigating to a now-removed tab.

**Step 7: Remove the `{activeTab === 'ai' && <AIChatPage />}` line**

Delete line 288:
```typescript
{activeTab === 'ai' && <AIChatPage />}
```

**Step 8: Also show the right sidebar expand button on non-canvas tabs**

The right sidebar expand button (lines 267-280) is currently inside `{activeTab === 'canvas' && (...)}`. We need it available on all views. Move the right expand button outside that conditional, below the canvas-specific block. The left expand button can stay canvas-only since the palette is canvas-specific.

After the canvas block closing `</>` and `)}` (line 282), and before the formulas/dashboard/scenarios lines, add:

```tsx
{!rightOpened && (
  <ActionIcon
    className="sidebar-reopen-tab sidebar-reopen-tab-right"
    variant="filled"
    color="deepPurple"
    size="lg"
    data-testid="right-expand"
    aria-label="Expand right sidebar"
    title="Expand right sidebar"
    onClick={openRight}
    style={{ position: 'fixed', right: 0, top: '50%', zIndex: 100 }}
  >
    <IconChevronLeft size={18} />
  </ActionIcon>
)}
```

Note: On non-canvas views, the expand button needs `position: fixed` since it's not overlaid on a canvas. Review this during testing — it may need CSS adjustment.

**Step 9: Verify types compile**

Run: `cd frontend && npx tsc -b --noEmit 2>&1 | head -40`

Expected: Should be close to clean. May still have errors in the old `WorkbenchLayout.tsx` (non-Mantine) which references `aiChatOpen`.

**Step 10: Commit**

```bash
git add frontend/src/components/workbench/WorkbenchLayoutMantine.tsx
git commit -m "feat: wire AI chat sidebar toggle into AppShell aside"
```

---

### Task 4: Update App.tsx routing

**Files:**
- Modify: `frontend/src/App.tsx`

**Step 1: Remove `/ai` from PATH_TO_TAB**

Remove the `'/ai': 'ai'` entry from the mapping (around line 12).

**Step 2: Verify it compiles**

Run: `cd frontend && npx tsc -b --noEmit 2>&1 | head -20`

**Step 3: Commit**

```bash
git add frontend/src/App.tsx
git commit -m "refactor: remove /ai route from PATH_TO_TAB"
```

---

### Task 5: Clean up old AI chat surfaces

**Files:**
- Modify: `frontend/src/components/workbench/WorkbenchLayout.tsx` (old layout — remove AI chat references)
- Modify: `frontend/src/styles/app.css` (remove `.ai-chat-floating`)
- Delete: `frontend/src/components/workbench/AIChatPage.tsx`
- Delete: `frontend/src/components/workbench/BuildPreviewPanel.tsx`
- Delete: `frontend/src/components/workbench/ChunkCard.tsx`

**Step 1: Remove floating AI panel from WorkbenchLayout.tsx**

In `WorkbenchLayout.tsx` (the older CSS-grid layout), remove:
- The `aiChatOpen` state selector (line 26)
- The AI chat toggle button and its unread badge (around lines 115-125)
- The `{aiChatOpen && <AIChatPanel ... />}` rendering (around line 161)
- The `AIChatPanel` import

If the old `WorkbenchLayout.tsx` is no longer the active layout (Mantine version is used), this file may be dead code. If so, consider whether it can be deleted entirely — check if it's imported anywhere besides as a fallback.

**Step 2: Remove `.ai-chat-floating` CSS**

In `app.css`, delete lines 109-114:
```css
.ai-chat-floating {
  position: absolute;
  top: 8px;
  right: 8px;
  z-index: 100;
}
```

**Step 3: Delete removed files**

```bash
rm frontend/src/components/workbench/AIChatPage.tsx
rm frontend/src/components/workbench/BuildPreviewPanel.tsx
rm frontend/src/components/workbench/ChunkCard.tsx
```

**Step 4: Check for remaining references**

Run: `grep -r "AIChatPage\|BuildPreviewPanel\|ChunkCard\|aiChatOpen\|setAiChatOpen" frontend/src/ --include="*.ts" --include="*.tsx" -l`

Fix any remaining references. The `AIChatPanel.tsx` (floating panel) can remain for now as reference, or be deleted if no longer imported anywhere.

**Step 5: Verify types compile**

Run: `cd frontend && npx tsc -b --noEmit 2>&1 | head -40`

**Step 6: Commit**

```bash
git add -A frontend/src/
git commit -m "refactor: remove floating AI panel, AIChatPage, and dead code"
```

---

### Task 6: Update existing tests

**Files:**
- Modify: `frontend/src/components/workbench/WorkbenchLayoutMantine.test.tsx`
- Modify: `frontend/src/state/editorStore.test.ts` (if it references `aiChatOpen`)

**Step 1: Add mock for AIChatSidebar in layout test**

In `WorkbenchLayoutMantine.test.tsx`, add a mock after the existing mocks:
```typescript
vi.mock('./AIChatSidebar', () => ({
  AIChatSidebar: () => <div data-testid="ai-chat-sidebar" />,
}));
```

Remove any mock for `AIChatPage` if present.

**Step 2: Update editorStore tests**

Search `editorStore.test.ts` for references to `aiChatOpen` and update them to use `rightSidebarMode`. For example:
- `aiChatOpen: true` → `rightSidebarMode: 'chat'`
- `aiChatOpen: false` → `rightSidebarMode: 'inspector'`

**Step 3: Run tests**

Run: `cd frontend && npx vitest run 2>&1 | tail -30`

Expected: All tests pass (or only pre-existing failures remain).

**Step 4: Commit**

```bash
git add frontend/src/
git commit -m "test: update tests for rightSidebarMode and AIChatSidebar"
```

---

### Task 7: Write test for sidebar toggle behavior

**Files:**
- Modify: `frontend/src/components/workbench/WorkbenchLayoutMantine.test.tsx`

**Step 1: Write the test**

```typescript
describe('Right sidebar toggle', () => {
  beforeEach(() => {
    useEditorStore.getState().loadModel(cloneModel(teacupModel));
    useEditorStore.getState().setRightSidebarMode('inspector');
  });

  it('shows inspector panel by default', () => {
    render(
      <MantineProvider>
        <WorkbenchLayout />
      </MantineProvider>,
    );
    expect(screen.getByTestId('inspector-panel')).toBeInTheDocument();
    expect(screen.queryByTestId('ai-chat-sidebar')).not.toBeInTheDocument();
  });

  it('switches to AI chat when chat mode is selected', async () => {
    const user = userEvent.setup();
    render(
      <MantineProvider>
        <WorkbenchLayout />
      </MantineProvider>,
    );

    // Click the "AI Chat" segment
    const chatToggle = screen.getByText('AI Chat');
    await user.click(chatToggle);

    expect(screen.getByTestId('ai-chat-sidebar')).toBeInTheDocument();
    expect(screen.queryByTestId('inspector-panel')).not.toBeInTheDocument();
  });
});
```

**Step 2: Run the test**

Run: `cd frontend && npx vitest run src/components/workbench/WorkbenchLayoutMantine.test.tsx 2>&1 | tail -20`

Expected: PASS

**Step 3: Commit**

```bash
git add frontend/src/components/workbench/WorkbenchLayoutMantine.test.tsx
git commit -m "test: add sidebar toggle tests for inspector/chat switching"
```

---

### Task 8: Final verification and cleanup

**Step 1: Run full frontend test suite**

Run: `cd frontend && npx vitest run 2>&1 | tail -40`

Expected: All tests pass (minus pre-existing failures).

**Step 2: Run type check**

Run: `cd frontend && npx tsc -b --noEmit`

Expected: Clean (minus pre-existing errors in older files).

**Step 3: Run backend tests (sanity check)**

Run: `make test-backend 2>&1 | tail -20`

Expected: No regressions.

**Step 4: Manual smoke test**

Run: `make dev`

Verify:
- Right sidebar shows SegmentedControl with "Inspector" and "AI Chat"
- Clicking "AI Chat" swaps to chat interface
- Clicking "Inspector" swaps back
- Chat input shows context-aware placeholder
- Sending a message works, response appears
- Suggestion chips work
- Sidebar collapse/expand works
- Chat is accessible from formulas, dashboard, scenarios, sensitivity tabs
- "New" button opens AI chat sidebar
- No floating AI panel on canvas
- No "AI" tab in header

**Step 5: Commit any final fixes**

```bash
git add -A
git commit -m "chore: final cleanup for AI chat sidebar"
```
