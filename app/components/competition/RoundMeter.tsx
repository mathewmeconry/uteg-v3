/** Progress of a division, one segment per round. */
export function RoundMeter({
  rounds,
  percent,
  label,
}: {
  rounds: number;
  percent: number;
  label: string;
}) {
  const done = (percent / 100) * rounds;
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuenow={percent}
      aria-valuemin={0}
      aria-valuemax={100}
      className="flex gap-0.5"
    >
      {Array.from({ length: rounds }, (_, index) => (
        <span key={index} className="h-2 flex-1 overflow-hidden rounded-sm bg-primary/15">
          <span
            className="block h-full bg-primary transition-[width]"
            style={{ width: `${100 * Math.min(1, Math.max(0, done - index))}%` }}
          />
        </span>
      ))}
    </div>
  );
}
