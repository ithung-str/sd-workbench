import { Alert, Badge, Group, Paper, Stack, Text } from '@mantine/core';
import { IconAlertTriangle, IconCheck, IconInfoCircle } from '@tabler/icons-react';
import type { VensimImportResponse } from '../../types/model';

function readinessColor(readiness: 'green' | 'yellow' | 'red'): 'green' | 'yellow' | 'red' {
  return readiness;
}

function inferReadiness(imported: VensimImportResponse): 'green' | 'yellow' | 'red' {
  const unsupported = imported.capabilities.details?.some((detail) => detail.support_mode === 'unsupported');
  if (unsupported) return 'red';
  const partial = imported.capabilities.details?.some((detail) => detail.support_mode !== 'pysd');
  if (partial || (imported.capabilities.partial?.length ?? 0) > 0) return 'yellow';
  return 'green';
}

export function VensimDiagnosticsPanel({
  imported,
  executionMode,
  fallbackActivations,
}: {
  imported: VensimImportResponse;
  executionMode?: 'pysd' | 'mixed' | 'blocked';
  fallbackActivations?: string[];
}) {
  const readiness = inferReadiness(imported);
  const families = imported.capabilities.families ?? [];
  const importGaps = imported.model_view.import_gaps;
  return (
    <Stack gap="xs">
      <Group justify="space-between" align="center">
        <Text size="sm" fw={600}>
          Compatibility Diagnostics
        </Text>
        <Badge color={readinessColor(readiness)}>{readiness.toUpperCase()}</Badge>
      </Group>

      <Paper withBorder p="xs">
        <Group gap="xs" align="center">
          {executionMode === 'mixed' ? <IconAlertTriangle size={16} color="#e67700" /> : <IconCheck size={16} color="#2b8a3e" />}
          <Text size="xs">
            Execution mode: <b>{executionMode ?? 'pysd'}</b>
          </Text>
        </Group>
        {fallbackActivations && fallbackActivations.length > 0 && (
          <Text size="xs" c="dimmed" mt={4}>
            Fallback activations: {fallbackActivations.join(', ')}
          </Text>
        )}
      </Paper>

      {families.length > 0 ? (
        <Paper withBorder p="xs">
          <Stack gap={6}>
            {families.map((family) => (
              <Group key={family.family} justify="space-between" wrap="nowrap">
                <Text size="xs">{family.family}</Text>
                <Badge
                  size="xs"
                  color={
                    family.support_mode === 'unsupported'
                      ? 'red'
                      : family.support_mode === 'native_fallback'
                        ? 'yellow'
                        : 'green'
                  }
                >
                  {family.support_mode}
                </Badge>
              </Group>
            ))}
          </Stack>
        </Paper>
      ) : (
        <Alert icon={<IconInfoCircle size={14} />} color="blue" variant="light">
          Function-level diagnostics will appear after import capability analysis.
        </Alert>
      )}

      {importGaps ? (
        <Paper withBorder p="xs">
          <Stack gap={4}>
            <Text size="xs" fw={600}>
              Import Gaps
            </Text>
            <Text size="xs" c="dimmed">
              Dropped variables: {importGaps.dropped_variables} | Dropped links: {importGaps.dropped_edges} | Unparsed equations: {importGaps.unparsed_equations}
            </Text>
            {importGaps.unsupported_constructs.length > 0 ? (
              <Text size="xs" c="dimmed">
                Unsupported constructs: {importGaps.unsupported_constructs.slice(0, 8).join(', ')}
                {importGaps.unsupported_constructs.length > 8 ? '…' : ''}
              </Text>
            ) : null}
            {importGaps.samples.length > 0 ? (
              <Stack gap={3} mt={4}>
                {importGaps.samples.slice(0, 6).map((sample, idx) => (
                  <Text size="xs" key={`${sample.symbol}-${idx}`} c={sample.severity === 'error' ? 'red' : 'dimmed'}>
                    [{sample.kind}] {sample.symbol}: {sample.reason}
                  </Text>
                ))}
              </Stack>
            ) : null}
          </Stack>
        </Paper>
      ) : null}
    </Stack>
  );
}
