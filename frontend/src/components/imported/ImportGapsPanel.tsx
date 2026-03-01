import { Accordion, Code, Stack, Text, Title } from '@mantine/core';
import { useEditorStore } from '../../state/editorStore';

export function ImportGapsPanel() {
  const importedModel = useEditorStore((s) => s.importedModel);
  const gaps = importedModel?.model_view.import_gaps;
  const fragments = useEditorStore((s) => s.model.metadata?.imported?.roundtrip?.unmapped_fragments ?? []);

  if (!importedModel) return null;

  return (
    <Stack gap="xs">
      <Title order={5}>Import Gaps</Title>
      <Text size="xs" c="dimmed">
        Dropped vars: {gaps?.dropped_variables ?? 0} | Dropped edges: {gaps?.dropped_edges ?? 0} | Unparsed equations:{' '}
        {gaps?.unparsed_equations ?? 0}
      </Text>
      <Accordion multiple>
        {(gaps?.samples ?? []).slice(0, 10).map((sample, idx) => (
          <Accordion.Item key={`${sample.symbol}-${idx}`} value={`${sample.symbol}-${idx}`}>
            <Accordion.Control>{sample.kind}: {sample.symbol}</Accordion.Control>
            <Accordion.Panel>
              <Text size="sm">{sample.reason}</Text>
            </Accordion.Panel>
          </Accordion.Item>
        ))}
      </Accordion>
      {fragments.length > 0 && (
        <>
          <Text size="sm" fw={600}>Raw XML fragments</Text>
          {fragments.slice(0, 3).map((fragment, idx) => (
            <Code key={idx} block>{fragment}</Code>
          ))}
        </>
      )}
    </Stack>
  );
}
