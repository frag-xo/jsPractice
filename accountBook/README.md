# 记账本

一个纯前端（无后端、无数据库）的记账小工具。数据存在浏览器 localStorage 里，可以离线使用、可以装到桌面。

## 功能

- 收支记录的新增、编辑、删除，支持批量删除
- 按年份 / 月份 / 类型 / 分类筛选，备注与分类模糊搜索（400ms 防抖）
- 按日期或金额排序（升序 / 降序）
- ECharts 分类占比饼图 + 近 6 个月收支趋势折线图
- 按月设置预算，顶部显示预算进度，超支标红
- 自定义分类，分类标签上显示被多少笔记录使用
- 月与月 / 年与年收支对比，含差值配色和一句话结论
- CSV 导出 / 导入（自动跳过重复记录，自动登记新分类）
- 深色模式（首次打开跟随系统设置）
- PWA：可安装到桌面、离线可用

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
└── js/
    ├── app.js              入口：DOM 事件、页面渲染调度
    ├── tracker.js          数据层：ExpenseTracker 类（CRUD / 筛选 / 统计 / CSV）
    ├── storage.js          localStorage 封装
    ├── render.js           视图层：把数据画成 DOM
    └── charts.js           ECharts 封装
```

## 本地运行

因为用了 ES Modules，**不能直接双击 index.html 打开**（`file://` 协议下浏览器会拦截模块加载）。需要起一个本地静态服务器：

```bash
cd accountBook
python3 -m http.server 8000
# 然后打开 http://localhost:8000
```

用 VS Code 的 Live Server 插件也可以。

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
