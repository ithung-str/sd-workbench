import { Group, Stack, TextInput, Textarea, Title } from '@mantine/core';
import { useEditorStore } from '../../state/editorStore';

export function ImportedModelPanel() {
  const model = useEditorStore((s) => s.model);
  const updateModelMetadata = useEditorStore((s) => s.updateModelMetadata);

  const imported = model.metadata?.imported;
  const info = imported?.model_info ?? {};

  return (
    <Stack gap="xs">
      <Title order={5}>Imported Model</Title>
      <TextInput
        label="Description"
        value={info.description ?? ''}
        onChange={(e) =>
          updateModelMetadata({
            imported: {
              ...(imported ?? {}),
              model_info: { ...info, description: e.target.value },
            },
          })
        }
      />
      <Group grow>
        <TextInput
          label="Author"
          value={info.author ?? ''}
          onChange={(e) =>
            updateModelMetadata({
              imported: {
                ...(imported ?? {}),
                model_info: { ...info, author: e.target.value },
              },
            })
          }
        />
        <TextInput
          label="Time units"
          value={info.time_units ?? ''}
          onChange={(e) =>
            updateModelMetadata({
              imported: {
                ...(imported ?? {}),
                model_info: { ...info, time_units: e.target.value },
              },
            })
          }
        />
      </Group>
      <Textarea
        label="Notes"
        minRows={3}
        value={info.notes ?? ''}
        onChange={(e) =>
          updateModelMetadata({
            imported: {
              ...(imported ?? {}),
              model_info: { ...info, notes: e.target.value },
            },
          })
        }
      />
    </Stack>
  );
}
