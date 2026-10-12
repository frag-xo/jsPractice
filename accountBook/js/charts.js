let pieChart = null
let lineChart = null

export function renderPieChart(el, data) {
  if (!pieChart) pieChart = echarts.init(el)
  pieChart.setOption({
    tooltip: { trigger: 'item', formatter: '{b}: ¥{c} ({d}%)' },
    legend: { bottom: 0, textStyle: { fontSize: 11 } },
    series: [{
      type: 'pie',
      radius: ['40%', '65%'],
      avoidLabelOverlap: true,
      itemStyle: { borderRadius: 6, borderColor: '#fff', borderWidth: 2 },
      label: { show: false },
      data: data.length ? data : [{ name: '暂无数据', value: 1, itemStyle: { color: '#e3e5e8' } }]
    }]
  })
}

export function renderLineChart(el, data) {
  if (!lineChart) lineChart = echarts.init(el)
  lineChart.setOption({
    tooltip: { trigger: 'axis' },
    legend: { data: ['收入', '支出'], bottom: 0, textStyle: { fontSize: 11 } },
    grid: { left: 40, right: 20, top: 20, bottom: 40 },
    xAxis: {
      type: 'category',
      data: data.map(d => d.month.slice(5) + '月'),
      axisLine: { lineStyle: { color: '#e3e5e8' } }
    },
    yAxis: {
      type: 'value',
      axisLine: { show: false },
      splitLine: { lineStyle: { color: '#eef0f3' } }
    },
    series: [
      { name: '收入', type: 'line', smooth: true, data: data.map(d => d.income), itemStyle: { color: '#16a34a' } },
      { name: '支出', type: 'line', smooth: true, data: data.map(d => d.expense), itemStyle: { color: '#ef4444' } }
    ]
  })
}

export function resizeCharts() {
  pieChart?.resize()
  lineChart?.resize()
}