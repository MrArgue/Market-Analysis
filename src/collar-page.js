export const collarPage = String.raw`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Signature Plus | Collar Simulator</title>
<style>
:root{font-family:Inter,ui-sans-serif,system-ui,-apple-system,Segoe UI,sans-serif;color:#202a32;background:#f7f8fa;font-variant-numeric:tabular-nums}
*{box-sizing:border-box}body{margin:0}.top{background:#15232c;color:#fff;padding:17px max(18px,calc((100vw - 1240px)/2));display:flex;justify-content:space-between;align-items:center;gap:10px}
.brand{font-size:19px;font-weight:750;letter-spacing:.04em}.brand span{color:#dab76d}.tag{background:#394755;border-radius:16px;padding:6px 10px;font-size:11px;letter-spacing:.08em}
main{max-width:1240px;margin:0 auto;padding:25px 18px 60px}.eyebrow{font-size:11px;letter-spacing:.12em;font-weight:800;color:#92713b;text-transform:uppercase}
h1{font-size:clamp(24px,3vw,36px);margin:9px 0 8px}p{color:#687780;line-height:1.5;margin:0 0 22px}.layout{display:grid;grid-template-columns:340px minmax(0,1fr);gap:17px}
.card{background:#fff;border:1px solid #e1e5e9;border-radius:14px;padding:20px;box-shadow:0 1px 2px #172d3b08}.card h2{font-size:15px;margin:0 0 18px}.field{margin:0 0 16px}label{font-size:12px;color:#53616b;font-weight:700;display:block;margin-bottom:7px}
input,select{width:100%;padding:11px 12px;border:1px solid #d1d8dc;border-radius:8px;background:#fff;color:#202a32;font-size:15px}
.inline{display:grid;grid-template-columns:1fr 1fr;gap:12px}.divider{border:0;border-top:1px solid #e8ebed;margin:18px 0}
.side-note{font-size:12px;line-height:1.55;color:#677781;background:#f4f6f8;border-radius:9px;padding:12px}
.metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-bottom:16px}
.metric{background:white;border:1px solid #e1e5e9;border-radius:12px;padding:16px}.metric small{display:block;color:#64727e;font-size:11px;font-weight:700;margin-bottom:8px}.metric strong{font-size:21px}.metric em{display:block;font-style:normal;color:#77848c;font-size:11px;margin-top:6px}
.chart{width:100%;height:auto;display:block}.chart text{font-size:11px;fill:#788590}.legend{display:flex;gap:20px;flex-wrap:wrap;font-size:12px;color:#60717b;margin:8px 0 16px}.sw{display:inline-block;width:19px;height:3px;vertical-align:middle;margin-right:7px;background:#b58b45}.sw.stock{background:#aab4bc}
.status{margin-top:13px;font-size:12px;border-radius:8px;background:#f4f6f8;padding:12px;color:#53616b}table{width:100%;border-collapse:collapse;font-size:12px}th,td{padding:11px 8px;text-align:right;border-bottom:1px solid #eef0f1;white-space:nowrap}th:first-child,td:first-child{text-align:left}th{color:#65747c;font-weight:700}tbody tr:hover{background:#fafbfb}.scroll{overflow-x:auto}
.chip{display:inline-block;padding:5px 8px;background:#edf2f1;color:#257258;border-radius:6px;font-size:11px;font-weight:750}
button{border:1px solid #d3d8dc;border-radius:8px;background:#fff;padding:10px 14px;cursor:pointer;font-weight:750;color:#2b3e48}button.primary{background:#ad884c;border-color:#ad884c;color:#fff}button:disabled{opacity:.5;cursor:default}
.controls{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.muted{color:#788590;font-size:12px}.error{color:#ad493f}
@media(max-width:900px){.layout{grid-template-columns:1fr}.metrics{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(max-width:470px){.card{padding:14px}.metrics{gap:8px}.metric{padding:11px}.metric strong{font-size:18px}.inline{gap:8px}.top{padding:15px 17px}.tag{font-size:9px}}
</style></head>
<body><header class="top"><div class="brand">SIGNATURE <span>PLUS</span></div><span class="tag">SIMULATED DATA · PROTOTYPE</span></header>
<main><div class="eyebrow">Protection / Research demonstration</div><h1>Zero-Cost Collar Simulator</h1><p>Explore the economics of hedging a concentrated stock position. All option quotes are synthetic and must not be used for trading or client proposals.</p>
<div class="layout"><aside class="card"><h2>Position &amp; contract settings</h2>
<div class="inline"><div class="field"><label for="ticker">Symbol</label><input id="ticker" value="AAPL" readonly></div><div class="field"><label for="stock">Stock price ($)</label><input type="number" min="1" max="5000" step=".01" id="stock" value="268"></div></div>
<div class="inline"><div class="field"><label for="shares">Shares owned</label><input type="number" min="100" step="100" id="shares" value="20000"></div><div class="field"><label for="days">Days to expiration</label><select id="days"><option value="90">90 days</option><option value="180">180 days</option><option selected value="365">365 days</option><option value="540">540 days</option></select></div></div>
<hr class="divider"><h2>Collar construction</h2>
<div class="field"><label for="put">Protective put strike</label><select id="put"></select></div>
<div class="field"><label for="call">Covered call strike</label><select id="call"></select></div>
<div class="field"><label for="method">Quote assumption</label><select id="method"><option value="conservative">Buy ask / sell bid</option><option value="mid">Midpoint of bid/ask</option></select></div>
<div class="controls"><button class="primary" id="auto">Find near-zero-cost collar</button><button id="reset">Reset</button></div>
<div class="status" id="selection"></div><hr class="divider">
<div class="side-note"><strong>Mock data methodology.</strong> Synthetic, Black-Scholes-style premiums with a fixed 30% annual volatility, 4% annual rate, 0.5% dividend yield, and an illustrative bid/ask spread. A simplified European pricing model is used even though AAPL listed options are generally American style. Quotes are not executable. Whole standard 100-share contracts only.</div></aside>
<section><div class="metrics">
<div class="metric"><small>Stock position</small><strong id="position">—</strong><em id="contracts">—</em></div>
<div class="metric"><small>Net option premium</small><strong id="premium">—</strong><em id="coststate">—</em></div>
<div class="metric"><small>Expiration floor</small><strong id="floor">—</strong><em id="floorpct">—</em></div>
<div class="metric"><small>Expiration cap</small><strong id="cap">—</strong><em id="cappct">—</em></div>
</div>
<div class="card" style="margin-bottom:16px"><div class="controls" style="justify-content:space-between"><h2 style="margin:0">Position value at expiration</h2><span class="chip">100% shares hedged</span></div>
<svg id="payoff" class="chart" viewBox="0 0 720 320" role="img" aria-label="Expiration values for unhedged AAPL stock and collar"></svg>
<div class="legend"><span><i class="sw"></i>Collared position</span><span><i class="sw stock"></i>Unhedged stock</span></div>
<div class="muted">Payoff includes the initial net option premium; does not include commissions, taxes, or changes before expiration.</div></div>
<div class="card"><div class="controls" style="justify-content:space-between;margin-bottom:10px"><h2 style="margin:0">Expiration scenarios</h2><span class="muted">Stock prices vs. today's reference</span></div><div class="scroll"><table><thead><tr><th>Stock return</th><th>Stock price</th><th>Unhedged value</th><th>Collar value</th><th>Difference</th></tr></thead><tbody id="scenario"></tbody></table></div></div>
<div class="card" style="margin-top:16px"><h2>Option legs</h2><div class="scroll"><table><thead><tr><th>Leg</th><th>Strike</th><th>Bid</th><th>Ask</th><th>Assumed fill</th><th>Cash flow</th></tr></thead><tbody id="legs"></tbody></table></div></div>
</section></div></main><script src="/collar.js"></script></body></html>`;
