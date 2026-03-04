export function Field(props: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <label className="block">
      <div className="text-sm font-medium">{props.label}</div>
      <div className="mt-1">{props.children}</div>
      {props.hint ? <div className="text-xs text-gray-600 mt-1">{props.hint}</div> : null}
    </label>
  );
}
