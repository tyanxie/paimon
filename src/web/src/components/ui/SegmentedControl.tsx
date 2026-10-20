import { Button } from "./Button";

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div className="ui-segmented select-none" role="group" aria-label={label}>
      {options.map((option) => (
        <Button
          key={option.value}
          aria-pressed={value === option.value}
          className="ui-segment"
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </Button>
      ))}
    </div>
  );
}
