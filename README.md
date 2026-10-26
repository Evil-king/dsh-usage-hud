# dsh-usage-hud

[中文](#中文) · [English](#english)

<a id="中文"></a>

在 DeepSeek Harness（DSH）网页工作区的输入框统计条里，**实时显示当前模型的 token 用量与预估费用**：胶囊常驻显示「当前模型 · 本会话 token 总量 · 预估花费」，点开即见每个模型的分段明细（缓存命中 / 未命中 / 写入 / 输出 / 推理）、计价时段与自定义单价设置。


## 功能

- ****实时胶囊**：挂在输入框下方统计条（与官方时长 / token 胶囊同排），**跟随模型选择器即时切换**并随每次请求结算刷新，显示：
  - 当前选中的模型名；
  - 该模型在本会话的 token（含缓存读取 / 写入；还没用过则显示 0）；
  - 该模型的费用（多币种时以 `+` 标记，明细里逐币种合计）。
- **明细弹层**：点击胶囊展开，逐模型显示
  - 分段：模型名、`当前模型` 标记、高峰 / 空闲时段、请求次数、价格来源（预设 / 自定义）；
  - 逐桶计价行：`token 数量 × 单价/1M`，输出行附「其中推理 N」；
  - 按币种合计、未归因请求说明、未定价模型说明、估算口径声明。
- **精确口径**：宿主端以 Session 投影（`usageHud`）折叠**完整持久化事件流**——重试按两次计费、同槽位结算覆盖不重复累计、峰谷时段按请求发起时刻（北京时间）判定，与官方 `tokenUsage` 口径逐桶对账一致；浏览器只做乘法，价格一律由宿主解析随线下发，两端不会算出两个数。
- **开箱即用的价目**：
  - harness 自带模型目录（`@earendil-works/pi-ai`，41 家供应商约 1495 个模型，USD 每 1M token，含长上下文阶梯价）；
  - DeepSeek 官方两条路由（`deepseek-flash`、`deepseek-v4-pro`）人民币 / 美元两套官方牌价，覆盖 API Key 与账号登录两种适配器；
  - 设置页可按 `provider/model` 或裸 `model` 追加自定义单价（含高峰价），用于自建端点、网关或协商折扣。

> 费用为**估算**：按目录单价与每段实际计价时段计算，仅供参考，并非账单。

## 安装

这是一个 **bundle**：安装后会加入 Loader 条目，由条目携带插件，不需要手工改动 Harness 任何文件。

```bash
git clone https://github.com/Evil-king/dsh-usage-hud.git "$HOME/.dsh/profiles/plugins/dsh-usage-hud"
```

然后在网页端 **插件页** 从该路径安装；或等价地执行：

```bash
dsh plugin --profile web add "$HOME/.dsh/profiles/plugins/dsh-usage-hud"
```

管理器会把包加入 profile 依赖、追加进 `dsh.profile.bundles` 并热生效；卸载则三者一并移除。

> 克隆在 `~/.dsh/profiles/` 之外时，先在克隆目录跑一次 `npm install`，让它带上自己的运行时依赖、位置无关。

## 设置

插件页 → `dsh-usage-hud` 配置：

| 设置 | 说明 |
| --- | --- |
| 启用用量胶囊 | 关闭后不注册投影，胶囊不再渲染 |
| 计价时段 | 按每段实际时段 / 全部按高峰 / 全部按空闲 |
| DeepSeek 官方价目 | 国内平台（¥）/ 国际平台（$） |
| 默认币种符号 | 自定义价未写币种时使用 |
| 自定义单价 | 键 `provider/model` 或裸 `model`；四项常规单价 + 可选四项高峰单价（留空 = 全天一口价），单位为每 1M token |

## 开发

```bash
npm install
npm test        # node --test ：投影折叠 / 计价优先级 / 客户端渲染
```

- `lib/projection.js` — `usageHud` 投影：纯折叠 + 视图组装（挂价）；
- `lib/pricing.js` — 目录预设 + DeepSeek 官方牌价 + 自定义覆盖与解析优先级；
- `lib/index.js` — 宿主端入口（Config 模式、投影注册）；
- `lib/client.js` — 浏览器端（统计条胶囊、明细弹层、设置表单）。

## 许可

[MIT](LICENSE)

---

<a id="english"></a>

# dsh-usage-hud (English)

A DeepSeek Harness (DSH) web plugin that shows **real-time current-model token usage and estimated cost** in the composer statistics strip: a resident pill with the current model, session tokens, and its estimated cost, plus a per-model breakdown dialog with rate windows and custom pricing.

- **Resident pill** in `conversation.composer.dock`, refreshed on every model-request settlement.
- **Breakdown dialog**: per-model sections with cache miss/hit/write, output (reasoning subset), `× price/1M` lines, per-currency totals, and provenance.
- **Exact arithmetic**: a `usageHud` Session projection folds the complete durable event log host-side (retries billed twice, same-slot settlements replace, peak windows stamped at request start in Beijing time), reconciling bucket-for-bucket with the built-in `tokenUsage`; the browser only multiplies rates the Host resolves and ships.
- **Prices out of the box**: the harness model catalog (41 providers, ~1495 models, incl. long-context tiers), DeepSeek official CNY/USD cards for both adapters, and a per-route custom-rate table in settings.

Costs are estimates from list rates and each request's rate window — reference only, not a bill.

Install (a bundle — nothing in the Harness is patched by hand):

```bash
git clone https://github.com/Evil-king/dsh-usage-hud.git "$HOME/.dsh/profiles/plugins/dsh-usage-hud"
dsh plugin --profile web add "$HOME/.dsh/profiles/plugins/dsh-usage-hud"
```

Develop: `npm install && npm test` (node --test: projection fold / pricing precedence / client render).

MIT License.
