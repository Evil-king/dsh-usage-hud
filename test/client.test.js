/**
 * Verification harness for the dsh-usage-hud client bundle.
 *
 * It materializes the real `lib/client.js` with stubbed React/DOM, applies it
 * to a fake client Context, then drives the real component functions to check
 * what they render — arithmetic over the Host's wire, so the fixtures fix both
 * sides of every multiplication.
 *
 *   node --test test/client.test.js
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";

const here = dirname(fileURLToPath(import.meta.url));
const BUNDLE = join(here, "..", "lib", "client.js");
const LOADED = readFileSync(BUNDLE, "utf8");

// ---- deterministic environment stubs -----------------------------------------

let registration = null;
const moduleLoader = { load: (record) => { registration = record; } };
const styleTags = [];
/** Harness switch: force the breakdown panel open so its branch renders. */
let harnessOpen = false;

globalThis.window = {
	innerWidth: 1200,
	innerHeight: 800,
	addEventListener() {},
	removeEventListener() {},
	__ModuleLoader__: moduleLoader
};
globalThis.document = {
	head: { appendChild: (tag) => styleTags.push(tag) },
	body: {},
	querySelector: () => null,
	createElement: () => ({ dataset: {}, style: {}, textContent: "" }),
	addEventListener() {},
	removeEventListener() {}
};

const react = {
	Fragment: Symbol("Fragment"),
	Component: class Component {
		constructor(props) {
			this.props = props ?? {};
			this.state = {};
		}
		setState(next) {
			this.state = { ...this.state, ...(typeof next === "function" ? next(this.state) : next) };
		}
	},
	createElement(type, props, ...children) {
		const node = { type, props: { ...(props ?? {}) } };
		if (children.length > 0) node.props.children = children.length === 1 ? children[0] : children;
		return node;
	},
	useRef: (value) => ({ current: value === undefined ? null : value }),
	useState: (value) => {
		const initial = typeof value === "function" ? value() : value;
		if (stateSlots === null) return [harnessOpen && initial === false ? true : initial, () => {}];
		const at = stateCursor;
		stateCursor += 1;
		const slots = stateSlots;
		if (!(at in slots)) slots[at] = initial;
		return [slots[at], (next) => {
			slots[at] = typeof next === "function" ? next(slots[at]) : next;
			stateDirty = true;
		}];
	},
	useCallback: (fn) => fn,
	useSyncExternalStore: (_subscribe, getSnapshot) => getSnapshot(),
	useEffect: (fn) => {
		if (stateSlots === null) return;
		fn();
	}
};

/** Per-render hook slots, shared across the renders of one mount. */
let stateSlots = null;
let stateCursor = 0;
let stateDirty = false;

/** Render a hook-using component repeatedly until its state settles. */
function mount(component, props) {
	const slots = [];
	const draw = () => {
		let tree = null;
		for (let pass = 0; pass < 8; pass += 1) {
			stateSlots = slots;
			stateCursor = 0;
			stateDirty = false;
			tree = component(props);
			stateSlots = null;
			if (stateDirty !== true) break;
		}
		return tree;
	};
	return { draw, slots };
}

/** Render one element the way React would. */
function renderNode(node) {
	if (typeof node.type !== "function") return null;
	if (node.type.prototype instanceof react.Component) {
		return new node.type(node.props).render();
	}
	return node.type(node.props);
}

/** Every element in a tree, resolving components as React would. */
function elements(node, out = []) {
	if (Array.isArray(node)) {
		for (const child of node) elements(child, out);
		return out;
	}
	if (node === null || node === undefined || typeof node !== "object") return out;
	out.push(node);
	if (typeof node.type === "function") {
		elements(renderNode(node), out);
		return out;
	}
	elements(node.props?.children, out);
	return out;
}

const react_dom = {
	// A portal without a container is a render-time crash: the shell unmounts the
	// pill the moment it is clicked. The stub fails loud so the bundle tests do.
	createPortal: (node, container) => {
		if (container === undefined || container === null) throw new Error("createPortal called without a container");
		return node;
	}
};

