# Frontend review — anti-slop, accessibility, browser (T29)

Reviewed 2026-11-23 against the deployed provenance page and home page (`https://skillmark-index.onrender.com`).

## Lighthouse accessibility

- **Score: 100** on `/s/invoice-parser/1.0.0` (Chrome headless, Lighthouse 12).
- JSON: `docs/screens/lighthouse-a11y.json`. No failing accessibility audits.

## Keyboard path

Tested with real Tab presses in Chrome on the provenance page:

1. Wordmark → 2. Limits → 3. Key owner (CCDExplorer) → 4. Key status (CCDExplorer) → 5. Repository → 6. Publisher account → browser chrome.

Every stop is an anchor, reachable without a mouse, with a visible `2px solid var(--assay)` focus ring. No focus traps; no interactive element is hidden from the tab order.

## Reduced motion

With `prefers-reduced-motion: reduce` emulated, `.resolve` computes `animation-name: none` (the 150 ms line-resolve transition is disabled). The page is fully readable with motion off.

## Responsive widths

Captured at **390 / 768 / 1024 / 1440** (see `docs/screens/`). Single 720 px document column, 4 px spacing scale, no horizontal page scroll. The verify command wraps rather than overflowing at 390. Ledger collapses to a single column below 768.

## DESIGN.md anti-slop checklist

- No gradients, glassmorphism, shield/lock/sparkle icons, emoji status, KPI cards, dark-mode-by-default crypto styling. **Pass.**
- No “secure”, “trustless”, “military-grade”, “AI-powered” copy. **Pass** (source grep clean).
- Every visible claim links to something checkable: ClawHavoc source, CCDExplorer account/transactions, CIS-8/CIS-8004 contracts, GitHub repo. **Pass.**
- Status never colour alone: every stamp pairs colour with an icon and a word. **Pass.**
- D16 limits sentence appears on the provenance page and the home page. **Pass.**
- Touch targets: header, footer and listing links are at least 44 px tall. Inline prose links use the WCAG inline exception. **Pass.**
- Fonts self-hosted (Fraunces/IBM Plex) with OFL licences. **Pass.**
- Motion: one 150 ms resolve, no decorative animation. **Pass.**

## Known cosmetic notes

- At 1440 the document stays 720 px wide by design; the page reads as a small archival sheet, not a dashboard.
- The provenance fixtures (`?fixture=…`) are visibly labelled “Demo fixture — illustrative state, not a live claim.”
