import { useRef, type ChangeEvent } from 'react';
import { useEditorStore } from '../../state/editorStore';
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
  const importVensim = useEditorStore((s) => s.importVensim);
  const jsonInputRef = useRef<HTMLInputElement | null>(null);
  const vensimInputRef = useRef<HTMLInputElement | null>(null);

  const onExport = () => {
    const blob = new Blob([JSON.stringify(model, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${model.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
    onActionComplete?.();
  };

  const onImport = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const parsed = JSON.parse(text) as ModelDocument;
    loadModel(parsed);
    e.target.value = '';
    onActionComplete?.();
  };

  const onImportVensim = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await importVensim(file);
    e.target.value = '';
    onActionComplete?.();
  };

  if (mode === 'menu') {
    return (
      <div className="hamburger-menu-actions">
        <button type="button" onClick={onExport}>Export JSON</button>
        <button type="button" onClick={() => jsonInputRef.current?.click()}>Import JSON</button>
        <button type="button" onClick={() => vensimInputRef.current?.click()}>Import Vensim</button>
        <input ref={jsonInputRef} type="file" accept="application/json" onChange={onImport} hidden />
        <input ref={vensimInputRef} type="file" accept=".mdl" onChange={onImportVensim} hidden />
      </div>
    );
  }

  return (
    <div className="io-controls">
      <button className="ghost-icon-button" onClick={onExport}>Export JSON</button>
      <label className="import-button">
        Import JSON
        <input type="file" accept="application/json" onChange={onImport} />
      </label>
      <label className="import-button">
        Import Vensim
        <input type="file" accept=".mdl" onChange={onImportVensim} />
      </label>
    </div>
  );
}