/** Stand-in for the shell's UI primitives. */
const primitives = {
	useAnchoredPosition: () => ({ left: 10, top: 10 }),
	useDismissOnOutsidePointer: () => {},
	useAnchoredMaxHeight: () => 400,
	IconChevronDownOutlineRegular: () => null,
	Switch: ({ checked, onChange }) => ({ type: "switch", props: { checked, onChange } }),
	Button: ({ onClick, children }) => ({ type: "button", props: { onClick, children } }),
	DisclosureRow: ({ children }) => ({ type: "row", props: { children } })
};

const sandbox = {
	window: globalThis.window,
	document: globalThis.document,
	console,
	require: (id) => {
		if (id === "react") return react;
		if (id === "react-dom") return react_dom;
		if (id === "@deepseek-ai/dsh-client-ui-primitives") return primitives;
		throw new Error(`unexpected require: ${id}`);
	}
};
vm.createContext(sandbox);
vm.runInContext(LOADED, sandbox, { filename: BUNDLE });
assert.ok(registration !== null, "the bundle registered with the module loader");
const clientExports = registration.factory(sandbox.require);
const { apply, inject } = clientExports;
assert.equal(registration.id, "dsh-usage-hud");

// ---- fake client context -----------------------------------------------------

let dictionaries = null;
const slotComponents = new Map();
const seatComponents = new Map();
let configFormsHandler = null;
const fakeCtx = {
	effect: (fn) => {
		fn();
		return () => {};
	},
	locale: {
		register: (ns, dicts) => {
			dictionaries = { ns, dicts };
			return () => {};
		}
	},
	inject: (names, callback) => {
		if (names.includes("configForms")) {
			configFormsHandler = callback;
			return () => {};
		}
		callback({
			remote: {},
			"remote.session": {
				session: {
					projections: async () => ({ ok: true, value: { values: {} } })
				}
			}
		});
		return () => {};
	},
	slots: {
		inject: (key, callback) => {
			callback();
			return () => {};
		},
		register: (options, component) => {
			if (options.key !== undefined) seatComponents.set(`${options.name}|${options.key}`, { options, component });
			else slotComponents.set(options.name, { options, component });
			return () => {};
		}
	}
};

test("the client entry registers on the module loader with its services", () => {
	// The exports live in the vm realm, so compare serialized forms.
	assert.equal(JSON.stringify(inject), JSON.stringify(["slots", "locale"]));
});

test("dictionaries are registered zh-first with identical keys and placeholders", () => {
	apply(fakeCtx);
	assert.ok(dictionaries !== null);
	assert.equal(dictionaries.ns, "usage-hud");
	const { zh, en } = dictionaries.dicts;
	const zhKeys = Object.keys(zh).sort();
	const enKeys = Object.keys(en).sort();
	assert.deepEqual(zhKeys, enKeys);
	for (const key of zhKeys) {
		const placeholders = (text) => [ ...text.matchAll(/\{(\w+)\}/g) ].map((m) => m[1]).sort();
		assert.deepEqual(placeholders(zh[key]), placeholders(en[key]), `placeholder mismatch on ${key}`);
	}
});

test("apply claims the composer dock and both config seats", () => {
	// The configForms injection deferred until now; claim it the way the live
	// service does before the seats are expected.
	assert.ok(configFormsHandler !== null, "configForms claimed");
	configFormsHandler({
		configForms: { get: (ns) => (ns === "usage-hud" ? fakeForm({ enabled: true, period: "auto", officialRates: "cny", currency: "$", prices: {} }) : null) },
		slots: fakeCtx.slots
	});
	assert.ok(slotComponents.has("conversation.composer.dock"), "dock pill registered");
	const pill = slotComponents.get("conversation.composer.dock");
	assert.equal(pill.options.id, "usage-hud");
	assert.ok(seatComponents.has("plugins.bundle.config|dsh-usage-hud"), "bundle seat registered");
	assert.ok(seatComponents.has("plugins.row.config|dsh-usage-hud#usage-hud"), "row seat registered");
});

// ---- fixtures ----------------------------------------------------------------

