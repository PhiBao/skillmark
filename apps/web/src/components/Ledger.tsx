import { CheckIcon } from "./Mark.tsx";

export interface LedgerLine {
  label: string;
  value: string;
  check: "ok" | "fail" | "unknown";
  detail?: string;
  link?: string;
}

const WORDS = { ok: "confirmed", fail: "failed", unknown: "not checked" } as const;

export function Ledger({ lines }: { lines: LedgerLine[] }) {
  return (
    <ol className="ledger" aria-label="Provenance ledger">
      {lines.map((line) => (
        <li className="ledger-row resolve" key={line.label}>
          <span className="ledger-label">{line.label}</span>
          <span
            className={`ledger-value${line.label === "Key owner" || line.label === "Agent badge" ? " ledger-value--body" : ""}`}
          >
            {line.link ? (
              <a href={line.link} rel="noreferrer">
                {line.value}
              </a>
            ) : (
              line.value
            )}
            {line.detail ? <span className="ledger-detail">{line.detail}</span> : null}
          </span>
          <span className={`ledger-check ledger-check--${line.check}`}>
            <CheckIcon kind={line.check} />
            <span className="sr-only">check: </span>
            {WORDS[line.check]}
          </span>
        </li>
      ))}
    </ol>
  );
}
