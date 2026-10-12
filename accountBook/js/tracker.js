import { storage } from './storage.js'

export const DEFAULT_CATEGORIES = ['餐饮', '交通', '购物', '居住', '娱乐', '工资', '其他']
export const CSV_HEADERS = ['类型', '金额', '分类', '日期', '备注']

/* ============================================================
   本地日期工具
   ------------------------------------------------------------
   原来到处用 new Date().toISOString()，取到的是 UTC 时间。
   在东八区，每天 0:00–8:00 会算成"昨天"，每月 1 号早上还会算成"上个月"。
   下面这些函数一律按本地时间算。
   ============================================================ */

export function formatDate(date = new Date()) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function formatMonth(date = new Date()) {
  return formatDate(date).slice(0, 7)
}

/** 严格校验 YYYY-MM-DD，并确认是真实存在的日期（挡住 2026-02-30 这种） */
export function isValidDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [y, m, d] = value.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d
}

export function isValidMonth(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}$/.test(value)
}

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100
}

function makeId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

/* ============================================================
   CSV 解析
   ------------------------------------------------------------
   原来用 text.split('\n') 硬切行，只要备注里带换行（导出时会被包进引号），
   自己导出的文件再导入回来就会串行、丢数据。
   这里按 RFC 4180 正经解析：支持引号包裹、引号内逗号、引号内换行、"" 转义。
   ============================================================ */
export function parseCSV(text) {
  const src = String(text ?? '').replace(/^\uFEFF/, '') // 去掉 BOM
  const rows = []
  let row = []
  let field = ''
  let inQuotes = false

  for (let i = 0; i < src.length; i++) {
    const ch = src[i]
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') { field += '"'; i++ }
        else inQuotes = false
      } else {
        field += ch
      }
    } else if (ch === '"') {
      inQuotes = true
    } else if (ch === ',') {
      row.push(field); field = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++
      row.push(field); field = ''
      rows.push(row); row = []
    } else {
      field += ch
    }
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row) }

  // 丢掉完全空白的行
  return rows.filter(r => r.some(cell => String(cell).trim() !== ''))
}

function escapeCSV(value) {
  const s = String(value ?? '')
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** 用于导入去重的指纹 */
function recordKey(r) {
  return [r.type, round2(r.amount).toFixed(2), r.category, r.date, r.note].join('\u0001')
}

/**
 * 归一化一条记录。
 * strict = true  ：新写入的记录，日期不合法直接拒绝（返回 null）
 * strict = false ：从 localStorage 读旧数据，尽量抢救，不丢用户数据
 */
function normalizeRecord(raw, strict = true) {
  if (!raw || typeof raw !== 'object') return null
  const amount = Number(raw.amount)
  if (!Number.isFinite(amount)) return null
  const date = String(raw.date ?? '').trim()
  if (!date) return null
  if (strict && !isValidDate(date)) return null

  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : makeId(),
    type: raw.type === 'income' ? 'income' : 'expense',
    amount: round2(amount),
    category: String(raw.category ?? '').trim() || '其他',
    date,
    note: String(raw.note ?? ''),
    createdAt: Number(raw.createdAt) || 0
  }
}

function normalizeCategories(raw) {
  const list = Array.isArray(raw) ? raw : []
  const seen = new Set()
  const result = []
  list.forEach(item => {
    const name = String(item ?? '').trim()
    if (name && !seen.has(name)) { seen.add(name); result.push(name) }
  })
  return result.length ? result : [...DEFAULT_CATEGORIES]
}

/** 兼容旧的单月预算格式 { month, amount } → { '2026-10': 3000 } */
function normalizeBudgets(raw) {
  const out = {}
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out

  if (typeof raw.month === 'string' && 'amount' in raw) {
    const amount = Number(raw.amount)
    if (isValidMonth(raw.month) && Number.isFinite(amount) && amount > 0) out[raw.month] = round2(amount)
    return out
  }

  Object.entries(raw).forEach(([month, value]) => {
    const amount = Number(value)
    if (isValidMonth(month) && Number.isFinite(amount) && amount > 0) out[month] = round2(amount)
  })
  return out
}

function systemPrefersDark() {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-color-scheme: dark)').matches
}

export class ExpenseTracker {
  constructor() {
    /** 上一次 save() 是否成功，UI 用它决定要不要提示用户 */
    this.lastSaveOk = true
    this.reload()
  }

  /** 从 localStorage 重新读一遍（构造函数、跨标签页同步都走这里） */
  reload() {
    this.records = this.loadRecords()
    this.categories = normalizeCategories(storage.get('categories', null))
    this.budgets = normalizeBudgets(storage.get('budget', null))
    const storedTheme = storage.get('theme', null)
    this.theme = storedTheme === 'dark' || storedTheme === 'light'
      ? storedTheme
      : (systemPrefersDark() ? 'dark' : 'light')
    return this
  }

