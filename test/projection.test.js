/**
 * Fold verification for the `usageHud` projection.
 *
 *   node --test test/projection.test.js
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
	createUsageHudDefinition,
	fold,
	isPeakInstant,
	narrowRates,
	USAGE_HUD_KEY
} from "../lib/projection.js";

/** One committed event, minimally shaped. */
function event(type, data, time = 1000) {
	return { type, data, time };
}

/** An assistant settlement carrying a usage record. */
function settlement(turn, step, usage, extra = {}) {
	return event("assistant/message", { turn, step, usage, ...extra });
}

const USAGE = { inputTokens: 100, outputTokens: 50, cacheReadTokens: 20, cacheWriteTokens: 10, reasoningTokens: 12 };

test("fold accumulates a settled attempt into its route group", () => {
	let state = fold.init();
	state = fold.apply(state, event("model/selection", { provider: "deepseek-account", model: "deepseek-flash" }));
	state = fold.apply(state, settlement(1, 1, USAGE));
	const groups = Object.values(state.buckets.groups);
	assert.equal(groups.length, 1);
	assert.equal(groups[0].provider, "deepseek-account");
	assert.equal(groups[0].model, "deepseek-flash");
	assert.equal(groups[0].uncachedInputTokens, 100);
	assert.equal(groups[0].cacheReadTokens, 20);
	assert.equal(groups[0].cacheWriteTokens, 10);
	assert.equal(groups[0].outputTokens, 50);
	assert.equal(groups[0].reasoningTokens, 12);
	assert.equal(groups[0].attempts, 1);
	assert.equal(state.current.provider, "deepseek-account");
});

test("a second sample in the same slot replaces, not adds", () => {
	let state = fold.init();
	state = fold.apply(state, event("model/selection", { provider: "p", model: "m" }));
	state = fold.apply(state, settlement(1, 1, USAGE));
	state = fold.apply(state, settlement(1, 1, { ...USAGE, inputTokens: 300 }));
	const group = Object.values(state.buckets.groups)[0];
	assert.equal(group.uncachedInputTokens, 300);
	assert.equal(group.attempts, 1);
});

test("a retried attempt adds because its slot was dropped", () => {
	let state = fold.init();
	state = fold.apply(state, event("model/selection", { provider: "p", model: "m" }));
	state = fold.apply(state, settlement(1, 1, USAGE));
	state = fold.apply(state, event("llm/retry-started", { turn: 1, step: 1 }));
	state = fold.apply(state, settlement(1, 1, USAGE));
	const group = Object.values(state.buckets.groups)[0];
	assert.equal(group.uncachedInputTokens, 200);
	assert.equal(group.attempts, 2);
});

test("attempts without a route land in unattributed", () => {
	let state = fold.init();
	state = fold.apply(state, settlement(1, 1, USAGE));
	assert.equal(state.buckets.unattributed.uncachedInputTokens, 100);
	assert.equal(state.buckets.unattributed.attempts, 1);
	assert.equal(state.current, null);
});

test("route falls back to the newest selection; message source wins", () => {
	let state = fold.init();
	state = fold.apply(state, event("model/selection", { provider: "p1", model: "m1" }));
	state = fold.apply(state, settlement(1, 1, USAGE, { message: { source: { provider: "p2", model: "m2" } } }));
	const groupOf = (provider) => Object.values(state.buckets.groups).find((group) => group.provider === provider);
	assert.equal(groupOf("p2").provider, "p2");
	state = fold.apply(state, settlement(1, 2, USAGE));
	assert.equal(groupOf("p1").provider, "p1");
	assert.equal(Object.keys(state.buckets.groups).length, 2);
});

test("an unusable usage record is ignored entirely", () => {
	let state = fold.init();
	state = fold.apply(state, settlement(1, 1, { inputTokens: -5, outputTokens: 10 }));
	state = fold.apply(state, settlement(1, 2, { inputTokens: 3.5, outputTokens: 10 }));
	assert.equal(Object.keys(state.buckets.groups).length, 0);
	assert.equal(state.buckets.unattributed.attempts, 0);
});

test("step start stamps the peak window, not the settlement", () => {
	// 2026-10-26 is a Monday. 10:00 Beijing (02:00 UTC) is peak; 20:00 Beijing is not.
	let state = fold.init();
	const peakStart = Date.UTC(2026, 9, 26, 2, 0, 0);
	const settleLate = Date.UTC(2026, 9, 26, 12, 0, 0);
	state = fold.apply(state, event("model/selection", { provider: "p", model: "m" }));
	state = fold.apply(state, event("step/start", { turn: 1, step: 1 }, peakStart));
	state = fold.apply(state, { ...settlement(1, 1, USAGE), time: settleLate });
	assert.equal(Object.values(state.buckets.groups)[0].peak, true);
});

