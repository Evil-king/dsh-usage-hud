/**
 * Verification for the account-level helpers: GLM plan quota and DeepSeek
 * wallet balance. Both are cached per answer and classified, never thrown.
 *
 *   node --test test/quota.test.js
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { queryGlmQuota, queryDeepseekBalance } from "../lib/index.js";

function fetchOnce(body, status = 200) {
	let calls = 0;
	const fetchImpl = async () => {
		calls += 1;
		return { ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(body) };
	};
	return { fetchImpl, calls: () => calls };
}

test("an empty token asks nothing upstream", async () => {
	const { fetchImpl, calls } = fetchOnce({});
	const answer = await queryGlmQuota("  ", { fetchImpl });
	assert.equal(answer.status, "no-token");
	assert.equal(calls(), 0);
});

test("a quota answer is classified, cached, and token-scoped", async () => {
	// The vendor's real envelope: limits and the plan level live under `data`.
	const body = {
		code: 200,
		success: true,
		data: {
			limit: null,
			limits: [
				{ type: "TIME_LIMIT", unit: 5, number: 1, usage: 4000, currentValue: 7, remaining: 3993, percentage: 1, nextResetTime: 1795228470977 },
				{ type: "TOKENS_LIMIT", unit: 3, number: 5, percentage: 59, nextResetTime: 1793002211831 },
				{ type: "TOKENS_LIMIT", unit: 6, number: 1, percentage: 11, nextResetTime: 1793586870974 }
			],
			level: "max"
		}
	};
	const { fetchImpl, calls } = fetchOnce(body);
	const first = await queryGlmQuota("token-a", { fetchImpl, now: () => 1000 });
	assert.equal(first.status, "ok");
	assert.equal(first.body.limits[1].percentage, 59);
	assert.equal(first.body.level, "max");
	// Within the TTL the second answer comes from cache.
	const second = await queryGlmQuota("token-a", { fetchImpl, now: () => 1000 + 60_000 });
	assert.equal(second.status, "ok");
	assert.equal(calls(), 1);
	// After the TTL it refetches.
	await queryGlmQuota("token-a", { fetchImpl, now: () => 1000 + 10 * 60_000 });
	assert.equal(calls(), 2);
	// Another token is another cache slot.
	await queryGlmQuota("token-b", { fetchImpl, now: () => 1000 });
	assert.equal(calls(), 3);
});

test("a rejected token is auth-invalid, not an error", async () => {
	const { fetchImpl } = fetchOnce({}, 401);
	assert.equal((await queryGlmQuota("stale", { fetchImpl })).status, "auth-invalid");
});

test("an unparsable upstream answer is an error", async () => {
	const fetchImpl = async () => ({ ok: true, status: 200, text: async () => "<html>" });
	assert.equal((await queryGlmQuota("weird", { fetchImpl })).status, "error");
});

test("balance maps the ready wallets and bonus wallets", async () => {
	const service = {
		getBalance: async () => ({
			status: "ready",
			value: [ { currency: "CNY", balance: "12.34" } ],
			bonusWallets: [ { currency: "CNY", balance: "3.00" } ]
		})
	};
	const answer = await queryDeepseekBalance(service, { now: () => 2000 });
	assert.equal(answer.status, "ok");
	assert.deepEqual(answer.wallets, [ { currency: "CNY", balance: "12.34" } ]);
	assert.deepEqual(answer.bonusWallets, [ { currency: "CNY", balance: "3.00" } ]);
	// Cached within the TTL: the service is not asked twice.
	let asked = 0;
	const counting = { getBalance: async () => { asked += 1; return { status: "ready", value: [] }; } };
	// Past the TTL of the answer cached above: this refetches once, then serves
	// the cached answer back.
	const past = 2000 + 10 * 60_000;
	await queryDeepseekBalance(counting, { now: () => past });
	await queryDeepseekBalance(counting, { now: () => past + 30_000 });
	assert.equal(asked, 1);
});

test("a signed-out or failed account seam is unavailable", async () => {
	assert.equal((await queryDeepseekBalance(null)).status, "unavailable");
	assert.equal((await queryDeepseekBalance({ getBalance: async () => null })).status, "unavailable");
	assert.equal((await queryDeepseekBalance({ getBalance: async () => ({ status: "failed" }) })).status, "unavailable");
});

test("a throwing account seam is an error, not a crash", async () => {
	const answer = await queryDeepseekBalance({ getBalance: async () => { throw new Error("boom"); } });
	assert.equal(answer.status, "error");
});
