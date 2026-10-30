import test from "node:test";
import assert from "node:assert/strict";
import {
  signatureModel as M,
  signatureModelScript,
} from "../src/signature-model.js";
import {
  buildProposal as buildReviewedProposal,
  handleProposal,
} from "../src/signature-proposal.js";
import { PDFDocument } from "pdf-lib";
import vm from "node:vm";
import { createHash } from "node:crypto";
import fs from "node:fs";
const buildProposal = (payload) =>
  buildReviewedProposal(
    payload,
    createHash("sha256")
      .update(Buffer.from(payload.template || "", "base64"))
      .digest("hex"),
  );
const p = () => M.defaultPosition("2026-10-30");
test("synthetic chain is expiry-specific; bounded mock Greeks and parity", () => {
  const qs = M.chain(268, "2026-10-30", "2027-01-15");
  const c = qs.find((q) => q.type === "call" && q.strike === 270),
    put = qs.find((q) => q.type === "put" && q.strike === 270);
  assert(c.delta > 0 && c.delta < 1);
  assert(put.delta < 0 && put.delta > -1);
  assert(qs.every((q) => q.mock && q.bid >= 0 && q.ask > q.bid));
  assert.notEqual(
    c.ask,
    M.chain(268, "2026-10-30", "2027-02-19").find(
      (q) => q.type === "call" && q.strike === 270,
    ).ask,
  );
  const T = 77 / 365;
  assert(
    Math.abs(
      (c.bid + c.ask - put.bid - put.ask) / 2 -
        (268 * Math.exp(-0.005 * T) - 270 * Math.exp(-0.04 * T)),
    ) < 0.001,
  );
});
test("protection sorts returns and models contract multiplier, residual shares and signed differences", () => {
  const x = { ...p(), shares: 20501 },
    a = M.protection(x),
    rows = M.scenarios(x);
  assert.equal(a.contracts, 205);
  assert.equal(a.remainder, 1);
  assert.equal(a.value(0), 235 * 20500 + a.net);
  assert.equal(a.value(500), 350 * 20500 + 500 + a.net);
  assert(rows.every((r, i) => !i || r.r < rows[i - 1].r));
  assert(rows[0].difference < 0);
  assert(rows.at(-1).difference > 0);
  assert(
    Math.abs(
      a.net -
        (M.fill(a.call, "sell", x.method) - M.fill(a.put, "buy", x.method)) *
          20500,
    ) < 1e-8,
  );
});
test("three monthly expirations roll through year boundary and skip expired Friday", () => {
  assert.deepEqual(M.monthly("2026-12-18"), [
    "2027-01-15",
    "2027-02-19",
    "2027-03-19",
  ]);
  assert.deepEqual(M.monthly("2026-10-30"), [
    "2026-11-20",
    "2026-12-18",
    "2027-01-15",
  ]);
  assert.throws(() => M.monthly("2026-02-30"));
});
test("delta defaults allocate calls across disjoint tranches, never overcover", () => {
  const x = { ...p(), strategy: "yield", shares: 1051 },
    a = M.yieldPlan(x);
  assert.deepEqual(
    a.rows.map((r) => r.contracts),
    [4, 3, 3],
  );
  assert.equal(a.remainder, 51);
  assert.equal(
    a.rows.reduce((s, r) => s + r.shares, 0),
    1000,
  );
  for (const r of a.rows) {
    const qs = M.chain(x.S, x.asOf, r.expiry).filter(
      (q) => q.type === "call" && q.strike >= x.S,
    );
    assert.equal(r.strike, M.nearest(qs, 0.2, "delta").strike);
  }
  assert.throws(() => M.scenarios(x), /no single/);
});
test("tax-aware ladder uses actual consecutive expiry calendar years, never duplicates a year", () => {
  const x = { ...p(), strategy: "yield", preset: "ladder", years: 3 };
  x.expiries = M.presetExpiries(x);
  assert.deepEqual(
    M.yieldPlan(x).rows.map((r) => r.year),
    [2026, 2027, 2028],
  );
  x.expiries[1] = "2026-12-25";
  assert.throws(() => M.yieldPlan(x));
});
test("infeasible income reports shortfall; overrides and small holdings remain covered", () => {
  const x = {
      ...p(),
      strategy: "yield",
      preset: "income",
      income: 1e8,
      shares: 101,
    },
    a = M.yieldPlan(x);
  assert(a.shortfall > 0);
  assert.equal(a.rows.filter((r) => r.contracts === 0).length, 2);
  assert.equal(
    a.rows.reduce((s, r) => s + r.contracts, 0),
    1,
  );
  x.strikes = [999999];
  assert.throws(() => M.yieldPlan(x), /strikes/);
});
test("invalid positions and expired or out-of-chain legs fail closed", () => {
  for (const change of [
    { S: NaN },
    { shares: 99 },
    { shares: 100.1 },
    { symbol: "<img>" },
    { expiry: "2026-10-29" },
    { put: 999 },
    { method: "foo" },
  ])
    assert.throws(() => M.protection({ ...p(), ...change }));
});
test("serialized browser model has no unresolved module references", () => {
  const ctx = {};
  vm.runInNewContext(signatureModelScript, ctx);
  assert.equal(ctx.SignatureModel.protection(p()).contracts, 200);
});
async function fixture() {
  const d = await PDFDocument.create();
  for (let i = 1; i <= 14; i++) d.addPage().drawText("TEST FIXTURE PAGE " + i);
  return Buffer.from(await d.save()).toString("base64");
}
test("PDF includes one original explanation per used strategy, then only selected analytics", async () => {
  const template = await fixture(),
    x = p(),
    y = { ...p(), symbol: "MSFT", strategy: "yield" };
  const doc = await PDFDocument.load(
    await buildProposal({
      positions: [x, x, y],
      pages: { protection: 3, yield: 9 },
      template,
    }),
  );
  assert.equal(doc.getPageCount(), 12);
  assert.equal(doc.getPage(1).getWidth(), 595.28);
  const only = await PDFDocument.load(
    await buildProposal({ positions: [x], pages: { protection: 3 }, template }),
  );
  assert.equal(only.getPageCount(), 6);
  await assert.rejects(
    buildProposal({
      positions: [{ ...x, strategy: "borrow" }],
      pages: {},
      template,
    }),
  );
  await assert.rejects(
    buildProposal({
      positions: [x],
      pages: { protection: 3 },
      template: "bad",
    }),
  );
});
test("proposal endpoint rejects wrong methods, cross-origin posts, oversized payloads and malformed inputs", async () => {
  assert.equal(
    (
      await handleProposal(
        new Request("https://example.com/api/signature-proposal"),
      )
    ).status,
    405,
  );
  assert.equal(
    (
      await handleProposal(
        new Request("https://example.com/api/signature-proposal", {
          method: "POST",
          headers: { origin: "https://evil.test" },
        }),
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await handleProposal(
        new Request("https://example.com/api/signature-proposal", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "content-length": "999999999",
          },
          body: "{}",
        }),
      )
    ).status,
    413,
  );
  assert.equal(
    (
      await handleProposal(
        new Request("https://example.com/api/signature-proposal", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: "{}",
        }),
      )
    ).status,
    400,
  );
});

