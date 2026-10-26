/**
 * dsh-usage-hud, node half.
 *
 * Two host-side responsibilities:
 *
 * 1. **The fold.** A `usageHud` projection unit is registered on the
 *    session-projection seam, so the browser receives per-model,
 *    per-rate-window token buckets folded over the complete durable log,
 *    plus the route of the latest settled request. See `lib/projection.js`.
 * 2. **The prices.** Each folded group is priced on the Host from the
 *    harness's own model catalog, overlaid with the user's overrides, and
 *    the resolved rates ride the wire with the group, so the browser
 *    multiplies and never chooses: it cannot disagree with the Host about a
 *    price. See `lib/pricing.js`.
 *
 * The exported `Config` is what the Loader validates this entry's `config`
 * against, and the same schema becomes the settings namespace named by the
 * profile entry id (`usage-hud`).
 *
 * @module dsh-usage-hud
 */
import z from "@deepseek-ai/schemastery";
import { createPriceLookup } from "./pricing.js";
import { createUsageHudDefinition } from "./projection.js";

/** Profile entry id; also the settings namespace the browser addresses. */
export const NAMESPACE = "usage-hud";

/** Cordis plugin name. */
export const name = "usage-hud";

/** The projection registry is required: without it there is nothing to fold into. */
export const inject = ["sessionProjections"];

/**
 * One peak rate set, in the entry's `currency` per 1,000,000 tokens.
 * Every number is `.required()` so a partially typed override is rejected
 * loudly here rather than silently understating the session.
 */
const Rates = z.object({
	miss: z.number().required(),
	hit: z.number().required(),
	write: z.number().required(),
	out: z.number().required()
});

/** All-zero rates, the sentinel for "this vendor has no peak window". */
const ZERO_RATES = { miss: 0, hit: 0, write: 0, out: 0 };

/**
 * One user override. Presets cover the harness's whole catalog, so an entry
 * here is only needed for a route the catalog does not price — a self-hosted
 * or gateway endpoint, a negotiated discount, or a catalog rate you disagree
 * with. All-zero peak rates are the documented way to say "one rate all day".
 */
const PriceOverride = z.object({
	/** Symbol prefixed to this entry's amounts; empty inherits the plugin's `currency`. */
	currency: z.string().default(""),
	/** Display name shown in the breakdown; empty shows `<provider>/<model>`. */
	label: z.string().default(""),
	/** Uncached prompt input per 1,000,000 tokens. */
	miss: z.number().required(),
	/** Cached prompt input per 1,000,000 tokens. */
	hit: z.number().required(),
	/** Cache-write prompt input per 1,000,000 tokens. */
	write: z.number().required(),
	/** Output tokens per 1,000,000 tokens. */
	out: z.number().required(),
	/** Peak-window rates; leave all four at 0 when the vendor charges one rate all day. */
	peak: Rates.default(ZERO_RATES)
});

/**
 * Live configuration.
 *
 * Every field is `.volatile()` on purpose: `dsh-settings` exposes only
 * volatile fields to the browser and to the settings page; a non-volatile
 * field would resolve on the Host and never reach the surface that
 * maintains it.
 */
export const Config = z.object({
	/** Whether the usage pill renders at all. */
	enabled: z.boolean().default(true).volatile(),
	/** `auto` charges each folded group the window it actually fell in. */
	period: z.union(["auto", "peak", "offpeak"]).default("auto").volatile(),
	/** Symbol for override entries that name none. The catalog prices in dollars, the DeepSeek official routes in yuan. */
	currency: z.string().default("$").volatile(),
	/**
	 * Which DeepSeek price list the official routes are billed from: the
	 * domestic platform quotes CNY, the international one USD. `cny` is the
	 * default because neither is a conversion of the other — this pins the
	 * card rather than guessing.
	 */
	officialRates: z.union(["cny", "usd"]).default("cny").volatile(),
	/**
	 * Price overrides keyed by `<provider>/<model>` or by bare `<model>`.
	 * Presets derived from the harness catalog apply underneath, so this
	 * table starts empty and stays small.
	 */
	prices: z.dict(PriceOverride).default({}).volatile(),
	/**
	 * The `authorization` request header of a signed-in bigmodel.cn session,
	 * used to read the GLM Coding Plan quota (5-hour window and weekly line).
	 * Empty disables the quota section entirely.
	 */
	glmAuthorization: z.string().default("").volatile()
});

