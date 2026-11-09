/**
 * 数据聚合层
 *
 * 职责：把原始的成百上千条流水，压缩成一份"给模型看的摘要"。
 *
 * 为什么要有这一层（面试点）：
 *   500 条流水直接序列化约 8000 token；聚合后约 200~300 token。
 *   成本降到 1/25 左右，而且模型不需要自己做加减法，数字不会算错。
 *
 * 本文件是纯函数，不依赖网络和 DOM，可以直接单测。
 */

function pad2(n) {
  return String(n).padStart(2, '0')
}

/** 取上一个月的 { year, month } */
export function previousMonth(year, month) {
  const y = Number(year)
  const m = Number(month)
  if (!Number.isFinite(y) || !Number.isFinite(m)) return null
  if (m <= 1) return { year: String(y - 1), month: 12 }
  return { year: String(y), month: m - 1 }
}

/**
 * 环比变化率。
 * 基期为 0 或不存在时返回 null —— 不能算出"从 0 涨到 100 是 10000%"这种无意义的值。
 */
export function changeRate(current, previous) {
  const cur = Number(current) || 0
  const prev = Number(previous) || 0
  if (prev === 0) return null
  return (cur - prev) / prev
}

/**
 * 构建给模型的摘要对象。
 *
 * @param {import('../tracker.js').ExpenseTracker} tracker
 * @param {{year?: string|number, month?: string|number}} period
 */
export function buildSummary(tracker, period = {}) {
  const now = new Date()
  const year = String(period.year || now.getFullYear())
  const month = Number(period.month || now.getMonth() + 1)
  const periodKey = `${year}-${pad2(month)}`

  const records = tracker.filter({ year, month })
  const stats = tracker.getStats(records)
  const categories = tracker.getCategoryStats(records).slice(0, 5)

  // 上月数据，用于环比
  const prev = previousMonth(year, month)
  const prevRecords = prev ? tracker.filter(prev) : []
  const prevStats = tracker.getStats(prevRecords)
  const prevCategories = tracker.getCategoryStats(prevRecords)

  const topCategories = categories.map(item => {
    const before = prevCategories.find(c => c.name === item.name)
    return {
      name: item.name,
      amount: item.value,
      prevAmount: before ? before.value : 0,
      changeRate: before ? changeRate(item.value, before.value) : null
    }
  })

  const budgetStatus = tracker.getBudgetStatus(periodKey)

  return {
    period: periodKey,
    recordCount: records.length,
    total: {
      income: stats.income,
      expense: stats.expense,
      balance: stats.balance
    },
    previous: {
      expense: prevStats.expense,
      income: prevStats.income
    },
    expenseChangeRate: changeRate(stats.expense, prevStats.expense),
    topCategories,
    budget: budgetStatus
      ? {
          amount: budgetStatus.budget,
          spent: budgetStatus.spent,
          remaining: budgetStatus.remaining,
          percent: Math.round(budgetStatus.rawPercent),
          over: budgetStatus.over
        }
      : null
  }
}

/**
 * 数据指纹：报告缓存的 key。
 * 只要流水有任何增减，指纹就会变，缓存自动失效。
 */
export function fingerprint(summary) {
  const cats = summary.topCategories
    .map(c => `${c.name}:${c.amount}`)
    .join('|')
  return [
    summary.period,
    summary.recordCount,
    summary.total.expense,
    summary.total.income,
    cats,
    summary.budget ? summary.budget.spent : 'nobudget'
  ].join('_')
}

/** 摘要是否"太单薄"，不值得调 AI（没有记录时直接走规则版） */
export function isTooThin(summary) {
  return summary.recordCount === 0
}
