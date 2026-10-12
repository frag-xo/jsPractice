// ===== 数据 =====
let records = JSON.parse(localStorage.getItem('records') || '[]')

// ===== DOM =====
const typeEl     = document.getElementById('type')
const amountEl   = document.getElementById('amount')
const categoryEl = document.getElementById('category')
const dateEl     = document.getElementById('date')
const noteEl     = document.getElementById('note')
const addBtn     = document.getElementById('addBtn')
const listEl     = document.getElementById('list')
const balanceEl  = document.getElementById('balance')
const incomeEl   = document.getElementById('totalIncome')
const expenseEl  = document.getElementById('totalExpense')

// ===== 保存 =====
function save() {
  localStorage.setItem('records', JSON.stringify(records))
}

// ===== 渲染 =====
function render() {
  save()
  listEl.innerHTML = ''

  // 按日期倒序
  const sorted = [...records].sort((a, b) => b.date.localeCompare(a.date))

  sorted.forEach(record => {
    const li = document.createElement('li')
    li.className = 'record-item'

    const isIncome = record.type === 'income'
    const sign = isIncome ? '+' : '-'

    li.innerHTML = `
      <div class="record-info">
        <div class="record-top">
          <span class="record-category">${record.category}</span>
          <span class="record-date">${record.date}</span>
        </div>
        <div class="record-note">${record.note || '无备注'}</div>
      </div>
      <span class="record-amount ${record.type}">${sign}¥${record.amount.toFixed(2)}</span>
    `

    const delBtn = document.createElement('button')
    delBtn.textContent = '删除'
    delBtn.addEventListener('click', () => {
      const index = records.indexOf(record)
      records.splice(index, 1)
      render()
    })

    li.appendChild(delBtn)
    listEl.appendChild(li)
  })

  updateStats()
}

// ===== 统计 =====
function updateStats() {
  const income = records
    .filter(r => r.type === 'income')
    .reduce((sum, r) => sum + r.amount, 0)

  const expense = records
    .filter(r => r.type === 'expense')
    .reduce((sum, r) => sum + r.amount, 0)

  const balance = income - expense

  incomeEl.textContent = `¥${income.toFixed(2)}`
  expenseEl.textContent = `¥${expense.toFixed(2)}`
  balanceEl.textContent = `¥${balance.toFixed(2)}`
  balanceEl.style.color = balance >= 0 ? '#1f2329' : '#ef4444'
}

// ===== 添加 =====
addBtn.addEventListener('click', () => {
  const type = typeEl.value
  const amount = parseFloat(amountEl.value)
  const category = categoryEl.value
  const date = dateEl.value
  const note = noteEl.value.trim()

  // 校验
  if (!amount || amount <= 0) {
    alert('请输入正确的金额')
    return
  }
  if (!date) {
    alert('请选择日期')
    return
  }

  records.push({
    id: Date.now(),
    type,
    amount,
    category,
    date,
    note
  })

  // 清空表单
  amountEl.value = ''
  noteEl.value = ''

  render()
})

// ===== 初始化 =====
// 日期默认今天
dateEl.value = new Date().toISOString().slice(0, 10)

render()