  loadRecords() {
    const raw = storage.get('records', [])
    if (!Array.isArray(raw)) return []
    const list = []
    raw.forEach((item, index) => {
      const record = normalizeRecord(item, false)
      if (!record) return
      // 老数据没有 createdAt，用读取顺序补上，保证同日排序稳定
      if (!record.createdAt) record.createdAt = index + 1
      list.push(record)
    })
    return list
  }

  // ===== 记录 CRUD =====
  add(record) {
    this.reload()
    const normalized = normalizeRecord({ ...record, id: makeId(), createdAt: Date.now() }, true)
    if (!normalized) return null
    this.records.push(normalized)
    this.save()
    return normalized
  }

  update(id, updates) {
    this.reload()
    const idx = this.records.findIndex(r => r.id === id)
    if (idx === -1) return null
    // 注意：不再直接改调用方传进来的对象
    const merged = normalizeRecord({ ...this.records[idx], ...updates, id }, true)
    if (!merged) return null
    merged.createdAt = this.records[idx].createdAt || Date.now()
    this.records[idx] = merged
    this.save()
    return merged
  }

  remove(id) {
    this.reload()
    const idx = this.records.findIndex(r => r.id === id)
    if (idx === -1) return false
    this.records.splice(idx, 1)
    this.save()
    return true
  }

  removeMany(ids) {
    this.reload()
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
      result = (year && year !== 'all')
        ? result.filter(r => r.date.startsWith(`${year}-${m}`))
        : result.filter(r => r.date.slice(5, 7) === m)
    }

    if (type && type !== 'all') {
      result = result.filter(r => r.type === type)
    }

    if (category && category !== 'all') {
      result = result.filter(r => r.category === category)
    }

    if (keyword) {
      const kw = String(keyword).toLowerCase()
      result = result.filter(r =>
        (r.note || '').toLowerCase().includes(kw) ||
        (r.category || '').toLowerCase().includes(kw)
      )
    }

