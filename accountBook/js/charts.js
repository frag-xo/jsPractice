/* ============================================================
   图表层（ECharts 封装）
   改动点：
   1. ECharts 不再从 CDN 加载，改成 vendor/echarts.min.js 本地文件 —— 断网也能用。
   2. 图表库没加载出来时给出可见提示，而不是抛 ReferenceError 把整个页面搞崩。
   3. 容器还是隐藏状态（宽度/高度为 0）时不初始化，先把数据挂起，
      等切到统计页再画，避免画出 0×0 的空图。
   4. 没有数据时不再塞一个 value:1 的假数据（以前 tooltip 会显示"暂无数据: ¥1.00"）。
   5. 配色跟随暗色模式。
   ============================================================ */

const PIE_COLORS = ['#4f7cff', '#16a34a', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16']

let pieChart = null
let lineChart = null
let pendingPie = null   // { el, data } —— 容器还没显示时的待渲染数据
let pendingLine = null
let warnedNoLib = false

function echartsLib() {
  return typeof window !== 'undefined' ? window.echarts : undefined
}

function cssVar(name, fallback) {
  if (typeof document === 'undefined' || !document.body) return fallback
  const value = getComputedStyle(document.body).getPropertyValue(name)
  return (value && value.trim()) || fallback
}

function containerReady(el) {
  return !!el && el.clientWidth > 0 && el.clientHeight > 0
}

function showFallback(el, message) {
  if (!el) return
  el.innerHTML = `<div class="chart-fallback">${message}</div>`
}

/**
 * 复用已有的实例；容器 DOM 变了就重建。
 * exists 传当前的实例，返回新的实例。
 */
function mount(exists, el) {
  const echarts = echartsLib()
  if (exists && exists.getDom() === el && !exists.isDisposed?.()) return exists
  if (exists && !exists.isDisposed?.()) exists.dispose()
  return echarts.init(el)
}

export function renderPieChart(el, data) {
  if (!el) return
  if (!echartsLib()) {
    if (!warnedNoLib) { console.error('[charts] ECharts 未加载，请检查 vendor/echarts.min.js'); warnedNoLib = true }
    showFallback(el, '图表库加载失败，请强制刷新（Command + Shift + R）')
    return
  }
  if (!containerReady(el)) { pendingPie = { el, data }; return }

  pendingPie = null
  pieChart = mount(pieChart, el)

  const empty = !data || !data.length
  const textColor = cssVar('--text-light', '#8a9099')

  pieChart.setOption({
    tooltip: empty ? { show: false } : { trigger: 'item', formatter: '{b}: ¥{c} ({d}%)' },
    legend: empty ? { show: false } : { bottom: 0, textStyle: { fontSize: 11, color: textColor } },
    graphic: empty
      ? [{ type: 'text', left: 'center', top: 'middle', style: { text: '还没有支出记录', fill: textColor, fontSize: 13 } }]
      : [],
    series: [{
      type: 'pie',
      radius: ['40%', '65%'],
      avoidLabelOverlap: true,
      color: PIE_COLORS,
      itemStyle: { borderRadius: 6, borderColor: cssVar('--card', '#ffffff'), borderWidth: 2 },
      label: { show: false },
      data: empty ? [] : data
    }]
  }, true)
}

export function renderLineChart(el, data) {
  if (!el) return
  if (!echartsLib()) {
    showFallback(el, '图表库加载失败，请强制刷新（Command + Shift + R）')
    return
  }
  if (!containerReady(el)) { pendingLine = { el, data }; return }

  pendingLine = null
  lineChart = mount(lineChart, el)

  const records = Array.isArray(data) ? data : []
  const textColor = cssVar('--text-light', '#8a9099')
  const borderColor = cssVar('--border', '#e3e5e8')
  const splitColor = cssVar('--hover', '#f2f4f7')
  const hasData = records.some(d => d.income > 0 || d.expense > 0)

  lineChart.setOption({
    tooltip: { trigger: 'axis' },
    legend: { data: ['收入', '支出'], bottom: 0, textStyle: { fontSize: 11, color: textColor } },
    grid: { left: 8, right: 16, top: 20, bottom: 40, containLabel: true },
    graphic: hasData
      ? []
      : [{ type: 'text', left: 'center', top: 'middle', style: { text: '近 6 个月还没有数据', fill: textColor, fontSize: 13 } }],
    xAxis: {
      type: 'category',
      data: records.map(d => `${String(d.month).slice(5)}月`),
      axisLine: { lineStyle: { color: borderColor } },
      axisLabel: { color: textColor }
    },
    yAxis: {
      type: 'value',
      axisLine: { show: false },
      axisLabel: { color: textColor },
      splitLine: { lineStyle: { color: splitColor } }
    },
    series: [
      { name: '收入', type: 'line', smooth: true, symbolSize: 6, data: records.map(d => d.income), itemStyle: { color: '#16a34a' } },
      { name: '支出', type: 'line', smooth: true, symbolSize: 6, data: records.map(d => d.expense), itemStyle: { color: '#ef4444' } }
    ]
  }, true)
}

/** 尺寸变化 / 切回统计页时调用：先补画被挂起的图，再 resize */
export function resizeCharts() {
  if (pendingPie) {
    const task = pendingPie
    renderPieChart(task.el, task.data)
  }
  if (pendingLine) {
    const task = pendingLine
    renderLineChart(task.el, task.data)
  }
  pieChart?.resize?.()
  lineChart?.resize?.()
}

export function disposeCharts() {
  if (pieChart && !pieChart.isDisposed?.()) pieChart.dispose()
  if (lineChart && !lineChart.isDisposed?.()) lineChart.dispose()
  pieChart = null
  lineChart = null
}
