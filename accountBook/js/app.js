import { ExpenseTracker } from './tracker.js'
import {
  renderList, renderStats, renderBudget, renderCategoryOptions,
  renderCategoryManager, renderYearMonthOptions, renderCompareResult
} from './render.js'
import { renderPieChart, renderLineChart, resizeCharts } from './charts.js'

const tracker = new ExpenseTracker()

// ===== DOM =====
const $ = (id) => document.getElementById(id)

const batchToggleBtn = $('batchToggleBtn')
const batchCancleBtn = $('batchCancleBtn')
const batchBar = $('batchBar')
const selectAllEl = $('selectAll')
const selectedCountEl = $('selectedCount')
const batchDeleteBtn = $('batchDeleteBtn')
const typeEl = $('type')
const amountEl = $('amount')
const categoryEl = $('category')
const dateEl = $('date')
const noteEl = $('note')
const addBtn = $('addBtn')
const cancelEditBtn = $('cancelEditBtn')
const listEl = $('list')
const balanceEl = $('balance')
const incomeEl = $('totalIncome')
const expenseEl = $('totalExpense')
const budgetBarEl = $('budgetBar')
const budgetFillEl = $('budgetFill')
const budgetTextEl = $('budgetText')
const searchInput = $('searchInput')
const yearFilter = $('yearFilter')
const monthFilter = $('monthFilter')
const typeFilter = $('typeFilter')
const categoryFilter = $('categoryFilter')
const sortBy = $('sortBy')
const sortOrder = $('sortOrder')
const themeBtn = $('themeBtn')
const pieChartEl = $('pieChart')
const lineChartEl = $('lineChart')
const categoryListEl = $('categoryList')
const newCategoryEl = $('newCategory')
const addCategoryBtn = $('addCategoryBtn')
const budgetMonthEl = $('budgetMonth')
const budgetAmountEl = $('budgetAmount')
const saveBudgetBtn = $('saveBudgetBtn')
const exportBtn = $('exportBtn')
const importInput = $('importInput')
const importStatus = $('importStatus')
const compareType = $('compareType')
const monthCompareRow = $('monthCompareRow')
const yearCompareRow = $('yearCompareRow')
const period1Month = $('period1Month')
const period2Month = $('period2Month')
const period1Year = $('period1Year')
const period2Year = $('period2Year')
const compareBtn = $('compareBtn')
const compareResult = $('compareResult')

// ===== 状态 =====
let editingId = null
let searchKeyword = ''
let batchMode = false
const selectedIds = new Set()

// ===== 防抖 =====
function debounce(fn, delay) {
  let timer = null
  return function (...args) {
    clearTimeout(timer)
    timer = setTimeout(() => fn.apply(this, args), delay)
  }
}

// ===== 当前筛选 =====
function getFilters() {
  return {
    year: yearFilter.value,
    month: monthFilter.value,
    type: typeFilter.value,
    category: categoryFilter.value,
    keyword: searchKeyword
  }
}

// ===== 渲染记录页 =====
function refresh() {
  const filtered = tracker.filter(getFilters())
  const sorted = tracker.sort(filtered, sortBy.value, sortOrder.value)

  const currentIds = new Set(sorted.map(r => r.id))
  for (const id of selectedIds) {
    if (!currentIds.has(id)) selectedIds.delete(id)
  }

  renderList(
    listEl,
    sorted,
    (record) => startEdit(record),
    (record) => {
      if (confirm('确定删除这条记录吗？')) {
        tracker.remove(record.id)
        selectedIds.delete(record.id)
        refresh()
      }
    },
    batchMode,
    selectedIds,
    (id) => {
      if (selectedIds.has(id)) selectedIds.delete(id)
      else selectedIds.add(id)
      refresh()
    }
  )

  const stats = tracker.getStats(filtered)
  renderStats({ balance: balanceEl, income: incomeEl, expense: expenseEl }, stats)

  const currentMonth = new Date().toISOString().slice(0, 7)
  renderBudget(budgetBarEl, budgetFillEl, budgetTextEl, tracker.getBudgetStatus(currentMonth))

  updateBatchBar(sorted.length)
}

