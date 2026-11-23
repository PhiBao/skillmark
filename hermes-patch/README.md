# Hermes patch: `verified` trust tier for community skills

**Status:** PR-ready. Not opened upstream — that requires the human's OK (T25).

## Why

Hermes's Skills Guard currently offers `builtin`, `trusted`, `community` and `agent-created` trust levels. A signed, ID-verified community skill is indistinguishable from an anonymous one, so it inherits `community` policy (`safe` allowed, `caution` blocked, `dangerous` blocked). Skillmark needs a way for a publisher's verified signature to earn a distinct tier **without** weakening the scanner.

This patch implements the idea already proposed upstream in **[RFC: pluggable publisher verification as a trust tier for community skills](https://github.com/NousResearch/hermes-agent/issues/40555)** — including the requested `("allow", "allow", "block")` policy and a pluggable verifier, off by default.

## What changes

`tools/skills_guard.py` only:

1. `INSTALL_POLICY["verified"] = ("allow", "allow", "block")`.
2. `hard_block` includes `"verified"` — a `dangerous` verdict can **never** be overridden with `--force`, exactly as for `community`/`trusted`.
3. A pluggable verifier hook (`SKILLMARK_VERIFIER`) and `skillmark_verify_json(path, binary="skillmark")` which returns true only when `skillmark verify <path> --json` reports `result: "verified"`.
4. `maybe_promote_to_verified(result, skill_path)` promotes a `community` scan result to `verified` only when the verifier agrees. With no verifier configured, behaviour is unchanged.

No other Hermes file is touched. The scanner verdict itself is never modified or bypassed.

## Apply and test

```bash
# From a clean Hermes checkout at the dev target (v0.23.3):
git apply /path/to/concordium/hermes-patch/verified_tier.patch
python -m pytest /path/to/concordium/hermes-patch/test_verified_tier.py -q
```

The test applies the patch to a fresh copy of `tools/skills_guard.py`, then asserts:

- the new policy is `("allow", "allow", "block")`;
- `safe` and `caution` are allowed for `verified`;
- `dangerous` is blocked even with `force=True`;
- the verifier promotes only on a positive result, and promotion never unblocks `dangerous`;
- the JSON verifier parses `skillmark verify --json` output.

`HERMES_SOURCE` can point at a different clean checkout. Verified locally on 2026-11-23 against Hermes v0.23.3 (`5 passed`).

## Proposed PR text

> Add an opt-in `verified` trust tier for community skills, as discussed in #40555. A publisher can register an external signing key in Concordium CIS-8; an off-chain verifier (`skillmark verify --json`) confirms the skill contents were signed by that key. The new tier uses `("allow", "allow", "block")`: caution verdicts are allowed, dangerous verdicts remain hard-blocked even with `--force`. The verifier is pluggable and off by default, so existing installs are unaffected. Tests cover the policy, the hard block and the verifier hook.

## Honest limits

- "Verified" means an ID-backed human's key signed the exact contents. It does **not** mean the skill is safe — the scanner still decides, and `dangerous` still wins (D16).
- On Concordium testnet, identities are test identities, not real KYC.
- The patch is against v0.23.3, the local dev target pinned in T04. Rebase before upstreaming.
