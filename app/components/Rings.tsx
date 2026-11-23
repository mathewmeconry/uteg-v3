/** The rings of the mark, hanging from the top edge of an ink surface. */
export function Rings({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 200 320"
      preserveAspectRatio="xMidYMin meet"
      className={className}
    >
      <g fill="none" strokeLinecap="round">
        <path d="M45 0v232M155 0v232" strokeWidth="5" className="stroke-ink-accent" />
        <path d="M45 214v20M155 214v20" strokeWidth="9" className="stroke-brand" />
        <circle cx="45" cy="274" r="36" strokeWidth="10" className="stroke-brand" />
        <circle cx="155" cy="274" r="36" strokeWidth="10" className="stroke-brand" />
      </g>
    </svg>
  );
}
