import { useRef, useState, type ChangeEvent } from 'react';
import { useEditorStore } from '../../state/editorStore';
import { importSpreadsheet, exportXmile } from '../../lib/api';
import { blankModel } from '../../lib/sampleModels';
import {
  listSavedModels,
  loadModelFromStorage,
  deleteModelFromStorage,
  setActiveModelId,
} from '../../lib/modelStorage';
import type { ModelDocument } from '../../types/model';

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export function ImportExportControls({
  mode = 'inline',
  onActionComplete,
}: {
  mode?: 'inline' | 'menu';
  onActionComplete?: () => void;
}) {
  const model = useEditorStore((s) => s.model);
  const loadModel = useEditorStore((s) => s.loadModel);
  const jsonInputRef = useRef<HTMLInputElement | null>(null);
  const spreadsheetInputRef = useRef<HTMLInputElement | null>(null);
  const [showSaved, setShowSaved] = useState(false);

  const onExportJson = () => {
    const blob = new Blob([JSON.stringify(model, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${model.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
    onActionComplete?.();
  };

  const onImportJson = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const parsed = JSON.parse(text) as ModelDocument;
    loadModel(parsed);
    setActiveModelId(parsed.id);
    e.target.value = '';
    onActionComplete?.();
  };

  const onImportSpreadsheet = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const result = await importSpreadsheet(file);
      if (result.ok && result.model) {
        loadModel(result.model as ModelDocument);
      }
    } catch (err) {
      const msg = err && typeof err === 'object' && 'errors' in err
        ? (err as { errors: { message: string }[] }).errors?.[0]?.message
        : 'Import failed';
      window.alert(msg);
    }
    e.target.value = '';
    onActionComplete?.();
  };

  const onExportXmile = async () => {
    try {
      const result = await exportXmile(model);
      if (result.ok && result.xml) {
        const blob = new Blob([result.xml], { type: 'application/xml' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${model.id}.xmile`;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch (err) {
      const msg = err && typeof err === 'object' && 'errors' in err
        ? (err as { errors: { message: string }[] }).errors?.[0]?.message
        : 'Export failed';
      window.alert(msg);
    }
    onActionComplete?.();
  };

  const onNewModel = () => {
    loadModel(blankModel);
    onActionComplete?.();
  };

  const onLoadSaved = (id: string) => {
    const saved = loadModelFromStorage(id);
    if (saved) {
      loadModel(saved);
      setActiveModelId(id);
    }
    setShowSaved(false);
    onActionComplete?.();
  };

  const onDeleteSaved = (id: string, name: string) => {
    if (!window.confirm(`Delete "${name}"?`)) return;
    deleteModelFromStorage(id);
    setShowSaved((prev) => prev); // force re-render
  };

  if (mode === 'menu') {
    const savedModels = showSaved ? listSavedModels() : [];
    return (
      <div className="hamburger-menu-actions">
        <button type="button" onClick={onNewModel}>New Model</button>
        <button type="button" onClick={() => setShowSaved(!showSaved)}>
          {showSaved ? 'Hide Saved Models' : 'Saved Models'}
        </button>
        {showSaved && (
          <div className="saved-models-list">
            {savedModels.length === 0 && (
              <span className="saved-models-empty">No saved models</span>
            )}
            {savedModels.map((entry) => (
              <div
                key={entry.id}
                className={`saved-model-item${entry.id === model.id ? ' active' : ''}`}
              >
                <button
                  type="button"
                  className="saved-model-load"
                  onClick={() => onLoadSaved(entry.id)}
                >
                  <span className="saved-model-name">{entry.name}</span>
                  <span className="saved-model-time">{timeAgo(entry.updatedAt)}</span>
                </button>
                <button
                  type="button"
                  className="saved-model-delete"
                  onClick={() => onDeleteSaved(entry.id, entry.name)}
                  title="Delete"
                >
                  &times;
                </button>
              </div>
            ))}
          </div>
        )}
        <hr />
        <button type="button" onClick={onExportJson}>Export JSON</button>
        <button type="button" onClick={onExportXmile}>Export XMILE</button>
        <button type="button" onClick={() => jsonInputRef.current?.click()}>Import JSON</button>
        <button type="button" onClick={() => spreadsheetInputRef.current?.click()}>Import CSV / Excel</button>
        <input ref={jsonInputRef} type="file" accept="application/json" onChange={onImportJson} hidden />
        <input ref={spreadsheetInputRef} type="file" accept=".csv,.xlsx" onChange={onImportSpreadsheet} hidden />
      </div>
    );
  }

  return (
    <div className="io-controls">
      <button className="ghost-icon-button" onClick={onExportJson}>Export JSON</button>
      <button className="ghost-icon-button" onClick={onExportXmile}>Export XMILE</button>
      <label className="import-button">
        Import JSON
        <input type="file" accept="application/json" onChange={onImportJson} />
      </label>
      <label className="import-button">
        Import CSV / Excel
        <input type="file" accept=".csv,.xlsx" onChange={onImportSpreadsheet} />
      </label>
    </div>
  );
}
