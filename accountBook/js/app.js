import { ExpenseTracker, formatDate, formatMonth, isValidMonth } from './tracker.js'
import {
  renderList, renderStats, renderBudget, renderCategoryOptions,
  renderCategoryManager, renderYearMonthOptions, renderCompareResult
} from './render.js'
import { renderPieChart, renderLineChart, resizeCharts } from './charts.js'

const tracker = new ExpenseTracker()

// ===== DOM =====
const $ = (id) => document.getElementById(id)

const batchToggleBtn = $('batchToggleBtn')
const batchCancelBtn = $('batchCancelBtn') // 原来拼成了 batchCancleBtn，$() 返回 null
const batchBar = $('batchBar')
const selectAllEl = $('selectAll')
const selectedCountEl = $('selectedCount')
const batchDeleteBtn = $('batchDeleteBtn')
const recordCountEl = $('recordCount')
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
const budgetHintEl = $('budgetHint')
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

/**
 * 统一的事件绑定。
 * 之前只要有一个元素取不到（比如浏览器还在用旧的 index.html 缓存），
 * xxx.addEventListener 就会抛 TypeError，整个脚本一行都不执行 ——
 * 表现就是"数据没了、标签页点不动"。现在缺元素只警告，不影响其他功能。
 */
function on(node, event, handler) {
  if (!node) {
    console.warn(`[记账本] 页面上找不到该元素，跳过 ${event} 事件绑定`)
    return
  }
  node.addEventListener(event, handler)
}

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

/** 分类筛选里也要能选到"已被删除但记录还在用"的分类 */
function allCategoryNames() {
  const set = new Set(tracker.categories)
  tracker.records.forEach(r => set.add(r.category))
  return [...set]
}

/** 清理掉已经被删掉的记录的选中状态，但保留"筛选后不可见"的选中项 */
function pruneSelection() {
  const alive = new Set(tracker.records.map(r => r.id))
  for (const id of [...selectedIds]) {
    if (!alive.has(id)) selectedIds.delete(id)
  }
}

// ===== 渲染记录页 =====
function refresh() {
  const filtered = tracker.filter(getFilters())
  const sorted = tracker.sort(filtered, sortBy.value, sortOrder.value)

  pruneSelection()

  renderList(listEl, sorted, {
    onEdit: startEdit,
    onDelete: handleDelete,
    batchMode,
    selectedIds,
    onToggleSelect: (id) => {
      if (selectedIds.has(id)) selectedIds.delete(id)
      else selectedIds.add(id)
      refresh()
    }
  })

  const stats = tracker.getStats(filtered)
  renderStats({ balance: balanceEl, income: incomeEl, expense: expenseEl }, stats)

  renderBudget(
    { bar: budgetBarEl, fill: budgetFillEl, text: budgetTextEl },
    tracker.getBudgetStatus(formatMonth())
  )

  updateBatchBar(sorted.length)

  if (recordCountEl) {
    const total = tracker.records.length
    recordCountEl.textContent = filtered.length === total
      ? `共 ${total} 条记录`
      : `筛选出 ${filtered.length} / ${total} 条记录`
  }
}

function updateBatchBar(totalCount) {
  if (!batchMode) {
    batchBar?.classList.add('hidden')
    batchToggleBtn?.classList.remove('hidden')
    return
  }

  batchBar?.classList.remove('hidden')
  batchToggleBtn?.classList.add('hidden')

  const count = selectedIds.size
  if (selectedCountEl) selectedCountEl.textContent = `已选 ${count} 条`
  if (selectAllEl) {
    selectAllEl.checked = totalCount > 0 && count === totalCount
    selectAllEl.indeterminate = count > 0 && count < totalCount
  }
  if (batchDeleteBtn) batchDeleteBtn.disabled = count === 0
}

/** 保存失败（本地存储写不进去）时明确告诉用户，不要默默丢数据 */
function warnIfSaveFailed() {
  if (!tracker.lastSaveOk) {
    alert('数据保存失败：浏览器本地存储可能已满或被禁用。请先导出 CSV 备份，再清理浏览器存储后重试。')
  }
}

// ===== 进入 / 退出批量模式 =====
on(batchToggleBtn, 'click', () => {
  batchMode = true
  selectedIds.clear()
  refresh()
})

on(batchCancelBtn, 'click', () => {
  batchMode = false
  selectedIds.clear()
  refresh()
})

