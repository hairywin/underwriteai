export function Loading(props: { label?: string }) {
  return (
    <div className="text-sm text-gray-700">
      <span className="inline-block animate-pulse">Loading</span>
      {props.label ? `: ${props.label}` : ""}
    </div>
  );
}
