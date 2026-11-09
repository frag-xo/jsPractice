# 记账本

一个纯前端（无后端、无数据库）的记账小工具。数据存在浏览器 localStorage 里，可以离线使用、可以装到桌面。

## 功能

- 收支记录的新增、编辑、删除，支持批量删除
- 按年份 / 月份 / 类型 / 分类筛选，备注与分类模糊搜索（400ms 防抖）
- 按日期或金额排序（升序 / 降序）
- ECharts 分类占比饼图 + 近 6 个月收支趋势折线图（窗口 resize 经 200ms 防抖重绘）
- 按月设置预算，顶部显示预算进度，超支标红
- 自定义分类，分类标签上显示被多少笔记录使用
- 月与月 / 年与年收支对比，含差值配色和一句话结论
- **AI 财务分析**：按月生成「总览 + 异常提示 + 可执行建议」，无 API Key 时自动降级为本地规则版
- CSV 导出 / 导入（自动跳过重复记录，自动登记新分类）
- 深色模式（首次打开跟随系统设置）
- PWA：可安装到桌面、离线可用
- 多标签页数据同步（`storage` 事件）

## 文件结构

```
accountBook/
├── index.html              页面结构
├── style.css               样式
├── manifest.json           PWA 清单
├── sw.js                   Service Worker（离线缓存）
├── icon.svg / icon-*.png   应用图标
├── sample-import.csv       可用于测试导入的示例文件
├── vendor/
│   └── echarts.min.js      ECharts 5.5.0（本地文件，不依赖 CDN）
├── js/
│   ├── app.js              入口：DOM 事件、页面渲染调度
│   ├── tracker.js          数据层：ExpenseTracker 类（CRUD / 筛选 / 统计 / CSV）
│   ├── storage.js          localStorage 封装
│   ├── render.js           视图层：把数据画成 DOM
│   ├── charts.js           ECharts 封装
│   └── ai/                 AI 财务分析模块
│       ├── index.js        对外入口：编排「聚合 → 缓存 → 调模型 → 校验 → 降级」
│       ├── aggregate.js    数据聚合：把流水压成摘要（纯函数，可单测）
│       ├── prompt.js       Prompt 模板
│       ├── client.js       模型调用：双模式、超时、错误分类
│       ├── schema.js       模型输出的容错解析与结构校验
│       ├── fallback.js     规则版报告（无 AI 时兜底）
│       ├── cache.js        报告缓存（按数据指纹失效）
│       └── config.js       配置与用量统计
└── test/
    ├── tracker.test.js     数据层测试（31 条）
    └── ai.test.js          AI 模块测试（39 条）
```

## AI 财务分析

「AI 分析」页可以按月份生成一份财务报告：一句话总览 + 异常提示 + 2~3 条可执行建议。

### 双模式：Key 放在哪里

| 模式 | 触发条件 | Key 存放位置 | 适用场景 |
|---|---|---|---|
| **代理模式** | 填了代理地址 | 服务端（浏览器不接触） | **生产环境推荐** |
| **直连模式** | 只填了 API Key | 浏览器 localStorage | 仅本地演示 |
| **降级模式** | 两者都不填 | —— | 功能仍可用，走本地规则 |

代理模式下浏览器只请求自己的转发服务，Key 不会出现在前端代码或网络面板里。直连模式是"不部署后端也能立刻跑起来"的折中，因此明确标注为**只适合本地演示**。

> 部分开放平台未对浏览器开放 CORS，直连可能被拦截。遇到这种情况界面会提示"建议改用代理模式"，而不是抛一个看不懂的报错。

### 三个关键设计

**1. 数据先聚合，再交给模型**

不把几百条流水直接塞进 prompt，而是先在本地算好统计值（总额、环比、Top5 分类、预算使用率），只把摘要发出去：

- 500 条流水约 8000 token；聚合后约 200~300 token，**成本降到约 1/25**
- 加减法都在本地做，模型只负责"组织语言 + 给建议"，**数字不会算错**

**2. 三级降级，保证永远有结果**

```
调模型 → 成功 → JSON 校验 → 失败重试一次 → 仍失败 → 规则版
       ↘ 超时 / 鉴权失败 / 额度用尽 / 网络异常 → 规则版
```

规则版是本地模板拼接（`js/ai/fallback.js`），不依赖任何外部服务。所以**没配 Key、断网、接口挂了，用户依然能看到一份有用的分析**，只是顶部徽章会标明"本地规则生成"。

**3. 缓存按数据指纹失效**

缓存 key 由「周期 + 记录数 + 收支总额 + 分类明细」拼成。任何一笔流水变动，指纹就变，缓存自动失效，**不会拿旧结论糊弄用户**；同一份数据重复点击则直接命中缓存，不重复花钱。

### 如何配置

打开「AI 分析」页 →「AI 设置」：

- **代理（推荐）**：填入自己的转发服务地址（形如 `http://127.0.0.1:8787/api/chat`），优先级高于 Key
- **直连**：填入智谱开放平台的 API Key（默认模型 `glm-4-flash`）

页面底部会显示当前模式、累计调用次数与 token 用量、缓存份数，方便观察成本。

> ⚠️ **实测结论：智谱开放平台没有对浏览器开放 CORS**，所以"直连模式"在浏览器里会被拦截（`Access-Control-Allow-Origin` 缺失）。直连代码保留是为了说明双模式的设计，真正可用的是代理模式。

### 启动本地代理（约 20 秒）

仓库里带了一个零依赖的 Node 代理：

```bash
# 1. 装/确认 Node 18+
node -v

# 2. 设置 Key（去 https://open.bigmodel.cn 申请，glm-4-flash 免费）
export ZHIPU_API_KEY=你的key

# 3. 启动代理
node proxy/server.mjs
# ✅ 代理已启动：http://127.0.0.1:8787/api/chat
```

