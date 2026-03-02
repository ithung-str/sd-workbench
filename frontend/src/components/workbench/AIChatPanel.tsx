import { useEffect, useRef } from 'react';
import {
  ActionIcon,
  Box,
  Group,
  Paper,
  ScrollArea,
  Stack,
  Text,
  Textarea,
  Tooltip,
} from '@mantine/core';
import { IconSend, IconTrash, IconX } from '@tabler/icons-react';
import { useEditorStore } from '../../state/editorStore';

export function AIChatPanel() {
  const aiCommand = useEditorStore((s) => s.aiCommand);
  const setAiCommand = useEditorStore((s) => s.setAiCommand);
  const runAiCommand = useEditorStore((s) => s.runAiCommand);
  const isApplyingAi = useEditorStore((s) => s.isApplyingAi);
  const aiChatHistory = useEditorStore((s) => s.aiChatHistory);
  const clearAiChat = useEditorStore((s) => s.clearAiChat);
  const setAiChatOpen = useEditorStore((s) => s.setAiChatOpen);
  const activeSimulationMode = useEditorStore((s) => s.activeSimulationMode);

  const scrollRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (viewportRef.current) {
      viewportRef.current.scrollTo({ top: viewportRef.current.scrollHeight, behavior: 'smooth' });
    }
  }, [aiChatHistory.length, isApplyingAi]);

  const isDisabled = activeSimulationMode === 'vensim';

  return (
    <Paper
      shadow="lg"
      radius="md"
      withBorder
      style={{
        width: 380,
        maxHeight: 520,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <Group
        justify="space-between"
        px="sm"
        py={8}
        style={{
          borderBottom: '1px solid var(--mantine-color-gray-3)',
          background: 'var(--mantine-color-violet-0)',
          flexShrink: 0,
        }}
      >
        <Text size="sm" fw={600} c="violet.8">
          AI Assistant
        </Text>
        <Group gap={4}>
          {aiChatHistory.length > 0 && (
            <Tooltip label="Clear conversation">
              <ActionIcon size="sm" variant="subtle" color="gray" onClick={clearAiChat}>
                <IconTrash size={14} />
              </ActionIcon>
            </Tooltip>
          )}
          <Tooltip label="Close">
            <ActionIcon size="sm" variant="subtle" color="gray" onClick={() => setAiChatOpen(false)}>
              <IconX size={14} />
            </ActionIcon>
          </Tooltip>
        </Group>
      </Group>

      {/* Messages */}
      <ScrollArea
        style={{ flex: 1, minHeight: 0 }}
        viewportRef={viewportRef}
        ref={scrollRef}
      >
        <Stack gap="xs" p="sm" style={{ minHeight: 120 }}>
          {aiChatHistory.length === 0 && !isApplyingAi && (
            <Text size="xs" c="dimmed" ta="center" py="lg">
              Ask AI to modify your model. It can add stocks, flows, connections, and more.
              {isDisabled ? ' (Disabled for Vensim models)' : ''}
            </Text>
          )}
          {aiChatHistory.map((msg, idx) => (
            <Box
              key={idx}
              style={{
                alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                maxWidth: '85%',
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
                  {msg.content}
                </Text>
              </Paper>
            </Box>
          ))}
          {isApplyingAi && (
            <Box style={{ alignSelf: 'flex-start', maxWidth: '85%' }}>
              <Paper p="xs" radius="md" style={{ background: 'var(--mantine-color-gray-1)' }}>
                <Text size="xs" c="dimmed" mb={2}>AI</Text>
                <Text size="sm" c="dimmed">Thinking...</Text>
              </Paper>
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
            placeholder={isDisabled ? 'AI editing disabled for Vensim models' : 'Ask AI to modify the model...'}
            value={aiCommand}
            onChange={(e) => setAiCommand(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void runAiCommand();
              }
            }}
            disabled={isDisabled || isApplyingAi}
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
            disabled={isDisabled || isApplyingAi || !aiCommand.trim()}
          >
            <IconSend size={16} />
          </ActionIcon>
        </Group>
      </Box>
    </Paper>
  );
}
