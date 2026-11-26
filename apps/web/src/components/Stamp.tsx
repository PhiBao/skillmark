import { CheckIcon } from "./Mark.tsx";

export type StampStatus =
  | "verified"
  | "revoked"
  | "tampered"
  | "unsigned"
  | "unknown-key"
  | "registry-mismatch"
  | "unreachable"
  | "dangerous"
  | "checking";

const LABELS: Record<StampStatus, string> = {
  verified: "Verified",
  revoked: "Revoked",
  tampered: "Tampered",
  unsigned: "Unsigned",
  "unknown-key": "Unknown key",
  "registry-mismatch": "Registry mismatch",
  unreachable: "Unreachable",
  dangerous: "Dangerous",
  checking: "Checking",
};

const ICONS: Record<StampStatus, "ok" | "fail" | "unknown"> = {
  verified: "ok",
  revoked: "fail",
  tampered: "fail",
  unsigned: "unknown",
  "unknown-key": "unknown",
  "registry-mismatch": "unknown",
  unreachable: "unknown",
  dangerous: "fail",
  checking: "unknown",
};

export function Stamp({ status }: { status: StampStatus }) {
  const tone =
    status === "registry-mismatch" ? "mismatch" : status === "dangerous" ? "revoked" : status;
  return (
    <span className={`stamp stamp--${tone}`} role="status">
      <CheckIcon kind={ICONS[status]} />
      {LABELS[status]}
    </span>
  );
}
