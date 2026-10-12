export function renderList(listEl, records, onEdit, onDelete, batchMode = false, selectedIds = new Set(), onToggleSelect = null) {
  listEl.innerHTML = ''

  records.forEach(record => {
    const li = document.createElement('li')
    const isIncome = record.type === 'income'
    const sign = isIncome ? '+' : '-'

    // 批量模式才显示复选框
    if (batchMode) {
      const checkbox = document.createElement('input')
      checkbox.type = 'checkbox'
      checkbox.className = 'record-checkbox'
      checkbox.checked = selectedIds.has(record.id)
      if (onToggleSelect) {
        checkbox.addEventListener('change', () => onToggleSelect(record.id))
      }
      li.appendChild(checkbox)
    }

    // 信息区
    const info = document.createElement('div')
    info.className = 'record-info'
    info.innerHTML = `
      <div class="record-top">
        <span class="record-category">${record.category}</span>
        <span class="record-date">${record.date}</span>
      </div>
      <div class="record-note">${record.note || '无备注'}</div>
    `

    // 金额
    const amountEl = document.createElement('span')
    amountEl.className = `record-amount ${record.type}`
    amountEl.textContent = `${sign}¥${record.amount.toFixed(2)}`

    li.appendChild(info)
    li.appendChild(amountEl)

    // 批量模式下隐藏编辑/删除按钮
    if (!batchMode) {
      const actions = document.createElement('div')
      actions.className = 'record-actions'

      const editBtn = document.createElement('button')
      editBtn.textContent = '编辑'
      editBtn.addEventListener('click', () => onEdit(record))
      actions.appendChild(editBtn)

      const delBtn = document.createElement('button')
      delBtn.textContent = '删除'
      delBtn.className = 'delete'
      delBtn.addEventListener('click', () => onDelete(record))
      actions.appendChild(delBtn)

      li.appendChild(actions)
    }

    listEl.appendChild(li)
  })
}

export function renderStats(statsEls, stats) {
  statsEls.balance.textContent = `¥${stats.balance.toFixed(2)}`
  statsEls.balance.style.color = stats.balance >= 0 ? 'var(--text)' : 'var(--expense)'
  statsEls.income.textContent = `¥${stats.income.toFixed(2)}`
  statsEls.expense.textContent = `¥${stats.expense.toFixed(2)}`
}

export function renderBudget(budgetBarEl, budgetFillEl, budgetTextEl, status) {
  if (!status) {
    budgetBarEl.classList.add('hidden')
    return
  }
  budgetBarEl.classList.remove('hidden')
  budgetTextEl.textContent = `¥${status.spent.toFixed(2)} / ¥${status.budget.toFixed(2)}`
  budgetFillEl.style.width = `${status.percent}%`
  budgetFillEl.classList.toggle('over', status.percent >= 100)
}

export function renderCategoryOptions(selectEl, categories, keepFirst = true) {
  const first = keepFirst ? selectEl.options[0]?.outerHTML : ''
  selectEl.innerHTML = first
  categories.forEach(cat => {
    const opt = document.createElement('option')
    opt.value = cat
    opt.textContent = cat
    selectEl.appendChild(opt)
  })
}

export function renderCategoryManager(listEl, categories, onRemove) {
  listEl.innerHTML = ''
  categories.forEach(cat => {
    const tag = document.createElement('span')
    tag.className = 'category-tag'
    tag.innerHTML = `${cat}`
    const btn = document.createElement('button')
    btn.textContent = '×'
    btn.addEventListener('click', () => onRemove(cat))
    tag.appendChild(btn)
    listEl.appendChild(tag)
  })
}

export function renderYearMonthOptions(yearEl, monthEl, records) {
  const years = new Set()
  records.forEach(r => {
    if (r.date) years.add(r.date.slice(0, 4))
  })
  const sortedYears = [...years].sort().reverse()

  yearEl.innerHTML = '<option value="all">全部年份</option>'
  sortedYears.forEach(y => {
    const opt = document.createElement('option')
    opt.value = y
    opt.textContent = y + ' 年'
    yearEl.appendChild(opt)
  })

  monthEl.innerHTML = '<option value="all">全部月份</option>'
  for (let m = 1; m <= 12; m++) {
    const opt = document.createElement('option')
    opt.value = String(m).padStart(2, '0')
    opt.textContent = m + ' 月'
    monthEl.appendChild(opt)
  }
}

export function renderCompareResult(el, data, type) {
  const { period1, period2 } = data
  const fmt = (n) => `¥${n.toFixed(2)}`
  const diff = (a, b) => {
    const d = a - b
    const color = d > 0 ? 'var(--income)' : d < 0 ? 'var(--expense)' : 'var(--text-light)'
    const sign = d > 0 ? '+' : ''
    return `<b style="color:${color}">${sign}${fmt(d)}</b>`
  }

  el.innerHTML = `
    <div class="compare-item">
      <h4>${period1.label}</h4>
      <div class="compare-grid">
        <div><span>收入</span><b class="income">${fmt(period1.income)}</b></div>
        <div><span>支出</span><b class="expense">${fmt(period1.expense)}</b></div>
        <div><span>结余</span><b>${fmt(period1.balance)}</b></div>
      </div>
    </div>
    <div class="compare-item">
      <h4>${period2.label}</h4>
      <div class="compare-grid">
        <div><span>收入</span><b class="income">${fmt(period2.income)}</b></div>
        <div><span>支出</span><b class="expense">${fmt(period2.expense)}</b></div>
        <div><span>结余</span><b>${fmt(period2.balance)}</b></div>
      </div>
    </div>
    <div class="compare-item">
      <h4>差值（${period1.label} - ${period2.label}）</h4>
      <div class="compare-grid">
        <div><span>收入</span>${diff(period1.income, period2.income)}</div>
        <div><span>支出</span>${diff(period1.expense, period2.expense)}</div>
        <div><span>结余</span>${diff(period1.balance, period2.balance)}</div>
      </div>
    </div>
  `
}