on(selectAllEl, 'change', () => {
  const filtered = tracker.filter(getFilters())
  const sorted = tracker.sort(filtered, sortBy.value, sortOrder.value)

  if (selectAllEl.checked) sorted.forEach(r => selectedIds.add(r.id))
  else selectedIds.clear()

  refresh()
})

on(batchDeleteBtn, 'click', () => {
  const count = selectedIds.size
  if (count === 0) return
  if (!confirm(`确定删除选中的 ${count} 条记录吗？此操作不可恢复。`)) return

  const deleted = tracker.removeMany([...selectedIds])
  selectedIds.clear()
  batchMode = false
  refresh()
  refreshCharts()
  warnIfSaveFailed()
  alert(`已删除 ${deleted} 条记录`)
})

// ===== 刷新筛选下拉选项 =====
function refreshFilters() {
  renderYearMonthOptions(yearFilter, monthFilter, tracker.records)
  renderCategoryOptions(categoryFilter, allCategoryNames(), { allLabel: '全部分类' })
}

/** "添加记录"表单里的分类下拉（和筛选器是两套选项，必须分别刷新） */
function refreshCategorySelect(preserve) {
  const wanted = preserve ?? categoryEl.value
  renderCategoryOptions(categoryEl, tracker.categories, { selected: wanted })

  // 这条记录用的分类已经被删掉了：临时补一个选项，
  // 否则 categoryEl.value = '宠物' 会静默失败，保存时分类就丢了。
  if (wanted && !Array.from(categoryEl.options).some(o => o.value === wanted)) {
    const opt = document.createElement('option')
    opt.value = wanted
    opt.textContent = `${wanted}（已删除）`
    categoryEl.appendChild(opt)
    categoryEl.value = wanted
  }
}

// ===== 编辑 =====
function startEdit(record) {
  editingId = record.id
  typeEl.value = record.type
  amountEl.value = record.amount
  refreshCategorySelect(record.category)
  dateEl.value = record.date
  noteEl.value = record.note || ''
  addBtn.textContent = '保存修改'
  cancelEditBtn?.classList.remove('hidden')
  switchTab('records')
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

function resetForm() {
  editingId = null
  typeEl.value = 'expense'
  amountEl.value = ''
  noteEl.value = ''
  dateEl.value = formatDate() // 用本地日期，不再用 UTC 的 toISOString
  addBtn.textContent = '添加记录'
  cancelEditBtn?.classList.add('hidden')
  refreshCategorySelect('')
}

// ===== 添加 / 保存 =====
function handleSubmit() {
  const amount = Number(amountEl.value)
  const date = dateEl.value

  if (!Number.isFinite(amount) || amount <= 0) return alert('请输入正确的金额')
  if (!date) return alert('请选择日期')
  if (!categoryEl.value) return alert('请先选择一个分类')

  const data = {
    type: typeEl.value,
    amount,
    category: categoryEl.value,
    date,
    note: noteEl.value.trim()
  }

  if (editingId) {
    const updated = tracker.update(editingId, data)
    if (!updated) return alert('保存失败：这条记录不存在，或金额/日期不合法')
    resetForm()
  } else {
    const created = tracker.add(data)
    if (!created) return alert('添加失败：请检查金额和日期')
    amountEl.value = ''
    noteEl.value = ''
    amountEl.focus()
  }

  warnIfSaveFailed()
  refreshFilters() // 先刷新下拉框（新出现的年份要能选到）
  refresh()        // 再渲染列表
  refreshCharts()
}

on(addBtn, 'click', handleSubmit)
on(cancelEditBtn, 'click', resetForm)

// 输入框里按回车直接提交
;[amountEl, noteEl, dateEl].forEach(el => {
  on(el, 'keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleSubmit()
    }
  })
})

function handleDelete(record) {
  if (!confirm('确定删除这条记录吗？')) return
  tracker.remove(record.id)
  selectedIds.delete(record.id)
  refresh()
  refreshCharts()
  warnIfSaveFailed()
}

// ===== 筛选事件 =====
on(searchInput, 'input', debounce((e) => {
  searchKeyword = e.target.value.trim()
  refresh()
}, 400))

on(yearFilter, 'change', refresh)
on(monthFilter, 'change', refresh)
on(typeFilter, 'change', refresh)
on(categoryFilter, 'change', refresh)
on(sortBy, 'change', refresh)
on(sortOrder, 'change', refresh)

// ===== 主题 =====
function applyTheme() {
  document.body.dataset.theme = tracker.theme
  if (themeBtn) themeBtn.textContent = tracker.theme === 'dark' ? '☀️' : '🌙'
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', tracker.theme === 'dark' ? '#17181c' : '#4f7cff')
}

