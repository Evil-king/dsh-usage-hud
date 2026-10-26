/**
 * The `usageHud` projection unit: a pure fold of the durable attempt
 * lifecycle into per-model, per-rate-window token buckets, plus the route
 * that served the session's latest settled request (the "current model").
 *
 * The fold mirrors `tokenUsage`'s add/replace bookkeeping so the two stay
 * reconcilable: a settlement replaces the buckets recorded for the same
 * `(turn, step)` slot, and `llm/retry-started` drops the slot so a retried
 * attempt adds rather than replaces -- both attempts were billed.
 *
 * Pricing never happens here. The fold is a pure function of the committed
 * log; prices are attached in the composed view (see `view()`), so a rate
 * change or a settings change recomposes the same recorded tokens.
 *
 * @module dsh-usage-hud/projection
 */
import { z } from "zod";

/** The projection key this unit owns. */
export const USAGE_HUD_KEY = "usageHud";

/** Persisted-state version; bump when the serialized shape changes. */
export const USAGE_HUD_STATE_VERSION = 1;

/** Beijing is UTC+8 with no daylight saving. */
const BEIJING_OFFSET_MS = 28800000;

/**
 * Whether one instant falls in DeepSeek's Beijing-time peak window:
 * Monday-Friday 09:00-12:00 and 14:00-18:00. Everything else is off-peak.
 *
 * A fixed rule, not configuration: the fold must stay a pure function of the
 * log, so the window is recorded at settlement time and the `period` display
 * policy is applied later, in the view.
 *
 * @param ms - Unix epoch milliseconds of the request's step start.
 * @returns whether the peak rate applies.
 */
export function isPeakInstant(ms) {
	const shifted = new Date(ms + BEIJING_OFFSET_MS);
	const day = shifted.getUTCDay();
	if (day === 0 || day === 6) return false;
	const minutes = shifted.getUTCHours() * 60 + shifted.getUTCMinutes();
	return (minutes >= 540 && minutes < 720) || (minutes >= 840 && minutes < 1080);
}

// -- wire/state schemas -------------------------------------------------------

const bucketBase = {
	/** Prompt input not served from the provider's cache. */
	uncachedInputTokens: z.number().int().nonnegative(),
	/** Prompt input served from the provider's cache. */
	cacheReadTokens: z.number().int().nonnegative(),
	/** Prompt input written into the provider's cache. */
	cacheWriteTokens: z.number().int().nonnegative(),
	/** Generated output tokens. */
	outputTokens: z.number().int().nonnegative(),
	/** Output tokens the provider reports as reasoning, a subset of output. */
	reasoningTokens: z.number().int().nonnegative()
};

/** One rate set in some currency per 1,000,000 tokens. */
const ratesSchema = z.object({
	miss: z.number().nonnegative(),
	hit: z.number().nonnegative(),
	write: z.number().nonnegative(),
	out: z.number().nonnegative()
});

/** The price the Host resolved for one group, narrowed to the rate set that applies. */
const priceSchema = z.object({
	currency: z.string(),
	/** Display name for the route; the catalog's `name`, or the override's label. */
	label: z.string(),
	/** The one rate set the Host billed this group with. */
	rates: ratesSchema,
	source: z.union([z.literal("preset"), z.literal("override")])
});

const bucketSchema = z.object({ ...bucketBase, attempts: z.number().int().nonnegative() });

const groupSchema = bucketSchema.extend({
	provider: z.string(),
	model: z.string(),
	peak: z.boolean(),
	price: priceSchema.optional()
});

/** The payload a client receives. */
export const wireSchema = z.object({
	groups: z.record(z.string(), groupSchema),
	unattributed: bucketSchema,
	/** Route of the latest settled request, or the newest selection when none settled. */
	current: z.object({ provider: z.string(), model: z.string() }).nullable(),
	/** Session-wide sums over groups plus unattributed. */
	totals: bucketSchema
}).strict();

/** The fold state's full shape, validated on persisted-cache rows before they seed a fold. */
export const stateSchema = z.object({
	/** Client-visible groups and unattributed bucket; reference-stable between events. */
	buckets: z.object({
		groups: z.record(z.string(), bucketSchema.extend({ provider: z.string(), model: z.string(), peak: z.boolean() })),
		unattributed: bucketSchema
	}).strict(),
	/** The `(turn, step)` slot whose buckets a later sample in the same attempt replaces. */
	last: z.object({
		turn: z.number().int().nonnegative(),
		step: z.number().int().nonnegative(),
		group: z.string().nullable(),
		totals: z.object(bucketBase).strict()
	}).strict().nullable(),
	/** Newest `model/selection` in effect, used when an attempt settles no route. */
	selection: z.object({ provider: z.string(), model: z.string() }).strict().nullable(),
	/** Route of the latest settled attempt, or null while none settled. */
	current: z.object({ provider: z.string(), model: z.string() }).strict().nullable(),
	/** Open step, so an attempt is stamped with its request's start, not its settlement. */
	step: z.object({
		turn: z.number().int().nonnegative(),
		step: z.number().int().nonnegative(),
		startTime: z.number().nonnegative()
	}).strict().nullable()
}).strict();

