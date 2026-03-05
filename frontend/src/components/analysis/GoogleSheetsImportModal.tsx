import { useState } from 'react';
import { Button, Checkbox, Group, Loader, Modal, Stack, Text, TextInput } from '@mantine/core';
import { IconBrandGoogle } from '@tabler/icons-react';
import type { DataTable } from '../../types/dataTable';
import { useGoogleAuth } from '../../lib/googleAuth';
import {
  fetchSheetData,
  fetchSpreadsheetMeta,
  parseSpreadsheetId,
  sheetDataToDataTable,
  type SheetInfo,
  type SpreadsheetMeta,
} from '../../lib/googleSheetsApi';

type Props = {
  opened: boolean;
  onClose: () => void;
  onImport: (table: DataTable) => void;
};

export function GoogleSheetsImportModal({ opened, onClose, onImport }: Props) {
  const { isAuthenticated, login, getToken } = useGoogleAuth();

  const [url, setUrl] = useState('');
  const [meta, setMeta] = useState<SpreadsheetMeta | null>(null);
  const [sheets, setSheets] = useState<SheetInfo[]>([]);
  const [checkedSheets, setCheckedSheets] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [importProgress, setImportProgress] = useState<{ current: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<'auth' | 'select' | 'importing'>(!isAuthenticated ? 'auth' : 'select');

  const reset = () => {
    setUrl('');
    setMeta(null);
    setSheets([]);
    setCheckedSheets(new Set());
    setLoading(false);
    setImportProgress(null);
    setError(null);
    setStep(!isAuthenticated ? 'auth' : 'select');
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleAuth = async () => {
    setError(null);
    try {
      await login();
      setStep('select');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed');
    }
  };

  const handleFetchMeta = async () => {
    const spreadsheetId = parseSpreadsheetId(url);
    if (!spreadsheetId) {
      setError('Invalid Google Sheets URL');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const token = await getToken();
      const fetched = await fetchSpreadsheetMeta(spreadsheetId, token);
      setMeta(fetched);
      setSheets(fetched.sheets);
      setCheckedSheets(new Set(fetched.sheets.map((s) => s.title)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch spreadsheet');
    } finally {
      setLoading(false);
    }
  };

  const toggleSheet = (title: string) => {
    setCheckedSheets((prev) => {
      const next = new Set(prev);
      if (next.has(title)) {
        next.delete(title);
      } else {
        next.add(title);
      }
      return next;
    });
  };

  const toggleAll = () => {
    if (checkedSheets.size === sheets.length) {
      setCheckedSheets(new Set());
    } else {
      setCheckedSheets(new Set(sheets.map((s) => s.title)));
    }
  };

  const handleImport = async () => {
    const spreadsheetId = parseSpreadsheetId(url);
    if (!spreadsheetId || checkedSheets.size === 0 || !meta) return;

    const sheetsToImport = sheets.filter((s) => checkedSheets.has(s.title));

    setStep('importing');
    setError(null);
    setImportProgress({ current: 0, total: sheetsToImport.length });

    try {
      const token = await getToken();
      for (let i = 0; i < sheetsToImport.length; i++) {
        const sheet = sheetsToImport[i];
        setImportProgress({ current: i + 1, total: sheetsToImport.length });
        const rawRows = await fetchSheetData(spreadsheetId, sheet.title, token);
        const table = sheetDataToDataTable(
          rawRows,
          spreadsheetId,
          url,
          sheet.title,
          sheet.sheetId,
          meta.title,
        );
        onImport(table);
      }
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed');
      setStep('select');
      setImportProgress(null);
    }
  };

  return (
    <Modal opened={opened} onClose={handleClose} title="Import from Google Sheets" size="md">
      <Stack gap="md">
        {error && (
          <Text size="sm" c="red">
            {error}
          </Text>
        )}

        {step === 'auth' && (
          <>
            <Text size="sm">Sign in with Google to access your spreadsheets.</Text>
            <Button leftSection={<IconBrandGoogle size={16} />} onClick={handleAuth}>
              Sign in with Google
            </Button>
          </>
        )}

        {step === 'select' && (
          <>
            <TextInput
              label="Google Sheets URL"
              placeholder="https://docs.google.com/spreadsheets/d/..."
              value={url}
              onChange={(e) => {
                setUrl(e.currentTarget.value);
                setMeta(null);
                setSheets([]);
                setCheckedSheets(new Set());
              }}
            />

            {!meta && (
              <Button onClick={handleFetchMeta} loading={loading} disabled={!url.trim()}>
                Load spreadsheet
              </Button>
            )}

            {meta && sheets.length > 0 && (
              <>
                <Text size="sm" fw={500}>
                  {meta.title}
                </Text>
                <Stack gap={6} style={{ border: '1px solid var(--mantine-color-gray-3)', borderRadius: 6, padding: '8px 10px', maxHeight: 260, overflowY: 'auto' }}>
                  <Group gap="xs">
                    <Checkbox
                      size="xs"
                      checked={checkedSheets.size === sheets.length}
                      indeterminate={checkedSheets.size > 0 && checkedSheets.size < sheets.length}
                      onChange={toggleAll}
                      label={<Text size="xs" fw={600} c="dimmed">Select all</Text>}
                    />
                  </Group>
                  {sheets.map((s) => (
                    <Checkbox
                      key={s.sheetId}
                      size="xs"
                      checked={checkedSheets.has(s.title)}
                      onChange={() => toggleSheet(s.title)}
                      label={s.title}
                    />
                  ))}
                </Stack>
                <Button onClick={handleImport} disabled={checkedSheets.size === 0}>
                  Import {checkedSheets.size} worksheet{checkedSheets.size !== 1 ? 's' : ''}
                </Button>
              </>
            )}
          </>
        )}

        {step === 'importing' && (
          <Stack align="center" gap="sm" py="lg">
            <Loader size="sm" />
            <Text size="sm">
              Importing{importProgress ? ` ${importProgress.current} of ${importProgress.total}` : ''}...
            </Text>
          </Stack>
        )}
      </Stack>
    </Modal>
  );
}
