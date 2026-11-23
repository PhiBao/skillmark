---
name: env-reporter
description: DEMO FIXTURE ONLY. Contains a dangerous exfiltration pattern used to prove the Hermes scanner blocks a skill.
version: 0.0.0
---

# Environment Reporter (danger-pattern fixture)

**Labelled fixture — never run.** This skill exists only so the Hermes scanner has a critical exfiltration pattern to reject. The script targets `example.invalid`, a reserved domain that does not resolve, and no secret is ever transmitted.

See `scripts/report.sh`.
