/**
 * Verification for the account-level helpers: GLM plan quota and DeepSeek
 * wallet balance. Both are cached per answer and classified, never thrown.
 *
 *   node --test test/quota.test.js
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { queryGlmQuota, queryDeepseekBalance, resolveGitBranch, listBranches, checkoutBranch } from "../lib/index.js";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

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

test("the branch resolver reads .git/HEAD and walks up from a subdirectory", () => {
	const root = mkdtempSync(join(tmpdir(), "usage-hud-git-"));
	try {
		mkdirSync(join(root, ".git"));
		writeFileSync(join(root, ".git", "HEAD"), "ref: refs/heads/feature/x\n");
		mkdirSync(join(root, "src", "deep"), { recursive: true });
		assert.equal(resolveGitBranch(root), "feature/x");
		assert.equal(resolveGitBranch(join(root, "src", "deep")), "feature/x");
		// A detached HEAD reports the short commit.
		writeFileSync(join(root, ".git", "HEAD"), "0123456789abcdef0123456789abcdef01234567\n");
		assert.equal(resolveGitBranch(root), "01234567");
		// Not a repository, or not a directory, yields nothing.
		assert.equal(resolveGitBranch("/"), "");
		assert.equal(resolveGitBranch("relative/path"), "");
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("branches list and switch inside a real repository", async () => {
	const root = mkdtempSync(join(tmpdir(), "usage-hud-branch-"));
	try {
		const git = (...args) => execFileSync("git", ["-C", root, ...args], { stdio: "pipe" });
		git("init", "-q", "-b", "main");
		git("config", "user.email", "test@example.com");
		git("config", "user.name", "test");
		writeFileSync(join(root, "a.txt"), "one\n");
		git("add", "a.txt");
		git("commit", "-q", "-m", "one");
		git("branch", "feature/x");

		const listed = await listBranches(root);
		assert.deepEqual([...listed.branches].sort(), ["feature/x", "main"]);
		assert.equal(listed.current, "main");

		const switched = await checkoutBranch(root, "feature/x");
		assert.equal(switched.ok, true);
		assert.equal((await listBranches(root)).current, "feature/x");

		// Unknown and hostile names are refused before git ever runs.
		assert.equal((await checkoutBranch(root, "nope")).ok, false);
		assert.equal((await checkoutBranch(root, "--upload-pack=evil")).ok, false);
		assert.equal((await listBranches("/definitely/not/here")).branches.length, 0);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});
