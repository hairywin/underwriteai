export function Banner(props: { kind: "info" | "warn" | "error"; children: React.ReactNode }) {
  const cls =
    props.kind === "info"
      ? "bg-blue-50 border-blue-200 text-blue-900"
      : props.kind === "warn"
      ? "bg-yellow-50 border-yellow-200 text-yellow-900"
      : "bg-red-50 border-red-200 text-red-900";

  return <div className={"border rounded p-3 text-sm " + cls}>{props.children}</div>;
}
