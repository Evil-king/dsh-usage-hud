/**
 * Preset unit prices for the `usageHud` fold, derived from the harness's own
 * model catalog plus the DeepSeek official price cards.
 *
 * The catalog (`@earendil-works/pi-ai`, the same one `dsh-llm-pi-ai` serves
 * from) ships 41 providers and ~1495 models, each with
 * `cost: { input, output, cacheRead, cacheWrite }` in USD per 1,000,000
 * tokens. Deriving presets from it rather than hardcoding a table means every
 * model the harness can route to is priced out of the box, and the numbers
 * track the installed catalog version.
 *
 * The catalog cannot price the DeepSeek official routes: `dsh-llm-deepseek`
 * is a separate adapter billed in CNY (domestic platform) or USD
 * (international platform) off the vendor's published page, so those rates
 * live here, per card.
 *
 * @module dsh-usage-hud/pricing
 */
import { getBuiltinModelDataGeneratedAt, getBuiltinModels, getBuiltinProviders } from "@earendil-works/pi-ai/providers/all";

/** Every built-in catalog provider prices in USD per 1,000,000 tokens. */
export const CATALOG_CURRENCY = "$";

/** The domestic official card quotes CNY per 1,000,000 tokens. */
export const OFFICIAL_CURRENCY = "¥";

/** The international official card quotes USD per 1,000,000 tokens. */
export const OFFICIAL_CURRENCY_USD = "$";

/**
 * DeepSeek publishes two price lists for the same models, one per platform.
 * Peak is Beijing time Monday–Friday 09:00–12:00 and 14:00–18:00 on both
 * cards; every other hour (and weekends) is off-peak at half the peak rate.
 * The vendor publishes no cache-write rate, so a cached write costs the
 * cache-miss rate.
 */
export const OFFICIAL_CARDS = {
	cny: {
		"deepseek-official/deepseek-flash": {
			currency: OFFICIAL_CURRENCY,
			label: "DeepSeek-V4.1-Flash",
			miss: 1,
			hit: 0.02,
			write: 1,
			out: 4,
			peak: { miss: 2, hit: 0.04, write: 2, out: 8 }
		},
		"deepseek-official/deepseek-v4-pro": {
			currency: OFFICIAL_CURRENCY,
			label: "DeepSeek-V4-Pro-0813",
			miss: 4.5,
			hit: 0.15,
			write: 4.5,
			out: 13.5,
			peak: { miss: 9, hit: 0.3, write: 9, out: 27 }
		}
	},
	usd: {
		"deepseek-official/deepseek-flash": {
			currency: OFFICIAL_CURRENCY_USD,
			label: "DeepSeek-V4.1-Flash",
			miss: 0.15,
			hit: 0.003,
			write: 0.15,
			out: 0.6,
			peak: { miss: 0.3, hit: 0.006, write: 0.3, out: 1.2 }
		},
		"deepseek-official/deepseek-v4-pro": {
			currency: OFFICIAL_CURRENCY_USD,
			label: "DeepSeek-V4-Pro-0813",
			miss: 0.66,
			hit: 0.022,
			write: 0.66,
			out: 1.98,
			peak: { miss: 1.32, hit: 0.044, write: 1.32, out: 3.96 }
		}
	}
};

/**
 * Every provider id that bills the official rates. DeepSeek exposes two ways
 * to reach the same models — an API key adapter and a signed-in-account
 * adapter — under separate provider ids, and a Session names the one that
 * served each request, so both must price.
 */
export const OFFICIAL_PROVIDERS = ["deepseek-official", "deepseek-account"];
for (const card of Object.values(OFFICIAL_CARDS)) {
	for (const route of Object.keys(card)) {
		const model = route.slice(route.indexOf("/") + 1);
		for (const provider of OFFICIAL_PROVIDERS) card[`${provider}/${model}`] = card[route];
	}
}

/** The card used when nothing says which platform bills the account. */
export const DEFAULT_OFFICIAL_CARD = "cny";

/**
 * The routes of one official card.
 *
 * @param card - `cny`, `usd`, or anything else for the default card.
 * @returns the card's route table.
 */
export function officialRoutes(card) {
	return OFFICIAL_CARDS[card] ?? OFFICIAL_CARDS[DEFAULT_OFFICIAL_CARD];
}

/**
 * Harness routes the catalog knows under another provider id, consulted only
 * after the official table and an exact catalog hit.
 */
const PROVIDER_ALIASES = {
	"deepseek-official": "deepseek",
	"deepseek-account": "deepseek"
};

/** A non-negative finite number, or 0. */
function rate(value) {
	return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0;
}

/** One four-rate set from a catalog cost object. */
function ratesOf(cost) {
	return {
		miss: rate(cost.input),
		hit: rate(cost.cacheRead),
		write: rate(cost.cacheWrite),
		out: rate(cost.output)
	};
}

/** Whether a rate set carries no billing information at all. */
function isUnpriced(rates) {
	return rates.miss === 0 && rates.hit === 0 && rates.write === 0 && rates.out === 0;
}

let cachedCatalog;
let cachedGeneratedAt;

/**
 * Every catalog route's preset, keyed `"<provider>/<model>"`.
 *
 * A broken or absent catalog narrows what is priced; it must never take the
 * plugin down, so a throw here yields an empty table and overrides still
 * apply.
 *
 * @returns the preset table, built once per process.
 */
