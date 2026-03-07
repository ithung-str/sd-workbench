import { useState, useEffect, useRef } from 'react';
import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Collapse,
  Group,
  List,
  Paper,
  ScrollArea,
  Stack,
  Text,
  Textarea,
  Tooltip,
} from '@mantine/core';
import {
  IconChevronDown,
  IconChevronRight,
  IconCode,
  IconCopy,
  IconSend,
  IconTrash,
} from '@tabler/icons-react';
import { useEditorStore, type WorkbenchTab } from '../../state/editorStore';
import type { AIChatComponentGroup, AIChatMessage, NotebookImportProgress, RetryLogEntry } from '../../types/model';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/** Strip markdown tables/headers from content when we have structured component groups */
function trimBeforeMarkdownTables(content: string): string {
  // Find the first markdown heading (##) or table row (| ... |) and cut there
  const lines = content.split('\n');
  const cutIdx = lines.findIndex((l) => /^#{1,3}\s/.test(l.trim()) || /^\|.*\|.*\|/.test(l.trim()));
  if (cutIdx > 0) {
    return lines.slice(0, cutIdx).join('\n').trim();
  }
  return content;
}

const ACTION_COLORS: Record<string, string> = {
  success: 'green',
  retrying: 'yellow',
  escalated: 'blue',
  gave_up: 'red',
};

function getPlaceholder(tab: WorkbenchTab): string {
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

/* ------------------------------------------------------------------ */
/*  Sub-components                                                     */
/* ------------------------------------------------------------------ */

function RetryLogSection({ log }: { log: RetryLogEntry[] }) {
  const [opened, setOpened] = useState(false);
  const lastEntry = log[log.length - 1];
  const resolved = lastEntry?.action === 'success';

  return (
    <Box mt={4}>
      <Group
        gap={6}
        style={{ cursor: 'pointer' }}
        onClick={() => setOpened((o) => !o)}
      >
        {opened ? <IconChevronDown size={12} /> : <IconChevronRight size={12} />}
        <Text size="xs" c="dimmed">
          {log.length} validation round{log.length !== 1 ? 's' : ''} ({resolved ? 'resolved' : 'failed'})
        </Text>
      </Group>
      <Collapse in={opened}>
        <Stack gap={4} mt={4} ml={16}>
          {log.map((entry) => (
            <Box key={entry.round}>
              <Group gap={6}>
                <Text size="xs" fw={500}>Round {entry.round}</Text>
                <Badge size="xs" color={ACTION_COLORS[entry.action] ?? 'gray'} variant="light">
                  {entry.action}
                </Badge>
                {entry.model_used && (
                  <Text size="xs" c="dimmed">{entry.model_used}</Text>
                )}
              </Group>
              {entry.errors.length > 0 && (
                <List size="xs" ml={8} mt={2}>
                  {entry.errors.map((err, i) => (
                    <List.Item key={i} style={{ color: 'var(--mantine-color-red-7)', fontSize: '0.7rem' }}>
                      {err}
                    </List.Item>
                  ))}
                </List>
              )}
            </Box>
          ))}
        </Stack>
      </Collapse>
    </Box>
  );
}

function DebugRawResponseSection({ text }: { text: string }) {
  const [opened, setOpened] = useState(false);
  const [copied, setCopied] = useState(false);

  const copyRaw = () => {
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <Box mt={4}>
      <Group
        gap={6}
        style={{ cursor: 'pointer' }}
        onClick={() => setOpened((o) => !o)}
      >
        {opened ? <IconChevronDown size={12} /> : <IconChevronRight size={12} />}
        <IconCode size={12} />
        <Text size="xs" c="dimmed">
          Raw AI response ({text.length} chars)
        </Text>
      </Group>
      <Collapse in={opened}>
        <Box mt={4} ml={16}>
          <Group gap={4} mb={4}>
            <Tooltip label={copied ? 'Copied!' : 'Copy raw response'}>
              <ActionIcon size="xs" variant="subtle" color="gray" onClick={copyRaw}>
                <IconCopy size={12} />
              </ActionIcon>
            </Tooltip>
            <Text size="xs" c="dimmed">{copied ? 'Copied!' : 'Click to copy'}</Text>
          </Group>
          <Box
            style={{
              maxHeight: 200,
              overflow: 'auto',
              background: 'var(--mantine-color-dark-8)',
              color: 'var(--mantine-color-gray-4)',
              borderRadius: 4,
              padding: 8,
              fontSize: '0.65rem',
              fontFamily: 'monospace',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-all',
            }}
          >
            {text}
          </Box>
        </Box>
      </Collapse>
    </Box>
  );
}

function NotebookImportProgressPanel({ progress }: { progress: NotebookImportProgress }) {
  return (
    <Box mt={8}>
      <Text size="xs" fw={600} c="dark.6">Notebook import</Text>
      <Text size="xs" c="dimmed" mb={6}>
        {progress.stageCount != null ? `${progress.stageCount} stages` : null}
        {progress.stageCount != null && progress.complexityTier ? ' · ' : null}
        {progress.complexityTier ? `${progress.complexityTier} workflow` : null}
      </Text>
      {progress.stages.length > 0 && (
        <Stack gap={4}>
          {progress.stages.map((stage) => (
            <Box
              key={stage.id}
              style={{
                borderRadius: 8,
                border: '1px solid rgba(134, 142, 150, 0.25)',
                background: progress.mainPathStageIds.includes(stage.id) ? 'rgba(8, 127, 140, 0.06)' : 'rgba(255,255,255,0.7)',
                padding: '6px 8px',
              }}
            >
              <Group justify="space-between" gap={6} wrap="nowrap">
                <Text size="xs" fw={600} lineClamp={1}>{stage.name}</Text>
                <Badge
                  size="xs"
                  variant="light"
                  color={stage.state === 'done' ? 'teal' : stage.state === 'building' ? 'orange' : stage.state === 'needs_review' ? 'yellow' : 'gray'}
                >
                  {stage.state.replace('_', ' ')}
                </Badge>
              </Group>
              {stage.purpose && (
                <Text size="xs" c="dimmed" lineClamp={2}>{stage.purpose}</Text>
              )}
            </Box>
          ))}
        </Stack>
      )}
      {progress.warnings.length > 0 && (
        <Stack gap={4} mt={8}>
          {progress.warnings.map((warning) => (
            <Text key={warning} size="xs" c="yellow.8">{warning}</Text>
          ))}
        </Stack>
      )}
    </Box>
  );
}

function ComponentGroups({ groups }: { groups: AIChatComponentGroup[] }) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const toggle = (type: string) =>
    setExpanded((prev) => ({ ...prev, [type]: !prev[type] }));

  return (
    <Stack gap={2} mt={6}>
      {groups.map((group) => (
        <Box key={group.type}>
          <Group
            gap={6}
            style={{ cursor: 'pointer' }}
            onClick={() => toggle(group.type)}
          >
            {expanded[group.type] ? <IconChevronDown size={12} /> : <IconChevronRight size={12} />}
            <Badge size="xs" variant="light" color="violet">
              {group.type} ({group.names.length})
            </Badge>
          </Group>
          <Collapse in={!!expanded[group.type]}>
            <Stack gap={1} ml={20} mt={2}>
              {group.names.map((name) => (
                <Text key={name} size="xs" style={{ lineHeight: 1.4 }}>
                  {name}
                </Text>
              ))}
            </Stack>
          </Collapse>
        </Box>
      ))}
    </Stack>
  );
}

function ChatBubble({
  msg,
  isLast,
  isApplyingAi,
  setAiCommand,
  runAiCommand,
}: {
  msg: AIChatMessage;
  isLast: boolean;
  isApplyingAi: boolean;
  setAiCommand: (cmd: string) => void;
  runAiCommand: () => Promise<void>;
}) {
  return (
    <Box
      style={{
        alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
        maxWidth: '90%',
      }}
    >
      <Paper
        p="xs"
        radius="md"
        style={{
          background:
            msg.role === 'user'
              ? 'var(--mantine-color-violet-1)'
              : msg.content.startsWith('Error:')
                ? 'var(--mantine-color-red-0)'
                : 'var(--mantine-color-gray-1)',
          borderBottomRightRadius: msg.role === 'user' ? 4 : undefined,
          borderBottomLeftRadius: msg.role === 'assistant' ? 4 : undefined,
        }}
      >
        <Text size="xs" c="dimmed" mb={2}>
          {msg.role === 'user' ? 'You' : 'AI'}
        </Text>
        <Text size="sm" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
          {msg.components?.length ? trimBeforeMarkdownTables(msg.content) : msg.content}
        </Text>
        {msg.components && msg.components.length > 0 && (
          <ComponentGroups groups={msg.components} />
        )}
      </Paper>

      {msg.role === 'assistant' && msg.retryLog && msg.retryLog.length > 0 && (
        <RetryLogSection log={msg.retryLog} />
      )}
      {msg.role === 'assistant' && msg.debugRawResponse && (
        <DebugRawResponseSection text={msg.debugRawResponse} />
      )}

      {/* Suggestion chips -- only shown on the last assistant message */}
      {msg.role === 'assistant' && msg.suggestions && msg.suggestions.length > 0 && isLast && (
        <Group gap={6} mt={6} wrap="wrap">
          {msg.suggestions.map((suggestion, sIdx) => (
            <Button
              key={sIdx}
              size="compact-xs"
              variant="outline"
              color="violet"
              radius="xl"
              onClick={() => {
                setAiCommand(suggestion);
                void runAiCommand();
              }}
              disabled={isApplyingAi}
              styles={{
                root: {
                  fontWeight: 500,
                  fontSize: '0.78rem',
                  maxWidth: '100%',
                  whiteSpace: 'normal',
                  height: 'auto',
                  padding: '4px 12px',
                },
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

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */

export function AIChatSidebar() {
  const aiCommand = useEditorStore((s) => s.aiCommand);
  const setAiCommand = useEditorStore((s) => s.setAiCommand);
  const runAiCommand = useEditorStore((s) => s.runAiCommand);
  const isApplyingAi = useEditorStore((s) => s.isApplyingAi);
  const aiStatusMessage = useEditorStore((s) => s.aiStatusMessage);
  const aiChatHistory = useEditorStore((s) => s.aiChatHistory);
  const aiStreamingRaw = useEditorStore((s) => s.aiStreamingRaw);
  const notebookImportProgress = useEditorStore((s: any) => s.notebookImportProgress as NotebookImportProgress | null);
  const clearAiChat = useEditorStore((s) => s.clearAiChat);
  const activeTab = useEditorStore((s) => s.activeTab);

  const viewportRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new messages arrive or streaming updates
  useEffect(() => {
    if (viewportRef.current) {
      viewportRef.current.scrollTo({ top: viewportRef.current.scrollHeight, behavior: 'smooth' });
    }
  }, [aiChatHistory.length, isApplyingAi, aiStatusMessage, aiStreamingRaw]);

  const copyChat = () => {
    const text = aiChatHistory
      .map((msg) => {
        let s = `${msg.role === 'user' ? 'You' : 'AI'}\n\n${msg.content}`;
        if (msg.debugRawResponse) {
          s += `\n\n--- Raw AI Response ---\n${msg.debugRawResponse}`;
        }
        return s;
      })
      .join('\n\n');
    void navigator.clipboard.writeText(text);
  };

  return (
    <Box
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
      }}
    >
      {/* Toolbar row -- copy + clear, right-aligned */}
      {aiChatHistory.length > 0 && (
        <Group
          justify="flex-end"
          gap={4}
          px="xs"
          py={4}
          style={{
            borderBottom: '1px solid var(--mantine-color-gray-3)',
            flexShrink: 0,
          }}
        >
          <Tooltip label="Copy chat">
            <ActionIcon size="sm" variant="subtle" color="gray" onClick={copyChat}>
              <IconCopy size={14} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label="Clear conversation">
            <ActionIcon size="sm" variant="subtle" color="gray" onClick={clearAiChat}>
              <IconTrash size={14} />
            </ActionIcon>
          </Tooltip>
        </Group>
      )}

      {/* Messages */}
      <ScrollArea
        style={{ flex: 1, minHeight: 0 }}
        viewportRef={viewportRef}
      >
        <Stack gap="xs" p="xs" style={{ minHeight: 80 }}>
          {aiChatHistory.length === 0 && !isApplyingAi && (
            <Text size="xs" c="dimmed" ta="center" py="lg">
              Ask AI to modify your model. It can add stocks, flows, connections, and more.
            </Text>
          )}

          {aiChatHistory.map((msg, idx) => (
            <ChatBubble
              key={idx}
              msg={msg}
              isLast={idx === aiChatHistory.length - 1}
              isApplyingAi={isApplyingAi}
              setAiCommand={setAiCommand}
              runAiCommand={runAiCommand}
            />
          ))}

          {/* Streaming / thinking indicator */}
          {isApplyingAi && (
            <Box style={{ alignSelf: 'flex-start', maxWidth: '90%' }}>
              <Paper p="xs" radius="md" style={{ background: 'var(--mantine-color-gray-1)' }}>
                <Text size="xs" c="dimmed" mb={2}>AI</Text>
                <Group gap={8} align="center">
                  <div className="ai-spinner" />
                  <Text size="sm" c="dimmed">{aiStatusMessage || 'Thinking...'}</Text>
                </Group>
                {notebookImportProgress && (
                  <NotebookImportProgressPanel progress={notebookImportProgress} />
                )}
                {aiStreamingRaw && (
                  <Box
                    mt={6}
                    style={{
                      maxHeight: 200,
                      overflow: 'auto',
                      background: 'var(--mantine-color-dark-8)',
                      color: 'var(--mantine-color-green-4)',
                      borderRadius: 4,
                      padding: 8,
                      fontSize: '0.65rem',
                      fontFamily: 'monospace',
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-all',
                    }}
                  >
                    {aiStreamingRaw}
                  </Box>
                )}
              </Paper>
            </Box>
          )}
        </Stack>
      </ScrollArea>

      {/* Input area */}
      <Box
        px="xs"
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