on(themeBtn, 'click', () => {
  tracker.setTheme(tracker.theme === 'dark' ? 'light' : 'dark')
  applyTheme()
  refreshCharts() // 图表文字颜色跟着主题走
})

// ===== 图表 =====
function refreshCharts() {
  renderPieChart(pieChartEl, tracker.getCategoryStats())
  renderLineChart(lineChartEl, tracker.getTrendData(tracker.records, 6))
}

// ===== 标签页切换 =====
function switchTab(name) {
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === name))
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('active', p.id === `tab-${name}`))
  if (name === 'stats') {
    // 等布局完成再画，否则拿到的是 0×0 的容器
    requestAnimationFrame(() => {
      refreshCharts()
      resizeCharts()
    })
  }
}

document.querySelectorAll('.tab').forEach(tab => {
  on(tab, 'click', () => switchTab(tab.dataset.tab))
})

// ===== 分类管理 =====
on(addCategoryBtn, 'click', () => {
  const name = newCategoryEl.value.trim()
  if (!name) return alert('请输入分类名称')
  if (name.length > 12) return alert('分类名称不要超过 12 个字')

  if (!tracker.addCategory(name)) {
    alert('分类已存在，或名称无效')
    return
  }

  newCategoryEl.value = ''
  refreshCategorySelect()
  refreshCategoryManager()
  refreshFilters()
  refresh()
  warnIfSaveFailed()
})

function refreshCategoryManager() {
  renderCategoryManager(
    categoryListEl,
    tracker.categories,
    (cat) => {
      const used = tracker.countByCategory(cat)
      const message = used
        ? `分类「${cat}」下还有 ${used} 笔记录。\n删除分类不会删掉这些记录，它们会保留原来的分类名。\n确定删除吗？`
        : `确定删除分类「${cat}」吗？`
      if (!confirm(message)) return

      tracker.removeCategory(cat)
      refreshCategorySelect()
      refreshCategoryManager()
      refreshFilters()
      refresh()
      warnIfSaveFailed()
    },
    (cat) => tracker.countByCategory(cat)
  )
}

// ===== 预算 =====
function loadBudgetIntoForm() {
  if (!budgetMonthEl) return
  const month = budgetMonthEl.value
  const amount = month ? tracker.getBudget(month) : 0
  if (budgetAmountEl) budgetAmountEl.value = amount || ''
  if (saveBudgetBtn) saveBudgetBtn.textContent = amount ? '更新预算' : '保存预算'
  if (budgetHintEl) {
    budgetHintEl.textContent = amount
      ? `${month} 已设置预算 ¥${amount.toFixed(2)}，清空金额后保存可取消`
      : '每个月的预算互相独立，可以分别设置'
  }
}

on(budgetMonthEl, 'change', loadBudgetIntoForm)

on(saveBudgetBtn, 'click', () => {
  const month = budgetMonthEl.value
  if (!isValidMonth(month)) return alert('请选择月份')

  const raw = budgetAmountEl.value.trim()
  if (!raw) {
    if (!tracker.getBudget(month)) return alert('请输入预算金额')
    if (!confirm(`确定取消 ${month} 的预算吗？`)) return
    tracker.setBudget(month, 0)
    loadBudgetIntoForm()
    refresh()
    return
  }

  const amount = Number(raw)
  if (!Number.isFinite(amount) || amount <= 0) return alert('请输入正确的金额')

  tracker.setBudget(month, amount)
  warnIfSaveFailed()
  loadBudgetIntoForm()
  refresh()
})

// ===== 导入导出 =====
on(exportBtn, 'click', () => {
  const csv = tracker.exportCSV()
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `记账本_${formatDate()}.csv`
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  // 立刻 revokeObjectURL 会让 Firefox / Safari 偶发下载失败，延后释放
  setTimeout(() => URL.revokeObjectURL(url), 1000)
})

