import type { ReactNode } from 'react';

/** Few choices, all visible. One tap instead of opening a select. */
export function RadioChips<Value extends string>({
  legend,
  name,
  value,
  options,
  onChange,
}: {
  legend: ReactNode;
  name: string;
  value: Value;
  options: readonly { value: Value; label: string }[];
  onChange: (value: Value) => void;
}) {
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-semibold">{legend}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <label
            key={option.value}
            className="relative flex h-10 min-w-12 cursor-pointer items-center justify-center rounded-md border border-foreground/20 bg-card px-3 text-sm font-semibold hover:bg-accent has-checked:border-ink has-checked:bg-ink has-checked:text-ink-foreground has-focus-visible:ring-[3px] has-focus-visible:ring-ring/50 pointer-coarse:h-11 dark:has-checked:border-primary dark:has-checked:bg-primary dark:has-checked:text-primary-foreground"
          >
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
              className="absolute inset-0 cursor-pointer opacity-0"
            />
            {option.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