    return result
  }

  sort(records, by = 'date', order = 'desc') {
    const dir = order === 'asc' ? 1 : -1
    // 同一毫秒内连续添加的记录 createdAt 会相同，
    // 这里用"在 records 数组里的插入顺序"兜底，保证排序结果稳定可预期。
    const orderIndex = new Map(this.records.map((r, i) => [r.id, i]))
    return [...records].sort((a, b) => {
      let diff
      if (by === 'amount') {
        diff = a.amount - b.amount
      } else {
        diff = a.date < b.date ? -1 : a.date > b.date ? 1 : 0
        if (diff === 0) {
          diff = (a.createdAt || 0) - (b.createdAt || 0)
          if (diff === 0) {
            diff = (orderIndex.get(a.id) ?? 0) - (orderIndex.get(b.id) ?? 0)
          }
        }
      }
      return diff === 0 ? 0 : diff * dir
    })
  }

  // ===== 统计 =====
  getStats(records = this.records) {
    let income = 0
    let expense = 0
    records.forEach(r => {
      const amount = Number(r.amount) || 0 // 挡住历史数据里 amount 是字符串的情况
      if (r.type === 'income') income += amount
      else expense += amount
    })
    return {
      income: round2(income),
      expense: round2(expense),
      balance: round2(income - expense)
    }
  }

  getCategoryStats(records = this.records) {
    const map = {}
    records
      .filter(r => r.type === 'expense')
      .forEach(r => {
        map[r.category] = (map[r.category] || 0) + (Number(r.amount) || 0)
      })
    return Object.entries(map)
      .map(([name, value]) => ({ name, value: round2(value) }))
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
    const match = type === 'year'
      ? (r, period) => r.date.startsWith(period + '-')
      : (r, period) => r.date.startsWith(period)

    const r1 = this.records.filter(r => match(r, period1))
    const r2 = this.records.filter(r => match(r, period2))

    return {
      period1: { label: period1, count: r1.length, ...this.getStats(r1) },
      period2: { label: period2, count: r2.length, ...this.getStats(r2) }
    }
  }

  // ===== 预算（改成按月份存，不再是只能存一个月）=====
  setBudget(month, amount) {
    this.reload()
    if (!isValidMonth(month)) return false
    const value = Number(amount)
    if (!Number.isFinite(value) || value <= 0) {
      delete this.budgets[month] // 传 0 / 空 → 取消这个月的预算
    } else {
      this.budgets[month] = round2(value)
    }
    return this.save()
  }

  getBudget(month) {
    return Number(this.budgets[month]) || 0
  }

  getBudgetStatus(month = formatMonth()) {
    const budget = this.getBudget(month)
    if (!budget) return null

    const spent = this.records
      .filter(r => r.type === 'expense' && r.date.startsWith(month))
      .reduce((sum, r) => sum + (Number(r.amount) || 0), 0)

    const rawPercent = (spent / budget) * 100
    return {
      month,
      budget: round2(budget),
      spent: round2(spent),
      remaining: round2(budget - spent),
      rawPercent,                                   // 真实百分比（可以超过 100）
      percent: Math.min(rawPercent, 100),           // 进度条宽度，最多 100%
      over: spent > budget
    }
  }

  // ===== 分类管理 =====
  addCategory(name) {
    this.reload()
    const trimmed = String(name ?? '').trim()
    if (!trimmed || trimmed.length > 12) return false
    if (this.categories.includes(trimmed)) return false
    this.categories.push(trimmed)
    return this.save()
  }

  removeCategory(name) {
    this.reload()
    const idx = this.categories.indexOf(name)
    if (idx === -1) return false
    this.categories.splice(idx, 1)
    return this.save()
  }

  /** 这个分类下面还有多少笔记录（删除前提示用） */
  countByCategory(name) {
    return this.records.filter(r => r.category === name).length
  }

  // ===== 导入导出 =====
  exportCSV() {
    const rows = [
      CSV_HEADERS,
      ...this.records.map(r => [
        r.type === 'income' ? '收入' : '支出',
        Number(r.amount).toFixed(2),
        r.category,
        r.date,
        r.note || ''
      ])
    ]
    // RFC 4180 用 \r\n 换行，Excel 打开更稳
    return rows.map(row => row.map(escapeCSV).join(',')).join('\r\n')
  }

  /**
   * 导入 CSV。返回 { added, skipped, duplicates, categoriesAdded }
   * - 支持带表头 / 不带表头；带表头时按列名匹配，列顺序可以不一样
   * - 无效行（日期不合法、金额不是正数）计入 skipped
   * - 和已有记录重复的计入 duplicates，不会重复导入
   * - 新出现的分类会自动登记到分类列表
   */
  importCSV(text) {
    this.reload()
    const rows = parseCSV(text)
    if (!rows.length) return { added: 0, skipped: 0, duplicates: 0, categoriesAdded: 0 }

    let index = { type: 0, amount: 1, category: 2, date: 3, note: 4 }
    let start = 0

    const header = rows[0].map(cell => String(cell).trim())
    if (header.some(h => CSV_HEADERS.includes(h))) {
      const found = {}
      header.forEach((h, i) => { if (CSV_HEADERS.includes(h)) found[h] = i })
      index = {
        type: found['类型'] ?? 0,
        amount: found['金额'] ?? 1,
        category: found['分类'] ?? 2,
        date: found['日期'] ?? 3,
        note: found['备注'] ?? 4
      }
      start = 1
    }

    const existing = new Set(this.records.map(recordKey))
    const categoriesBefore = this.categories.length
    let added = 0
    let skipped = 0
    let duplicates = 0

    for (let i = start; i < rows.length; i++) {
      const cells = rows[i]
      const typeText = String(cells[index.type] ?? '').trim()
      const amount = Number(String(cells[index.amount] ?? '').trim())
      const category = String(cells[index.category] ?? '').trim() || '其他'
      const date = String(cells[index.date] ?? '').trim()
      const note = String(cells[index.note] ?? '').trim()

      if (!isValidDate(date) || !Number.isFinite(amount) || amount <= 0) { skipped++; continue }

      const record = {
        id: makeId(),
        type: /^(收入|income)$/i.test(typeText) ? 'income' : 'expense',
        amount: round2(amount),
        category,
        date,
        note,
        createdAt: Date.now() + i
      }

      const key = recordKey(record)
      if (existing.has(key)) { duplicates++; continue }
      existing.add(key)

      this.records.push(record)
      added++
      if (!this.categories.includes(category)) this.categories.push(category)
    }

    this.save()
    return { added, skipped, duplicates, categoriesAdded: this.categories.length - categoriesBefore }
  }

  // ===== 主题 =====
  setTheme(theme) {
    this.theme = theme === 'dark' ? 'dark' : 'light'
    return this.save()
  }

  // ===== 保存 =====
  save() {
    const results = [
      storage.set('records', this.records),
      storage.set('categories', this.categories),
      storage.set('budget', this.budgets),
      storage.set('theme', this.theme)
    ]
    this.lastSaveOk = results.every(Boolean)
    return this.lastSaveOk
  }
}