/** The bigmodel.cn monitor endpoint the GLM Coding Plan usage page itself reads. */
export const GLM_QUOTA_URL = "https://bigmodel.cn/api/monitor/usage/quota/limit";
/** How long one successful quota answer stands; the plan window moves slowly. */
export const GLM_QUOTA_TTL_MS = 5 * 60 * 1000;

/** The module-level quota cache: one answer per token, shared by every caller. */
const glmQuotaCache = new Map();

/**
 * Query the GLM Coding Plan quota for one authorization header.
 *
 * Success is cached for `GLM_QUOTA_TTL_MS` per token, so the pill's periodic
 * poll and a manual refresh share one upstream request; failures are never
 * cached. The `unit` codes on the wire: `3` is the 5-hour window, `6` the
 * weekly line.
 *
 * @param authorization - the raw `authorization` header value.
 * @param options - a fetch implementation and clock, injectable for tests.
 * @returns the classified answer for the browser.
 */
export async function queryGlmQuota(authorization, options = {}) {
	const token = typeof authorization === "string" ? authorization.trim() : "";
	if (token === "") return { status: "no-token" };
	const now = typeof options.now === "function" ? options.now() : Date.now();
	const fetchImpl = options.fetchImpl ?? fetch;
	const cached = glmQuotaCache.get(token);
	if (cached !== undefined && now - cached.fetchedAt < GLM_QUOTA_TTL_MS) {
		return { status: "ok", body: cached.body, fetchedAt: cached.fetchedAt };
	}
	try {
		const upstream = await fetchImpl(GLM_QUOTA_URL, { headers: { authorization: token } });
		const text = await upstream.text();
		let body;
		try {
			body = JSON.parse(text);
		} catch (_unparsable) {
			body = undefined;
		}
		if (upstream.status === 401 || upstream.status === 403) return { status: "auth-invalid" };
		if (!upstream.ok) return { status: "error", message: `upstream ${upstream.status}` };
		if (body === undefined || !Array.isArray(body?.limits)) return { status: "error", message: "unparsable upstream answer" };
		glmQuotaCache.set(token, { body, fetchedAt: now });
		return { status: "ok", body, fetchedAt: now };
	} catch (error) {
		return { status: "error", message: error?.message ?? String(error) };
	}
}

/** How long one balance answer stands; Platform records recharges, not live spend. */
export const DEEPSEEK_BALANCE_TTL_MS = 3 * 60 * 1000;

/** The module-level balance cache, shared by every caller of the one route. */
let deepseekBalanceCache = { at: 0, value: null };
/** The live account service, borrowed while its fiber runs; null without one. */
let deepseekAccountService = null;

/**
 * Query the signed-in Platform wallets through the harness's own account seam.
 *
 * The service answers `null` while signed out and a `failed` outcome when
 * Platform did not respond; both are carried as states, never errors. Only a
 * `ready` answer is cached — an offline moment should not pin a stale wallet.
 *
 * @param service - the `deepseekAccount` context service, or null.
 * @param options - a clock, injectable for tests.
 * @returns the classified answer for the browser.
 */
export async function queryDeepseekBalance(service, options = {}) {
	if (service === null || service === undefined) return { status: "unavailable" };
	const now = typeof options.now === "function" ? options.now() : Date.now();
	if (deepseekBalanceCache.value !== null && now - deepseekBalanceCache.at < DEEPSEEK_BALANCE_TTL_MS) {
		return { status: "ok", ...deepseekBalanceCache.value, fetchedAt: deepseekBalanceCache.at };
	}
	try {
		const client = {
			version: "1.0.0",
			locale: "en",
			timezoneOffsetSeconds: -new Date().getTimezoneOffset() * 60
		};
		const balance = await service.getBalance(client);
		if (balance === null || typeof balance !== "object" || balance.status !== "ready" || !Array.isArray(balance.value)) {
			return { status: "unavailable" };
		}
		const wallet = (entry) => ({
			currency: entry?.currency === "USD" ? "USD" : entry?.currency === "CNY" ? "CNY" : String(entry?.currency ?? ""),
			balance: typeof entry?.balance === "string" ? entry.balance : String(entry?.balance ?? "")
		});
		const value = {
			wallets: balance.value.map(wallet),
			bonusWallets: Array.isArray(balance.bonusWallets) ? balance.bonusWallets.map(wallet) : []
		};
		deepseekBalanceCache = { at: now, value };
		return { status: "ok", ...value, fetchedAt: now };
	} catch (_unreadable) {
		return { status: "error" };
	}
}

