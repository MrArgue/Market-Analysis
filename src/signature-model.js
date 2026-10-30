// Shared, deterministic synthetic model. Never a quote or tax recommendation.
export function createSignatureModel() {
  const disclaimer =
    "SYNTHETIC DATA — RESEARCH PROTOTYPE — NOT FOR CLIENT USE OR TRADING";
  const cdf = (x) => {
    const a = Math.abs(x),
      t = 1 / (1 + 0.2316419 * a);
    const y =
      1 -
      0.3989422804 *
        Math.exp((-a * a) / 2) *
        t *
        (0.31938153 +
          t *
            (-0.356563782 +
              t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
    return x < 0 ? 1 - y : y;
  };
  const date = (s) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s))
      throw Error("Use an ISO calendar date.");
    const d = new Date(s + "T00:00:00Z");
    if (!Number.isFinite(+d) || d.toISOString().slice(0, 10) !== s)
      throw Error("Invalid calendar date.");
    return d;
  };
  const iso = (d) => d.toISOString().slice(0, 10);
  const days = (asOf, expiry) => (+date(expiry) - +date(asOf)) / 86400000;
  function monthly(asOf, count = 3) {
    const a = date(asOf),
      out = [];
    let m = a.getUTCMonth(),
      y = a.getUTCFullYear();
    while (out.length < count) {
      const d = new Date(Date.UTC(y, m, 1));
      d.setUTCDate(1 + ((5 - d.getUTCDay() + 7) % 7) + 14);
      if (d > a) out.push(iso(d));
      m++;
      if (m === 12) {
        m = 0;
        y++;
      }
    }
    return out;
  }
  function chain(S, asOf, expiry) {
    const D = days(asOf, expiry);
    if (!Number.isFinite(S) || S < 1 || S > 5000 || D <= 0 || D > 3650)
      throw Error(
        "Price must be $1–$5,000 and expiry 1–3,650 days after valuation.",
      );
    const T = D / 365,
      v = 0.3,
      r = 0.04,
      q = 0.005,
      sv = v * Math.sqrt(T),
      step = S >= 200 ? 5 : S >= 50 ? 2.5 : S >= 5 ? 1 : 0.05,
      out = [];
    for (
      let n = Math.max(1, Math.ceil((S * 0.5) / step));
      n <= Math.floor((S * 2) / step);
      n++
    ) {
      const strike = Number((n * step).toFixed(2)),
        d1 = (Math.log(S / strike) + (r - q + (v * v) / 2) * T) / sv,
        d2 = d1 - sv;
      for (const type of ["put", "call"]) {
        const fair = Math.max(
          0,
          type === "call"
            ? S * Math.exp(-q * T) * cdf(d1) -
                strike * Math.exp(-r * T) * cdf(d2)
            : strike * Math.exp(-r * T) * cdf(-d2) -
                S * Math.exp(-q * T) * cdf(-d1),
        );
        const half = Math.max(0.08, fair * 0.025);
        out.push({
          type,
          strike,
          expiry,
          bid: Math.max(0, fair - half),
          ask: fair + half,
          delta: Math.exp(-q * T) * (type === "call" ? cdf(d1) : cdf(d1) - 1),
          mock: true,
        });
      }
    }
    return out;
  }
  const nearest = (list, target, key = "strike") =>
    list.reduce((a, b) =>
      Math.abs(b[key] - target) < Math.abs(a[key] - target) ? b : a,
    );
  const fill = (q, side, method) =>
    method === "mid" ? (q.bid + q.ask) / 2 : side === "buy" ? q.ask : q.bid;
  function validate(p) {
    if (!/^[A-Z][A-Z0-9.-]{0,14}$/.test(p.symbol))
      throw Error("Enter a valid symbol label.");
    if (
      !Number.isFinite(p.S) ||
      p.S < 1 ||
      p.S > 5000 ||
      !Number.isInteger(p.shares) ||
      p.shares < 100 ||
      p.shares > 10000000
    )
      throw Error("Enter $1–$5,000 and 100–10,000,000 whole shares.");
    date(p.asOf);
    if (!["conservative", "mid"].includes(p.method))
      throw Error("Choose a fill assumption.");
  }
  function protection(p) {
    validate(p);
    const quotes = chain(p.S, p.asOf, p.expiry),
      put = quotes.find((q) => q.type === "put" && q.strike === p.put),
      call = quotes.find((q) => q.type === "call" && q.strike === p.call);
    if (!put || !call || p.put >= p.S || p.call <= p.S)
      throw Error(
        "Select a put below spot and call above spot from this expiry chain.",
      );
    const contracts = Math.floor(p.shares / 100),
      covered = contracts * 100,
      remainder = p.shares - covered,
      net =
        (fill(call, "sell", p.method) - fill(put, "buy", p.method)) * covered;
    const value = (end) =>
      end * p.shares +
      covered * (Math.max(p.put - end, 0) - Math.max(end - p.call, 0)) +
      net;
    return { contracts, covered, remainder, net, value, put, call };
  }
  function yieldPlan(p) {
    validate(p);
    if (!["delta", "income", "ladder"].includes(p.preset))
      throw Error("Choose a yield preset.");
    if (
      !(Number.isFinite(p.delta) && p.delta >= 0.01 && p.delta <= 0.99) ||
      !(Number.isFinite(p.income) && p.income >= 0 && p.income <= 1e9) ||
      !Number.isInteger(p.years) ||
      p.years < 2 ||
      p.years > 5
    )
      throw Error("Delta: .01–.99; target: $0–$1bn; years: 2–5.");
    const expiries = p.expiries;
    if (
      !Array.isArray(expiries) ||
      expiries.length !== (p.preset === "ladder" ? p.years : 3) ||
      new Set(expiries).size !== expiries.length
    )
      throw Error("Provide distinct expirations for every tranche.");
    if (
      expiries.some(
        (e, i) => days(p.asOf, e) <= 0 || (i && e <= expiries[i - 1]),
      )
    )
      throw Error("Expirations must increase after valuation.");
    if (
      p.preset === "ladder" &&
      expiries.some(
        (e, i) => i && +e.slice(0, 4) !== +expiries[0].slice(0, 4) + i,
      )
    )
      throw Error(
        "Tax-aware ladder needs one expiry in each consecutive calendar year.",
      );
    const total = Math.floor(p.shares / 100),
      base = Math.floor(total / expiries.length),
      extra = total % expiries.length;
    const rows = expiries.map((expiry, i) => {
      const contracts = base + (i < extra ? 1 : 0),
        calls = chain(p.S, p.asOf, expiry).filter(
          (q) => q.type === "call" && q.strike >= p.S,
        );
      let q = nearest(calls, p.delta, "delta");
      if (p.preset === "income" && contracts) {
        const target = p.income / (total * 100);
        q = calls.reduce((a, b) =>
          Math.abs(fill(b, "sell", p.method) - target) <
          Math.abs(fill(a, "sell", p.method) - target)
            ? b
            : a,
        );
      }
      const override = p.strikes?.[i];
      if (override != null) {
        q = calls.find((q) => q.strike === override);
        if (!q)
          throw Error(
            "Choose call strikes from the corresponding expiry chain.",
          );
      }
      return {
        ...q,
        contracts,
        shares: contracts * 100,
        premium: fill(q, "sell", p.method) * contracts * 100,
        fill: fill(q, "sell", p.method),
        year: +expiry.slice(0, 4),
      };
    });
    const premium = rows.reduce((s, r) => s + r.premium, 0);
    return {
      rows,
      premium,
      contracts: total,
      remainder: p.shares - total * 100,
      shortfall: Math.max(0, p.income - premium),
    };
  }
  function scenarios(p) {
    const returns = [
      0.8, 0.6, 0.4, 0.3, 0.2, 0.1, 0, -0.1, -0.2, -0.3, -0.4, -0.6,
    ];
    if (p.strategy === "protection") {
      const a = protection(p);
      return returns.map((r) => {
        const end = p.S * (1 + r),
          stock = end * p.shares,
          value = a.value(end);
        return { r, end, stock, value, difference: value - stock };
      });
    }
    throw Error(
      "Multi-expiry yield has no single expiration payoff. Use each tranche separately.",
    );
  }
  function defaultPosition(asOf) {
    const expiry = monthly(asOf, 12)[11];
    return {
      symbol: "AAPL",
      S: 268,
      shares: 20000,
      asOf,
      expiry,
      put: 235,
      call: 350,
      method: "conservative",
      strategy: "protection",
      preset: "delta",
      delta: 0.2,
      income: 10000,
      years: 3,
      expiries: monthly(asOf),
      strikes: [],
    };
  }
  function presetExpiries(p) {
    if (p.preset !== "ladder") return monthly(p.asOf);
    let y = +p.asOf.slice(0, 4);
    if (days(p.asOf, monthly(y + "-12-01", 1)[0]) <= 0) y++;
    return Array.from(
      { length: p.years },
      (_, i) => monthly(y + i + "-12-01", 1)[0],
    );
  }
  return {
    disclaimer,
    days,
    monthly,
    chain,
    nearest,
    fill,
    validate,
    protection,
    yieldPlan,
    scenarios,
    defaultPosition,
    presetExpiries,
  };
}
export const signatureModel = createSignatureModel();
export const signatureModelScript =
  "(()=>{const __name=(fn)=>fn;globalThis.SignatureModel=(" +
  createSignatureModel.toString() +
  ")();})();";
