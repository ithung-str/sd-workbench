import { MantineProvider } from '@mantine/core';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AIChatSidebar } from './AIChatSidebar';
import { useEditorStore } from '../../state/editorStore';

describe('AIChatSidebar notebook import progress', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useEditorStore.setState((state) => ({
      ...state,
      aiCommand: '',
      aiChatHistory: [],
      isApplyingAi: true,
      aiStatusMessage: 'Finding the workflow stages',
      aiStreamingRaw: '{"debug":"raw"}',
      rightSidebarMode: 'chat',
      notebookImportProgress: {
        phase: 'stage_plan',
        message: 'Finding the workflow stages',
        complexityTier: 'large',
        stageCount: 3,
        currentStageId: 'sec_prepare',
        stages: [
          { id: 'sec_ingest', name: 'Load inputs', purpose: 'Loads source data.', state: 'done' },
          { id: 'sec_prepare', name: 'Prepare materials', purpose: 'Cleans and merges materials.', state: 'building' },
          { id: 'sec_output', name: 'Generate outputs', purpose: 'Builds tables and exports.', state: 'queued' },
        ],
        warnings: ['Separated export logic into its own stage.'],
        mainPathStageIds: ['sec_ingest', 'sec_prepare', 'sec_output'],
        isReviewPass: false,
      } as any,
    }));
  });

  it('renders the notebook stage checklist above raw debug text', () => {
    render(
      <MantineProvider>
        <AIChatSidebar />
      </MantineProvider>,
    );

    expect(screen.getByText('Finding the workflow stages')).toBeInTheDocument();
    expect(screen.getByText((content) => content.includes('3 stages'))).toBeInTheDocument();
    expect(screen.getByText('Load inputs')).toBeInTheDocument();
    expect(screen.getByText('Prepare materials')).toBeInTheDocument();
    expect(screen.getByText('Generate outputs')).toBeInTheDocument();
    expect(screen.getByText('Separated export logic into its own stage.')).toBeInTheDocument();
    expect(screen.getByText('{"debug":"raw"}')).toBeInTheDocument();
  });
});