/** Write one JSON response the same way the harness's own routes do. */
function sendJson(response, status, body) {
	response.writeHead(status, {
		"content-type": "application/json; charset=utf-8",
		"cache-control": "no-store"
	});
	response.end(JSON.stringify(body));
}

/**
 * Read one resolved config field, unwrapping the volatile accessor handle
 * Schemastery resolves `.volatile()` fields to.
 *
 * @param value - the resolved field, plain or volatile.
 * @param fallback - what to use when the field is absent.
 * @returns the field's value.
 */
function configValue(value, fallback) {
	if (value === undefined || value === null) return fallback;
	return typeof value.get === "function" ? value.get() : value;
}

/**
 * Register the `usageHud` unit, pricing each group from the harness catalog
 * overlaid with this entry's overrides.
 *
 * Disabling the plugin registers nothing rather than publishing an unpriced
 * fold: with no key served the browser renders no pill.
 *
 * @param ctx - registrant context carrying the projection registry.
 * @param config - resolved plugin configuration.
 */
export function apply(ctx, config) {
	if (configValue(config?.enabled, true) === false) return;
	ctx.sessionProjections.register(createUsageHudDefinition({
		lookup: createPriceLookup({
			overrides: configValue(config?.prices, undefined),
			defaultCurrency: configValue(config?.currency, undefined),
			officialCard: configValue(config?.officialRates, "cny")
		}),
		period: configValue(config?.period, "auto"),
		// The card and the override table can both change an already-composed
		// view, so both belong in the pricing identity the cache keys on.
		priceRevision: () => JSON.stringify([
			configValue(config?.officialRates, "cny"),
			configValue(config?.period, "auto"),
			configValue(config?.prices, undefined)
		])
	}));
	// The signed-in Platform wallets ride the harness's own account seam: the
	// service already owns the credential and the request headers, so the route
	// only has to hand its answer to the browser. Composed only when an account
	// adapter is active; a key-only install leaves the balance section hidden.
	ctx.inject(["deepseekAccount"], (scope) => {
		deepseekAccountService = scope.deepseekAccount;
		ctx.effect(() => () => {
			deepseekAccountService = null;
		}, "usage-hud: balance seam");
	});
	// The GLM Coding Plan quota is an account-level figure the browser cannot
	// read directly (CORS), so the Host proxies one same-origin route over the
	// monitor endpoint the vendor's own usage page reads. Registered only when
	// a web server is composed; a deployment without one simply shows no quota.
	ctx.inject(["webServer"], (scope) => {
		ctx.effect(() => scope.webServer.register({
			kind: "exact",
			path: "/usage-hud/api/glm-quota",
			handler: async (request, response) => {
				if (request.method !== "GET") {
					response.writeHead(405, { allow: "GET" });
					response.end();
					return;
				}
				// Read at request time: a token pasted into the settings takes
				// effect without restarting anything.
				const answer = await queryGlmQuota(configValue(config?.glmAuthorization, ""));
				if (answer.status === "ok") {
					sendJson(response, 200, { status: "ok", limits: answer.body.limits, fetchedAt: answer.fetchedAt });
					return;
				}
				if (answer.status === "no-token") {
					sendJson(response, 409, { status: "no-token" });
					return;
				}
				if (answer.status === "auth-invalid") {
					sendJson(response, 401, { status: "auth-invalid" });
					return;
				}
				sendJson(response, 502, { status: "error", message: answer.message ?? "upstream" });
			}
		}), "usage-hud: glm quota route");
		ctx.effect(() => scope.webServer.register({
			kind: "exact",
			path: "/usage-hud/api/deepseek-balance",
			handler: async (request, response) => {
				if (request.method !== "GET") {
					response.writeHead(405, { allow: "GET" });
					response.end();
					return;
				}
				const answer = await queryDeepseekBalance(deepseekAccountService);
				if (answer.status === "ok") {
					sendJson(response, 200, { status: "ok", wallets: answer.wallets, bonusWallets: answer.bonusWallets, fetchedAt: answer.fetchedAt });
					return;
				}
				if (answer.status === "unavailable") {
					sendJson(response, 409, { status: "unavailable" });
					return;
				}
				sendJson(response, 502, { status: "error" });
			}
		}), "usage-hud: deepseek balance route");
	});
}
