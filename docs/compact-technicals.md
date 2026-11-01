# Compact Technicals view

Both Returns and Technicals use a balanced, two-table desktop layout, preserving sector boundaries. Below 1,400px the tables stack and each has bounded scrolling; desktop headings stick to the page top. Sector disclosure buttons hide/show all associated industries and stocks, independently of industry disclosure state. Collapse state survives refreshes and view changes, and resets when changing universe. No additional data calls occur when expanding/collapsing or switching views.

Technicals displays seven data columns: average score (no /6 suffix), ratio percentile, above 50/200-day averages, advancing/declining, and 20/63/252-session closing highs/lows. Paired values are whole percentages in the labeled order. A stock flag displays 100% or 0%; missing halves display `-` independently. Each half keeps its own valid-company denominator, available on hover. Score remains two decimal places; percentile is displayed to one decimal place.

Group percentiles average valid share-class percentiles within each company, then average company votes directly. Sector/universe values are not averages of industry averages, and are not percentiles of a sector/sector ratio. A stock's denominator remains its sector ETF, with existing minimum warmup, preceding-observation lookback and tie rules unchanged. The backend retains existing strong/weak and overbought/oversold fields for compatibility; the compact view hides those columns.

Existing saved reports gain aggregate percentiles after their next normal refresh. No historical rebuild, extra provider endpoint, schema, secrets or Access changes are required.