test("uninterested events return the same state reference", () => {
	const state = fold.init();
	const next = fold.apply(state, event("user/message", { parts: [] }));
	assert.equal(next, state);
});

test("view composes groups with prices and session totals", () => {
	const definition = createUsageHudDefinition({
		lookup: (provider, model) => provider === "p" && model === "m"
			? { currency: "¥", label: "Model M", base: { miss: 1, hit: 0.1, write: 1, out: 2 }, source: "preset" }
			: null
	});
	let state = fold.init();
	state = fold.apply(state, event("model/selection", { provider: "p", model: "m" }));
	state = fold.apply(state, settlement(1, 1, USAGE));
	const view = definition.wire.view(state);
	assert.equal(view.current.provider, "p");
	assert.equal(view.totals.uncachedInputTokens, 100);
	assert.equal(view.totals.attempts, 1);
	const group = Object.values(view.groups)[0];
	assert.equal(group.price.currency, "¥");
	assert.equal(group.price.rates.miss, 1);
	assert.equal(group.price.source, "preset");
});

test("a new selection overrides the settled route as the current model", () => {
	const definition = createUsageHudDefinition({});
	let state = fold.init();
	state = fold.apply(state, event("model/selection", { provider: "p1", model: "m1" }));
	state = fold.apply(state, settlement(1, 1, USAGE));
	// The user switches the model selector: the pill must follow at once.
	state = fold.apply(state, event("model/selection", { provider: "p2", model: "m2" }));
	assert.deepEqual(definition.wire.view(state).current, { provider: "p2", model: "m2" });
	// ... so the settled p1 group remains folded, just not "current".
	assert.equal(Object.keys(definition.wire.view(state).groups).length, 1);
});

test("view falls back to the selection before anything settles", () => {
	const definition = createUsageHudDefinition({});
	let state = fold.init();
	state = fold.apply(state, event("model/selection", { provider: "p", model: "m" }));
	const view = definition.wire.view(state);
	assert.deepEqual(view.current, { provider: "p", model: "m" });
	assert.equal(view.totals.attempts, 0);
});

test("view is cached per state and invalidated by price revision", () => {
	let card = "a";
	const definition = createUsageHudDefinition({
		lookup: () => ({ currency: "$", label: "", base: { miss: 1, hit: 1, write: 1, out: 1 }, source: "preset" }),
		priceRevision: () => card
	});
	let state = fold.init();
	state = fold.apply(state, settlement(1, 1, USAGE));
	const first = definition.wire.view(state);
	const again = definition.wire.view(state);
	assert.equal(first, again);
	card = "b";
	const changed = definition.wire.view(state);
	assert.notEqual(first, changed);
});

test("narrowRates honours the period policy and long-context tiers", () => {
	const price = {
		base: { miss: 1, hit: 0.1, write: 1, out: 2 },
		peak: { miss: 2, hit: 0.2, write: 2, out: 4 },
		tiers: [{ above: 1000, miss: 4, hit: 0.4, write: 4, out: 8 }]
	};
	const peakGroup = { peak: true, uncachedInputTokens: 100, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 0 };
	const offpeakGroup = { ...peakGroup, peak: false };
	const tierGroup = { ...peakGroup, uncachedInputTokens: 2000 };
	assert.equal(narrowRates(price, peakGroup, "auto").miss, 2);
	assert.equal(narrowRates(price, offpeakGroup, "auto").miss, 1);
	assert.equal(narrowRates(price, offpeakGroup, "peak").miss, 2);
	assert.equal(narrowRates(price, peakGroup, "offpeak").miss, 1);
	assert.equal(narrowRates(price, tierGroup, "auto").miss, 4);
});

test("peak window follows Beijing weekdays and hours", () => {
	// Monday 10:00 Beijing.
	assert.equal(isPeakInstant(Date.UTC(2026, 9, 26, 2, 0, 0)), true);
	// Monday 13:00 Beijing (lunch break).
	assert.equal(isPeakInstant(Date.UTC(2026, 9, 26, 5, 0, 0)), false);
	// Monday 20:00 Beijing.
	assert.equal(isPeakInstant(Date.UTC(2026, 9, 26, 12, 0, 0)), false);
	// Sunday 10:00 Beijing.
	assert.equal(isPeakInstant(Date.UTC(2026, 9, 25, 2, 0, 0)), false);
});

test("definition carries the seam contract", () => {
	const definition = createUsageHudDefinition({});
	assert.equal(definition.key, USAGE_HUD_KEY);
	assert.equal(typeof definition.init, "function");
	assert.equal(typeof definition.apply, "function");
	assert.equal(typeof definition.wire.view, "function");
	assert.ok(definition.stateSchema);
	assert.ok(definition.wire.viewSchema);
});