// -- helpers ------------------------------------------------------------------

/** A non-negative safe integer, or undefined. */
function count(value) {
	return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : undefined;
}

/** A zeroed five-bucket total. */
function zeroTotals() {
	return {
		uncachedInputTokens: 0,
		cacheReadTokens: 0,
		cacheWriteTokens: 0,
		outputTokens: 0,
		reasoningTokens: 0
	};
}

/** A zeroed wire bucket. */
function zeroBucket() {
	return { ...zeroTotals(), attempts: 0 };
}

/** Whether a bucket carries nothing at all. */
function isEmptyBucket(bucket) {
	return bucket.uncachedInputTokens === 0
		&& bucket.cacheReadTokens === 0
		&& bucket.cacheWriteTokens === 0
		&& bucket.outputTokens === 0
		&& bucket.attempts === 0;
}

/** Whether two five-bucket totals are equal. */
function sameTotals(left, right) {
	return left.uncachedInputTokens === right.uncachedInputTokens
		&& left.cacheReadTokens === right.cacheReadTokens
		&& left.cacheWriteTokens === right.cacheWriteTokens
		&& left.outputTokens === right.outputTokens
		&& left.reasoningTokens === right.reasoningTokens;
}

/**
 * The five disjoint buckets one provider usage record contributes.
 *
 * `reasoningTokens` is reported inside `outputTokens` by the provider; it is
 * carried for display and never added to any total.
 *
 * @param usage - a provider usage record from a settled or failed attempt.
 * @returns the buckets, or undefined when the record is unusable.
 */
function totalsOf(usage) {
	if (usage === null || typeof usage !== "object") return undefined;
	const input = count(usage.inputTokens);
	const output = count(usage.outputTokens);
	if (input === undefined || output === undefined) return undefined;
	const cacheRead = usage.cacheReadTokens === undefined ? 0 : count(usage.cacheReadTokens);
	const cacheWrite = usage.cacheWriteTokens === undefined ? 0 : count(usage.cacheWriteTokens);
	if (cacheRead === undefined || cacheWrite === undefined) return undefined;
	let reasoning = 0;
	if (usage.reasoningTokens !== undefined) {
		reasoning = count(usage.reasoningTokens);
		// A reasoning count the provider did not actually generate is noise.
		if (reasoning === undefined || reasoning > output) reasoning = 0;
	}
	return {
		uncachedInputTokens: input,
		cacheReadTokens: cacheRead,
		cacheWriteTokens: cacheWrite,
		outputTokens: output,
		reasoningTokens: reasoning
	};
}

/**
 * The usage one durable attempt settlement reports: an explicit
 * `assistant/message.usage` wins, otherwise the last `usage` chunk embedded
 * in the stream.
 *
 * @param event - a committed session event.
 * @returns the usage record, or undefined when this event reports none.
 */
function usageOf(event) {
	if (event.type === "assistant/message" && event.data.usage !== undefined) return event.data.usage;
	if (event.type !== "assistant/message" && event.type !== "assistant/attempt") return undefined;
	const stream = event.data.stream;
	if (!Array.isArray(stream)) return undefined;
	for (let index = stream.length - 1; index >= 0; index -= 1) {
		const record = stream[index];
		if (record === null || typeof record !== "object" || record.type !== "chunk") continue;
		const chunk = record.chunk;
		if (chunk !== null && typeof chunk === "object" && chunk.type === "usage") return chunk.usage;
	}
	return undefined;
}

/** A `{provider, model}` with both members non-empty, or null. */
function validSelection(value) {
	if (value === null || typeof value !== "object") return null;
	const provider = value.provider;
	const model = value.model;
	if (typeof provider !== "string" || provider === "") return null;
	if (typeof model !== "string" || model === "") return null;
	return { provider, model };
}

/**
 * The route a settled attempt is billed to: its own assembled message when it
 * has one, otherwise the newest selection in effect.
 */
function routeOf(event, state) {
	if (event.type === "assistant/message" && event.data.message !== undefined) {
		const own = validSelection(event.data.message === null ? null : event.data.message.source);
		if (own !== null) return own;
	}
	return state.selection;
}

