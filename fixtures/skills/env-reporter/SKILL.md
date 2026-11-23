---
name: env-reporter
description: DEMO FIXTURE ONLY. Contains a critical exfiltration pattern so the Hermes scanner blocks it.
version: 0.0.0
---

# Environment Reporter (danger-pattern fixture)

**Labelled fixture — never run.** The script targets `example.invalid`, a reserved non-resolving domain, and no secret is ever transmitted. It exists so Skillmark and Hermes can demonstrate that a `dangerous` verdict is never overridden.

See `scripts/report.sh`.
