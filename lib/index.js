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
	prices: z.dict(PriceOverride).default({}).volatile()
});

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
}