function updateBatchBar(totalCount) {
  if (!batchMode) {
    batchBar.classList.add('hidden')
    batchToggleBtn.classList.remove('hidden')
    return
  }

  batchBar.classList.remove('hidden')
  batchToggleBtn.classList.add('hidden')

  const count = selectedIds.size
  selectedCountEl.textContent = `已选 ${count} 条`

  selectAllEl.checked = totalCount > 0 && count === totalCount
  selectAllEl.indeterminate = count > 0 && count < totalCount

  batchDeleteBtn.disabled = count === 0
}

// 进入批量模式
batchToggleBtn.addEventListener('click', () => {
  batchMode = true
  selectedIds.clear()
  refresh()
})

// 退出批量模式
batchCancelBtn.addEventListener('click', () => {
  batchMode = false
  selectedIds.clear()
  refresh()
})

// 全选
selectAllEl.addEventListener('change', () => {
  const filtered = tracker.filter(getFilters())
  const sorted = tracker.sort(filtered, sortBy.value, sortOrder.value)

  if (selectAllEl.checked) {
    sorted.forEach(r => selectedIds.add(r.id))
  } else {
    selectedIds.clear()
  }
  refresh()
})

// 批量删除
batchDeleteBtn.addEventListener('click', () => {
  const count = selectedIds.size
  if (count === 0) return
  if (!confirm(`确定删除选中的 ${count} 条记录吗？此操作不可恢复。`)) return

  const deleted = tracker.removeMany([...selectedIds])
  selectedIds.clear()
  batchMode = false
  refresh()
  refreshCharts()
  alert(`已删除 ${deleted} 条记录`)
})

// ===== 刷新筛选下拉选项 =====
function refreshFilters() {
  renderYearMonthOptions(yearFilter, monthFilter, tracker.records)
  renderCategoryOptions(categoryFilter, tracker.categories, true)
}

// ===== 编辑 =====
function startEdit(record) {
  editingId = record.id
  typeEl.value = record.type
  amountEl.value = record.amount
  categoryEl.value = record.category
  dateEl.value = record.date
  noteEl.value = record.note || ''
  addBtn.textContent = '保存修改'
  cancelEditBtn.classList.remove('hidden')
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

function cancelEdit() {
  editingId = null
  typeEl.value = 'expense'
  amountEl.value = ''
  noteEl.value = ''
  dateEl.value = new Date().toISOString().slice(0, 10)
  addBtn.textContent = '添加记录'
  cancelEditBtn.classList.add('hidden')
}

// ===== 添加/保存 =====
addBtn.addEventListener('click', () => {
  const amount = parseFloat(amountEl.value)
  const date = dateEl.value

  if (!amount || amount <= 0) return alert('请输入正确的金额')
  if (!date) return alert('请选择日期')

  const data = {
    type: typeEl.value,
    amount,
    category: categoryEl.value,
    date,
    note: noteEl.value.trim()
  }

  if (editingId) {
    tracker.update(editingId, data)
    cancelEdit()
  } else {
    tracker.add(data)
    amountEl.value = ''
    noteEl.value = ''
  }

  refresh()
  refreshCharts()
})

cancelEditBtn.addEventListener('click', cancelEdit)

// ===== 筛选事件 =====
searchInput.addEventListener('input', debounce((e) => {
  searchKeyword = e.target.value.trim()
  refresh()
}, 400))

yearFilter.addEventListener('change', refresh)
monthFilter.addEventListener('change', refresh)
typeFilter.addEventListener('change', refresh)
categoryFilter.addEventListener('change', refresh)
sortBy.addEventListener('change', refresh)
sortOrder.addEventListener('change', refresh)

// ===== 主题 =====
function applyTheme() {
  document.body.dataset.theme = tracker.theme
  themeBtn.textContent = tracker.theme === 'dark' ? '☀️' : '🌙'
}

themeBtn.addEventListener('click', () => {
  tracker.setTheme(tracker.theme === 'dark' ? 'light' : 'dark')
  applyTheme()
})

// ===== 图表 =====
function refreshCharts() {
  const pieData = tracker.getCategoryStats()
  renderPieChart(pieChartEl, pieData)

  const trendData = tracker.getTrendData(tracker.records, 6)
  renderLineChart(lineChartEl, trendData)
}

// ===== 标签页切换 =====
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'))
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'))
    tab.classList.add('active')
    $(`tab-${tab.dataset.tab}`).classList.add('active')

    if (tab.dataset.tab === 'stats') {
      setTimeout(() => {
        refreshCharts()
        resizeCharts()
      }, 50)
    }
  })
})

