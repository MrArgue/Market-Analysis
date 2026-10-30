# Signature Plus research prototype

The `/collar` route now provides a multi-position proposal studio. Existing `/`, `/sectors`, market APIs and diagnostics retain their existing implementations. No deployment or database migration is required by this branch.

## Supported behavior

- Up to 10 independent positions in native, keyboard-accessible collapsible sections. Collapse preserves all settings; removing a position deletes it. State is in memory only and disappears on reload.
- Protection: descending stock-return scenarios, signed red/green differences, expiry-specific strike dropdowns and keyboard-operable index sliders. Both legs always share the selected expiry; there is no misleading payoff for mismatched expirations. The zero-cost finder retains the selected put and picks the highest affordable call, or the closest available debit.
- Whole standard 100-share contracts. Protection hedges floor(shares/100) contracts per leg, and shows residual unhedged shares. Yield never sells more calls than the owned shares cover.
- Yield: Delta-Targeted Income defaults to 0.20 model delta over the next three synthetic monthly dates. Income-Targeted Overwrite picks the closest achievable initial premium per covered share, reports shortfalls, and allows manual strike edits. Tax-Aware Exit Ladder divides contracts across 2–5 consecutive calendar years. The default December expiry advances the first planned year if this year's expiry has passed. All tranche expiry dates and strikes can be edited.
- Contracts are divided as evenly as possible, with extra contracts allocated to earlier tranches. Each tranche covers **different shares** and is opened at the valuation date. This is not a rolling monthly overwrite of the whole position. Small holdings can have zero-contract tranches. Residual shares are excluded from tranche payoff tables and disclosed separately.
- Each yield tranche has its own expiration payoff; values at different dates are never summed. Initial premium totals may be summed because every tranche is assumed opened at the same valuation date. Ladder labels identify planned expiry years, not guaranteed sale/tax years: early exercise, no assignment or tax rules can change actual results.

## Synthetic data and placeholders

Symbols are editable **labels**, not market-data lookups. The synthetic chain adapter accepts price, valuation date, expiry and option type and returns available strikes. Both selectors and sliders use that chain. A production adapter must additionally fetch actual symbol-specific chains and implement exchange calendars, quote timestamps, settlement conventions and data entitlements.

Monthly dates use the third Friday in UTC, skip dates on/before valuation, and **do not adjust exchange holidays**. Expiries must be distinct, increase after valuation and remain within 3,650 days. Protection uses puts below spot and calls above spot; yield uses calls at/above spot. These are prototype constraints, not the full listed-option universe.

Premiums and delta use a European Black-Scholes-style model with fixed 30% volatility, 4% rate, 0.5% dividend yield and a synthetic spread. Mock delta is not an assignment probability or broker Greek. Prices are not executable. No American exercise, dividends as cash flows, taxes, commissions, liquidity, margin, suitability, tax-lot accounting or future reinvestment is modeled. Premium is not total return.

Diversification, Upside and Borrow are explicitly unavailable placeholders. They retain position inputs but produce no analytics and cannot enter a proposal. They do not silently fall back to Protection.

## PDF assembly and remaining source-deck dependency

The previously uploaded 14-page Signature Plus deck was **not present** in the accessible prior-chat attachments, repository, or workspace during implementation. No replacement explainer text or guessed page mapping is shipped. Exact deck integration remains a review gate for this draft PR.

Build Proposal selects supported positions. Upload the original unencrypted 14-page PDF (maximum 8 MiB), enter the 1-based Protection/Yield explanation page numbers for strategies in use, and confirm that you verified the mapping. The application checks page count, ranges and distinct mappings; it cannot authenticate the deck or determine the semantic content of a page. A reviewer must inspect the original deck and select the right pages. Current mapping supports one explanation page per strategy; multi-page explainers and source-deck common/disclosure pages require a follow-up after reviewing the original.

The downloaded document contains:

1. A research-only cover with model assumptions and source-page mapping.
2. Exactly one unchanged source explanation page for each selected strategy.
3. Each selected position's generated analytics, grouped under its strategy. Protection gets one page; Yield gets a program page and one payoff/chart page per nonzero-contract tranche.

Original source pages keep their content and dimensions; their historical examples may differ from the new analytics. Source pages are not watermarked so the original explanation artwork remains constant. New pages prominently say SYNTHETIC DATA / NOT FOR CLIENT USE OR TRADING. Only selected explanation pages are copied: the full original deck and its other disclosures are **not** automatically included. This is not an approved client proposal. No signatures, PDF/A, accessibility tagging, editable forms or compliance approval workflow is provided. Generated tables round displayed dollars; calculations retain full precision.

The browser posts the PDF and position snapshot to `/api/signature-proposal`; the Worker assembles the result in memory, without application storage or logging of request bodies. The endpoint accepts JSON POST only, rejects explicit foreign origins, caps streamed request size at 12 MiB, validates positions and template size, and returns uncached downloads. Hosting infrastructure policies still apply. There is no new authentication layer, per-user storage or production abuse protection. Large/complex PDFs and many yield tranches can exceed hosting CPU/memory limits: production resource/performance testing is outstanding. Invalid/encrypted PDFs fail closed with a generic error.

## Validation

Install with `npm ci`; run `npm test` and `npm run build` (dry run only). For browser tests, run `npx playwright install chromium`, then `npm run test:e2e`. On systems with an existing Chromium browser, set `PLAYWRIGHT_EXECUTABLE_PATH` to its executable. Playwright starts a local Worker automatically; no remote deployment is performed.

Unit coverage includes parity/Greek bounds, contract multipliers and residuals, descending scenarios, signed differences, expiry changes, year rollover, tax-year uniqueness, shortfall handling, manual strikes, small holdings, invalid inputs, template page selection and request rejection. A bundled-model regression test guards serialization against build-generated helper references.

The browser test uses a **clearly labeled, generated test fixture**, not the missing Signature Plus source deck. It exercises 390px mobile controls and horizontal table containment, independent positions, collapse/reopen, keyboard slider snapping, all presets, unsupported strategy exclusion and a real local-Worker PDF download, plus a 1440px desktop snapshot. This is Chromium mobile viewport testing, not physical iPhone/Safari validation. Existing research route tests remain part of the full suite.

Before merge: supply and inspect the original deck, confirm source page mappings/disclosures, review generated PDFs against it, and run intended-host performance checks. Before any client use: replace synthetic data and complete financial, tax, compliance and security review.
