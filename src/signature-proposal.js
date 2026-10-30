import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { signatureModel as M } from "./signature-model.js";
const MAX_BODY = 12 * 1024 * 1024;
// The optional digest dependency is for local fixture tests only; HTTP always uses the reviewed deck fingerprint.
export async function buildProposal(
  { positions, template },
  expectedDigest = M.deck.sha256,
) {
  const pages = M.deck.pages;
  if (
    !Array.isArray(positions) ||
    positions.length < 1 ||
    positions.length > 10
  )
    throw Error("Select 1–10 positions.");
  for (const p of positions) {
    if (!["protection", "yield"].includes(p.strategy))
      throw Error("Unsupported strategy.");
    p.strategy === "protection" ? M.protection(p) : M.yieldPlan(p);
  }
  const strategies = [...new Set(positions.map((p) => p.strategy))];
  if (
    typeof template !== "string" ||
    template.length > Math.ceil((8 * 1024 * 1024) / 3) * 4 ||
    template.length % 4 !== 0 ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(template)
  )
    throw Error("Attach the original PDF, up to 8 MB.");
  const bytes = Uint8Array.from(atob(template), (c) => c.charCodeAt(0));
  if (
    bytes.length > 8 * 1024 * 1024 ||
    new TextDecoder().decode(bytes.subarray(0, 5)) !== "%PDF-"
  )
    throw Error("Invalid PDF.");
  const digest = Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
    (b) => b.toString(16).padStart(2, "0"),
  ).join("");
  if (digest !== expectedDigest)
    throw Error(
      "Upload the reviewed original Signature Plus deck. This file is a different version.",
    );
  const source = await PDFDocument.load(bytes);
  if (source.getPageCount() !== 14)
    throw Error("Expected the original 14-page Signature Plus deck.");
  const doc = await PDFDocument.create(),
    font = await doc.embedFont(StandardFonts.Helvetica),
    bold = await doc.embedFont(StandardFonts.HelveticaBold);
  doc.setTitle("Signature Plus - Research prototype");
  doc.setSubject(M.disclaimer);
  let page, y;
  const color = rgb(0.11, 0.18, 0.23),
    gold = rgb(0.59, 0.43, 0.18);
  function line(text, size = 11, ink = color) {
    page.drawText(text, { x: 40, y, size, font, color: ink });
    y -= size + 8;
  }
  function newPage(title) {
    page = doc.addPage([1008, 612]);
    y = 565;
    page.drawText("SIGNATURE PLUS | " + title, {
      x: 40,
      y,
      size: 18,
      font: bold,
      color: gold,
    });
    y -= 32;
    page.drawText(
      "SYNTHETIC DATA - RESEARCH PROTOTYPE - NOT FOR CLIENT USE OR TRADING",
      { x: 40, y: 22, size: 8, font: bold, color: rgb(0.65, 0.12, 0.1) },
    );
  }
  function row(cells, widths, inks = []) {
    let x = 40;
    cells.forEach((c, i) => {
      page.drawText(String(c), {
        x,
        y,
        size: 9,
        font,
        color: inks[i] || color,
      });
      x += widths[i];
    });
    y -= 20;
  }
  const money = (n) =>
      new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 0,
      }).format(n),
    price = (n) =>
      new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(n),
    pct = (n) => (n >= 0 ? "+" : "") + (n * 100).toFixed(0) + "%";
  function payoff(p, value, shares) {
    const x = 48,
      top = y - 5,
      w = 660,
      h = 100,
      lo = p.S * 0.4,
      hi = p.S * 1.8,
      values = Array.from({ length: 71 }, (_, i) => {
        const end = lo + ((hi - lo) * i) / 70;
        return { end, stock: end * shares, value: value(end) };
      }),
      max = Math.max(...values.map((v) => Math.max(v.stock, v.value))) * 1.05,
      min = Math.min(0, ...values.map((v) => v.value)),
      Y = (v) => top - h + ((v - min) / (max - min)) * h;
    for (let i = 1; i < values.length; i++)
      for (const [k, c] of [
        ["stock", rgb(0.5, 0.55, 0.6)],
        ["value", gold],
      ])
        page.drawLine({
          start: { x: x + ((i - 1) / 70) * w, y: Y(values[i - 1][k]) },
          end: { x: x + (i / 70) * w, y: Y(values[i][k]) },
          thickness: 1.5,
          color: c,
        });
    y = top - h - 15;
    line(
      "Stock at expiry: " +
        money(lo) +
        " to " +
        money(hi) +
        " | Gold: strategy value; gray: stock value",
      9,
    );
  }
  newPage("Research proposal");
  line("ILLUSTRATIVE ONLY. Not a client proposal.", 16);
  line(
    positions.length +
      " position(s); selected strategies: " +
      strategies.join(", "),
  );
  line(
    "Reference prices, option quotes, deltas and all analytics are synthetic.",
  );
  line("European model: 30% volatility, 4% rate, 0.5% dividend yield.");
  line(
    "No commissions, taxes, liquidity, American exercise or early assignment modeled.",
  );
  line(
    "Mock deltas are not assignment probabilities. Premium income is not total return.",
  );
  line(
    "Yield tranches use separate shares and different expirations; values are not aggregated.",
  );
  line(
    "Calendar-year sales, tax treatment and future income are not guaranteed.",
  );
  line(
    "Original explanation pages are copied unchanged; historical examples may differ.",
  );
  line(
    "Includes original cover, selected explanations, definitions and disclosures.",
  );
  line(strategies.map((s) => s + ": source page " + pages[s]).join(" | "));
  line(
    "Research use only. Source definitions/disclosures do not approve this synthetic proposal.",
  );
  const [cover] = await doc.copyPages(source, [M.deck.cover - 1]);
  doc.addPage(cover);
  for (const strategy of strategies) {
    const [explanation] = await doc.copyPages(source, [pages[strategy] - 1]);
    doc.addPage(explanation);
    for (const p of positions.filter((p) => p.strategy === strategy)) {
      if (strategy === "protection") {
        const a = M.protection(p);
        newPage(p.symbol + " | Protection");
        line(
          "Valuation " +
            p.asOf +
            " | Both legs expire " +
            p.expiry +
            " | Reference " +
            money(p.S),
        );
        line(
          p.shares +
            " shares | " +
            a.contracts +
            " contracts per leg | " +
            a.remainder +
            " unhedged shares",
        );
        line(
          "Put " +
            money(p.put) +
            " / call " +
            money(p.call) +
            " | Net premium " +
            money(a.net) +
            " | " +
            p.method +
            " fills",
        );
        payoff(p, a.value, p.shares);
        row(
          [
            "Stock return",
            "Stock price",
            "Stock value",
            "Collar value",
            "Difference",
          ],
          [105, 110, 135, 135, 130],
        );
        for (const r of M.scenarios(p))
          row(
            [
              pct(r.r),
              money(r.end),
              money(r.stock),
              money(r.value),
              money(r.difference),
            ],
            [105, 110, 135, 135, 130],
            [
              null,
              null,
              null,
              null,
              r.difference < 0
                ? rgb(0.7, 0.1, 0.1)
                : r.difference > 0
                  ? rgb(0.05, 0.4, 0.2)
                  : color,
            ],
          );
        line(
          "Value includes initial net premium. Residual shares retain uncapped downside/upside.",
          9,
        );
      } else {
        const a = M.yieldPlan(p);
        newPage(p.symbol + " | Yield program");
        line(
          "Valuation " +
            p.asOf +
            " | Reference " +
            money(p.S) +
            " | " +
            p.shares +
            " shares",
        );
        line(
          "Preset " +
            p.preset +
            (p.preset === "income"
              ? " | Initial premium target " + money(p.income)
              : " | Target mock delta " + p.delta),
        );
        line(
          a.contracts +
            " contracts total | " +
            a.remainder +
            " uncovered shares | Initial premium " +
            money(a.premium),
        );
        line(
          (p.preset === "income"
            ? "Income target shortfall " + money(a.shortfall) + " | "
            : "") +
            p.method +
            " fills",
        );
        line("Disjoint share tranches. Do not sum expiry values across dates.");
        row(
          [
            "Expiry / year",
            "Contracts / shares",
            "Strike",
            "Mock delta",
            "Premium",
          ],
          [150, 150, 110, 110, 130],
        );
        for (const r of a.rows)
          row(
            [
              r.expiry + " / " + r.year,
              r.contracts + " / " + r.shares,
              money(r.strike),
              r.delta.toFixed(3),
              money(r.premium),
            ],
            [150, 150, 110, 110, 130],
          );
        line(
          "Planned calendar-year allocation only. Early assignment or no assignment can change sales.",
          9,
        );
        line(
          "No tax calculation or guaranteed exit. Zero-contract tranches earn no premium.",
          9,
        );
        for (const r of a.rows.filter((r) => r.contracts)) {
          newPage(p.symbol + " | Yield tranche " + r.expiry);
          line(
            r.shares +
              " shares | " +
              r.contracts +
              " calls | Strike " +
              money(r.strike) +
              " | Mock delta " +
              r.delta.toFixed(3),
          );
          line(
            "Initial premium " +
              money(r.premium) +
              " | Fill/share " +
              price(r.fill) +
              " | Valued only at " +
              r.expiry,
          );
          const value = (end) => Math.min(end, r.strike) * r.shares + r.premium;
          payoff(p, value, r.shares);
          row(
            [
              "Stock return",
              "Stock price",
              "Stock value",
              "Call + stock",
              "Difference",
            ],
            [105, 110, 135, 135, 130],
          );
          for (const rr of [
            0.8, 0.6, 0.4, 0.3, 0.2, 0.1, 0, -0.1, -0.2, -0.3, -0.4, -0.6,
          ]) {
            const end = p.S * (1 + rr),
              stock = end * r.shares,
              diff = value(end) - stock;
            row(
              [
                pct(rr),
                money(end),
                money(stock),
                money(value(end)),
                money(diff),
              ],
              [105, 110, 135, 135, 130],
              [
                null,
                null,
                null,
                null,
                diff < 0
                  ? rgb(0.7, 0.1, 0.1)
                  : diff > 0
                    ? rgb(0.05, 0.4, 0.2)
                    : color,
              ],
            );
          }
          line(
            "Premium does not protect against substantial stock losses. Upside above strike is forgone.",
            9,
          );
        }
      }
    }
  }
  for (const appendix of await doc.copyPages(
    source,
    M.deck.appendix.map((n) => n - 1),
  ))
    doc.addPage(appendix);
  return doc.save();
}
export async function handleProposal(request) {
  if (request.method !== "POST")
    return new Response("Method Not Allowed", {
      status: 405,
      headers: { Allow: "POST" },
    });
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin)
    return new Response("Cross-origin proposal requests are not allowed.", {
      status: 403,
    });
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    return new Response("Expected JSON.", { status: 415 });
  try {
    if (Number(request.headers.get("content-length")) > MAX_BODY)
      return new Response("Proposal too large.", { status: 413 });
    const reader = request.body?.getReader();
    if (!reader) throw Error("Missing proposal.");
    let size = 0,
      chunks = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > MAX_BODY) {
        await reader.cancel();
        return new Response("Proposal too large.", { status: 413 });
      }
      chunks.push(value);
    }
    const body = new Uint8Array(size);
    let offset = 0;
    for (const c of chunks) {
      body.set(c, offset);
      offset += c.length;
    }
    const pdf = await buildProposal(JSON.parse(new TextDecoder().decode(body)));
    return new Response(pdf, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition":
          'attachment; filename="Signature-Plus-RESEARCH-ONLY.pdf"',
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new Response(
      "Unable to build PDF. Check position inputs, reviewed original 14-page PDF. Other deck versions are not supported.",
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
}
