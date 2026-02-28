export function TextNodeView({ data }: { data: { text: string } }) {
  return (
    <div className="rf-node rf-node-text">
      <div className="rf-text-content">{data.text || 'Note'}</div>
    </div>
  );
}