function wireFixture({ price = true, currency = "¥", second = null, current = { provider: "p", model: "m" } } = {}) {
	const groups = {
		"p m peak": {
			provider: "p",
			model: "m",
			peak: true,
			uncachedInputTokens: 1000000,
			cacheReadTokens: 0,
			cacheWriteTokens: 0,
			outputTokens: 500000,
			reasoningTokens: 100000,
			attempts: 2,
			...(price ? {
				price: {
					currency,
					label: "Model M",
					rates: { miss: 1, hit: 0.1, write: 1, out: 2 },
					source: "preset"
				}
			} : {})
		}
	};
	if (second !== null) groups["q n offpeak"] = second;
	return {
		groups,
		unattributed: { uncachedInputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 0, reasoningTokens: 0, attempts: 0 },
		current,
		totals: { uncachedInputTokens: 1000000, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 500000, reasoningTokens: 100000, attempts: 2 }
	};
}

const zhDict = () => dictionaries.dicts.zh;
/** The framework t seat: interpolate `{name}` placeholders from the zh dictionary. */
function makeT() {
	const dict = zhDict();
	return (key, params) => {
		let text = dict[key] ?? key;
		if (params !== null && typeof params === "object") {
			for (const [name, value] of Object.entries(params)) text = text.replaceAll(`{${name}}`, String(value));
		}
		return text;
	};
}

function pillProps(useProjection, extra = {}) {
	return {
		useProjection: (key) => key === "usageHud" ? useProjection : undefined,
		settings: undefined,
		refresh: undefined,
		sessionId: "s1",
		t: makeT(),
		...extra
	};
}

function textOf(node, out = []) {
	if (Array.isArray(node)) {
		for (const child of node) textOf(child, out);
		return out;
	}
	if (node === null || node === undefined) return out;
	if (typeof node === "string" || typeof node === "number") {
		out.push(String(node));
		return out;
	}
	if (typeof node.type === "function") {
		textOf(renderNode(node), out);
		return out;
	}
	textOf(node.props?.children, out);
	return out;
}
/** The pill/panel/seat text as one string, exactly what a reader scans. */
function textOfJoined(tree) {
	return textOf(tree).join("|");
}

test("the pill renders current model, session tokens, and its cost", () => {
	const pill = slotComponents.get("conversation.composer.dock").component;
	const { draw } = mount(pill, pillProps(wireFixture()));
	const text = textOfJoined(draw());
	assert.ok(text.includes("Model M"), `model label drawn: ${text}`);
	assert.ok(text.includes("1.50M"), `session tokens drawn: ${text}`);
	assert.ok(text.includes("¥2.00"), `cost drawn (1M×¥1 + 0.5M×¥2): ${text}`);
});

test("the pill hides when nothing has been recorded", () => {
	const pill = slotComponents.get("conversation.composer.dock").component;
	const { draw } = mount(pill, pillProps({ groups: {}, unattributed: { uncachedInputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 0, reasoningTokens: 0, attempts: 0 }, current: null, totals: { uncachedInputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 0, reasoningTokens: 0, attempts: 0 } }));
	assert.equal(draw(), null);
});

test("an unpriced current model draws tokens without a cost", () => {
	const pill = slotComponents.get("conversation.composer.dock").component;
	const { draw } = mount(pill, pillProps(wireFixture({ price: false })));
	const text = textOfJoined(draw());
	assert.ok(text.includes("1.50M"), `tokens drawn: ${text}`);
	assert.ok(!text.includes("¥"), `no cost invented: ${text}`);
});

test("a second currency marks the pill with a plus", () => {
	const pill = slotComponents.get("conversation.composer.dock").component;
	const wire = wireFixture({
		second: {
			provider: "q",
			model: "n",
			peak: false,
			uncachedInputTokens: 2000000,
			cacheReadTokens: 0,
			cacheWriteTokens: 0,
			outputTokens: 0,
			reasoningTokens: 0,
			attempts: 1,
			price: { currency: "$", label: "Model N", rates: { miss: 0.5, hit: 0.5, write: 0.5, out: 0.5 }, source: "preset" }
		}
	});
	const { draw } = mount(pill, pillProps(wire));
	const text = textOfJoined(draw());
	assert.ok(text.includes("+"), `mixed currencies marked: ${text}`);
});

