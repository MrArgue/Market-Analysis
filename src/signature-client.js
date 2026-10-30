export function signatureClient() {
  "use strict";
  const M = globalThis.SignatureModel,
    $ = (id) => document.getElementById(id),
    states = [];
  const money = (n) =>
      new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 2,
      }).format(n),
    pct = (n) => (n >= 0 ? "+" : "") + (n * 100).toFixed(1) + "%";
  const esc = (s) =>
    String(s).replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
  const today = () => {
    const d = new Date();
    return (
      d.getFullYear() +
      "-" +
      String(d.getMonth() + 1).padStart(2, "0") +
      "-" +
      String(d.getDate()).padStart(2, "0")
    );
  };
  function timestamp() {
    const d = new Date();
    $("valuation-stamp").dateTime = d.toISOString();
    $("valuation-stamp").textContent =
      "As of " +
      new Intl.DateTimeFormat("en-US", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(d) +
      " (" +
      Intl.DateTimeFormat().resolvedOptions().timeZone +
      ")";
  }
  function refreshToday() {
    const date = today();
    for (const s of states) {
      if (s.p.asOf === date) continue;
      s.p.asOf = date;
      if (M.days(date, s.p.expiry) <= 0) s.p.expiry = M.monthly(date, 12)[11];
      if (s.p.expiries.some((e) => M.days(date, e) <= 0)) {
        s.p.expiries = M.presetExpiries(s.p);
        s.p.strikes = [];
      }
      render(s);
    }
    timestamp();
  }
  const supported = (p) => ["protection", "yield"].includes(p.strategy);
  function input(key, label, value, type = "number", attrs = "") {
    return (
      "<div><label>" +
      label +
      '<input data-key="' +
      key +
      '" type="' +
      type +
      '" value="' +
      esc(value) +
      '" ' +
      attrs +
      "></label></div>"
    );
  }
  function select(key, label, values, value) {
    return (
      "<div><label>" +
      label +
      '<select data-key="' +
      key +
      '">' +
      values
        .map(
          ([v, t]) =>
            '<option value="' +
            esc(v) +
            '" ' +
            (String(v) === String(value) ? "selected" : "") +
            ">" +
            esc(t) +
            "</option>",
        )
        .join("") +
      "</select></label></div>"
    );
  }
  function expirationField(p, key, label, value) {
    let expirations;
    try {
      expirations = M.optionExpirations(p.symbol, p.asOf);
    } catch {
      return "";
    }
    return select(
      key,
      label,
      expirations.map((expiry) => [
        expiry,
        new Intl.DateTimeFormat("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
          timeZone: "UTC",
        }).format(new Date(expiry + "T00:00:00Z")) +
          " (" +
          M.days(p.asOf, expiry) +
          " days)",
      ]),
      value,
    );
  }
  function table(head, rows) {
    return (
      '<div class="card table-card"><h2>' +
      (head[0] === "Leg"
        ? "Option legs"
        : head[0] === "Stock return"
          ? "Expiration scenarios"
          : head[0] === "Expiry / planned year"
            ? "Call schedule"
            : "Tranche scenarios") +
      '</h2><div class="scroll"><table><thead><tr>' +
      head.map((h) => "<th>" + h + "</th>").join("") +
      "</tr></thead><tbody>" +
      rows
        .map(
          (r) => "<tr>" + r.map((c) => "<td>" + c + "</td>").join("") + "</tr>",
        )
        .join("") +
      "</tbody></table></div></div>"
    );
  }
  function strikes(p, type, expiry) {
    return M.chain(p.S, p.asOf, expiry).filter(
      (q) =>
        q.type === type && (type === "put" ? q.strike < p.S : q.strike > p.S),
    );
  }
  const strikeText = (p, value) =>
    money(value) + " · " + pct(value / p.S - 1) + " vs. stock";
  function strikeField(p, key, type, expiry, value) {
    const qs = strikes(p, type, expiry),
      idx = qs.findIndex((q) => q.strike === value);
    return (
      '<div class="strike-field">' +
      select(
        key,
        type === "put" ? "Protective put strike" : "Covered call strike",
        qs.map((q) => [q.strike, money(q.strike)]),
        value,
      ) +
      '<label class="slider-label"><span class="sr-only">Adjust ' +
      type +
      ' strike</span><input type="range" data-strike="' +
      key +
      '" min="0" max="' +
      (qs.length - 1) +
      '" step="1" value="' +
      idx +
      '" aria-valuetext="' +
      strikeText(p, value) +
      '"><output data-strike-output="' +
      key +
      '">' +
      strikeText(p, value) +
      "</output></label></div>"
    );
  }
  function sync(p) {
    if (p.strategy === "protection") {
      for (const [key, type, target] of [
        ["put", "put", p.S * 0.88],
        ["call", "call", p.S * 1.3],
      ]) {
        const qs = strikes(p, type, p.expiry);
        p[key] = M.nearest(qs, p[key] || target).strike;
      }
    }
  }
  function plot(p) {
    const compact = window.innerWidth < 600,
      chart = M.collarChart(p, compact ? 3 : 5),
      W = compact ? 400 : 760,
      H = compact ? 320 : 365;
    const left = compact ? 65 : 90,
      right = W - 20,
      top = 30,
      bottom = H - 65;
    const X = (v) =>
        left +
        ((v - chart.x.min) / (chart.x.max - chart.x.min)) * (right - left),
      Y = (v) =>
        bottom -
        ((v - chart.y.min) / (chart.y.max - chart.y.min)) * (bottom - top);
    const axisMoney = (n) => {
      const abs = Math.abs(n),
        scale = abs >= 1e9 ? 1e9 : abs >= 1e6 ? 1e6 : abs >= 1e3 ? 1e3 : 1,
        suffix =
          scale === 1e9 ? "B" : scale === 1e6 ? "M" : scale === 1e3 ? "K" : "";
      return (
        (n < 0 ? "-" : "") +
        "$" +
        (abs / scale).toLocaleString("en-US", { maximumFractionDigits: 2 }) +
        suffix
      );
    };
    let grid = "";
    for (const v of chart.y.ticks) {
      const y = Y(v);
      grid +=
        '<line x1="' +
        left +
        '" x2="' +
        right +
        '" y1="' +
        y +
        '" y2="' +
        y +
        '" stroke="#e6dfc8"/><line x1="' +
        (left - 5) +
        '" x2="' +
        left +
        '" y1="' +
        y +
        '" y2="' +
        y +
        '" stroke="#536064"/><text class="y-tick" x="' +
        (left - 10) +
        '" y="' +
        (y + 4) +
        '" text-anchor="end">' +
        axisMoney(v) +
        "</text>";
    }
    for (const [i, v] of chart.x.ticks.entries()) {
      const x = X(v);
      grid +=
        '<line x1="' +
        x +
        '" x2="' +
        x +
        '" y1="' +
        top +
        '" y2="' +
        bottom +
        '" stroke="#eee9d9"/><line x1="' +
        x +
        '" x2="' +
        x +
        '" y1="' +
        bottom +
        '" y2="' +
        (bottom + 5) +
        '" stroke="#536064"/><text class="x-tick" x="' +
        x +
        '" y="' +
        (bottom + 22) +
        '" text-anchor="' +
        (i === 0
          ? "start"
          : i === chart.x.ticks.length - 1
            ? "end"
            : "middle") +
        '">' +
        "$" +
        v.toLocaleString("en-US", { maximumFractionDigits: 2 }) +
        "</text>";
    }
    const points = (key) =>
      chart.points
        .map((v) => X(v.price).toFixed(2) + "," + Y(v[key]).toFixed(2))
        .join(" ");
    return (
      '<div class="card chart-card"><h2>Position value at expiration</h2><svg class="chart payoff-chart" viewBox="0 0 ' +
      W +
      " " +
      H +
      '" role="img" aria-label="' +
      esc(p.symbol) +
      " stock and collar values at " +
      esc(p.expiry) +
      '"><title>' +
      esc(p.symbol) +
      " at expiration " +
      esc(p.expiry) +
      '</title><g class="chart-grid">' +
      grid +
      '</g><path class="x-axis" d="M' +
      left +
      " " +
      bottom +
      "H" +
      right +
      '" fill="none" stroke="#1f2b2f" stroke-width="1.5"/><path class="y-axis" d="M' +
      left +
      " " +
      top +
      "V" +
      bottom +
      '" fill="none" stroke="#1f2b2f" stroke-width="1.5"/><text class="axis-title" text-anchor="middle" x="' +
      (left + right) / 2 +
      '" y="' +
      (H - 12) +
      '">' +
      esc(p.symbol) +
      ' price at expiration (USD)</text><text class="axis-title" text-anchor="middle" transform="translate(16 ' +
      (top + bottom) / 2 +
      ') rotate(-90)">Position value (USD)</text><polyline class="stock-line" fill="none" stroke="#8c999e" stroke-width="3" stroke-dasharray="1 7" stroke-linecap="round" points="' +
      points("stock") +
      '"/><polyline class="collar-line" fill="none" stroke="#b58b45" stroke-width="3" stroke-linejoin="round" points="' +
      points("collar") +
      '"/></svg><div class="legend"><span><i class="sw"></i>Collared position</span><span><i class="sw stock"></i>Unhedged stock (dotted)</span></div><p class="muted">At ' +
      esc(p.expiry) +
      ". Collar includes initial net premium; taxes and fees excluded.</p></div>"
    );
  }
  function analysis(p) {
    if (!supported(p))
      return (
        '<div class="notice">' +
        esc(p.strategy) +
        " is a placeholder. No analytics or proposal pages are available. Select Protection or Yield to model this position.</div>"
      );
    if (p.strategy === "protection") {
      const a = M.protection(p);
      return (
        '<div class="metrics">' +
        [
          [
            "Stock position",
            money(p.S * p.shares),
            a.contracts + " contracts / leg",
          ],
          [
            "Net option premium",
            money(a.net),
            a.net >= 0 ? "Credit received" : "Debit paid",
          ],
          [
            "Expiration floor",
            money(a.value(0)),
            pct(a.value(0) / (p.S * p.shares) - 1) + " vs. entry",
          ],
          [
            a.remainder ? "Value at call strike" : "Expiration cap",
            money(a.value(p.call)),
            pct(a.value(p.call) / (p.S * p.shares) - 1) + " vs. entry",
          ],
        ]
          .map(
            ([label, value, note]) =>
              '<div class="metric"><small>' +
              label +
              "</small><strong>" +
              value +
              "</strong><em>" +
              note +
              "</em></div>",
          )
          .join("") +
        '</div><p class="status">' +
        a.contracts +
        " contracts per leg; " +
        a.covered +
        " covered shares; " +
        a.remainder +
        " unhedged residual shares. Net premium " +
        money(a.net) +
        ". Both legs expire " +
        esc(p.expiry) +
        ".</p>" +
        plot(p) +
        table(
          [
            "Stock return",
            "Stock price",
            "Unhedged value",
            "Collar value",
            "Difference",
          ],
          M.scenarios(p).map((r) => [
            pct(r.r),
            money(r.end),
            money(r.stock),
            money(r.value),
            '<span class="' +
              (r.difference > 0
                ? "positive"
                : r.difference < 0
                  ? "negative"
                  : "") +
              '">' +
              (r.difference > 0 ? "+" : "") +
              money(r.difference) +
              "</span>",
          ]),
        ) +
        table(
          ["Leg", "Expiry", "Strike", "Bid", "Ask", "Fill"],
          [a.put, a.call].map((q) => [
            q.type,
            esc(q.expiry),
            money(q.strike),
            money(q.bid),
            money(q.ask),
            money(M.fill(q, q.type === "put" ? "buy" : "sell", p.method)),
          ]),
        )
      );
    }
    const a = M.yieldPlan(p);
    return (
      "<h3>Covered-call Yield</h3><p>" +
      a.contracts +
      " total contracts across disjoint share tranches; " +
      a.remainder +
      " uncovered residual shares. Total initial premium " +
      money(a.premium) +
      ". " +
      (p.preset === "income"
        ? "Target shortfall " +
          money(a.shortfall) +
          ". Target may be infeasible."
        : "") +
      '</p><div class="notice">These are simultaneous calls on separate shares, not repeated overwrites of the entire holding. There is no single expiration payoff. Each tranche is valued at its own expiry. Assignment can occur early or not at all; calendar-year sales and tax results are not guaranteed.</div>' +
      table(
        [
          "Expiry / planned year",
          "Contracts / shares",
          "Strike",
          "Mock delta",
          "Fill / share",
          "Initial premium",
        ],
        a.rows.map((r) => [
          esc(r.expiry) + " / " + r.year,
          r.contracts + " / " + r.shares,
          money(r.strike),
          r.delta.toFixed(3),
          money(r.fill),
          money(r.premium),
        ]),
      ) +
      a.rows
        .filter((r) => r.contracts)
        .map(
          (r) =>
            "<h3>Tranche at " +
            esc(r.expiry) +
            "</h3>" +
            table(
              [
                "Stock return at this expiry",
                "Stock value",
                "Covered-call value",
                "Difference",
              ],
              [0.4, 0.2, 0, -0.2, -0.4].map((v) => {
                const stock = p.S * (1 + v) * r.shares,
                  value =
                    Math.min(p.S * (1 + v), r.strike) * r.shares + r.premium;
                return [
                  pct(v),
                  money(stock),
                  money(value),
                  '<span class="' +
                    (value - stock >= 0 ? "positive" : "negative") +
                    '">' +
                    money(value - stock) +
                    "</span>",
                ];
              }),
            ),
        )
        .join("")
    );
  }
  function render(s) {
    timestamp();
    s.p.asOf = today();
    const p = s.p,
      root = s.root;
    root.querySelector("summary").textContent =
      p.symbol + " · " + p.shares.toLocaleString() + " shares · " + p.strategy;
    let controls = "";
    try {
      M.validate(p);
      if (p.strategy === "protection") {
        sync(p);
        controls =
          expirationField(p, "expiry", "Protection term", p.expiry) +
          strikeField(p, "put", "put", p.expiry, p.put) +
          strikeField(p, "call", "call", p.expiry, p.call) +
          '<button class="primary" data-auto>Find near-zero-cost collar</button>';
      } else if (p.strategy === "yield") {
        controls =
          select(
            "preset",
            "Yield starting point",
            [
              ["delta", "Delta-Targeted Income"],
              ["ladder", "Tax-Aware Exit Ladder"],
              ["income", "Income-Targeted Overwrite"],
            ],
            p.preset,
          ) +
          input(
            "delta",
            "Target mock call delta",
            p.delta,
            "number",
            'min=".01" max=".99" step=".01"',
          ) +
          input(
            "income",
            "Total initial premium target ($)",
            p.income,
            "number",
            'min="0" step="100"',
          ) +
          input(
            "years",
            "Ladder calendar years (2–5)",
            p.years,
            "number",
            'min="2" max="5"',
          );
        const a = M.yieldPlan(p);
        controls += a.rows
          .map(
            (r, i) =>
              "<fieldset><legend>Tranche " +
              (i + 1) +
              " · " +
              r.contracts +
              " contracts</legend>" +
              expirationField(p, "expiry-" + i, "Expiration", r.expiry) +
              select(
                "strike-" + i,
                "Call strike (editable)",
                M.chain(p.S, p.asOf, r.expiry)
                  .filter((q) => q.type === "call" && q.strike >= p.S)
                  .map((q) => [q.strike, money(q.strike)]),
                r.strike,
              ) +
              "</fieldset>",
          )
          .join("");
      }
    } catch (e) {
      controls =
        '<p class="error">' +
        esc(e.message) +
        "</p>" +
        (p.strategy === "yield"
          ? p.expiries
              .map((e, i) =>
                expirationField(
                  p,
                  "expiry-" + i,
                  "Tranche " + (i + 1) + " expiry",
                  e,
                ),
              )
              .join("")
          : expirationField(p, "expiry", "Protection term", p.expiry)) +
        "<button data-repair>Reset strategy settings</button>";
    }
    root.querySelector(".position-body").innerHTML =
      '<aside class="card position-inputs"><h2>Position &amp; contract settings</h2><div class="input-grid">' +
      input(
        "symbol",
        "Symbol (synthetic label)",
        p.symbol,
        "text",
        'maxlength="15"',
      ) +
      input(
        "S",
        "Reference stock price ($)",
        p.S,
        "number",
        'min="1" max="5000" step=".01"',
      ) +
      input(
        "shares",
        "Shares owned",
        p.shares,
        "number",
        'min="100" max="10000000" step="1"',
      ) +
      select(
        "strategy",
        "Strategy",
        [
          ["protection", "Protection"],
          ["diversification", "Diversification — unavailable"],
          ["upside", "Upside — unavailable"],
          ["yield", "Yield"],
          ["borrow", "Borrow — unavailable"],
        ],
        p.strategy,
      ) +
      select(
        "method",
        "Synthetic fill assumption",
        [
          ["conservative", "Buy ask / sell bid"],
          ["mid", "Midpoint"],
        ],
        p.method,
      ) +
      '</div><hr class="divider"><h2>Strategy construction</h2><div class="strategy-controls">' +
      controls +
      '</div><hr class="divider"><button data-remove>Remove position</button></aside><section class="results" aria-live="polite"></section>';
    try {
      root.querySelector(".results").innerHTML = analysis(p);
    } catch (e) {
      root.querySelector(".results").innerHTML =
        '<p class="error">' + esc(e.message) + "</p>";
    }
    if (p.strategy === "yield")
      for (const [key, visible] of [
        ["delta", p.preset !== "income"],
        ["income", p.preset === "income"],
        ["years", p.preset === "ladder"],
      ]) {
        const el = root.querySelector('[data-key="' + key + '"]');
        if (el) el.parentElement.parentElement.hidden = !visible;
      }
    refreshIncludes();
  }
  function findZero(p) {
    const a = M.protection(p),
      debit = M.fill(a.put, "buy", p.method),
      qs = strikes(p, "call", p.expiry),
      affordable = qs.filter((q) => M.fill(q, "sell", p.method) >= debit);
    p.call = (
      affordable.at(-1) ||
      qs.reduce((a, b) =>
        Math.abs(M.fill(b, "sell", p.method) - debit) <
        Math.abs(M.fill(a, "sell", p.method) - debit)
          ? b
          : a,
      )
    ).strike;
  }
  function add() {
    if (states.length >= 10) return;
    const p = M.defaultPosition(today()),
      root = document.createElement("details");
    root.className = "position";
    root.open = true;
    root.innerHTML =
      '<summary></summary><div class="position-body layout"></div>';
    $("positions").append(root);
    const s = { p, root, include: true };
    states.push(s);
    root.addEventListener("change", (e) => {
      const k = e.target.dataset.key;
      if (!k) return;
      refreshToday();
      let v = e.target.value;
      if (
        ["S", "shares", "put", "call", "delta", "income", "years"].includes(k)
      )
        v = Number(v);
      if (k.startsWith("expiry-")) {
        p.expiries[+k.split("-")[1]] = v;
        p.strikes = [];
      } else if (k.startsWith("strike-"))
        p.strikes[+k.split("-")[1]] = Number(v);
      else p[k] = k === "symbol" ? v.toUpperCase() : v;
      if (["preset", "years"].includes(k)) {
        try {
          p.expiries = M.presetExpiries(p);
          p.strikes = [];
        } catch {}
      }
      if (["S", "delta", "income", "method"].includes(k)) p.strikes = [];
      render(s);
    });
    root.addEventListener("input", (e) => {
      const k = e.target.dataset.strike;
      if (k) {
        if (p.asOf !== today()) {
          refreshToday();
          return;
        }
        timestamp();
        p[k] = strikes(p, k === "put" ? "put" : "call", p.expiry)[
          +e.target.value
        ].strike;
        const select = root.querySelector('[data-key="' + k + '"]');
        select.value = p[k];
        e.target.setAttribute("aria-valuetext", strikeText(p, p[k]));
        root.querySelector('[data-strike-output="' + k + '"]').textContent =
          strikeText(p, p[k]);
        root.querySelector(".results").innerHTML = analysis(p);
      }
    });
    root.addEventListener("click", (e) => {
      if (e.target.hasAttribute("data-auto")) {
        try {
          findZero(p);
          render(s);
        } catch {}
      }
      if (e.target.hasAttribute("data-repair")) {
        Object.assign(p, {
          expiry: M.monthly(p.asOf, 12)[11],
          expiries: M.presetExpiries(p),
          strikes: [],
          put: 0,
          call: 0,
        });
        render(s);
      }
      if (e.target.hasAttribute("data-remove")) {
        states.splice(states.indexOf(s), 1);
        root.remove();
        refreshIncludes();
      }
    });
    render(s);
  }
  function refreshIncludes() {
    $("include").innerHTML = states
      .map(
        (s, i) =>
          '<label><input type="checkbox" data-include="' +
          i +
          '" ' +
          (s.include && supported(s.p) ? "checked" : "") +
          " " +
          (!supported(s.p) ? "disabled" : "") +
          "> " +
          esc(s.p.symbol) +
          " · " +
          esc(s.p.strategy) +
          (!supported(s.p) ? " (unavailable)" : "") +
          "</label>",
      )
      .join("");
    $("add").disabled = states.length >= 10;
  }
  $("include").addEventListener("change", (e) => {
    if (e.target.dataset.include != null)
      states[+e.target.dataset.include].include = e.target.checked;
  });
  $("add").addEventListener("click", add);
  $("build").addEventListener("click", () => {
    $("proposal").hidden = false;
    refreshIncludes();
    $("proposal").scrollIntoView({ behavior: "smooth" });
  });
  $("download").addEventListener("click", async () => {
    const button = $("download");
    button.disabled = true;
    try {
      const positions = states
        .filter((s) => s.include && supported(s.p))
        .map((s) => structuredClone(s.p));
      if (!positions.length)
        throw Error("Select at least one supported position.");
      positions.forEach((p) =>
        p.strategy === "protection" ? M.protection(p) : M.yieldPlan(p),
      );
      const file = $("deck").files[0];
      if (!file || file.size > 8 * 1024 * 1024)
        throw Error("Attach the original 14-page PDF, up to 8 MB.");
      $("pdf-status").textContent = "Assembling research PDF…";
      const bytes = new Uint8Array(await file.arrayBuffer());
      const digest = Array.from(
        new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
        (b) => b.toString(16).padStart(2, "0"),
      ).join("");
      if (digest !== M.deck.sha256)
        throw Error(
          "Please upload the reviewed original SEIA Signature Plus Marketing Deck. This is a different file or version.",
        );
      let binary = "";
      for (let i = 0; i < bytes.length; i += 8192)
        binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
      const response = await fetch("/api/signature-proposal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ positions, template: btoa(binary) }),
      });
      if (!response.ok) throw Error(await response.text());
      const url = URL.createObjectURL(await response.blob()),
        a = document.createElement("a");
      a.href = url;
      a.download = "Signature-Plus-RESEARCH-ONLY.pdf";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      $("pdf-status").textContent =
        "Research PDF downloaded. Review all pages before use. Not for client use.";
    } catch (e) {
      $("pdf-status").textContent = e.message;
    } finally {
      button.disabled = false;
    }
  });
  add();
  let resizeTimer;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      for (const s of states)
        if (s.p.strategy === "protection") {
          try {
            s.root.querySelector(".chart-card").outerHTML = plot(s.p);
          } catch {}
        }
    }, 150);
  });
  setInterval(refreshToday, 60000);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) refreshToday();
  });
  window.addEventListener("focus", refreshToday);
}
export const signatureScript =
  "(()=>{const __name=(fn)=>fn;(" + signatureClient.toString() + ")();})();";
