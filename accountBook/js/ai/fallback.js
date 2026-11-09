/**
 * 规则版降级报告
 *
 * 作用：在不配置 API Key、接口超时、模型输出不合法时，仍然给出一份可用的分析。
 *
 * 为什么必须有（面试点）：
 *   AI 是"外部依赖"，会超时、会限流、会返回垃圾。
 *   如果主流程强依赖它，用户就会遇到白屏。降级到本地规则，功能永远可用。
 */

const money = n => (Math.round((Number(n) || 0) * 100) / 100).toFixed(2)

function percent(rate) {
  if (rate === null || rate === undefined) return null
  return Math.round(rate * 100)
}

/**
 * @param {ReturnType<import('./aggregate.js').buildSummary>} summary
 * @param {{reason?: string}} options
 */
export function buildFallbackReport(summary, options = {}) {
  const { total, topCategories, budget, previous, expenseChangeRate, recordCount } = summary
  const highlights = []
  const suggestions = []

  // ---- 总览 ----
  let head = `本期共支出 ${money(total.expense)} 元`
  const change = percent(expenseChangeRate)
  if (change !== null) {
    if (change > 0) head += `，比上月多 ${change}%`
    else if (change < 0) head += `，比上月少 ${Math.abs(change)}%`
    else head += '，与上月持平'
  }
  if (recordCount > 0 && recordCount < 3) head += '（记录较少，仅供参考）'
  const summaryText = recordCount === 0 ? '本期还没有记账记录。' : head + '。'

  if (recordCount === 0) {
    return {
      summary: summaryText,
      highlights: [],
      suggestions: ['先记几笔账，再来生成分析吧。']
    }
  }

  // ---- 亮点：最高支出分类 ----
  const top = topCategories[0]
  if (top) {
    const share = total.expense > 0 ? Math.round((top.amount / total.expense) * 100) : 0
    highlights.push({
      type: 'trend',
      text: `${top.name}是本期最大支出，共 ${money(top.amount)} 元，占总支出 ${share}%`
    })

    const ch = percent(top.changeRate)
    if (ch !== null && Math.abs(ch) >= 20) {
      highlights.push({
        type: ch > 0 ? 'warning' : 'positive',
        text: `${top.name}比上月${ch > 0 ? '多出' : '减少'} ${Math.abs(ch)}%`
      })
    }
  }

  // ---- 亮点：预算 ----
  if (budget) {
    if (budget.over) {
      highlights.push({
        type: 'overspend',
        text: `已超出预算 ${money(Math.abs(budget.remaining))} 元，使用率 ${budget.percent}%`
      })
      suggestions.push(`下月把「${top ? top.name : '主要支出'}」的预算再压低一些。`)
    } else if (budget.percent >= 80) {
      highlights.push({
        type: 'warning',
        text: `预算已使用 ${budget.percent}%，剩余 ${money(budget.remaining)} 元`
      })
    } else {
      highlights.push({
        type: 'positive',
        text: `预算使用 ${budget.percent}%，控制在计划内`
      })
    }
  } else {
    highlights.push({
      type: 'warning',
      text: '本期还没有设置预算，无法判断是否超支'
    })
    suggestions.push('在「设置」里加一个月度预算，超支会更早被发现。')
  }

  // ---- 亮点：整体环比 ----
  if (change !== null && Math.abs(change) >= 30 && previous.expense > 0) {
    highlights.push({
      type: change > 0 ? 'warning' : 'positive',
      text: `总支出比上月${change > 0 ? '上升' : '下降'} ${Math.abs(change)}%，${
        change > 0 ? '幅度偏大，留意是否有一次性大额支出' : '保持得不错'
      }`
    })
  }

  // ---- 建议 ----
  if (top && top.amount > 0) {
    suggestions.push(`优先看「${top.name}」这一项，它占了支出的 ${Math.round((top.amount / total.expense) * 100)}%。`)
  }
  if (total.balance < 0) {
    suggestions.push('本期支出超过收入，建议先控制非必要开销。')
  }
  if (suggestions.length === 0) {
    suggestions.push('支出结构比较均衡，继续保持记账习惯。')
  }

  return {
    summary: summaryText,
    highlights: highlights.slice(0, 4),
    suggestions: suggestions.slice(0, 3),
    /* 供 UI 判断是否降级展示 */
    _fallback: true,
    _reason: options.reason || 'unknown'
  }
}
