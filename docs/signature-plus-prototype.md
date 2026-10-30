# Signature Plus research prototype

The `/collar` route now provides a multi-position proposal studio. Existing `/`, `/sectors`, market APIs and diagnostics retain their existing implementations. No deployment or database migration is required by this branch.

## Supported behavior

- SEIA parchment (#f0ead5), charcoal (#1f2b2f), gold (#ded2ab), and high-contrast table headers are used. Each expanded stock uses a 340px left input panel and right analytics area on desktop; mobile stacks inputs above analytics. Valuation always uses the browser's current local calendar date, shown with a date/time/timezone stamp at the top instead of an editable field. The date refreshes on interaction, tab focus/visibility and each minute; past expiries roll to future preset dates at midnight. Strike sliders display the selected dollar strike and percentage versus the reference stock price and use the original gold accent.
- Up to 10 independent positions in native, keyboard-accessible collapsible sections. Collapse preserves all settings; removing a position deletes it. State is in memory only and disappears on reload.
- Protection: descending stock-return scenarios, signed red/green differences, expiry-specific strike dropdowns and keyboard-operable index sliders. Both legs always share the selected expiry; there is no misleading payoff for mismatched expirations. The zero-cost finder retains the selected put and picks the highest affordable call, or the closest available debit.
- Whole standard 100-share contracts. Protection hedges floor(shares/100) contracts per leg, and shows residual unhedged shares. Yield never sells more calls than the owned shares cover.
- Yield: Delta-Targeted Income defaults to 0.20 model delta over the next three synthetic monthly dates. Income-Targeted Overwrite picks the closest achievable initial premium per covered share, reports shortfalls, and allows manual strike edits. Tax-Aware Exit Ladder divides contracts across 2–5 consecutive calendar years. The default December expiry advances the first planned year if this year's expiry has passed. All tranche expiry dates and strikes can be edited.
- Contracts are divided as evenly as possible, with extra contracts allocated to earlier tranches. Each tranche covers **different shares** and is opened at the valuation date. This is not a rolling monthly overwrite of the whole position. Small holdings can have zero-contract tranches. Residual shares are excluded from tranche payoff tables and disclosed separately.
- Each yield tranche has its own expiration payoff; values at different dates are never summed. Initial premium totals may be summed because every tranche is assumed opened at the same valuation date. Ladder labels identify planned expiry years, not guaranteed sale/tax years: early exercise, no assignment or tax rules can change actual results.

## Synthetic data and placeholders

Symbols are editable **labels**, not market-data lookups. The synthetic chain adapter accepts price, valuation date, expiry and option type and returns available strikes. Both selectors and sliders use that chain. Expiration dropdowns (Protection and Yield) use the shared symbol/calendar adapter: the next 60 synthetic monthly expirations, each labeled with its date and whole calendar days from today. No calendar/date inputs remain, and model validation rejects unavailable expiries. A production adapter must additionally fetch actual symbol-specific chains and implement exchange calendars, quote timestamps, settlement conventions and data entitlements.

Monthly dates use the third Friday in UTC, skip dates on/before valuation, and **do not adjust exchange holidays**. Expiries must be distinct, increase after valuation and remain within 3,650 days. Protection uses puts below spot and calls above spot; yield uses calls at/above spot. These are prototype constraints, not the full listed-option universe.

Premiums and delta use a European Black-Scholes-style model with fixed 30% volatility, 4% rate, 0.5% dividend yield and a synthetic spread. Mock delta is not an assignment probability or broker Greek. Prices are not executable. No American exercise, dividends as cash flows, taxes, commissions, liquidity, margin, suitability, tax-lot accounting or future reinvestment is modeled. Premium is not total return.

Diversification, Upside and Borrow are explicitly unavailable placeholders. They retain position inputs but produce no analytics and cannot enter a proposal. They do not silently fall back to Protection.

## Production scope

At the user's request, PDF output is postponed. The Build Proposal button is disabled and the proposal HTTP endpoint returns 503 without parsing uploads. The PDF implementation remains available for future development and unit tests, but is excluded from the deployed Worker import graph. Production testing focuses on multiple positions, Protection controls and covered-call Yield presets.

## Deferred: verified source deck and PDF assembly

The supplied SEIA Signature Plus Marketing Deck was visually reviewed in full on October 30, 2026. It is a 14-page, unencrypted PDF with 1008 x 612 point pages. Its reviewed SHA-256 fingerprint is recorded in the shared model. This fingerprint identifies one exact file/version, not an assertion of future compliance approval.

The deck is marked proprietary/confidential and the repository is public. **Do not commit the PDF, extracted artwork, rendered source pages, or assembled proposals.** No deck bytes are shipped in the app or repository. The user must upload the original file for each browser session. Browser and server verify its fingerprint; different/re-exported versions fail closed. A reviewed replacement requires updating the fingerprint, page map and validation. User-supplied page mappings and digest fields cannot change HTTP assembly behavior. Fixture tests inject a digest only as an internal function argument, which the endpoint never obtains from request data.

Verified source map (1-based):

| Page | Role | Assembly behavior |
| --- | --- | --- |
| 1 | Original cover | Retained after research-only cover |
| 2 | All-solution overview | Omitted to avoid presenting unused solutions |
| 3 | Protection explanation | Included once only when Protection is selected |
| 4 | Protection sample analytics | Replaced by generated position analytics |
| 5–8 | Diversification / Upside explanations and samples | Omitted; unsupported |
| 9 | Yield explanation | Included once only when Yield is selected |
| 10 | Yield sample analytics | Replaced by generated position/tranche analytics |
| 11–12 | Borrow explanation and sample | Omitted; unsupported |
| 13 | Definitions | Always retained at end |
| 14 | Disclosures | Always retained last |

Build Proposal selects supported positions and automatically assembles: research-only cover; original cover; selected strategy explanation then its position analytics; definitions; disclosures. Protection gets one custom page. Yield gets a program page and one chart/scenario page per nonzero-contract tranche. Each explanation appears once even for multiple positions using that strategy. A single Protection position produces 6 pages; a three-tranche Yield position produces 9; one of each produces 11. All pages use the source 1008 x 612 point size. Source pages preserve content/dimensions unchanged and were checked by decoded PDF content streams and identical rendered PNG hashes. Source page numbers remain original; new analytics retain research-only disclaimers. Source definitions/disclosures mention other strategies as part of constant general material; their unchanged content is not a claim those strategies are implemented.

Generated tables round total dollars, show per-share fills to cents and retain full calculation precision. There are no signatures, PDF/A, accessibility tags, editable forms or compliance approval workflow. Preserved source pages are not watermarked. This remains a synthetic research demonstration, not an approved client proposal.

The browser posts the source PDF and selected position snapshot to /api/signature-proposal. The Worker verifies the file and assembles the result in memory, without application storage or logging of request bodies. Upload is limited to 8 MiB; streamed JSON is capped at 12 MiB. The endpoint accepts JSON POST only, rejects explicit foreign origins, validates positions, and returns uncached downloads. Hosting policies still apply. There is no new authentication, per-user storage or production abuse protection. The real 6.8 MB source succeeded through the local Worker/browser download; production-host CPU/memory/load validation remains outstanding. The larger real file also exposed and resolved a repetitive-base64-regex stack overflow missed by the small fixture.

## Validation

Install with `npm ci`; run `npm test` and `npm run build` (dry run only). For browser tests, run `npx playwright install chromium`, then `npm run test:e2e`. On systems with an existing Chromium browser, set `PLAYWRIGHT_EXECUTABLE_PATH` to its executable. Playwright starts a local Worker automatically; no remote deployment is performed.

Unit coverage includes parity/Greek bounds, contract multipliers and residuals, descending scenarios, signed differences, expiry changes, year rollover, tax-year uniqueness, shortfall handling, manual strikes, small holdings, invalid inputs, template page selection and request rejection. A bundled-model regression test guards serialization against build-generated helper references.

The default browser test verifies a clearly labeled synthetic substitute is rejected. Set SIGNATURE_DECK_PATH to a local copy of the reviewed original to also exercise the real download. The optional source-deck unit integration test uses the same environment variable. Never commit that local file. It exercises 390px mobile controls and horizontal table containment, independent positions, collapse/reopen, keyboard slider snapping, all presets, unsupported strategy exclusion and a real local-Worker PDF download, plus a 1440px desktop snapshot. This is Chromium mobile viewport testing, not physical iPhone/Safari validation. Existing research route tests remain part of the full suite.

Validated locally with the real deck: all 152 unit/route/bundle/PDF tests pass (including the optional source integration), mobile browser test downloads the assembled proposal, build dry run passes, and all pages of an 11-page mixed example were rendered and reviewed. Before merge: complete business/compliance review of source and generated materials and run intended-host performance checks. Before any client use: replace synthetic data and complete financial, tax, compliance and security review.

## SEIA typography and contrast

Reference: https://seia.com/ and its public stylesheet, checked October 30, 2026; matches the tokens documented in CHART_UPDATES.md. Body, labels, controls, metrics and tables use Albert Sans; headings and wordmark use an Optima nova / Optima / Georgia serif stack at regular weight. SEIA's font server omits cross-origin permission, so linking its files did not load in the simulator. Albert Sans now loads from Google Fonts' embeddable static CDN; licensed Optima is used only when installed locally, with a serif fallback otherwise. No proprietary font file is copied or proxied. Only the simulator route's font policy is expanded to fonts.gstatic.com; existing research routes are unchanged.

The table headers use charcoal with parchment text and a gold separator. Alternating warm-white rows, parchment background, light input panels and stronger borders improve separation. Public font unavailability falls back to Arial/body and Georgia/headings; no external font is required for controls or calculations. Browser checks verify Albert Sans loads, the date/day labels, unavailable-expiry rejection, table colors, mobile no-overflow, layout preservation, and invalid-symbol recovery.

## Collar chart axes

The expiration-value chart has dollar-labeled horizontal stock-price and vertical position-value axes, nice-step ticks and light gridlines. Domains cover both selected strikes and both payoff lines, including residual-share behavior. Exact put/call vertices preserve the payoff bends. Share count changes rescale the value axis; stock price/strike changes rescale the price domain as needed. Value ticks abbreviate thousands/millions/billions, and mobile uses fewer ticks with collision checks. Unhedged stock uses a gray dotted line and matching legend; the collar stays solid gold. Rendering responds to viewport size without affecting other positions or calculations.
