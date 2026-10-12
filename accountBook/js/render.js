/* ============================================================
   视图层：只负责把数据画成 DOM，不改数据。
   原则：用户输入（分类名、备注、日期）一律用 textContent 写入，
   不再拼 innerHTML —— 这样从 CSV 导入的 <img onerror=...> 之类不会被执行。
   ============================================================ */

const HTML_ESCAPE = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }

/** 少数必须用 innerHTML 的地方（对比结果）用它转义 */
export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => HTML_ESCAPE[ch])
}

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100
}

function money(n) {
  return `¥${(Number(n) || 0).toFixed(2)}`
}

function makeOption(value, text) {
  const opt = document.createElement('option')
  opt.value = value
  opt.textContent = text
  return opt
}

function selectHasValue(selectEl, value) {
  return Array.from(selectEl.options).some(o => o.value === value)
}

/** 记录列表 */
export function renderList(listEl, records, options = {}) {
  const {
    onEdit,
    onDelete,
    batchMode = false,
    selectedIds = new Set(),
    onToggleSelect = null
  } = options

  listEl.innerHTML = ''

  records.forEach(record => {
    const li = document.createElement('li')
    li.dataset.id = record.id

    // 批量模式才显示复选框
    if (batchMode) {
      const checkbox = document.createElement('input')
      checkbox.type = 'checkbox'
      checkbox.className = 'record-checkbox'
      checkbox.checked = selectedIds.has(record.id)
      checkbox.setAttribute('aria-label', `选择 ${record.category} ${record.date}`)
      if (onToggleSelect) checkbox.addEventListener('change', () => onToggleSelect(record.id))
      li.appendChild(checkbox)
    }

    // 信息区
    const info = document.createElement('div')
    info.className = 'record-info'

    const top = document.createElement('div')
    top.className = 'record-top'

    const categoryEl = document.createElement('span')
    categoryEl.className = 'record-category'
    categoryEl.textContent = record.category

    const dateEl = document.createElement('span')
    dateEl.className = 'record-date'
    dateEl.textContent = record.date

    top.append(categoryEl, dateEl)

    const noteEl = document.createElement('div')
    noteEl.className = 'record-note'
    noteEl.textContent = record.note || '无备注'
    noteEl.title = record.note || ''

    info.append(top, noteEl)

    // 金额
    const isIncome = record.type === 'income'
    const amountEl = document.createElement('span')
    amountEl.className = `record-amount ${isIncome ? 'income' : 'expense'}`
    amountEl.textContent = `${isIncome ? '+' : '-'}${money(record.amount)}`

    li.append(info, amountEl)

    // 批量模式下隐藏编辑/删除按钮
    if (!batchMode) {
      const actions = document.createElement('div')
      actions.className = 'record-actions'

      const editBtn = document.createElement('button')
      editBtn.type = 'button'
      editBtn.textContent = '编辑'
      editBtn.addEventListener('click', () => onEdit?.(record))

      const delBtn = document.createElement('button')
      delBtn.type = 'button'
      delBtn.textContent = '删除'
      delBtn.className = 'delete'
      delBtn.addEventListener('click', () => onDelete?.(record))

      actions.append(editBtn, delBtn)
      li.appendChild(actions)
    }

    listEl.appendChild(li)
  })
}

/** 顶部结余 / 收入 / 支出 */
export function renderStats(els, stats) {
  els.balance.textContent = money(stats.balance)
  els.balance.classList.toggle('negative', stats.balance < 0)
  els.income.textContent = money(stats.income)
  els.expense.textContent = money(stats.expense)
}

/** 预算进度条 */
export function renderBudget(els, status) {
  const { bar, fill, text } = els
  if (!status) {
    bar.classList.add('hidden')
    return
  }
  bar.classList.remove('hidden')

  const percent = Math.round(status.rawPercent)
  text.textContent = `${money(status.spent)} / ${money(status.budget)}（${percent}%）`
  text.classList.toggle('over', status.over)
  bar.title = status.over
    ? `已超支 ${money(Math.abs(status.remaining))}`
    : `剩余 ${money(status.remaining)}`

  fill.style.width = `${Math.min(status.rawPercent, 100)}%`
  fill.classList.toggle('over', status.over)
}

/**
 * 分类下拉框。
 * allLabel 传字符串时会生成一个"全部 xx"的首项（筛选器用）。
 * 会尽量保留原来的选中项，避免重建下拉框把用户的筛选条件悄悄清掉。
 */
export function renderCategoryOptions(selectEl, categories, { allLabel = null, selected = null } = {}) {
  const wanted = selected ?? selectEl.value
  selectEl.innerHTML = ''
  if (allLabel) selectEl.appendChild(makeOption('all', allLabel))
  categories.forEach(cat => selectEl.appendChild(makeOption(cat, cat)))
  if (wanted && selectHasValue(selectEl, wanted)) selectEl.value = wanted
}

