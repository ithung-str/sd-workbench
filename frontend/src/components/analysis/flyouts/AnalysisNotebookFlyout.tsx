import { useCallback, useRef, useState } from 'react';
import { Alert, Button, Group, Loader, Stack, Text, TextInput, Box } from '@mantine/core';
import { IconFileUpload, IconCheck } from '@tabler/icons-react';
import {
  parseNotebook,
  type NotebookCell,
} from '../../../lib/api';

type Props = {
  onStartTransform: (cells: NotebookCell[], pipelineName: string) => void;
};

export function AnalysisNotebookFlyout({ onStartTransform }: Props) {
  const [step, setStep] = useState<'upload' | 'parsing' | 'parsed' | 'error'>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [pipelineName, setPipelineName] = useState('');
  const [cells, setCells] = useState<NotebookCell[]>([]);
  const [error, setError] = useState('');

  const handleFileChange = useCallback(async (f: File | null) => {
    setFile(f);
    if (!f) return;

    setStep('parsing');
    setError('');
    try {
      const resp = await parseNotebook(f);
      if (!resp.ok) {
        setError(resp.error ?? 'Failed to parse notebook');
        setStep('error');
        return;
      }
      setCells(resp.cells);
      setPipelineName(resp.name || 'Imported Notebook');
      setStep('parsed');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStep('error');
    }
  }, []);

  const handleReset = useCallback(() => {
    setStep('upload');
    setFile(null);
    setPipelineName('');
    setCells([]);
    setError('');
  }, []);

  return (
    <Stack gap="sm">
      {step === 'upload' && (
        <NotebookDropZone onFile={handleFileChange} />
      )}

      {step === 'parsing' && (
        <Group gap="xs">
          <Loader size="sm" />
          <Text size="sm">Parsing notebook...</Text>
        </Group>
      )}

      {step === 'parsed' && (
        <>
          <Alert color="teal" icon={<IconCheck size={16} />} p="xs">
            <Text size="xs">
              Parsed {cells.length} cells from <b>{file?.name}</b>
            </Text>
          </Alert>
          <TextInput
            label="Pipeline name"
            size="sm"
            value={pipelineName}
            onChange={(e) => setPipelineName(e.currentTarget.value)}
          />
          <Text size="xs" c="dimmed">
            {cells.filter((c) => c.cell_type === 'code').length} code cells,{' '}
            {cells.filter((c) => c.cell_type === 'markdown').length} markdown cells
          </Text>
          <Button
            size="sm"
            onClick={() => {
              onStartTransform(cells, pipelineName);
            }}
          >
            Transform with AI
          </Button>
          <Button size="xs" variant="subtle" color="gray" onClick={handleReset}>
            Cancel
          </Button>
        </>
      )}

      {step === 'error' && (
        <>
          <Alert color="red" p="xs">
            <Text size="xs">{error}</Text>
          </Alert>
          <Button size="xs" variant="subtle" color="gray" onClick={handleReset}>
            Try Again
          </Button>
        </>
      )}
    </Stack>
  );
}

/** Drop zone for the initial .ipynb upload. */
function NotebookDropZone({ onFile }: { onFile: (f: File | null) => void }) {
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <Box
      style={{
        border: `2px dashed ${dragOver ? 'var(--mantine-color-violet-5)' : 'var(--mantine-color-gray-4)'}`,
        borderRadius: 8,
        padding: '24px 16px',
        background: dragOver ? 'var(--mantine-color-violet-0)' : 'transparent',
        cursor: 'pointer',
        textAlign: 'center',
        transition: 'all 0.15s',
      }}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        const f = e.dataTransfer.files[0];
        if (f && f.name.endsWith('.ipynb')) onFile(f);
      }}
      onClick={() => inputRef.current?.click()}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".ipynb"
        style={{ display: 'none' }}
        onChange={(e) => {
          const f = e.target.files?.[0] ?? null;
          if (f) onFile(f);
        }}
      />
      <Stack gap={6} align="center">
        <IconFileUpload size={28} style={{ color: dragOver ? 'var(--mantine-color-violet-6)' : 'var(--mantine-color-gray-5)' }} />
        <Text size="sm" fw={500}>Drop .ipynb here</Text>
        <Text size="xs" c="dimmed">or click to browse</Text>
      </Stack>
    </Box>
  );
}