test("low-price chains retain protective strikes and year-end ladders start in a future year", () => {
  const x = { ...p(), S: 1, put: 0.9, call: 1.2 };
  assert.equal(M.protection(x).contracts, 200);
  const y = { ...p(), asOf: "2026-12-31", strategy: "yield", preset: "ladder" };
  y.expiries = M.presetExpiries(y);
  assert.deepEqual(
    M.yieldPlan(y).rows.map((r) => r.year),
    [2027, 2028, 2029],
  );
});

test("production assembly rejects substitute decks even with client fingerprint or page overrides", async () => {
  const template = await fixture();
  await assert.rejects(
    buildReviewedProposal({
      positions: [p()],
      template,
      pages: { protection: 4 },
      expectedDigest: createHash("sha256")
        .update(Buffer.from(template, "base64"))
        .digest("hex"),
    }),
    /original/,
  );
});
test(
  "reviewed source deck assembly includes only selected explainers and common appendices",
  { skip: !process.env.SIGNATURE_DECK_PATH },
  async () => {
    const template = fs
      .readFileSync(process.env.SIGNATURE_DECK_PATH)
      .toString("base64");
    const x = p(),
      y = { ...p(), strategy: "yield" };
    const protection = await PDFDocument.load(
      await buildReviewedProposal({
        positions: [x],
        template,
        pages: { protection: 4 },
      }),
    );
    assert.equal(protection.getPageCount(), 6);
    assert(protection.getPages().every((p) => p.getWidth() === 1008));
    const yieldOnly = await PDFDocument.load(
      await buildReviewedProposal({ positions: [y], template }),
    );
    assert.equal(yieldOnly.getPageCount(), 9);
    const mixed = await PDFDocument.load(
      await buildReviewedProposal({ positions: [x, x, y], template }),
    );
    assert.equal(mixed.getPageCount(), 12);
  },
);

test("only chain-listed monthly expirations are selectable for Protection and Yield", () => {
  const available = M.optionExpirations("AAPL", "2026-10-30");
  assert.equal(available.length, 60);
  assert.deepEqual(available.slice(0, 3), [
    "2026-11-20",
    "2026-12-18",
    "2027-01-15",
  ]);
  assert.equal(M.days("2026-10-30", available[0]), 21);
  assert(!available.includes("2026-11-21"));
  assert.throws(
    () => M.protection({ ...p(), expiry: "2026-11-21" }),
    /available expiration/,
  );
  assert.throws(
    () =>
      M.yieldPlan({
        ...p(),
        strategy: "yield",
        expiries: ["2026-11-21", "2026-12-18", "2027-01-15"],
      }),
    /available expirations/,
  );
  assert.deepEqual(M.optionExpirations("AAPL", "2026-11-20").slice(0, 2), [
    "2026-12-18",
    "2027-01-15",
  ]);
});

test("collar chart axes cover stock/strikes and all payoff values across position sizes", () => {
  for (const x of [
    p(),
    { ...p(), S: 1, put: 0.9, call: 1.2, shares: 101 },
    { ...p(), S: 5000, put: 4500, call: 9500, shares: 10000000 },
  ]) {
    const chart = M.collarChart(x);
    assert(chart.x.min <= Math.min(x.S, x.put));
    assert(chart.x.max >= x.call);
    assert(chart.x.max > chart.x.min);
    assert(chart.y.max > chart.y.min);
    assert(chart.x.ticks.length >= 3 && chart.x.ticks.length <= 8);
    assert(chart.y.ticks.length >= 3 && chart.y.ticks.length <= 8);
    for (const point of chart.points) {
      assert(point.stock >= chart.y.min && point.stock <= chart.y.max);
      assert(point.collar >= chart.y.min && point.collar <= chart.y.max);
      assert.equal(point.collar, M.protection(x).value(point.price));
    }
    assert(chart.points.some((pt) => pt.price === x.put));
    assert(chart.points.some((pt) => pt.price === x.call));
  }
  const initial = M.collarChart(p());
  assert(M.collarChart({ ...p(), shares: 40000 }).y.max > initial.y.max);
  assert(M.collarChart({ ...p(), call: 530 }).x.max > initial.x.max);
});
