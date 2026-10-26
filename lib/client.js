window.__ModuleLoader__.load({
	id: "dsh-usage-hud",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		const react = require("react");
		const react_dom = require("react-dom");
		/** The shell's own UI primitives, so the panel behaves and measures exactly as the dock's other trays do. */
		const primitives = require("@deepseek-ai/dsh-client-ui-primitives");
		const h = react.createElement;
		//#region constants
		/** Dictionary namespace owned by this plugin; must equal the profile entry id. */
		const NS = "usage-hud";
		/** Composer-dock list that already carries the session's time and token pills. */
		const SLOT = "conversation.composer.dock";
		/** The Host fold this plugin registers; absent while the Host half serves nothing. */
		const PROJECTION = "usageHud";
		/** This package's name; the Plugins page keys config seats by it. */
		const PACKAGE = "dsh-usage-hud";
		/** Bundle-own configuration seat on the Plugins page. */
		const BUNDLE_SEAT = "plugins.bundle.config";
		/** One patch row's configuration seat, keyed `<package>#<row id>`. */
		const ROW_SEAT = "plugins.row.config";
		/** Panel placement metrics, in the dock's own units. */
		const PANEL_GAP = 8;
		const PANEL_MARGIN = 12;
		const PANEL_MAX_HEIGHT = 460;
		/**
		* Unplaced portal panel: hidden but laid out, so the clamp's measure pass
		* sees real dimensions instead of collapsing to nothing. Same shape the
		* built-in stat dialog uses.
		*/
		const MEASURE_STYLE = {
			visibility: "hidden",
			left: 0,
			top: 0
		};
		/** Stable no-op subscription, so a missing settings form still calls the hooks it always calls. */
		const NOOP_SUBSCRIBE = () => () => {};
		/** Stable empty read for the same reason. */
		const EMPTY_SNAPSHOT = () => void 0;
		//#endregion
		//#region css
		const CSS = ".dshHud_root{box-sizing:border-box;min-width:0;max-width:100%;font-size:calc(var(--dsh-content-font-size-secondary,13px) - 1px);line-height:calc(20px + var(--dsh-content-font-delta-secondary,0px));justify-content:center;gap:12px;display:flex}.dshHud_anchor{min-width:0;display:inline-flex}.dshHud_pill{box-sizing:border-box;corner-shape:round;max-width:100%;color:var(--dsw-alias-label-tertiary);font:inherit;font-variant-numeric:tabular-nums;line-height:inherit;white-space:nowrap;cursor:pointer;background:0 0;border:none;border-radius:999px;align-items:center;gap:6px;padding:1px 8px;display:inline-flex}.dshHud_pill svg{flex:none;width:14px;height:14px}.dshHud_pill:hover,.dshHud_pill[aria-expanded=true]{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-secondary)}.dshHud_model{text-overflow:ellipsis;min-width:0;overflow:hidden}.dshHud_pillCost{color:var(--dsw-alias-label-secondary)}.dshHud_panel{position:fixed;z-index:1100;box-sizing:border-box;width:max-content;min-width:min(320px,100vw - 24px);max-width:min(460px,100vw - 24px);border:0;border-radius:var(--dsw-radius-lg);background:var(--dsw-specific-menu);backdrop-filter:var(--dsw-menu-backdrop-filter);--dsw-elevation-stroke-color:var(--dsw-alias-border-l1);box-shadow:var(--dsw-elevation-prominent);color:var(--dsw-alias-label-secondary);cursor:default;padding:16px;font-size:12px;line-height:18px}.dshHud_title{color:var(--dsw-alias-label-primary);justify-content:space-between;gap:16px;margin-bottom:8px;font-weight:500;display:flex}.dshHud_titleValue{font-variant-numeric:tabular-nums}.dshHud_rule{border-top:.5px solid var(--dsw-alias-border-l2);margin-bottom:10px}.dshHud_sections{flex-direction:column;gap:10px;display:flex;overflow:auto}.dshHud_section{flex-direction:column;gap:4px;display:flex}.dshHud_sectionHead{color:var(--dsw-alias-label-primary);align-items:baseline;gap:8px;font-weight:500;display:flex;min-width:0}.dshHud_sectionName{text-overflow:ellipsis;min-width:0;overflow:hidden}.dshHud_currentTag{flex:none;color:var(--dsw-alias-state-business-primary);font-size:11px;font-weight:400}.dshHud_sectionMeta{color:var(--dsw-alias-label-tertiary);font-weight:400;font-size:11px;white-space:nowrap}.dshHud_row{grid-template-columns:minmax(0,1fr) auto auto;align-items:baseline;gap:0 10px;display:grid}.dshHud_rowLabel{color:var(--dsw-alias-label-secondary);min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.dshHud_rowDetail{color:var(--dsw-alias-label-tertiary);font-variant-numeric:tabular-nums;white-space:nowrap}.dshHud_rowCost{color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums;text-align:right;white-space:nowrap}.dshHud_subtotal{color:var(--dsw-alias-label-secondary);margin-top:2px;font-variant-numeric:tabular-nums;text-align:right}.dshHud_total{justify-content:space-between;gap:16px;margin-top:10px;padding-top:10px;font-weight:500;display:flex;border-top:.5px solid var(--dsw-alias-border-l2)}.dshHud_amounts{font-variant-numeric:tabular-nums;text-align:right}.dshHud_note{color:var(--dsw-alias-label-tertiary);margin-top:6px;font-size:11px;line-height:16px}.dshHud_form{display:flex;flex-direction:column}.dshHud_notice{margin:0 0 12px;font-size:12px;line-height:1.5;color:var(--dsw-alias-label-tertiary)}.dshHud_field{display:flex;flex-direction:column;gap:6px;padding:12px 0}.dshHud_field+.dshHud_field{border-top:.5px solid var(--dsw-alias-border-l2)}.dshHud_fieldHead{align-items:center;gap:8px;display:flex}.dshHud_fieldLabel{flex:1;min-width:0;font-size:13px;font-weight:500;line-height:1.5;color:var(--dsw-alias-label-primary)}.dshHud_hint{margin:0;font-size:12px;line-height:1.5;color:var(--dsw-alias-label-tertiary)}.dshHud_control{box-sizing:border-box;appearance:none;width:100%;height:34px;padding:0 30px 0 12px;border:.5px solid var(--dsw-alias-border-l4);border-radius:var(--dsw-radius-md);background:var(--dsw-alias-bg-layer-3);color:var(--dsw-alias-label-primary);font:inherit;font-size:13px;line-height:1.5}.dshHud_control:focus-visible{outline:none;border-color:var(--dsw-alias-state-business-primary)}.dshHud_input{box-sizing:border-box;width:100%;height:34px;padding:0 12px;border:.5px solid var(--dsw-alias-border-l4);border-radius:var(--dsw-radius-md);background:var(--dsw-alias-bg-layer-3);color:var(--dsw-alias-label-primary);font:inherit;font-size:13px;line-height:1.5}.dshHud_input:focus-visible{outline:none;border-color:var(--dsw-alias-state-business-primary)}.dshHud_select{display:flex;align-items:center;position:relative;flex:1;min-width:0}.dshHud_select svg{position:absolute;right:10px;pointer-events:none;color:var(--dsw-alias-label-tertiary)}.dshHud_footer{align-items:center;gap:8px;padding-top:16px;display:flex}.dshHud_status{font-size:12px;line-height:1.5;color:var(--dsw-alias-label-tertiary)}.dshHud_status[data-state=failed]{color:var(--dsw-alias-label-error)}.dshHud_line{display:flex;flex-wrap:wrap;align-items:flex-end;gap:10px}.dshHud_cell{display:flex;flex-direction:column;gap:4px;min-width:0}.dshHud_cellLabel{font-size:11px;line-height:1.5;color:var(--dsw-alias-label-tertiary)}.dshHud_cell .dshHud_input,.dshHud_cell .dshHud_control{width:92px}.dshHud_cellName{flex:1;min-width:180px}.dshHud_cellName .dshHud_input{width:100%}.dshHud_rateGroupLabel{align-self:center;min-width:110px;font-size:12px;line-height:1.5;color:var(--dsw-alias-label-tertiary)}.dshHud_route{padding:2px 0}.dshHud_route+.dshHud_route{border-top:.5px solid var(--dsw-alias-border-l2)}.dshHud_routeHead{display:flex;align-items:center;gap:8px}.dshHud_routeKey{flex:1;min-width:0;font-size:12px;line-height:1.5;color:var(--dsw-alias-label-tertiary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.dshHud_pillQuota{color:var(--dsw-alias-label-tertiary)}.dshHud_pillQuota em{font-style:normal;color:var(--dsw-alias-label-secondary)}.dshHud_quotaBar{height:4px;border-radius:2px;background:var(--dsw-alias-interactive-bg-hover);overflow:hidden;margin-top:3px}.dshHud_quotaFill{height:100%;border-radius:2px;background:var(--dsw-alias-state-success-primary)}.dshHud_quotaFill--weekly{background:var(--dsw-alias-link)}.dshHud_quotaRow{display:flex;flex-direction:column;gap:1px}.dshHud_quotaLine{display:flex;justify-content:space-between;gap:12px;align-items:baseline}.dshHud_quotaLabel{color:var(--dsw-alias-label-secondary)}.dshHud_quotaMeta{color:var(--dsw-alias-label-tertiary);font-variant-numeric:tabular-nums;font-size:11px}.dshHud_quotaHead{display:flex;justify-content:space-between;align-items:baseline;gap:12px;margin-bottom:4px}.dshHud_quotaRefresh{font-size:11px;padding:0 6px;height:20px;min-height:20px}";
		/** Inject the class sheet once per page, keyed by the same tag protocol shipped plugins use. */
		function injectCss() {
			const tagId = "dsh-usage-hud/UsageHud.css";
			if (typeof document === "undefined") return;
			if (document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") !== null) return;
			const tag = document.createElement("style");
			tag.dataset.plugin = PACKAGE;
			tag.dataset.pluginCss = tagId;
			tag.textContent = CSS;
			document.head.appendChild(tag);
		}
		//#endregion
		//#region view
		/** Non-negative finite number, or 0. */
		function num(value) {
			return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0;
		}
		/** The five token buckets plus the settled-attempt count a wire bucket carries. */
		function bucketOf(value) {
			const source = value !== null && typeof value === "object" ? value : {};
			return {
				uncachedInputTokens: num(source.uncachedInputTokens),
				cacheReadTokens: num(source.cacheReadTokens),
				cacheWriteTokens: num(source.cacheWriteTokens),
				outputTokens: num(source.outputTokens),
				reasoningTokens: num(source.reasoningTokens),
				attempts: num(source.attempts)
			};
		}
		/** Total tokens across a bucket's four billed members. */
		function bucketTotal(bucket) {
			return bucket.uncachedInputTokens + bucket.cacheReadTokens + bucket.cacheWriteTokens + bucket.outputTokens;
		}
		/** Compact token count: 1234, 12.3k, 1.23M. */
		function formatTokens(value) {
			if (value < 1e3) return String(value);
			if (value < 1e6) return `${(value / 1e3).toFixed(value < 1e4 ? 1 : 0)}k`;
			return `${(value / 1e6).toFixed(2)}M`;
		}
		/** Money text with the precision the magnitude deserves. */
		function formatMoney(value, currency) {
			if (!Number.isFinite(value) || value <= 0) return `${currency}0.00`;
			const digits = value >= 1 ? 2 : value >= 0.01 ? 3 : 4;
			return `${currency}${value.toFixed(digits)}`;
		}
		/** The display name a group is disclosed under. */
		function labelOf(group, price) {
			if (price !== null && price !== undefined && typeof price.label === "string" && price.label !== "") return price.label;
			const provider = typeof group.provider === "string" ? group.provider : "";
			const model = typeof group.model === "string" ? group.model : "";
			return provider === "" ? model : `${provider}/${model}`;
		}
		/** The priced rows of one bucket, dropping empty ones. */
		function pricedRows(bucket, rates, currency) {
			return [
				{ key: "panel.bucket.miss", tokens: bucket.uncachedInputTokens, price: num(rates.miss) },
				{ key: "panel.bucket.hit", tokens: bucket.cacheReadTokens, price: num(rates.hit) },
				{ key: "panel.bucket.write", tokens: bucket.cacheWriteTokens, price: num(rates.write) },
				{ key: "panel.bucket.out", tokens: bucket.outputTokens, price: num(rates.out) }
			].filter((row) => row.tokens > 0).map((row) => ({
				key: row.key,
				tokens: row.tokens,
				cost: row.tokens / 1e6 * row.price,
				detail: `${formatTokens(row.tokens)} × ${currency}${row.price}/M`
			}));
		}
		/**
		 * Compose the wire payload into everything the pill and the panel draw.
		 *
		 * Pure: same wire in, same view out, so the panel and the pill can never
		 * disagree about a figure.
		 *
		 * @param wire - the `usageHud` projection value, or undefined/null.
		 * @returns the view, or null when nothing has been recorded yet.
		 */
		function buildView(wire) {
			if (wire === null || wire === undefined || typeof wire !== "object") return null;
			const raw = wire.groups !== null && typeof wire.groups === "object" ? wire.groups : {};
			const unattributed = bucketOf(wire.unattributed);
			const totals = bucketOf(wire.totals);
			const current = wire.current !== null && typeof wire.current === "object"
				? { provider: String(wire.current.provider ?? ""), model: String(wire.current.model ?? "") }
				: null;
			const rows = [];
			const totalsByCurrency = new Map();
			const unpriced = [];
			for (const key of Object.keys(raw)) {
				const group = raw[key];
				if (group === null || typeof group !== "object") continue;
				const bucket = bucketOf(group);
				const price = group.price !== null && typeof group.price === "object" ? group.price : null;
				const rates = price !== null && price.rates !== null && typeof price.rates === "object" ? price.rates : null;
				const currency = price !== null && typeof price.currency === "string" && price.currency !== "" ? price.currency : "$";
				const bucketCosts = rates === null ? [] : pricedRows(bucket, rates, currency);
				let cost = 0;
				for (const row of bucketCosts) cost += row.cost;
				if (rates !== null) totalsByCurrency.set(currency, (totalsByCurrency.get(currency) ?? 0) + cost);
				else unpriced.push(labelOf(group, price));
				rows.push({
					key,
					label: labelOf(group, price),
					provider: typeof group.provider === "string" ? group.provider : "",
					model: typeof group.model === "string" ? group.model : "",
					peak: group.peak === true,
					attempts: bucket.attempts,
					bucket,
					rates,
					currency,
					source: price !== null && price.source === "override" ? "override" : "preset",
					bucketCosts,
					cost,
					isCurrent: current !== null && current.provider === group.provider && current.model === group.model
				});
			}
			if (rows.length === 0 && totals.attempts === 0) return null;
			// The current model reads first, then the expensive rest.
			rows.sort((left, right) => (Number(right.isCurrent) - Number(left.isCurrent)) || (right.cost - left.cost) || left.label.localeCompare(right.label));
			/**
			 * Pill figures follow the *selected* model, so switching the model
			 * selector moves the pill at once: its own tokens, its own cost.
			 * Before the selection has served anything they read zero, which is
			 * the honest answer; the panel still totals the whole session.
			 */
			const currentRows = rows.filter((row) => row.isCurrent);
			let currentLabel = null;
			let pillCurrency = null;
			let pillCost = 0;
			let pillPlus = false;
			let pillTokens = 0;
			for (const row of currentRows) {
				if (currentLabel === null) currentLabel = row.label;
				pillTokens += bucketTotal(row.bucket);
				if (row.rates !== null) {
					if (pillCurrency === null || pillCurrency === row.currency) {
						pillCurrency = row.currency;
						pillCost += row.cost;
					} else {
						pillPlus = true;
					}
				}
			}
			if (currentRows.length === 0) {
				// No selection recorded at all: fall back to the session figures.
				if (current === null) pillTokens = bucketTotal(totals);
			}
			if (totalsByCurrency.size > 1) pillPlus = true;
			if (currentLabel === null && current !== null) {
				currentLabel = current.provider === "" ? current.model : `${current.provider}/${current.model}`;
			}
			return {
				rows,
				totals,
				sessionTokens: bucketTotal(totals),
				unattributed,
				totalsByCurrency: [ ...totalsByCurrency.entries() ].map(([currency, amount]) => ({ currency, amount })),
				unpriced,
				current,
				currentLabel,
				pillCurrency,
				pillCost,
				pillPlus,
				pillTokens
			};
		}
		//#endregion
		//#region quota
		/** How long one quota answer stands, mirroring the Host's own cache. */
		const QUOTA_TTL_MS = 5 * 60 * 1000;
		/** Poll tick: cheap, because the fetch no-ops while the TTL holds. */
		const QUOTA_TICK_MS = 60 * 1000;
		/** The one quota answer every outlet shares, plus its subscribers. */
		const quotaStore = { value: null, fetchedAt: 0, pending: null, listeners: new Set() };
		/**
		* Poll the Host's same-origin quota proxy once, skipping while its TTL holds.
		*
		* The route answers 409 while no token is configured and 401 when the vendor
		* rejects it; both are carried as states rather than errors, so the panel can
		* explain itself instead of blinking.
		*
		* @param force - bypass the TTL, for the panel's manual refresh.
		* @returns the settled store, after every listener was told.
		*/
		async function pollQuota(force) {
			const now = Date.now();
			if (force !== true && quotaStore.value !== null && quotaStore.value.state === "ok" && now - quotaStore.fetchedAt < QUOTA_TTL_MS) return quotaStore.value;
			if (quotaStore.pending !== null) return quotaStore.pending;
			quotaStore.pending = (async () => {
				// The error default keeps a 200 with an unusable body from wedging
				// the pending slot: every path settles on a real state.
				let next = { state: "error", limits: null, fetchedAt: now };
				try {
					const response = await fetch("/usage-hud/api/glm-quota", { cache: "no-store" });
					if (response.status === 200) {
						const body = await response.json();
						if (body !== null && typeof body === "object" && Array.isArray(body.limits)) {
							next = { state: "ok", limits: body.limits, fetchedAt: body.fetchedAt ?? now };
						}
					}
					else if (response.status === 409) next = { state: "no-token", limits: null, fetchedAt: now };
					else if (response.status === 401) next = { state: "auth-invalid", limits: null, fetchedAt: now };
				} finally {
					quotaStore.value = next;
					quotaStore.fetchedAt = next.fetchedAt;
					quotaStore.pending = null;
					for (const listener of quotaStore.listeners) listener();
				}
				return next;
			})();
			return quotaStore.pending;
		}
		/** The quota answer as a hook: subscribes, polls on mount, ticks the TTL. */
		function useGlmQuota() {
			const [snapshot, setSnapshot] = react.useState(quotaStore.value);
			react.useEffect(() => {
				const listener = () => {
					setSnapshot(quotaStore.value);
				};
				quotaStore.listeners.add(listener);
				pollQuota().catch(() => {});
				const timer = setInterval(() => {
					pollQuota().catch(() => {});
				}, QUOTA_TICK_MS);
				return () => {
					quotaStore.listeners.delete(listener);
					clearInterval(timer);
				};
			}, []);
			return snapshot;
		}
		/**
		* The reset moment one limit carries, in that limit's own granularity: the
		* 5-hour window names its clock time, the weekly line its date.
		* @param limit - one vendor limit record.
		* @returns the localized reset text, or "" when it names no moment.
		*/
		function quotaResetText(limit) {
			const at = Number(limit?.nextResetTime);
			if (!Number.isFinite(at) || at <= 0) return "";
			const date = new Date(at);
			const two = (value) => String(value).padStart(2, "0");
			if (limit.unit === 3) return `${two(date.getHours())}:${two(date.getMinutes())}`;
			return `${date.getMonth() + 1}\u6708${date.getDate()}\u65e5`;
		}
		/**
		* The pill's compact quota text: "78%/64%" for the two windows it knows.
		* @param limits - the vendor limit records, or null.
		* @returns the text, or null when there is nothing to draw.
		*/
		function quotaPillText(limits) {
			if (!Array.isArray(limits)) return null;
			const hourly = limits.find((limit) => limit.unit === 3);
			const weekly = limits.find((limit) => limit.unit === 6);
			const percent = (limit) => Math.max(0, Math.min(100, Math.round(Number(limit?.percentage) || 0)));
			if (hourly === undefined && weekly === undefined) return null;
			return [hourly, weekly].filter((limit) => limit !== undefined).map((limit) => `${percent(limit)}%`).join("/");
		}
		//#region balance
		/** How long one balance answer stands; recharges, not live spend, move it. */
		const BALANCE_TTL_MS = 3 * 60 * 1000;
		/** Poll tick for the balance: cheap, the fetch no-ops while the TTL holds. */
		const BALANCE_TICK_MS = 60 * 1000;
		/** The one balance answer every outlet shares, plus its subscribers. */
		const balanceStore = { value: null, fetchedAt: 0, pending: null, listeners: new Set() };
		/**
		* Poll the Host's same-origin DeepSeek balance proxy once.
		*
		* 409 means the account seam is unavailable (a key-only install); the pill
		* then simply draws no balance rather than an invented zero.
		*
		* @param force - bypass the TTL, for the panel's manual refresh.
		* @returns the settled store, after every listener was told.
		*/
		async function pollBalance(force) {
			const now = Date.now();
			if (force !== true && balanceStore.value !== null && balanceStore.value.state === "ok" && now - balanceStore.fetchedAt < BALANCE_TTL_MS) return balanceStore.value;
			if (balanceStore.pending !== null) return balanceStore.pending;
			balanceStore.pending = (async () => {
				// Same error default as the quota poll: no path may leave the
				// pending slot wedged without a state to render.
				let next = { state: "error", wallets: null, fetchedAt: now };
				try {
					const response = await fetch("/usage-hud/api/deepseek-balance", { cache: "no-store" });
					if (response.status === 200) {
						const body = await response.json();
						if (body !== null && typeof body === "object" && Array.isArray(body.wallets)) {
							next = { state: "ok", wallets: body.wallets, bonusWallets: Array.isArray(body.bonusWallets) ? body.bonusWallets : [], fetchedAt: body.fetchedAt ?? now };
						}
					}
					else if (response.status === 409) next = { state: "unavailable", wallets: null, fetchedAt: now };
				} finally {
					balanceStore.value = next;
					balanceStore.fetchedAt = next.fetchedAt;
					balanceStore.pending = null;
					for (const listener of balanceStore.listeners) listener();
				}
				return next;
			})();
			return balanceStore.pending;
		}
		/** The balance answer as a hook: subscribes, polls on mount, ticks the TTL. */
		function useDeepseekBalance() {
			const [snapshot, setSnapshot] = react.useState(balanceStore.value);
			react.useEffect(() => {
				const listener = () => {
					setSnapshot(balanceStore.value);
				};
				balanceStore.listeners.add(listener);
				pollBalance().catch(() => {});
				const timer = setInterval(() => {
					pollBalance().catch(() => {});
				}, BALANCE_TICK_MS);
				return () => {
					balanceStore.listeners.delete(listener);
					clearInterval(timer);
				};
			}, []);
			return snapshot;
		}
		/** The wallet's display symbol; the Platform reports ISO codes. */
		function walletSymbol(currency) {
			return currency === "USD" ? "$" : currency === "CNY" ? "\u00a5" : currency;
		}
		/**
		* The pill's compact balance text: "¥12.34", one wallet per code.
		* @param wallets - the wallet records, or null.
		* @returns the text, or null when there is nothing to draw.
		*/
		function balancePillText(wallets) {
			if (!Array.isArray(wallets) || wallets.length === 0) return null;
			const drawn = wallets.filter((wallet) => Number.isFinite(Number(wallet.balance)));
			if (drawn.length === 0) return null;
			return drawn.map((wallet) => `${walletSymbol(wallet.currency)}${Number(wallet.balance).toFixed(2)}`).join("+");
		}
		/**
		* The account family a provider id belongs to, which decides what the pill
		* adds beyond tokens and cost: DeepSeek draws its wallet, GLM its plan quota.
		* @param provider - the route's provider id.
		* @returns "deepseek", "glm", or null for anything else.
		*/
		function providerFamily(provider) {
			if (typeof provider !== "string") return null;
			if (provider.startsWith("deepseek")) return "deepseek";
			if (provider.startsWith("glm") || provider.startsWith("zai")) return "glm";
			return null;
		}
		//#endregion
		//#region pill
		/** A small bolt mark, sized by the pill's own line. */
		function BoltIcon() {
			return h("svg", {
				viewBox: "0 0 16 16",
				fill: "none",
				"aria-hidden": "true"
			}, h("path", {
				d: "M9.5 1.5 4 9h3l-.7 5.5L12 7H8.8l.7-5.5Z",
				fill: "currentColor"
			}));
		}
		/** The composer-dock pill: current model, session tokens, its cost. */
		function UsagePill({ useProjection, settings, refresh, sessionId, t }) {
			const projected = useProjection(PROJECTION);
			/**
			 * The Host's view, pulled once after a setting that shapes it changes.
			 *
			 * A projection is recomposed on session events alone, so a price
			 * override or a card switch has to be pulled; the pulled value stands
			 * in until the stream delivers its own.
			 */
			const [pulled, setPulled] = react.useState(null);
			const form = settings === undefined || settings === null ? null : settings;
			const moneySnapshot = react.useSyncExternalStore(form === null ? NOOP_SUBSCRIBE : form.subscribe, form === null ? EMPTY_SNAPSHOT : form.getSnapshot);
			const owner = moneySnapshot === void 0 || moneySnapshot === null ? void 0 : moneySnapshot.value;
			const hostKey = owner === void 0 ? "" : JSON.stringify([owner.period ?? null, owner.officialRates ?? null, owner.prices ?? null]);
			const lastHostKey = react.useRef(null);
			react.useEffect(() => {
				if (lastHostKey.current === null || lastHostKey.current === hostKey) {
					lastHostKey.current = hostKey;
					return void 0;
				}
				lastHostKey.current = hostKey;
				if (typeof refresh !== "function" || sessionId === void 0) return void 0;
				let live = true;
				refresh(sessionId).then((values) => {
					if (live && values !== null && values !== void 0 && values[PROJECTION] !== void 0) setPulled(values[PROJECTION]);
				});
				return () => {
					live = false;
				};
			}, [hostKey, refresh, sessionId]);
			const streamed = react.useRef(projected);
			react.useEffect(() => {
				if (streamed.current === projected) return;
				streamed.current = projected;
				if (pulled !== null) setPulled(null);
			}, [projected, pulled]);
			const [open, setOpen] = react.useState(false);
			const anchor = react.useRef(null);
			const quota = useGlmQuota();
			const balance = useDeepseekBalance();
			const view = buildView(pulled === null ? projected : pulled);
			if (view === null) return null;
			const parts = [];
			if (view.currentLabel !== null) parts.push(h("span", {
				key: "model",
				className: "dshHud_model",
				title: view.currentLabel
			}, view.currentLabel));
			parts.push(h("span", {
				key: "tokens"
			}, formatTokens(view.pillTokens), " tok"));
			if (view.pillCurrency !== null) {
				parts.push(h("span", {
					key: "cost",
					className: "dshHud_pillCost"
				}, formatMoney(view.pillCost, view.pillCurrency), view.pillPlus ? "+" : ""));
			}
			// What rides beside the figures is the provider's own story: DeepSeek
			// shows the wallet it spends, GLM shows the plan windows it consumes.
			const family = view.current === null ? null : providerFamily(view.current.provider);
			if (family === "glm") {
				// "78%/64%" is the 5-hour window then the weekly line; the panel
				// names which is which.
				const quotaText = quota !== null && quota.state === "ok" ? quotaPillText(quota.limits) : null;
				if (quotaText !== null) {
					parts.push(h("span", {
						key: "quota",
						className: "dshHud_pillQuota"
					}, " ", h("em", null, quotaText)));
				}
			}
			if (family === "deepseek") {
				const balanceText = balance !== null && balance.state === "ok" ? balancePillText(balance.wallets) : null;
				if (balanceText !== null) {
					parts.push(h("span", {
						key: "balance",
						className: "dshHud_pillQuota"
					}, " ", t("pill.balance.label"), " ", h("em", null, balanceText)));
				}
			}
			const summary = `${t("pill.aria")} · ${formatTokens(view.pillTokens)} tok${view.pillCurrency !== null ? ` · ${formatMoney(view.pillCost, view.pillCurrency)}${view.pillPlus ? "+" : ""}` : ""}`;
			return h("div", {
				className: "dshHud_root",
				"data-usage-hud": ""
			}, h("span", {
				className: "dshHud_anchor",
				ref: anchor
			}, h("button", {
				type: "button",
				className: "dshHud_pill",
				"aria-haspopup": "dialog",
				"aria-expanded": open,
				"aria-label": summary,
				title: summary,
				onClick: () => {
					setOpen(!open);
				}
			}, h(BoltIcon), ...parts)), open ? h(UsagePanel, {
				anchor,
				view,
				quota,
				balance,
				t,
				onClose: () => {
					setOpen(false);
				}
			}) : null);
		}
		//#endregion
		//#region panel
		/**
		* The GLM Coding Plan quota block: the 5-hour window and the weekly line,
		* each with its share bar and reset moment, refreshed on demand.
		*
		* A missing, rejected, or unreachable token each explain themselves in one
		* line instead of blinking; the section hides only when the vendor answer
		* names neither window.
		*
		* @param props - the quota answer and the translate seat.
		*/
		function QuotaSection({ quota, t }) {
			if (quota === null) return null;
			const head = (children) => h("div", {
				className: "dshHud_section"
			}, h("div", {
				className: "dshHud_quotaHead"
			}, h("span", {
				className: "dshHud_sectionName"
			}, t("panel.quota.title")), h(primitives.Button, {
				kind: "secondary",
				className: "dshHud_quotaRefresh",
				onClick: () => {
					pollQuota(true).catch(() => {});
				}
			}, t("panel.quota.refresh"))), children);
			if (quota.state === "no-token") {
				return head(h("p", {
					className: "dshHud_note"
				}, t("panel.quota.noToken")));
			}
			if (quota.state === "auth-invalid") {
				return head(h("p", {
					className: "dshHud_note"
				}, t("panel.quota.invalid")));
			}
			if (quota.state !== "ok" || !Array.isArray(quota.limits)) {
				return head(h("p", {
					className: "dshHud_note"
				}, t("panel.quota.error")));
			}
			const bars = [ [ 3, "panel.quota.hourly", "" ], [ 6, "panel.quota.weekly", " dshHud_quotaFill--weekly" ] ]
				.map(([unit, key, fillClass]) => {
					const limit = quota.limits.find((entry) => entry.unit === unit);
					if (limit === undefined) return null;
					const percent = Math.max(0, Math.min(100, Number(limit.percentage) || 0));
					const reset = quotaResetText(limit);
					return h("div", {
						key,
						className: "dshHud_quotaRow"
					}, h("div", {
						className: "dshHud_quotaLine"
					}, h("span", {
						className: "dshHud_quotaLabel"
					}, t(key)), h("span", {
						className: "dshHud_quotaMeta"
					}, `${percent}%${reset === "" ? "" : ` \u00b7 ${t("panel.quota.reset", { time: reset })}`}`)), h("div", {
						className: "dshHud_quotaBar"
					}, h("div", {
						className: `dshHud_quotaFill${fillClass}`,
						style: { width: `${percent}%` }
					})));
				});
			const drawn = bars.filter((bar) => bar !== null);
			if (drawn.length === 0) return null;
			return head(drawn);
		}
		/**
		* The DeepSeek wallet block: the signed-in Platform balances, with the
		* granted bonuses the account already holds.
		*
		* A key-only install has no account seam to ask, and says so in one line
		* instead of drawing an invented zero.
		*
		* @param props - the balance answer and the translate seat.
		*/
		function BalanceSection({ balance, t }) {
			if (balance === null) return null;
			const head = (children) => h("div", {
				className: "dshHud_section"
			}, h("div", {
				className: "dshHud_quotaHead"
			}, h("span", {
				className: "dshHud_sectionName"
			}, t("panel.balance.title")), h(primitives.Button, {
				kind: "secondary",
				className: "dshHud_quotaRefresh",
				onClick: () => {
					pollBalance(true).catch(() => {});
				}
			}, t("panel.balance.refresh"))), children);
			if (balance.state === "unavailable") {
				return head(h("p", {
					className: "dshHud_note"
				}, t("panel.balance.unavailable")));
			}
			if (balance.state !== "ok" || !Array.isArray(balance.wallets)) {
				return head(h("p", {
					className: "dshHud_note"
				}, t("panel.balance.error")));
			}
			const rows = [];
			for (const wallet of balance.wallets) {
				const amount = Number(wallet.balance);
				if (!Number.isFinite(amount)) continue;
				rows.push(h("div", {
					key: `wallet-${wallet.currency}`,
					className: "dshHud_quotaLine"
				}, h("span", {
					className: "dshHud_quotaLabel"
				}, t("panel.balance.wallet")), h("span", {
					className: "dshHud_quotaMeta"
				}, `${walletSymbol(wallet.currency)}${amount.toFixed(2)}`)));
			}
			const bonus = balance.bonusWallets.filter((wallet) => Number.isFinite(Number(wallet.balance)) && Number(wallet.balance) > 0);
			for (const wallet of bonus) {
				rows.push(h("div", {
					key: `bonus-${wallet.currency}`,
					className: "dshHud_quotaLine"
				}, h("span", {
					className: "dshHud_quotaLabel"
				}, t("panel.balance.bonus")), h("span", {
					className: "dshHud_quotaMeta"
				}, `${walletSymbol(wallet.currency)}${Number(wallet.balance).toFixed(2)}`)));
			}
			if (rows.length === 0) return head(h("p", {
				className: "dshHud_note"
			}, t("panel.balance.unavailable")));
			return head(rows);
		}
		/** The breakdown tray: one section per model, plus totals and notes. */
		function UsagePanel({ anchor, view, quota, balance, t, onClose }) {
			const family = view.current === null ? null : providerFamily(view.current.provider);
			const panelRef = react.useRef(null);
			const pos = primitives.useAnchoredPosition({
				open: true,
				anchorRef: anchor,
				panelRef,
				side: "top",
				gap: PANEL_GAP,
				margin: PANEL_MARGIN
			});
			primitives.useDismissOnOutsidePointer(anchor, true, onClose, panelRef);
			const maxHeight = primitives.useAnchoredMaxHeight(panelRef, PANEL_MAX_HEIGHT, pos, PANEL_MARGIN);
			react.useEffect(() => {
				const onKeyDown = (event) => {
					if (event.key === "Escape") onClose();
				};
				document.addEventListener("keydown", onKeyDown);
				return () => {
					document.removeEventListener("keydown", onKeyDown);
				};
			}, [onClose]);
			const sections = view.rows.map((row) => {
				const meta = [
					t(row.peak ? "panel.period.peak" : "panel.period.offpeak"),
					t(row.source === "override" ? "panel.source.override" : "panel.source.preset")
				];
				if (row.attempts > 0) meta.push(t("panel.attempts", { count: row.attempts }));
				return h("div", {
					key: row.key,
					className: "dshHud_section",
					"data-usage-hud-segment": row.label
				}, h("div", {
					className: "dshHud_sectionHead"
				}, h("span", {
					className: "dshHud_sectionName",
					title: `${row.provider}/${row.model}`
				}, row.label), row.isCurrent ? h("span", {
					className: "dshHud_currentTag"
				}, t("panel.currentTag")) : null, h("span", {
					className: "dshHud_sectionMeta"
				}, meta.join(" · "))), row.rates === null ? h("div", {
					className: "dshHud_note"
				}, t("panel.note.thisUnpriced"), " · ", [
					row.bucket.uncachedInputTokens > 0 ? `${t("panel.bucket.miss")} ${formatTokens(row.bucket.uncachedInputTokens)}` : null,
					row.bucket.cacheReadTokens > 0 ? `${t("panel.bucket.hit")} ${formatTokens(row.bucket.cacheReadTokens)}` : null,
					row.bucket.cacheWriteTokens > 0 ? `${t("panel.bucket.write")} ${formatTokens(row.bucket.cacheWriteTokens)}` : null,
					row.bucket.outputTokens > 0 ? `${t("panel.bucket.out")} ${formatTokens(row.bucket.outputTokens)}` : null
				].filter((part) => part !== null).join(" · ")) : row.bucketCosts.map((line) => h("div", {
					key: line.key,
					className: "dshHud_row"
				}, h("span", {
					className: "dshHud_rowLabel"
				}, t(line.key), line.key === "panel.bucket.out" && row.bucket.reasoningTokens > 0 ? t("panel.bucket.reasoning", { tokens: formatTokens(row.bucket.reasoningTokens) }) : ""), h("span", {
					className: "dshHud_rowDetail"
				}, line.detail), h("span", {
					className: "dshHud_rowCost"
				}, formatMoney(line.cost, row.currency)))), row.rates !== null ? h("div", {
					className: "dshHud_subtotal"
				}, formatMoney(row.cost, row.currency)) : null);
			});
			const totals = view.totalsByCurrency.length === 0
				? formatTokens(view.sessionTokens) + " tok"
				: view.totalsByCurrency.map(({ currency, amount }) => formatMoney(amount, currency)).join(" + ");
			return react_dom.createPortal(h("div", {
				className: "dshHud_panel",
				ref: panelRef,
				// The measure pass must see the tray's natural size: clamping it
				// before placement would make the clamp the thing being measured.
				style: pos === null ? MEASURE_STYLE : {
					...pos,
					maxHeight,
					overflowY: "auto"
				},
				role: "dialog",
				"aria-label": t("panel.title"),
				"data-usage-hud-panel": ""
			}, h("div", {
				className: "dshHud_title"
			}, h("span", null, t("panel.title")), h("span", {
				className: "dshHud_titleValue"
			}, formatTokens(view.sessionTokens), " tok")), h("div", {
				className: "dshHud_rule"
			}), family === "glm" ? h(QuotaSection, {
				quota,
				t
			}) : null, family === "deepseek" ? h(BalanceSection, {
				balance,
				t
			}) : null, h("div", {
				className: "dshHud_sections"
			}, sections), h("div", {
				className: "dshHud_total"
			}, h("span", null, t("panel.totals")), h("span", {
				className: "dshHud_amounts"
			}, totals)), view.unattributed.attempts > 0 ? h("p", {
				className: "dshHud_note"
			}, t("panel.note.unattributed", { count: view.unattributed.attempts })) : null, view.unpriced.length > 0 ? h("p", {
				className: "dshHud_note"
			}, t("panel.note.unpriced", { models: view.unpriced.join("、") })) : null, h("p", {
				className: "dshHud_note"
			}, t("panel.note.estimate"))), document.body);
		}
		//#endregion
		//#region settings
		/**
		 * Bound readers for one settings form, memoized per form.
		 *
		 * `useSyncExternalStore` requires a stable subscribe and getSnapshot
		 * identity across renders; class methods detach their receiver.
		 */
		const FORM_ACCESS = new WeakMap();
		function formAccess(form) {
			let access = FORM_ACCESS.get(form);
			if (access === undefined) {
				access = {
					subscribe: (listener) => form.subscribe(listener),
					getSnapshot: () => form.getSnapshot()
				};
				FORM_ACCESS.set(form, access);
			}
			return access;
		}
		/** One override row's editable draft; numbers stay text while editing. */
		function draftRowFrom(key, entry) {
			const source = entry !== null && typeof entry === "object" ? entry : {};
			const peak = source.peak !== null && typeof source.peak === "object" ? source.peak : {};
			const text = (value) => (typeof value === "number" && Number.isFinite(value) && value !== 0 ? String(value) : "");
			return {
				key,
				label: typeof source.label === "string" ? source.label : "",
				currency: typeof source.currency === "string" ? source.currency : "",
				miss: text(source.miss),
				hit: text(source.hit),
				write: text(source.write),
				out: text(source.out),
				peakMiss: text(peak.miss),
				peakHit: text(peak.hit),
				peakWrite: text(peak.write),
				peakOut: text(peak.out)
			};
		}
		/** The write shape of one draft row: only fully numeric rate fields survive. */
		function draftRowTo(draft) {
			const numberOr = (text) => {
				const trimmed = typeof text === "string" ? text.trim() : "";
				if (trimmed === "") return 0;
				const value = Number(trimmed);
				return Number.isFinite(value) && value >= 0 ? value : 0;
			};
			const hasPeak = [draft.peakMiss, draft.peakHit, draft.peakWrite, draft.peakOut].some((text) => text.trim() !== "");
			return {
				label: draft.label,
				currency: draft.currency,
				miss: numberOr(draft.miss),
				hit: numberOr(draft.hit),
				write: numberOr(draft.write),
				out: numberOr(draft.out),
				...(hasPeak ? {
					peak: {
						miss: numberOr(draft.peakMiss),
						hit: numberOr(draft.peakHit),
						write: numberOr(draft.peakWrite),
						out: numberOr(draft.peakOut)
					}
				} : {
					peak: { miss: 0, hit: 0, write: 0, out: 0 }
				})
			};
		}
		/** Whether two override tables differ, so a burst of edits writes once. */
		function pricesKey(prices) {
			return JSON.stringify(prices ?? {});
		}
		/** The plugins-page configuration form: toggles, selects, and the override table. */
		function UsageHudSettings({ settings, t }) {
			const access = settings === undefined || settings === null ? null : formAccess(settings);
			const snapshot = react.useSyncExternalStore(access === null ? NOOP_SUBSCRIBE : access.subscribe, access === null ? EMPTY_SNAPSHOT : access.getSnapshot);
			const owner = snapshot === void 0 || snapshot === null ? void 0 : snapshot.value;
			const writable = owner !== void 0 && (snapshot.writable === undefined || snapshot.writable === true);
			const [status, setStatus] = react.useState("");
			const [drafts, setDrafts] = react.useState(null);
			const prices = owner?.prices ?? {};
			/** Persist one field write; a failure is named, not swallowed. */
			const persist = react.useCallback(async (field, value) => {
				if (writable === false) return;
				setStatus("saving");
				try {
					if (await settings.set(field, value) !== true) {
						setStatus("failed");
						return;
					}
					setStatus("saved");
				} catch (_writeFailed) {
					setStatus("failed");
				}
			}, [settings, writable]);
			/** Rebuild the drafts whenever the table they edit is replaced from outside. */
			react.useEffect(() => {
				setDrafts(null);
			}, [pricesKey(prices)]);
			if (owner === void 0) return h("p", { className: "dshHud_notice" }, t("settings.summary", { count: Object.keys(prices).length }));
			const rows = drafts ?? Object.keys(prices).map((key) => draftRowFrom(key, prices[key]));
			const commit = (next) => {
				const table = {};
				for (const row of next) {
					if (row.key.trim() === "") continue;
					table[row.key.trim()] = draftRowTo(row);
				}
				persist("prices", table);
			};
			const update = (index, field, value) => {
				const next = rows.map((row, at) => at === index ? { ...row, [field]: value } : row);
				setDrafts(next);
			};
			const input = (value, onChange, placeholder) => h("input", {
				className: "dshHud_input",
				type: "text",
				value,
				placeholder,
				disabled: writable === false,
				spellCheck: false,
				onChange: (event) => {
					onChange(event.target.value);
				},
				onBlur: () => {
					commit(rows);
				}
			});
			const rateCells = (row, index, prefix) => [
				["miss", "settings.rates.miss"],
				["hit", "settings.rates.hit"],
				["write", "settings.rates.write"],
				["out", "settings.rates.out"]
			].map(([field, labelKey]) => h("div", {
				key: field,
				className: "dshHud_cell"
			}, h("span", {
				className: "dshHud_cellLabel"
			}, t(labelKey)), input(row[`${prefix}${field.charAt(0).toUpperCase()}${field.slice(1)}`], (value) => {
				update(index, `${prefix}${field.charAt(0).toUpperCase()}${field.slice(1)}`, value);
			})));
			const select = (value, options, onChange) => h("div", {
				className: "dshHud_select"
			}, h("select", {
				className: "dshHud_control",
				value,
				disabled: writable === false,
				onChange: (event) => {
					onChange(event.target.value);
				}
			}, options.map((option) => h("option", {
				key: option.value,
				value: option.value
			}, option.label))), h(primitives.IconChevronDownOutlineRegular, null));
			const field = (label, control, hint) => h("div", {
				className: "dshHud_field"
			}, h("div", {
				className: "dshHud_fieldHead"
			}, h("span", {
				className: "dshHud_fieldLabel"
			}, label)), control, hint === undefined || hint === "" ? null : h("p", {
				className: "dshHud_hint"
			}, hint));
			return h("div", {
				className: "dshHud_form"
			}, h("p", {
				className: "dshHud_notice"
			}, t("settings.basis")), field(t("settings.enabled"), h(primitives.Switch, {
				checked: owner.enabled !== false,
				disabled: writable === false,
				onChange: (checked) => {
					persist("enabled", checked === true);
				}
			})), field(t("settings.period"), select(owner.period ?? "auto", [
				{ value: "auto", label: t("settings.period.auto") },
				{ value: "peak", label: t("settings.period.peak") },
				{ value: "offpeak", label: t("settings.period.offpeak") }
			], (value) => {
				persist("period", value);
			})), field(t("settings.officialRates"), select(owner.officialRates ?? "cny", [
				{ value: "cny", label: t("settings.officialRates.cny") },
				{ value: "usd", label: t("settings.officialRates.usd") }
			], (value) => {
				persist("officialRates", value);
			})), field(t("settings.currency"), input(owner.currency ?? "$", (value) => {
				persist("currency", value === "" ? "$" : value);
			}), t("settings.currency.hint")), field(t("settings.glmAuthorization"), input(owner.glmAuthorization ?? "", (value) => {
				persist("glmAuthorization", value.trim());
			}), t("settings.glmAuthorization.hint")), field(t("settings.prices"), h("div", null, rows.map((row, index) => h("div", {
				key: `route-${index}`,
				className: "dshHud_route"
			}, h("div", {
				className: "dshHud_routeHead"
			}, h("div", {
				className: "dshHud_cell dshHud_cellName"
			}, h("span", {
				className: "dshHud_cellLabel"
			}, t("settings.route")), input(row.key, (value) => {
				update(index, "key", value);
			}, "provider/model")), h("div", {
				className: "dshHud_cell dshHud_cellName"
			}, h("span", {
				className: "dshHud_cellLabel"
			}, t("settings.routeLabel")), input(row.label, (value) => {
				update(index, "label", value);
			})), h("div", {
				className: "dshHud_cell"
			}, h("span", {
				className: "dshHud_cellLabel"
			}, t("settings.routeCurrency")), input(row.currency, (value) => {
				update(index, "currency", value);
			})), h(primitives.Button, {
				kind: "secondary",
				disabled: writable === false,
				onClick: () => {
					const next = rows.filter((_row, at) => at !== index);
					setDrafts(next);
					commit(next);
				}
			}, t("settings.remove"))), h("div", {
				className: "dshHud_line"
			}, h("span", {
				className: "dshHud_rateGroupLabel"
			}, t("settings.rates.base")), ...rateCells(row, index, "")), h("div", {
				className: "dshHud_line"
			}, h("span", {
				className: "dshHud_rateGroupLabel"
			}, t("settings.rates.peak")), ...rateCells(row, index, "peak")))), h("div", {
				className: "dshHud_footer"
			}, h(primitives.Button, {
				kind: "secondary",
				disabled: writable === false,
				onClick: () => {
					const next = [...rows, draftRowFrom("", null)];
					setDrafts(next);
				}
			}, t("settings.addRoute")), h("span", {
				className: "dshHud_status",
				"data-state": status === "failed" ? "failed" : status
			}, status === "" ? "" : t(`settings.status.${status}`)))), t("settings.prices.hint")));
		}
		/** Boundary so a settings crash names itself instead of blanking the page. */
		class SettingsBoundary extends react.Component {
			constructor(props) {
				super(props);
				this.state = { error: null };
			}
			static getDerivedStateFromError(error) {
				return { error };
			}
			componentDidCatch(error, info) {
				console.error("usage-hud: settings form crashed:", error, info);
			}
			render() {
				if (this.state.error !== null) {
					return h("p", {
						className: "dshHud_notice",
						"data-usage-hud-error": ""
					}, `${String(this.state.error?.message ?? this.state.error)}`);
				}
				return this.props.children;
			}
		}
		/** The seat component: the form under its own boundary. */
		function UsageHudSettingsSeat(props) {
			return h(SettingsBoundary, null, h(UsageHudSettings, props));
		}
		//#endregion
		//#region dictionaries
		/** Simplified Chinese dictionary (the key-set source of truth). */
		const zh = {
			"pill.aria": "本会话用量与费用",
			"panel.title": "本会话用量与费用",
			"panel.currentTag": "当前模型",
			"panel.period.peak": "高峰时段",
			"panel.period.offpeak": "空闲时段",
			"panel.source.preset": "预设价",
			"panel.source.override": "自定义价",
			"panel.attempts": "{count} 次请求",
			"panel.bucket.miss": "输入（缓存未命中）",
			"panel.bucket.hit": "输入（缓存命中）",
			"panel.bucket.write": "输入（缓存写入）",
			"panel.bucket.out": "输出",
			"panel.bucket.reasoning": "（其中推理 {tokens}）",
			"panel.totals": "合计",
			"panel.note.thisUnpriced": "未定价",
			"panel.note.unattributed": "另有 {count} 次请求未记录模型，未计入上方任何一行。",
			"panel.note.unpriced": "{models} 未定价，费用未计入合计。",
			"panel.note.estimate": "费用按 harness 模型目录单价（或自定义价）与实际计价时段估算，仅供参考，并非账单。",
			"settings.basis": "胶囊显示在输入框下方统计条：当前模型、本会话 token 总量与预估费用。预设价来自 harness 自带模型目录。",
			"settings.enabled": "启用用量胶囊",
			"settings.period": "计价时段",
			"settings.period.auto": "按每段实际时段",
			"settings.period.peak": "全部按高峰",
			"settings.period.offpeak": "全部按空闲",
			"settings.officialRates": "DeepSeek 官方价目",
			"settings.officialRates.cny": "国内平台（¥ 人民币）",
			"settings.officialRates.usd": "国际平台（$ 美元）",
			"settings.currency": "默认币种符号",
			"settings.currency.hint": "自定义价未写币种时使用；目录价默认 $，DeepSeek 官方价默认 ¥。",
			"settings.prices": "自定义单价",
			"settings.prices.hint": "键为 provider/model 或裸 model，单位为每百万 token；预设价之外的路由（自建/网关端点）在这里补价。高峰四格留空表示全天一口价。",
			"settings.route": "路由（provider/model）",
			"settings.routeLabel": "显示名",
			"settings.routeCurrency": "币种",
			"settings.rates.base": "常规（/1M tok）",
			"settings.rates.peak": "高峰（/1M tok）",
			"settings.rates.miss": "未命中",
			"settings.rates.hit": "命中",
			"settings.rates.write": "写入",
			"settings.rates.out": "输出",
			"settings.addRoute": "添加路由",
			"settings.remove": "移除",
			"settings.summary": "自定义单价：{count} 项",
			"settings.status.saving": "保存中…",
			"settings.status.saved": "已保存",
			"settings.status.failed": "保存失败",
			"pill.balance.label": "余额",
			"panel.balance.title": "DeepSeek 账户余额",
			"panel.balance.refresh": "刷新",
			"panel.balance.wallet": "账户余额",
			"panel.balance.bonus": "赠送余额",
			"panel.balance.unavailable": "未登录或未获取到账户余额(账号登录的安装才有余额)。",
			"panel.balance.error": "余额查询失败,稍后自动重试。",
			"panel.quota.title": "GLM 编程套餐额度",
			"panel.quota.refresh": "刷新",
			"panel.quota.hourly": "5 小时额度",
			"panel.quota.weekly": "每周额度",
			"panel.quota.reset": "重置 {time}",
			"panel.quota.noToken": "未配置:在插件设置里填写 bigmodel.cn 的 Authorization 后,这里显示 5 小时与每周额度。",
			"panel.quota.invalid": "Authorization 已被拒绝,请更新插件设置里的值。",
			"panel.quota.error": "额度查询失败,稍后自动重试。",
			"settings.glmAuthorization": "GLM 套餐授权(Authorization)",
			"settings.glmAuthorization.hint": "登录 bigmodel.cn → F12 打开开发者工具 → Network 任一请求 → 复制请求头 authorization 的完整值粘贴到这里。留空则不显示套餐额度。"
		};
		/** English dictionary. */
		const en = {
			"pill.aria": "Session usage & cost",
			"panel.title": "Session usage & cost",
			"panel.currentTag": "current",
			"panel.period.peak": "peak",
			"panel.period.offpeak": "off-peak",
			"panel.source.preset": "preset price",
			"panel.source.override": "custom price",
			"panel.attempts": "{count} requests",
			"panel.bucket.miss": "Input (cache miss)",
			"panel.bucket.hit": "Input (cache hit)",
			"panel.bucket.write": "Input (cache write)",
			"panel.bucket.out": "Output",
			"panel.bucket.reasoning": " ({tokens} reasoning)",
			"panel.totals": "Total",
			"panel.note.thisUnpriced": "unpriced",
			"panel.note.unattributed": "{count} further request(s) recorded no model and are not in any row above.",
			"panel.note.unpriced": "{models} unpriced; their cost is not in the total.",
			"panel.note.estimate": "Costs are estimated from the harness model catalog (or custom rates) and each request's rate window. Reference only, not a bill.",
			"settings.basis": "The pill sits in the composer statistics strip: current model, session tokens, and estimated cost. Preset prices come from the harness model catalog.",
			"settings.enabled": "Enable the usage pill",
			"settings.period": "Rate window",
			"settings.period.auto": "As billed (auto)",
			"settings.period.peak": "All peak",
			"settings.period.offpeak": "All off-peak",
			"settings.officialRates": "DeepSeek official price list",
			"settings.officialRates.cny": "Domestic platform (¥ CNY)",
			"settings.officialRates.usd": "International platform ($ USD)",
			"settings.currency": "Default currency symbol",
			"settings.currency.hint": "Used by custom rates that name none; catalog rates are $, DeepSeek official rates are ¥.",
			"settings.prices": "Custom rates",
			"settings.prices.hint": "Keys are provider/model or bare model, per 1M tokens; price routes the catalog does not cover (self-hosted/gateway). Leave the four peak fields empty for one rate all day.",
			"settings.route": "Route (provider/model)",
			"settings.routeLabel": "Label",
			"settings.routeCurrency": "Currency",
			"settings.rates.base": "Base (per 1M tok)",
			"settings.rates.peak": "Peak (per 1M tok)",
			"settings.rates.miss": "Miss",
			"settings.rates.hit": "Hit",
			"settings.rates.write": "Write",
			"settings.rates.out": "Output",
			"settings.addRoute": "Add route",
			"settings.remove": "Remove",
			"settings.summary": "Custom rates: {count}",
			"settings.status.saving": "Saving…",
			"settings.status.saved": "Saved",
			"settings.status.failed": "Save failed",
			"pill.balance.label": "Balance",
			"panel.balance.title": "DeepSeek balance",
			"panel.balance.refresh": "Refresh",
			"panel.balance.wallet": "Wallet",
			"panel.balance.bonus": "Bonus",
			"panel.balance.unavailable": "No account balance (only a signed-in account install has one).",
			"panel.balance.error": "Balance query failed; retries automatically.",
			"panel.quota.title": "GLM Coding Plan quota",
			"panel.quota.refresh": "Refresh",
			"panel.quota.hourly": "5-hour window",
			"panel.quota.weekly": "Weekly line",
			"panel.quota.reset": "resets {time}",
			"panel.quota.noToken": "Not configured: paste your bigmodel.cn Authorization into the plugin settings to show the 5-hour and weekly quota here.",
			"panel.quota.invalid": "The Authorization was rejected; update it in the plugin settings.",
			"panel.quota.error": "Quota query failed; it retries automatically.",
			"settings.glmAuthorization": "GLM plan Authorization header",
			"settings.glmAuthorization.hint": "Sign in at bigmodel.cn, open DevTools \u2192 Network, copy any request's full authorization header value, and paste it here. Leave empty to hide the quota."
		};
		//#endregion
		/** Required client services: the slot ledger and this plugin's dictionaries. */
		const inject = ["slots", "locale"];
		/**
		* Client plugin body: the dictionaries, the composer-dock pill, and the
		* configuration the Plugins page renders.
		*
		* The configuration seats are claimed only when the settings service is
		* present, so a deployment without it still mounts the pill rather than
		* failing the whole entry.
		*
		* @param ctx - client root context.
		*/
		function apply(ctx) {
			injectCss();
			ctx.effect(() => ctx.locale.register(NS, {
				zh,
				en
			}), "usage-hud: dictionaries");
			/**
			* Pull the Host's current projection values for one session.
			*
			* The Host recomposes its views on session events alone, so a setting
			* that shapes the composition — the rate window, the price list, an
			* override — would sit stale until the next event.
			* `remote.session.projections` reads every registered projection
			* without activating an Agent, which is exactly the pull needed.
			*/
			let pull = null;
			const refresh = (sessionId) => pull === null ? Promise.resolve(null) : pull(sessionId);
			ctx.inject(["remote", "remote.session"], (scoped) => {
				pull = (sessionId) => scoped.remote.session.projections({
					sessionId
				}).then((result) => result !== null && result !== void 0 && result.ok === true && result.value !== null && result.value !== void 0 && typeof result.value === "object" ? result.value.values : null).catch(() => null);
			});
			ctx.slots.inject(SLOT, () => ctx.slots.register({
				name: SLOT,
				id: NS,
				order: 30,
				locale: NS,
				inject: () => ({
					refresh
				})
			}, UsagePill));
			ctx.inject(["configForms"], (scope) => {
				const form = scope.configForms.get(NS);
				for (const [seat, key] of [[BUNDLE_SEAT, PACKAGE], [ROW_SEAT, `${PACKAGE}#${NS}`]]) {
					scope.slots.inject(seat, () => scope.slots.register({
						name: seat,
						key,
						locale: NS,
						inject: () => ({
							settings: form
						})
					}, UsageHudSettingsSeat));
				}
			});
		}
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map