然后在记账本「AI 设置 → 代理地址」里填 `http://127.0.0.1:8787/api/chat`，点保存，再点「生成分析」。

代理做了三件事：加 CORS 头 → 注入 Key → 透传请求。**Key 只在 Node 进程的环境变量里，不进浏览器、不进仓库。**

### 部署到线上（可选）

把 `proxy/server.mjs` 的逻辑搬到 Vercel Edge Function，Key 配在项目的环境变量里：

```js
// api/chat.js
export const config = { runtime: 'edge' }

export default async function handler(req) {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  }
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 })

  const upstream = await fetch('https://open.bigmodel.cn/api/paas/v4/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.ZHIPU_API_KEY}`
    },
    body: await req.text()
  })

  return new Response(upstream.body, {
    status: upstream.status,
    headers: { ...cors, 'Content-Type': 'application/json' }
  })
}
```

部署后把地址填进「代理地址」即可，前提是记账本本身也部署在可访问的位置。

## 本地运行

因为用了 ES Modules，**不能直接双击 index.html 打开**（`file://` 协议下浏览器会拦截模块加载）。需要起一个本地静态服务器：

```bash
cd accountBook
python3 -m http.server 8000
# 然后打开 http://localhost:8000
```

用 VS Code 的 Live Server 插件也可以。

## 单元测试（Vitest）

数据层（`js/tracker.js`）是纯逻辑，不碰 DOM，所以可以直接在 Node 里测，不需要浏览器、也不需要 jsdom。

```bash
npm install      # 首次运行，安装 vitest
npm test         # 跑一遍全部用例（vitest run）
npm run test:watch   # 开发时监听文件变化自动重跑
```

用例都在 `test/` 下，共 **70 条**（数据层 31 条 + AI 模块 39 条）。

**`test/tracker.test.js`（31 条）**

- **CSV 解析**：引号内的逗号 / 换行 / 转义引号、BOM、CRLF
- **日期工具**：本地时间（避免 `toISOString()` 在东八区凌晨退回前一天）
- **增改校验**：金额非数字、日期不存在时拒绝写入；字符串金额被归一化
- **筛选**：不选年份跨年份按月筛、年 + 月、类型 + 分类组合、关键词
- **排序**：同日按添加顺序、按金额、不改动原数组
- **导入导出**：备注含换行也能往返、重复记录去重、脏数据跳过、新分类自动登记、表头可换序
- **预算**：按月分别保存、超支标记、无预算返回 null
- **统计**：收支结余、分类聚合倒序

**`test/ai.test.js`（39 条）**

- **聚合**：收支汇总、Top5 截断与排序、环比计算、跨年取上月、分类级环比、空数据不抛错
- **指纹**：数据变化时指纹必变、数据相同时指纹稳定（保证缓存不会误命中）
- **模型输出解析**：纯 JSON / ```json 代码块 / 前后带说明文字 / 完全非法输入
- **结构校验**：缺字段抛错、非法 type 降级、字符串数组兼容、超长截断、字段同义名兼容
- **规则版降级**：空数据提示、超支与预算充足分别给出对应结论、条数上限

关于 localStorage：`js/storage.js` 用的是浏览器的 `localStorage`，Node 里没有这个全局对象。测试文件顶部用一个内存对象顶替了它，所以**不需要 jsdom**，整个测试跑完不到 1 秒。

> 测试里踩到一个坑：`tracker.add()` 内部会 `reload()` 同步 localStorage，所以在同一个 `it` 里连建两个 tracker 会读到彼此的数据。涉及两次构造的用例，中间要 `localStorage.clear()`。

## 部署到 GitHub Pages

1. 把整个文件夹推到仓库
2. 仓库 Settings → Pages → Source 选 `main` 分支、`/ (root)`
3. 访问 `https://<用户名>.github.io/<仓库名>/accountBook/`

> 注意 URL 大小写敏感，文件夹名要和链接里完全一致。
> 仓库根目录放一个空的 `.nojekyll` 文件可以跳过 Jekyll 处理（本项目文件夹内已放了一份）。

## CSV 格式

导出和导入使用同一套格式，列顺序为：

```
类型,金额,分类,日期,备注
支出,25.00,餐饮,2026-10-12,午餐
```

- `类型`：`支出` 或 `收入`
- `日期`：必须是 `YYYY-MM-DD`，不能写 `2026/10/12`
- `备注`：可以留空；如果里面有逗号，需要用双引号包起来，例如 `"买衣服, 打折"`
- 文件编码必须是 **UTF-8**（Mac 文本编辑：格式 → 制作纯文本，保存时编码选 UTF-8），否则中文乱码
- 重复的记录（类型+金额+分类+日期+备注 完全相同）导入时会自动跳过
- 表头可以带也可以不带；带表头时会按列名匹配，所以列顺序可以调换

可以直接用仓库里的 `sample-import.csv` 测试导入。

## 数据说明

- 所有数据存在浏览器 localStorage，键名前缀 `accountBook_`
- 换浏览器 / 换设备 / 清理浏览器数据都会导致数据看不到，请用 CSV 导出备份
- 同一浏览器开了多个标签页时，改动会通过 `storage` 事件自动同步

## 更新后没变化？

Service Worker 会缓存页面资源。如果改了代码但页面没更新：

1. 在当前页面按 `Command + Shift + R`（Windows 用 `Ctrl + Shift + R`）强制刷新一次
2. 仍然不行就打开 DevTools → Application → Service Workers → Unregister，再刷新

正常刷新时 HTML / JS / CSS 走的是"网络优先"策略，所以之后更新会自动生效。
