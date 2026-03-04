import { useState } from 'react';
import { Button, Loader, Modal, Select, Stack, Text, TextInput } from '@mantine/core';
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
  const [selectedSheet, setSelectedSheet] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<'auth' | 'select' | 'importing'>(!isAuthenticated ? 'auth' : 'select');

  const reset = () => {
    setUrl('');
    setMeta(null);
    setSheets([]);
    setSelectedSheet(null);
    setLoading(false);
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
      if (fetched.sheets.length > 0) {
        setSelectedSheet(fetched.sheets[0].title);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch spreadsheet');
    } finally {
      setLoading(false);
    }
  };

  const handleImport = async () => {
    const spreadsheetId = parseSpreadsheetId(url);
    if (!spreadsheetId || !selectedSheet || !meta) return;

    const sheet = sheets.find((s) => s.title === selectedSheet);
    if (!sheet) return;

    setStep('importing');
    setError(null);
    try {
      const token = await getToken();
      const rawRows = await fetchSheetData(spreadsheetId, selectedSheet, token);
      const table = sheetDataToDataTable(
        rawRows,
        spreadsheetId,
        url,
        sheet.title,
        sheet.sheetId,
        meta.title,
      );
      onImport(table);
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed');
      setStep('select');
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
                setSelectedSheet(null);
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
                <Select
                  label="Worksheet"
                  data={sheets.map((s) => s.title)}
                  value={selectedSheet}
                  onChange={setSelectedSheet}
                />
                <Button onClick={handleImport} disabled={!selectedSheet}>
                  Import worksheet
                </Button>
              </>
            )}
          </>
        )}

        {step === 'importing' && (
          <Stack align="center" gap="sm" py="lg">
            <Loader size="sm" />
            <Text size="sm">Importing data...</Text>
          </Stack>
        )}
      </Stack>
    </Modal>
  );
}
