/**
 * AI 模块单元测试（Vitest）
 *
 * 覆盖三个纯逻辑模块：
 *   aggregate.js —— 数据聚合与环比计算（AI 拿到的是摘要，不是原始流水）
 *   schema.js    —— 模型输出的容错解析与结构校验
 *   fallback.js  —— 无 AI 时的规则版报告
 *
 * 不测 client.js（依赖 fetch 和网络），它的输入输出是外部服务，用 mock 意义不大。
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { ExpenseTracker } from '../js/tracker.js'
import {
  previousMonth,
  changeRate,
  buildSummary,
  fingerprint,
  isTooThin
} from '../js/ai/aggregate.js'
import {
  extractJSON,
  normalizeReport,
  parseReport,
  ALLOWED_TYPES
} from '../js/ai/schema.js'
import { buildFallbackReport } from '../js/ai/fallback.js'

// ---------- 内存版 localStorage ----------
let memory = {}
globalThis.localStorage = {
  getItem: (key) => (key in memory ? memory[key] : null),
  setItem: (key, value) => { memory[key] = String(value) },
  removeItem: (key) => { delete memory[key] },
  clear: () => { memory = {} },
  key: (i) => Object.keys(memory)[i] ?? null,
  get length() { return Object.keys(memory).length }
}

beforeEach(() => { memory = {} })

const rec = (date, amount, extra = {}) => ({
  type: 'expense', amount, category: '餐饮', date, note: '', ...extra
})

function makeTracker(records = []) {
  const tracker = new ExpenseTracker()
  records.forEach(r => tracker.add(r))
  return tracker
}

// ============================================================
describe('previousMonth：取上个月', () => {
  it('普通月份', () => {
    expect(previousMonth('2026', 5)).toEqual({ year: '2026', month: 4 })
  })

  it('1 月的上个月是去年 12 月', () => {
    expect(previousMonth('2026', 1)).toEqual({ year: '2025', month: 12 })
  })

  it('非法输入返回 null', () => {
    expect(previousMonth('abc', 3)).toBeNull()
  })
})

// ============================================================
describe('changeRate：环比变化率', () => {
  it('正常计算', () => {
    expect(changeRate(120, 100)).toBeCloseTo(0.2)
  })

  it('下降为负数', () => {
    expect(changeRate(80, 100)).toBeCloseTo(-0.2)
  })

  it('基期为 0 时返回 null —— 避免"从 0 涨到 100"的无限增长', () => {
    expect(changeRate(100, 0)).toBeNull()
  })
})

// ============================================================
describe('buildSummary：把流水压成摘要', () => {
  it('正确汇总收入、支出、结余', () => {
    const tracker = makeTracker([
      rec('2026-05-01', 100),
      rec('2026-05-02', 50),
      rec('2026-05-03', 2000, { type: 'income', category: '工资' })
    ])
    const s = buildSummary(tracker, { year: '2026', month: 5 })

    expect(s.period).toBe('2026-05')
    expect(s.recordCount).toBe(3)
    expect(s.total.expense).toBe(150)
    expect(s.total.income).toBe(2000)
    expect(s.total.balance).toBe(1850)
  })

  it('分类只取前 5 名，按金额降序', () => {
    const tracker = makeTracker([
      rec('2026-05-01', 10, { category: 'A' }),
      rec('2026-05-02', 50, { category: 'B' }),
      rec('2026-05-03', 30, { category: 'C' }),
      rec('2026-05-04', 20, { category: 'D' }),
      rec('2026-05-05', 5,  { category: 'E' }),
      rec('2026-05-06', 1,  { category: 'F' })
    ])
    const s = buildSummary(tracker, { year: '2026', month: 5 })

    expect(s.topCategories).toHaveLength(5)
    expect(s.topCategories[0].name).toBe('B')
    expect(s.topCategories[0].amount).toBe(50)
  })

  it('计算出与上月的环比', () => {
    const tracker = makeTracker([
      rec('2026-05-10', 150),
      rec('2026-04-10', 100)
    ])
    const s = buildSummary(tracker, { year: '2026', month: 5 })

    expect(s.previous.expense).toBe(100)
    expect(s.expenseChangeRate).toBeCloseTo(0.5)   // 150 vs 100
  })

  it('分类级环比：上月没有的分类，changeRate 为 null', () => {
    const tracker = makeTracker([
      rec('2026-05-10', 100, { category: '新增分类' })
    ])
    const s = buildSummary(tracker, { year: '2026', month: 5 })

    expect(s.topCategories[0].changeRate).toBeNull()
  })

  it('没有记录时返回空的汇总，不抛错', () => {
    const tracker = makeTracker([])
    const s = buildSummary(tracker, { year: '2026', month: 5 })

    expect(s.recordCount).toBe(0)
    expect(s.total.expense).toBe(0)
    expect(s.topCategories).toEqual([])
  })

  it('设了预算就带上预算信息', () => {
    const tracker = makeTracker([rec('2026-05-01', 300)])
    tracker.setBudget('2026-05', 1000)
    const s = buildSummary(tracker, { year: '2026', month: 5 })

    expect(s.budget).not.toBeNull()
    expect(s.budget.amount).toBe(1000)
    expect(s.budget.spent).toBe(300)
    expect(s.budget.percent).toBe(30)
    expect(s.budget.over).toBe(false)
  })

  it('超支时 over 为 true', () => {
    const tracker = makeTracker([rec('2026-05-01', 1200)])
    tracker.setBudget('2026-05', 1000)
    const s = buildSummary(tracker, { year: '2026', month: 5 })

    expect(s.budget.over).toBe(true)
    expect(s.budget.percent).toBe(120)
  })
})

// ============================================================
describe('fingerprint：数据指纹', () => {
  // 注意：tracker.add() 内部会 reload() 同步 localStorage，
  // 同一个 it 里连续建两个 tracker 会读到彼此的数据，所以中间要清空。
  it('数据不同则指纹不同', () => {
    const a = buildSummary(makeTracker([rec('2026-05-01', 100)]), { year: '2026', month: 5 })
    localStorage.clear()
    const b = buildSummary(makeTracker([rec('2026-05-01', 200)]), { year: '2026', month: 5 })
    expect(fingerprint(a)).not.toBe(fingerprint(b))
  })

  it('数据相同则指纹稳定', () => {
    const a = buildSummary(makeTracker([rec('2026-05-01', 100)]), { year: '2026', month: 5 })
    localStorage.clear()
    const b = buildSummary(makeTracker([rec('2026-05-01', 100)]), { year: '2026', month: 5 })
    expect(fingerprint(a)).toBe(fingerprint(b))
  })
})

// ============================================================
describe('isTooThin：没有记录就不值得调模型', () => {
  it('0 条记录为 true', () => {
    const s = buildSummary(makeTracker([]), { year: '2026', month: 5 })
    expect(isTooThin(s)).toBe(true)
  })

  it('有记录为 false', () => {
    const s = buildSummary(makeTracker([rec('2026-05-01', 10)]), { year: '2026', month: 5 })
    expect(isTooThin(s)).toBe(false)
  })
})

// ============================================================
describe('extractJSON：从模型返回里抠出 JSON', () => {
  it('本身是合法 JSON', () => {
    const r = extractJSON('{"summary":"ok"}')
    expect(r).toEqual({ summary: 'ok' })
  })

  it('被 ```json 代码块包裹', () => {
    const r = extractJSON('```json\n{"summary":"ok"}\n```')
    expect(r).toEqual({ summary: 'ok' })
  })

  it('被 ``` 包裹（没写 json）', () => {
    const r = extractJSON('```\n{"summary":"ok"}\n```')
    expect(r).toEqual({ summary: 'ok' })
  })

  it('前后带了说明文字', () => {
    const r = extractJSON('好的，分析如下：\n{"summary":"ok"}\n希望对你有帮助')
    expect(r).toEqual({ summary: 'ok' })
  })

  it('完全不是 JSON 时返回 null', () => {
    expect(extractJSON('抱歉，我无法完成')).toBeNull()
  })

  it('空输入返回 null', () => {
    expect(extractJSON('')).toBeNull()
    expect(extractJSON(null)).toBeNull()
  })
})

// ============================================================
describe('normalizeReport：校验并归一化', () => {
  it('正常结构原样通过', () => {
    const r = normalizeReport({
      summary: '本月花了 100 元',
      highlights: [{ type: 'trend', text: '餐饮占比最高' }],
      suggestions: ['少点外卖']
    })
    expect(r.summary).toBe('本月花了 100 元')
    expect(r.highlights).toHaveLength(1)
    expect(r.suggestions).toEqual(['少点外卖'])
  })

  it('缺少 summary 抛错', () => {
    expect(() => normalizeReport({ highlights: [{ type: 'trend', text: 'x' }] }))
      .toThrow(/summary/)
  })

  it('highlights 和 suggestions 都空时抛错', () => {
    expect(() => normalizeReport({ summary: '有总览但没内容' })).toThrow(/为空/)
  })

  it('非法 type 降级为 trend', () => {
    const r = normalizeReport({
      summary: 'ok',
      highlights: [{ type: '乱写的类型', text: '内容' }],
      suggestions: []
    })
    expect(r.highlights[0].type).toBe('trend')
    expect(ALLOWED_TYPES).toContain(r.highlights[0].type)
  })

  it('highlights 是字符串数组时也能兼容', () => {
    const r = normalizeReport({
      summary: 'ok',
      highlights: ['直接给的文字'],
      suggestions: []
    })
    expect(r.highlights[0]).toEqual({ type: 'trend', text: '直接给的文字' })
  })

  it('超过 4 条 highlights 会被截断', () => {
    const r = normalizeReport({
      summary: 'ok',
      highlights: Array.from({ length: 8 }, (_, i) => ({ type: 'trend', text: `第${i}条` })),
      suggestions: []
    })
    expect(r.highlights).toHaveLength(4)
  })

  it('超长文本会被截断', () => {
    const r = normalizeReport({
      summary: 'x'.repeat(200),
      highlights: [{ type: 'trend', text: 'y'.repeat(200) }],
      suggestions: []
    })
    expect(r.summary.length).toBeLessThanOrEqual(81)
    expect(r.highlights[0].text.length).toBeLessThanOrEqual(61)
  })

  it('兼容 overview / advice 这类同义字段', () => {
    const r = normalizeReport({
      overview: '总览内容',
      advice: ['建议一']
    })
    expect(r.summary).toBe('总览内容')
    expect(r.suggestions).toEqual(['建议一'])
  })
})

// ============================================================
describe('parseReport：提取 + 校验一步到位', () => {
  it('合法输入返回对象', () => {
    const r = parseReport('{"summary":"ok","highlights":[{"type":"trend","text":"t"}],"suggestions":[]}')
    expect(r.summary).toBe('ok')
  })

  it('非法输入返回 null（不抛错，方便上层重试）', () => {
    expect(parseReport('不是 JSON')).toBeNull()
    expect(parseReport('{"foo":1}')).toBeNull()
  })
})

// ============================================================
describe('buildFallbackReport：无 AI 时的规则版', () => {
  it('没有记录时给出提示而不是空白', () => {
    const s = buildSummary(makeTracker([]), { year: '2026', month: 5 })
    const r = buildFallbackReport(s)
    expect(r.summary).toContain('还没有')
    expect(r.suggestions.length).toBeGreaterThan(0)
  })

  it('有记录时给出总览和分类亮点', () => {
    const tracker = makeTracker([
      rec('2026-05-01', 300, { category: '餐饮' }),
      rec('2026-05-02', 100, { category: '交通' })
    ])
    const s = buildSummary(tracker, { year: '2026', month: 5 })
    const r = buildFallbackReport(s)

    expect(r.summary).toContain('400')
    expect(r.highlights.length).toBeGreaterThan(0)
    expect(r.highlights.some(h => h.text.includes('餐饮'))).toBe(true)
    expect(r.suggestions.length).toBeGreaterThan(0)
  })

  it('超支时出现 overspend 提示', () => {
    const tracker = makeTracker([rec('2026-05-01', 1500)])
    tracker.setBudget('2026-05', 1000)
    const s = buildSummary(tracker, { year: '2026', month: 5 })
    const r = buildFallbackReport(s)

    expect(r.highlights.some(h => h.type === 'overspend')).toBe(true)
  })

  it('预算充足时出现 positive 提示', () => {
    const tracker = makeTracker([rec('2026-05-01', 100)])
    tracker.setBudget('2026-05', 1000)
    const s = buildSummary(tracker, { year: '2026', month: 5 })
    const r = buildFallbackReport(s)

    expect(r.highlights.some(h => h.type === 'positive')).toBe(true)
  })

  it('标记 _fallback 便于 UI 区分来源', () => {
    const s = buildSummary(makeTracker([rec('2026-05-01', 10)]), { year: '2026', month: 5 })
    expect(buildFallbackReport(s)._fallback).toBe(true)
  })

  it('highlight 数量不超过 4 条、建议不超过 3 条', () => {
    const tracker = makeTracker([
      rec('2026-05-01', 1500, { category: '餐饮' }),
      rec('2026-04-01', 500, { category: '餐饮' })
    ])
    tracker.setBudget('2026-05', 1000)
    const s = buildSummary(tracker, { year: '2026', month: 5 })
    const r = buildFallbackReport(s)

    expect(r.highlights.length).toBeLessThanOrEqual(4)
    expect(r.suggestions.length).toBeLessThanOrEqual(3)
  })
})
