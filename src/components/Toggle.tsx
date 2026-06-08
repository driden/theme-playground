type ToggleOption<T extends string> = { value: T; label: string };

type Props<T extends string> = {
  options: readonly ToggleOption<T>[];
  value: T;
  onChange: (value: T) => void;
};

// A small segmented control: one button per option, the selected one marked
// `active`. Generic over the option value so callers keep their own typed union.
export function Toggle<T extends string>({ options, value, onChange }: Props<T>) {
  return (
    <span className="toggle">
      {options.map(option => (
        <button
          key={option.value}
          type="button"
          className={value === option.value ? "active" : ""}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </span>
  );
}
