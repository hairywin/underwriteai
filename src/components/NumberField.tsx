import { Field } from "./Field";

export function NumberField(props: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
  max?: number;
  hint?: string;
}) {
  return (
    <Field label={props.label} hint={props.hint}>
      <input
        type="number"
        className="w-full border rounded px-2 py-1"
        value={Number.isFinite(props.value) ? props.value : 0}
        step={props.step ?? 0.01}
        min={props.min}
        max={props.max}
        onChange={(e) => props.onChange(Number(e.target.value))}
      />
    </Field>
  );
}