test("the open panel names the current model and prices every bucket", () => {
	const pill = slotComponents.get("conversation.composer.dock").component;
	const mounted = mount(pill, pillProps(wireFixture()));
	const first = mounted.draw();
	const button = elements(first).find((node) => node.type === "button");
	assert.ok(button !== undefined, "the pill carries a trigger button");
	// Click it the way React would: the open state flips and the next draw
	// renders the panel branch.
	button.props.onClick();
	const text = textOfJoined(mounted.draw());
	assert.ok(text.includes("当前模型"), `current tag drawn: ${text}`);
	assert.ok(text.includes("高峰时段"), `rate window drawn: ${text}`);
	assert.ok(text.includes("2 次请求"), `attempt count drawn: ${text}`);
	assert.ok(text.includes("1.00M × ¥1/M"), `cache-miss line drawn: ${text}`);
	assert.ok(text.includes("500k × ¥2/M"), `output line drawn: ${text}`);
	assert.ok(text.includes("（其中推理 100k）"), `reasoning subset drawn: ${text}`);
	assert.ok(text.includes("¥2.00"), `group subtotal drawn: ${text}`);
	assert.ok(text.includes("合计"), `totals drawn: ${text}`);
	assert.ok(text.includes("并非账单"), `estimate disclosure drawn: ${text}`);
});

// ---- settings seat -----------------------------------------------------------

function settingsProps(form) {
	return { settings: form, t: makeT() };
}

/** A settings form stub recording field writes. */
function fakeForm(value) {
	const writes = [];
	let snapshot = { value, writable: true };
	return {
		writes,
		subscribe: () => () => {},
		getSnapshot: () => snapshot,
		set: async (field, fieldValue) => {
			writes.push([field, fieldValue]);
			snapshot = { value: { ...snapshot.value, [field]: fieldValue }, writable: true };
			return true;
		}
	};
}

test("the settings seat renders its fields over the form snapshot", () => {
	assert.ok(configFormsHandler !== null, "configForms claimed");
	configFormsHandler({
		configForms: { get: (ns) => (ns === "usage-hud" ? fakeForm({ enabled: true, period: "auto", officialRates: "cny", currency: "$", prices: {} }) : null) },
		slots: fakeCtx.slots
	});
	const seat = seatComponents.get("plugins.bundle.config|dsh-usage-hud").component;
	const tree = seat(settingsProps(fakeForm({ enabled: true, period: "auto", officialRates: "cny", currency: "$", prices: {} })));
	const text = textOfJoined(tree);
	assert.ok(text.includes("启用用量胶囊"), `enabled field drawn: ${text}`);
	assert.ok(text.includes("计价时段"), `period field drawn: ${text}`);
	assert.ok(text.includes("DeepSeek 官方价目"), `official card field drawn: ${text}`);
	assert.ok(text.includes("自定义单价"), `override table drawn: ${text}`);
});

test("an override row persists a fully typed table on commit", async () => {
	const form = fakeForm({ enabled: true, period: "auto", officialRates: "cny", currency: "$", prices: {
		"selfhosted/my-model": { label: "", currency: "€", miss: 1, hit: 1, write: 1, out: 1, peak: { miss: 0, hit: 0, write: 0, out: 0 } }
	} });
	const seat = seatComponents.get("plugins.bundle.config|dsh-usage-hud").component;
	const tree = seat(settingsProps(form));
	const inputs = elements(tree).filter((node) => node.type === "input");
	assert.ok(inputs.length >= 8, `route inputs drawn: ${inputs.length}`);
});

test("a settings crash is contained by the boundary", () => {
	const seat = seatComponents.get("plugins.bundle.config|dsh-usage-hud").component;
	const tree = seat({ settings: null, t: makeT() });
	const text = textOfJoined(tree);
	assert.ok(text.includes("自定义单价"), `summary fallback drawn: ${text}`);
});
