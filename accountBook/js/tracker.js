import { storage } from './storage.js'

const DEFAULT_CATEGORIES = ['餐饮', '交通', '购物', '居住', '娱乐', '工资', '其他']

export class ExpenseTracker {
  constructor() {
    this.records = storage.get('records', [])
    this.categories = storage.get('categories', [...DEFAULT_CATEGORIES])
    this.budget = storage.get('budget', { month: '', amount: 0 })
    this.theme = storage.get('theme', 'light')
  }

  // ===== 记录 CRUD =====
  add(record) {
    const newRecord = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
      type: record.type,
      amount: Number(record.amount),
      category: record.category,
      date: record.date,
      note: record.note || ''
    }
    this.records.push(newRecord)
    this.save()
    return newRecord
  }

  update(id, updates) {
    const idx = this.records.findIndex(r => r.id === id)
    if (idx === -1) return null
    if (updates.amount !== undefined) updates.amount = Number(updates.amount)
    this.records[idx] = { ...this.records[idx], ...updates }
    this.save()
    return this.records[idx]
  }

  remove(id) {
    const idx = this.records.findIndex(r => r.id === id)
    if (idx === -1) return false
    this.records.splice(idx, 1)
    this.save()
    return true
  }

  removeMany(ids) {
    const idSet = new Set(ids)
    const before = this.records.length
    this.records = this.records.filter(r => !idSet.has(r.id))
    this.save()
    return before - this.records.length
}

  getById(id) {
    return this.records.find(r => r.id === id) || null
  }

  // ===== 筛选 =====
  filter({ year, month, type, category, keyword } = {}) {
  let result = [...this.records]

  if (year && year !== 'all') {
    result = result.filter(r => r.date.startsWith(year + '-'))
  }

  if (month && month !== 'all') {
    const m = String(month).padStart(2, '0')
    if (year && year !== 'all') {
      result = result.filter(r => r.date.startsWith(`${year}-${m}`))
    } else {
      // 没选年份，跨年份筛选该月
      result = result.filter(r => r.date.slice(5, 7) === m)
    }
  }

  if (type && type !== 'all') {
    result = result.filter(r => r.type === type)
  }

  if (category && category !== 'all') {
    result = result.filter(r => r.category === category)
  }

  if (keyword) {
    const kw = keyword.toLowerCase()
    result = result.filter(r => (r.note || '').toLowerCase().includes(kw))
  }

  return result
}

  // ===== 统计 =====
  getStats(records = this.records) {
    let income = 0, expense = 0
    records.forEach(r => {
      if (r.type === 'income') income += r.amount
      else expense += r.amount
    })
    return {
      income: Number(income.toFixed(2)),
      expense: Number(expense.toFixed(2)),
      balance: Number((income - expense).toFixed(2))
    }
  }

  getCategoryStats(records = this.records) {
    const map = {}
    records
      .filter(r => r.type === 'expense')
      .forEach(r => {
        map[r.category] = (map[r.category] || 0) + r.amount
      })
    return Object.entries(map)
      .map(([name, value]) => ({ name, value: Number(value.toFixed(2)) }))
      .sort((a, b) => b.value - a.value)
  }

  getTrendData(records = this.records, months = 6) {
    const now = new Date()
    const result = []
    for (let i = months - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      const monthRecords = records.filter(r => r.date.startsWith(key))
      result.push({ month: key, ...this.getStats(monthRecords) })
    }
    return result
  }

  // ===== 对比 =====
  getComparison(period1, period2, type = 'month') {
    let r1, r2
    if (type === 'year') {
      r1 = this.records.filter(r => r.date.startsWith(period1 + '-'))
      r2 = this.records.filter(r => r.date.startsWith(period2 + '-'))
    } else {
      r1 = this.records.filter(r => r.date.startsWith(period1))
      r2 = this.records.filter(r => r.date.startsWith(period2))
    }
    return {
      period1: { label: period1, ...this.getStats(r1) },
      period2: { label: period2, ...this.getStats(r2) }
    }
  }

  // ===== 预算 =====
  setBudget(month, amount) {
    this.budget = { month, amount: Number(amount) }
    this.save()
  }

  getBudgetStatus(month) {
    if (!this.budget.month || !this.budget.amount) return null
    if (this.budget.month !== month) return null
    const records = this.records.filter(r => r.date.startsWith(month) && r.type === 'expense')
    const spent = records.reduce((s, r) => s + r.amount, 0)
    return {
      budget: this.budget.amount,
      spent: Number(spent.toFixed(2)),
      remaining: Number((this.budget.amount - spent).toFixed(2)),
      percent: Math.min(100, (spent / this.budget.amount) * 100)
    }
  }

  // ===== 分类管理 =====
  addCategory(name) {
    const trimmed = name.trim()
    if (!trimmed || this.categories.includes(trimmed)) return false
    this.categories.push(trimmed)
    this.save()
    return true
  }

  removeCategory(name) {
    const idx = this.categories.indexOf(name)
    if (idx === -1) return false
    this.categories.splice(idx, 1)
    this.save()
    return true
  }

  // ===== 导入导出 =====
  exportCSV() {
    const headers = ['类型', '金额', '分类', '日期', '备注']
    const rows = this.records.map(r => [
      r.type === 'income' ? '收入' : '支出',
      r.amount,
      r.category,
      r.date,
      r.note || ''
    ])
    const escape = (v) => {
      const s = String(v)
      if (s.includes(',') || s.includes('"') || s.includes('\n')) {
        return '"' + s.replace(/"/g, '""') + '"'
      }
      return s
    }
    return [headers, ...rows].map(row => row.map(escape).join(',')).join('\n')
  }

  importCSV(text) {
    const lines = text.trim().split('\n')
    if (lines.length < 2) return { added: 0, skipped: 0 }

    let added = 0, skipped = 0
    for (let i = 1; i < lines.length; i++) {
      const parts = this.parseCSVLine(lines[i])
      if (parts.length < 4) { skipped++; continue }
      const [typeStr, amountStr, category, date, ...noteParts] = parts
      const type = typeStr.trim() === '收入' ? 'income' : 'expense'
      const amount = parseFloat(amountStr)
      if (!amount || !date) { skipped++; continue }

      this.records.push({
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
        type,
        amount,
        category: category.trim(),
        date: date.trim(),
        note: noteParts.join(',').trim()
      })
      added++
    }
    this.save()
    return { added, skipped }
  }

  parseCSVLine(line) {
    const result = []
    let current = ''
    let inQuotes = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (inQuotes) {
        if (ch === '"' && line[i + 1] === '"') { current += '"'; i++ }
        else if (ch === '"') inQuotes = false
        else current += ch
      } else {
        if (ch === '"') inQuotes = true
        else if (ch === ',') { result.push(current); current = '' }
        else current += ch
      }
    }
    result.push(current)
    return result
  }

  // ===== 主题 =====
  setTheme(theme) {
    this.theme = theme
    this.save()
  }

  // ===== 保存 =====
  save() {
    storage.set('records', this.records)
    storage.set('categories', this.categories)
    storage.set('budget', this.budget)
    storage.set('theme', this.theme)
  }
}