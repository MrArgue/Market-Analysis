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
  function table(head, rows) {
    return (
      '<div class="scroll"><table><thead><tr>' +
      head.map((h) => "<th>" + h + "</th>").join("") +
      "</tr></thead><tbody>" +
      rows
        .map(
          (r) => "<tr>" + r.map((c) => "<td>" + c + "</td>").join("") + "</tr>",
        )
        .join("") +
      "</tbody></table></div>"
    );
  }
  function strikes(p, type, expiry) {
    return M.chain(p.S, p.asOf, expiry).filter(
      (q) =>
        q.type === type && (type === "put" ? q.strike < p.S : q.strike > p.S),
    );
  }
  function strikeField(p, key, type, expiry, value) {
    const qs = strikes(p, type, expiry),
      idx = qs.findIndex((q) => q.strike === value);
    return (
      select(
        key,
        type === "put" ? "Protective put strike" : "Covered call strike",
        qs.map((q) => [q.strike, money(q.strike)]),
        value,
      ) +
      "<label>Slide " +
      type +
      ' strike<input type="range" data-strike="' +
      key +
      '" min="0" max="' +
      (qs.length - 1) +
      '" step="1" value="' +
      idx +
      '" aria-valuetext="' +
      money(value) +
      '"><span class="muted">Snaps to ' +
      qs.length +
      " available synthetic strikes for " +
      esc(expiry) +
      "</span></label>"
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
  function plot(p, a) {
    const pts = Array.from({ length: 61 }, (_, i) => {
        const end = p.S * (0.4 + i * 0.02);
        return { end, stock: end * p.shares, value: a.value(end) };
      }),
      max = Math.max(...pts.map((v) => Math.max(v.stock, v.value))) * 1.05,
      min = Math.min(0, ...pts.map((v) => v.value));
    const X = (v) => 55 + ((v / p.S - 0.4) / 1.2) * 600,
      Y = (v) => 260 - ((v - min) / (max - min)) * 225;
    return (
      '<svg class="chart" viewBox="0 0 700 300" role="img" aria-label="Protection versus unhedged value at ' +
      esc(p.expiry) +
      '"><text x="55" y="20">Value at ' +
      esc(p.expiry) +
      " (USD)</text>" +
      ["stock", "value"]
        .map(
          (k, i) =>
            '<polyline fill="none" stroke="' +
            (i ? "#9b702e" : "#667985") +
            '" stroke-width="3" points="' +
            pts.map((v) => X(v.end) + "," + Y(v[k])).join(" ") +
            '"/>',
        )
        .join("") +
      '<text x="55" y="285">Stock price ' +
      money(p.S * 0.4) +
      '</text><text x="450" y="285">' +
      money(p.S * 1.6) +
      '</text></svg><p class="muted">Gold: protection including premium. Gray: unhedged stock. No taxes or fees.</p>'
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
        "<h3>Zero-Cost Collar Simulator</h3><p>" +
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
        plot(p, a) +
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
          input("expiry", "Both legs expire", p.expiry, "date") +
          strikeField(p, "put", "put", p.expiry, p.put) +
          strikeField(p, "call", "call", p.expiry, p.call) +
          "<button data-auto>Find near-zero-cost collar</button>";
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
              input("expiry-" + i, "Expiration", r.expiry, "date") +
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
                input(
                  "expiry-" + i,
                  "Tranche " + (i + 1) + " expiry",
                  e,
                  "date",
                ),
              )
              .join("")
          : input("expiry", "Protection expiry", p.expiry, "date")) +
        "<button data-repair>Reset strategy settings</button>";
    }
    root.querySelector(".position-body").innerHTML =
      '<div class="grid">' +
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
      input("asOf", "Valuation date", p.asOf, "date") +
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
      '</div><div class="grid">' +
      controls +
      '</div><div class="results" aria-live="polite"></div><button data-remove>Remove position</button>';
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
    const p = M.defaultPosition(new Date().toLocaleDateString("en-CA")),
      root = document.createElement("details");
    root.className = "card";
    root.open = true;
    root.innerHTML = '<summary></summary><div class="position-body"></div>';
    $("positions").append(root);
    const s = { p, root, include: true };
    states.push(s);
    root.addEventListener("change", (e) => {
      const k = e.target.dataset.key;
      if (!k) return;
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
      if (["preset", "years", "asOf"].includes(k)) {
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
        p[k] = strikes(p, k === "put" ? "put" : "call", p.expiry)[
          +e.target.value
        ].strike;
        const select = root.querySelector('[data-key="' + k + '"]');
        select.value = p[k];
        e.target.setAttribute("aria-valuetext", money(p[k]));
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
}
export const signatureScript =
  "(()=>{const __name=(fn)=>fn;(" + signatureClient.toString() + ")();})();";
