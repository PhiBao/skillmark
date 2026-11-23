/** The hallmark mark: a ruled square with a lowercase s over a baseline tick. */
export function Mark({ size = 18 }: { size?: number }) {
  return (
    <svg
      className="wordmark-mark"
      width={size}
      height={size}
      viewBox="0 0 18 18"
      role="img"
      aria-label="Skillmark hallmark"
    >
      <rect
        x="0.75"
        y="0.75"
        width="16.5"
        height="16.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path
        d="M5 12.5c.8 1 2 1.6 3.4 1.6 1.9 0 3.1-1 3.1-2.3 0-1.2-.9-1.8-2.8-2.2-1.6-.4-2.2-.8-2.2-1.5 0-.7.7-1.1 1.7-1.1 1 0 1.9.4 2.6 1"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="square"
      />
      <path d="M4 15.5h10" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

export function CheckIcon({ kind }: { kind: "ok" | "fail" | "unknown" }) {
  if (kind === "ok") {
    return (
      <svg viewBox="0 0 14 14" aria-hidden="true">
        <path d="M2 7.5 5.5 11 12 3.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
      </svg>
    );
  }
  if (kind === "fail") {
    return (
      <svg viewBox="0 0 14 14" aria-hidden="true">
        <path d="M2.5 2.5l9 9M11.5 2.5l-9 9" fill="none" stroke="currentColor" strokeWidth="1.8" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 14 14" aria-hidden="true">
      <path d="M2.5 7h9" fill="none" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}