on(importInput, 'change', (e) => {
  const file = e.target.files?.[0]
  if (!file) return

  const reader = new FileReader()
  reader.onerror = () => { importStatus.textContent = '读取文件失败，请重试' }
  reader.onload = (ev) => {
    let result
    try {
      result = tracker.importCSV(String(ev.target.result ?? ''))
    } catch (error) {
      console.error('[记账本] CSV 解析失败：', error)
      importStatus.textContent = '导入失败：这个文件不是合法的 CSV'
      return
    }

    const parts = [`新增 ${result.added} 条`]
    if (result.duplicates) parts.push(`跳过重复 ${result.duplicates} 条`)
    if (result.skipped) parts.push(`忽略无效 ${result.skipped} 条`)
    if (result.categoriesAdded) parts.push(`新增分类 ${result.categoriesAdded} 个`)

    importStatus.textContent = result.added
      ? `导入完成：${parts.join('，')}`
      : `没有导入任何记录（${parts.join('，')}）。请确认文件是 UTF-8 编码、格式为「类型,金额,分类,日期,备注」`

    // 顺序很重要：先重建下拉框，再渲染列表。
    // 反过来的话，列表会用"旧的筛选条件"渲染，看起来就是"导入成功但没有数据"。
    refreshFilters()
    refreshCategorySelect()
    refreshCategoryManager()
    refresh()
    refreshCharts()
    warnIfSaveFailed()
  }

  reader.readAsText(file, 'utf-8')
  e.target.value = '' // 允许重复选择同一个文件
})

// ===== 对比 =====
on(compareType, 'change', () => {
  const isMonth = compareType.value === 'month'
  monthCompareRow?.classList.toggle('hidden', !isMonth)
  yearCompareRow?.classList.toggle('hidden', isMonth)
})

on(compareBtn, 'click', () => {
  let p1
  let p2
  const type = compareType.value

  if (type === 'month') {
    p1 = period1Month.value
    p2 = period2Month.value
    if (!isValidMonth(p1) || !isValidMonth(p2)) return alert('请选择两个月份')
  } else {
    p1 = String(period1Year.value).trim()
    p2 = String(period2Year.value).trim()
    if (!/^\d{4}$/.test(p1) || !/^\d{4}$/.test(p2)) return alert('请输入 4 位数的年份')
  }

  renderCompareResult(compareResult, tracker.getComparison(p1, p2, type), type)
})

// ===== 窗口大小变化 =====
on(window, 'resize', debounce(resizeCharts, 200))

// ===== 多标签页同步 =====
// 同一个浏览器开了两个页面时，另一个页面改了数据要能同步过来，
// 否则两个页面各存一份内存数据，后保存的会把先保存的覆盖掉。
on(window, 'storage', (event) => {
  if (event.key && !event.key.startsWith('accountBook_')) return
  tracker.reload()
  applyTheme()
  refreshFilters()
  refreshCategorySelect()
  refreshCategoryManager()
  refresh()
  refreshCharts()
  loadBudgetIntoForm()
})

// ===== PWA =====
function registerServiceWorker() {
  const sw = navigator.serviceWorker
  if (!sw) return
  if (location.protocol === 'file:') return // 直接双击打开 html 时注册不了，跳过

  sw.register('sw.js', { updateViaCache: 'none' })
    .then((reg) => {
      reg.update().catch(() => {})
      reg.addEventListener('updatefound', () => {
        const worker = reg.installing
        if (!worker) return
        worker.addEventListener('statechange', () => {
          if (worker.state === 'activated' && sw.controller) {
            console.info('[记账本] 新版本已就绪，刷新后生效')
          }
        })
      })
    })
    .catch((error) => console.warn('[记账本] Service Worker 注册失败：', error))

  // 新的 SW 接管后自动刷新一次，避免新旧文件混用
  let reloading = false
  sw.addEventListener('controllerchange', () => {
    if (reloading) return
    reloading = true
    location.reload()
  })
}

// ===== 初始化 =====
function init() {
  applyTheme()
  dateEl.value = formatDate()
  if (budgetMonthEl) budgetMonthEl.value = formatMonth()

  refreshCategorySelect()
  refreshFilters()
  refreshCategoryManager()
  loadBudgetIntoForm()
  refresh()

  // 对比页给个合理默认值
  if (period1Month && !period1Month.value) period1Month.value = formatMonth()
  if (period2Month && !period2Month.value) {
    const last = new Date()
    last.setDate(1)
    last.setMonth(last.getMonth() - 1)
    period2Month.value = formatMonth(last)
  }
  if (period1Year && !period1Year.value) period1Year.value = String(new Date().getFullYear())
  if (period2Year && !period2Year.value) period2Year.value = String(new Date().getFullYear() - 1)

  registerServiceWorker()
}

try {
  init()
} catch (error) {
  console.error('[记账本] 初始化失败：', error)
  const banner = document.createElement('div')
  banner.className = 'app-error'
  banner.textContent = '页面初始化失败。请强制刷新（Command + Shift + R）；若仍然失败，请查看浏览器控制台的报错信息。'
  document.body.prepend(banner)
}