// ===== 分类管理 =====
addCategoryBtn.addEventListener('click', () => {
  const name = newCategoryEl.value.trim()
  if (!name) return
  if (tracker.addCategory(name)) {
    newCategoryEl.value = ''
    refreshCategoryManager()
    refreshFilters()
    refresh()
  } else {
    alert('分类已存在或无效')
  }
})

function refreshCategoryManager() {
  renderCategoryManager(categoryListEl, tracker.categories, (cat) => {
    if (confirm(`确定删除分类「${cat}」吗？`)) {
      tracker.removeCategory(cat)
      refreshCategoryManager()
      refreshFilters()
      refresh()
    }
  })
}

// ===== 预算 =====
saveBudgetBtn.addEventListener('click', () => {
  const month = budgetMonthEl.value
  const amount = parseFloat(budgetAmountEl.value)
  if (!month) return alert('请选择月份')
  if (!amount || amount <= 0) return alert('请输入正确的金额')
  tracker.setBudget(month, amount)
  alert('预算已保存')
  refresh()
})

// ===== 导入导出 =====
exportBtn.addEventListener('click', () => {
  const csv = tracker.exportCSV()
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `记账本_${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
})

importInput.addEventListener('change', (e) => {
  const file = e.target.files[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = (ev) => {
    const result = tracker.importCSV(ev.target.result)
    importStatus.textContent = `导入完成：新增 ${result.added} 条，跳过 ${result.skipped} 条`
    refresh()
    refreshFilters()
    refreshCharts()
  }
  reader.readAsText(file, 'utf-8')
  importInput.value = ''
})

// ===== 对比 =====
compareType.addEventListener('change', () => {
  if (compareType.value === 'month') {
    monthCompareRow.classList.remove('hidden')
    yearCompareRow.classList.add('hidden')
  } else {
    monthCompareRow.classList.add('hidden')
    yearCompareRow.classList.remove('hidden')
  }
})

compareBtn.addEventListener('click', () => {
  let p1, p2, type
  if (compareType.value === 'month') {
    p1 = period1Month.value
    p2 = period2Month.value
    type = 'month'
    if (!p1 || !p2) return alert('请选择两个月份')
  } else {
    p1 = period1Year.value
    p2 = period2Year.value
    type = 'year'
    if (!p1 || !p2) return alert('请选择两个年份')
  }
  const data = tracker.getComparison(p1, p2, type)
  renderCompareResult(compareResult, data, type)
})

// ===== 窗口大小变化 =====
window.addEventListener('resize', debounce(resizeCharts, 200))

// ===== 初始化 =====
function init() {
  applyTheme()
  dateEl.value = new Date().toISOString().slice(0, 10)
  budgetMonthEl.value = new Date().toISOString().slice(0, 7)

  renderCategoryOptions(categoryEl, tracker.categories, false)
  refreshFilters()
  refreshCategoryManager()
  refresh()

  if (tracker.budget.month && tracker.budget.amount) {
    budgetMonthEl.value = tracker.budget.month
    budgetAmountEl.value = tracker.budget.amount
  }

  // PWA
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {})
  }
}

init()