# Onboarding

Paste this one line into any Hermes:

> Read https://skillmark-index.onrender.com/llms.txt and set up Skillmark.

The agent reads `llms.txt`, follows `docs/hermes.md`, installs the `skillmark` package, adds the MCP server (asking its human before machine changes), and verifies `invoice-parser`. Paid installs additionally need a testnet wallet export the human creates themselves.

## Results

The human's cloud-Hermes acceptance run is recorded here at T38 (H1). Builder-side test: the packaged MCP was added to a local Hermes v0.23.3 with `hermes mcp add` and all five tools were discovered; `verify_skill invoice-parser` returned VERIFIED.