export function catalogPresets() {
	if (cachedCatalog !== undefined) return cachedCatalog;
	const table = Object.create(null);
	try {
		for (const provider of getBuiltinProviders()) {
			for (const model of getBuiltinModels(provider)) {
				const cost = model.cost ?? {};
				const tiers = Array.isArray(cost.tiers)
					? cost.tiers
						.filter((tier) => typeof tier.inputTokensAbove === "number")
						.map((tier) => ({ above: tier.inputTokensAbove, ...ratesOf(tier) }))
						.sort((left, right) => left.above - right.above)
					: [];
				table[`${provider}/${model.id}`] = {
					currency: CATALOG_CURRENCY,
					label: typeof model.name === "string" && model.name !== "" ? model.name : model.id,
					...ratesOf(cost),
					...(tiers.length === 0 ? {} : { tiers })
				};
			}
		}
	} catch (_catalogUnavailable) {
		// An unreadable catalog leaves the table as far as it got.
	}
	cachedCatalog = table;
	return table;
}

/**
 * The installed catalog's generation timestamp, shown as price provenance.
 *
 * @returns epoch milliseconds, or undefined when the catalog does not say.
 */
export function catalogGeneratedAt() {
	if (cachedGeneratedAt !== undefined) return cachedGeneratedAt;
	try {
		cachedGeneratedAt = getBuiltinModelDataGeneratedAt();
	} catch (_catalogUnavailable) {
		cachedGeneratedAt = undefined;
	}
	return cachedGeneratedAt;
}

/**
 * Normalize one config override entry into the internal preset shape.
 *
 * All rates default to 0: a partially typed row prices nothing rather than
 * silently understating the session, and an all-zero row is the documented
 * spelling of "this route is free / I do not want it priced".
 */
function overrideOf(entry, defaultCurrency) {
	if (entry === null || typeof entry !== "object") return null;
	const declaredPeak = entry.peak !== null && typeof entry.peak === "object" ? entry.peak : null;
	const peak = declaredPeak !== null && !isUnpriced(declaredPeak) ? declaredPeak : null;
	return {
		currency: typeof entry.currency === "string" && entry.currency !== "" ? entry.currency : defaultCurrency,
		label: typeof entry.label === "string" ? entry.label : "",
		miss: rate(entry.miss),
		hit: rate(entry.hit),
		write: rate(entry.write),
		out: rate(entry.out),
		...(peak === null ? {} : { peak: { miss: rate(peak.miss), hit: rate(peak.hit), write: rate(peak.write), out: rate(peak.out) } })
	};
}

/**
 * Normalize one resolved preset into the wire price a client prices with.
 *
 * @param entry - a catalog or official preset.
 * @param source - where the price came from, for the disclosure.
 * @returns the wire price.
 */
function shape(entry, source) {
	const base = { miss: rate(entry.miss), hit: rate(entry.hit), write: rate(entry.write), out: rate(entry.out) };
	const declaredPeak = entry.peak === undefined || entry.peak === null ? null : entry.peak;
	const peak = declaredPeak === null || isUnpriced(declaredPeak)
		? undefined
		: { miss: rate(declaredPeak.miss), hit: rate(declaredPeak.hit), write: rate(declaredPeak.write), out: rate(declaredPeak.out) };
	const tiers = Array.isArray(entry.tiers) && entry.tiers.length > 0
		? entry.tiers.map((tier) => ({ above: rate(tier.above), miss: rate(tier.miss), hit: rate(tier.hit), write: rate(tier.write), out: rate(tier.out) }))
		: undefined;
	return {
		currency: typeof entry.currency === "string" && entry.currency !== "" ? entry.currency : CATALOG_CURRENCY,
		label: typeof entry.label === "string" ? entry.label : "",
		base,
		...(peak === undefined ? {} : { peak }),
		...(tiers === undefined ? {} : { tiers }),
		source
	};
}

/**
 * Build the resolution used to price one folded attempt.
 *
 * Precedence: a user override keyed `<provider>/<model>`, then one keyed by
 * the bare `<model>`, then the DeepSeek official table, then the catalog for
 * the exact route, then the catalog under the route's alias.
 *
 * @param options - user overrides, the default currency for entries that name
 *   none, the official card selector, and an optional catalog table.
 * @returns a resolver from one route to its wire price, or null when nothing
 *   prices it.
 */
export function createPriceLookup(options = {}) {
	const overrides = options.overrides !== null && typeof options.overrides === "object" ? options.overrides : {};
	const defaultCurrency = typeof options.defaultCurrency === "string" && options.defaultCurrency !== "" ? options.defaultCurrency : CATALOG_CURRENCY;
	const catalog = options.catalog ?? catalogPresets();
	const cardOf = (source) => {
		const value = typeof source === "function" ? source() : source;
		return value === "usd" ? "usd" : DEFAULT_OFFICIAL_CARD;
	};
	const prepared = Object.create(null);
	for (const key of Object.keys(overrides)) {
		const entry = overrideOf(overrides[key], defaultCurrency);
		if (entry !== null) prepared[key] = entry;
	}
	return (provider, model) => {
		const card = cardOf(options.officialCard);
		if (typeof model !== "string" || model === "") return null;
		const qualified = typeof provider === "string" && provider !== "" ? `${provider}/${model}` : null;
		const routes = qualified === null ? [model] : [qualified, model];
		for (const route of routes) {
			const override = prepared[route];
			if (override !== undefined) return shape(override, "override");
		}
		if (qualified !== null) {
			const official = officialRoutes(card)[qualified];
			if (official !== undefined) return shape(official, "preset");
			const direct = catalog[qualified];
			if (direct !== undefined) return shape(direct, "preset");
			const alias = PROVIDER_ALIASES[provider];
			if (alias !== undefined) {
				const aliased = catalog[`${alias}/${model}`];
				if (aliased !== undefined) return shape(aliased, "preset");
			}
		}
		return null;
	};
}
