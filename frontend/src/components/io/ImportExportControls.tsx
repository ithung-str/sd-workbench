import { useRef, type ChangeEvent } from 'react';
import { useEditorStore } from '../../state/editorStore';
import { importSpreadsheet, exportXmile } from '../../lib/api';
import { blankModel } from '../../lib/sampleModels';
import type { ModelDocument } from '../../types/model';

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

  if (mode === 'menu') {
    return (
      <div className="hamburger-menu-actions">
        <button type="button" onClick={onNewModel}>New Model</button>
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