/** 设置页的分类标签；countOf 用来显示每个分类被多少笔记录使用 */
export function renderCategoryManager(listEl, categories, onRemove, countOf = () => 0) {
  listEl.innerHTML = ''

  if (!categories.length) {
    const hint = document.createElement('span')
    hint.className = 'empty-hint'
    hint.textContent = '还没有分类，先添加一个吧'
    listEl.appendChild(hint)
    return
  }

  categories.forEach(cat => {
    const tag = document.createElement('span')
    tag.className = 'category-tag'

    const label = document.createElement('span')
    label.textContent = cat

    const count = countOf(cat)
    if (count > 0) {
      const badge = document.createElement('span')
      badge.className = 'category-count'
      badge.textContent = String(count)
      badge.title = `有 ${count} 笔记录在用这个分类`
      label.append(badge)
    }

    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'category-remove'
    btn.textContent = '×'
    btn.title = `删除分类「${cat}」`
    btn.setAttribute('aria-label', `删除分类 ${cat}`)
    btn.addEventListener('click', () => onRemove(cat))

    tag.append(label, btn)
    listEl.appendChild(tag)
  })
}

/** 年份 / 月份筛选下拉框，重建时保留用户当前的选择 */
export function renderYearMonthOptions(yearEl, monthEl, records) {
  const prevYear = yearEl.value
  const prevMonth = monthEl.value

  const years = new Set()
  records.forEach(r => {
    if (typeof r.date === 'string' && /^\d{4}-/.test(r.date)) years.add(r.date.slice(0, 4))
  })

  yearEl.innerHTML = ''
  yearEl.appendChild(makeOption('all', '全部年份'))
  const sortedYears = [...years].sort().reverse()
  sortedYears.forEach(y => yearEl.appendChild(makeOption(y, `${y} 年`)))
  yearEl.value = selectHasValue(yearEl, prevYear) ? prevYear : 'all'

  monthEl.innerHTML = ''
  monthEl.appendChild(makeOption('all', '全部月份'))
  for (let m = 1; m <= 12; m++) {
    monthEl.appendChild(makeOption(String(m).padStart(2, '0'), `${m} 月`))
  }
  monthEl.value = selectHasValue(monthEl, prevMonth) ? prevMonth : 'all'
}

/** 收支对比结果 */
export function renderCompareResult(el, data, type = 'month') {
  const { period1, period2 } = data
  const unit = type === 'year' ? '年' : '月'

  const diffCell = (title, a, b, higherIsBetter) => {
    const d = round2(a - b)
    let cls = 'diff-flat'
    if (d > 0) cls = higherIsBetter ? 'diff-good' : 'diff-bad'
    else if (d < 0) cls = higherIsBetter ? 'diff-bad' : 'diff-good'
    const sign = d > 0 ? '+' : ''
    return `<div><span>${title}</span><b class="${cls}">${sign}${money(d)}</b></div>`
  }

  const block = (p) => `
    <div class="compare-item">
      <h4>${escapeHtml(p.label)} <small>${p.count} 笔</small></h4>
      <div class="compare-grid">
        <div><span>收入</span><b class="income">${money(p.income)}</b></div>
        <div><span>支出</span><b class="expense">${money(p.expense)}</b></div>
        <div><span>结余</span><b>${money(p.balance)}</b></div>
      </div>
    </div>`

  // 一句话结论：支出是"越少越好"，收入和结余是"越多越好"
  const expenseDiff = round2(period1.expense - period2.expense)
  let summary
  if (expenseDiff > 0) summary = `${period1.label} 比 ${period2.label} 多花了 ${money(expenseDiff)}`
  else if (expenseDiff < 0) summary = `${period1.label} 比 ${period2.label} 少花了 ${money(-expenseDiff)}`
  else summary = `${period1.label} 与 ${period2.label} 支出持平`

  el.innerHTML = `
    ${block(period1)}
    ${block(period2)}
    <div class="compare-item">
      <h4>差值（${escapeHtml(period1.label)} - ${escapeHtml(period2.label)}）</h4>
      <div class="compare-grid">
        ${diffCell('收入', period1.income, period2.income, true)}
        ${diffCell('支出', period1.expense, period2.expense, false)}
        ${diffCell('结余', period1.balance, period2.balance, true)}
      </div>
      <p class="compare-summary">${escapeHtml(summary)}</p>
    </div>
    <p class="hint">对比维度：按${unit}统计，共 ${period1.count + period2.count} 笔记录参与计算</p>
  `
}