/** The group key for one route and rate window. */
function groupKeyOf(route, peak) {
	return `${route.provider}\u0000${route.model}\u0000${peak ? "peak" : "offpeak"}`;
}

/**
 * Apply one signed contribution to the bucket state.
 *
 * @param buckets - the current bucket state.
 * @param group - group key, or null for the unattributed slot.
 * @param descriptor - route and window, required only when this creates a group.
 * @param totals - the five buckets to apply.
 * @param sign - `1` to add, `-1` to remove.
 * @returns the next bucket state.
 */
function contribute(buckets, group, descriptor, totals, sign) {
	const apply = (current) => ({
		uncachedInputTokens: Math.max(0, current.uncachedInputTokens + sign * totals.uncachedInputTokens),
		cacheReadTokens: Math.max(0, current.cacheReadTokens + sign * totals.cacheReadTokens),
		cacheWriteTokens: Math.max(0, current.cacheWriteTokens + sign * totals.cacheWriteTokens),
		outputTokens: Math.max(0, current.outputTokens + sign * totals.outputTokens),
		reasoningTokens: Math.max(0, current.reasoningTokens + sign * totals.reasoningTokens),
		attempts: Math.max(0, current.attempts + sign)
	});
	if (group === null) {
		return { groups: buckets.groups, unattributed: apply(buckets.unattributed) };
	}
	const current = Object.prototype.hasOwnProperty.call(buckets.groups, group) ? buckets.groups[group] : undefined;
	// Removal carries no descriptor: the entry being undone already holds one.
	const source = current ?? descriptor;
	if (source === undefined || source === null) return buckets;
	const next = apply({
		uncachedInputTokens: current?.uncachedInputTokens ?? 0,
		cacheReadTokens: current?.cacheReadTokens ?? 0,
		cacheWriteTokens: current?.cacheWriteTokens ?? 0,
		outputTokens: current?.outputTokens ?? 0,
		reasoningTokens: current?.reasoningTokens ?? 0,
		attempts: current?.attempts ?? 0,
		provider: source.provider,
		model: source.model,
		peak: source.peak
	});
	next.provider = source.provider;
	next.model = source.model;
	next.peak = source.peak;
	const groups = { ...buckets.groups };
	if (isEmptyBucket(next)) delete groups[group];
	else groups[group] = next;
	return { groups, unattributed: buckets.unattributed };
}

/** The empty fold state. */
function emptyState() {
	return {
		buckets: { groups: {}, unattributed: zeroBucket() },
		last: null,
		selection: null,
		current: null,
		step: null
	};
}

/**
 * The pure fold: previous state plus one committed session event.
 *
 * An uninterested event returns the SAME state reference, which keeps the
 * drive's work proportional to the events this unit actually consumes.
 */
export const fold = {
	init: () => emptyState(),
	apply: (state, event) => {
		switch (event.type) {
			case "model/selection": {
				const selection = validSelection(event.data);
				if (selection === null) return state;
				if (state.selection !== null
					&& state.selection.provider === selection.provider
					&& state.selection.model === selection.model) return state;
				return { ...state, selection };
			}
			case "step/start": {
				const { turn, step } = event.data;
				if (state.step !== null && state.step.turn === turn && state.step.step === step) return state;
				return { ...state, step: { turn, step, startTime: event.time } };
			}
			case "step/end": {
				if (state.step === null) return state;
				if (state.step.turn !== event.data.turn || state.step.step !== event.data.step) return state;
				return { ...state, step: null };
			}
			case "turn/end": {
				if (state.step === null || state.step.turn !== event.data.turn) return state;
				return { ...state, step: null };
			}
			case "llm/retry-started": {
				// Dropping the slot makes the retried attempt ADD instead of
				// replacing the attempt it supersedes. Both were billed.
				if (state.last === null) return state;
				if (state.last.turn !== event.data.turn || state.last.step !== event.data.step) return state;
				return { ...state, last: null };
			}
			case "assistant/message":
			case "assistant/attempt": {
				const sample = usageOf(event);
				if (sample === undefined) return state;
				const totals = totalsOf(sample);
				if (totals === undefined) return state;
				const { turn, step } = event.data;
				const previous = state.last !== null && state.last.turn === turn && state.last.step === step ? state.last : null;
				const route = routeOf(event, state);
				const at = state.step !== null && state.step.turn === turn && state.step.step === step ? state.step.startTime : event.time;
				const peak = isPeakInstant(typeof at === "number" ? at : 0);
				const group = route === null ? null : groupKeyOf(route, peak);
				if (previous !== null && previous.group === group && sameTotals(previous.totals, totals)) return state;
				let buckets = state.buckets;
				if (previous !== null) buckets = contribute(buckets, previous.group, null, previous.totals, -1);
				buckets = contribute(buckets, group, route === null ? null : { provider: route.provider, model: route.model, peak }, totals, 1);
				return {
					...state,
					buckets,
					current: route === null ? state.current : { provider: route.provider, model: route.model },
					last: { turn, step, group, totals }
				};
			}
			default:
				return state;
		}
	}
};

/**
 * Narrow one resolved price to the single rate set that applies to a group.
 *
 * Long-context tiers replace both windows, mirroring the catalog's own
 * `calculateCost`: the highest configured threshold the group's total input
 * exceeds prices the whole request. Otherwise the `period` policy selects the
 * window, defaulting to the one the request actually fell in.
 *
 * @param price - the resolved preset or override.
 * @param group - the folded group, for its token split and recorded window.
 * @param period - the settings policy: `auto` honours the recorded window.
 * @returns the applicable four-rate set.
 */
export function narrowRates(price, group, period) {
	if (Array.isArray(price.tiers)) {
		const inputTokens = group.uncachedInputTokens + group.cacheReadTokens + group.cacheWriteTokens;
		let matched;
		for (const tier of price.tiers) {
			if (inputTokens > tier.above) matched = tier;
		}
		if (matched !== undefined) {
			return { miss: matched.miss, hit: matched.hit, write: matched.write, out: matched.out };
		}
	}
	const peakWindow = period === "peak" ? true : period === "offpeak" ? false : group.peak === true;
	return peakWindow && price.peak !== undefined ? price.peak : price.base;
}

/** Sum every group plus the unattributed slot into one bucket. */
function sumTotals(buckets) {
	const totals = zeroBucket();
	for (const bucket of [ ...Object.values(buckets.groups), buckets.unattributed ]) {
		totals.uncachedInputTokens += bucket.uncachedInputTokens;
		totals.cacheReadTokens += bucket.cacheReadTokens;
		totals.cacheWriteTokens += bucket.cacheWriteTokens;
		totals.outputTokens += bucket.outputTokens;
		totals.reasoningTokens += bucket.reasoningTokens;
		totals.attempts += bucket.attempts;
	}
	return totals;
}

/**
 * Create the `usageHud` projection unit for one resolved price table.
 *
 * The composed view is cached per state object: the live drive dedupes by
 * `Object.is`, so an object-valued view allocated on every call would publish
 * on every event. `priceRevision` exists because the cached view is a function
 * of the prices as well -- the same recorded state must recompose when the
 * resolved card or the price table changes.
 *
 * @param options - the host-composed price resolver, the rate-window policy,
 *   and an optional getter for whatever else the composed prices depend on.
 * @returns the definition to register on the session-projection seam.
 */
export function createUsageHudDefinition({ lookup, period = "auto", priceRevision } = {}) {
	const resolve = typeof lookup === "function" ? lookup : () => null;
	const policy = period === "peak" || period === "offpeak" ? period : "auto";
	const revisionOf = typeof priceRevision === "function" ? priceRevision : () => null;
	const cache = new WeakMap();
	return {
		key: USAGE_HUD_KEY,
		stateVersion: USAGE_HUD_STATE_VERSION,
		stateSchema,
		init: fold.init,
		apply: fold.apply,
		wire: {
			viewSchema: wireSchema,
			view(state) {
				const revision = revisionOf();
				const cached = cache.get(state);
				if (cached !== undefined && cached.revision === revision) return cached.view;
				const groups = {};
				for (const key of Object.keys(state.buckets.groups)) {
					const group = state.buckets.groups[key];
					const price = resolve(group.provider, group.model);
					if (price === null) {
						groups[key] = group;
						continue;
					}
					// The browser multiplies and never chooses: the rates that
					// apply ride the wire, so it cannot disagree with the Host.
					groups[key] = {
						...group,
						price: {
							currency: price.currency,
							label: price.label,
							rates: narrowRates(price, group, policy),
							source: price.source
						}
					};
				}
				const view = {
					groups,
					unattributed: state.buckets.unattributed,
					// No settled route yet: the newest selection is the current model.
					current: state.current ?? state.selection,
					totals: sumTotals(state.buckets)
				};
				cache.set(state, { revision, view });
				return view;
			}
		}
	};
}

/** The fold without prices, for tests and for hosts that price nothing. */
export const usageHudProjectionDefinition = createUsageHudDefinition({});
