/**
 * Prompt 模板
 *
 * 设计要点（面试点）：
 * 1. 把"算数"交给本地，模型只负责"组织语言 + 给建议"，降低出错概率
 * 2. 强制 JSON 输出，前端才能稳定渲染成卡片
 * 3. 明确禁止编造：数据里没有的不要写
 * 4. 给输出加长度约束，避免模型长篇大论（省 token）
 */

const PERCENT = r => (r === null ? null : Math.round(r * 100))

/** 把摘要对象翻译成模型容易理解的人话 */
export function describeSummary(summary) {
  const lines = []
  lines.push(`统计周期：${summary.period}，共 ${summary.recordCount} 条记录`)
  lines.push(`收入：${summary.total.income} 元；支出：${summary.total.expense} 元；结余：${summary.total.balance} 元`)

  const change = PERCENT(summary.expenseChangeRate)
  if (change !== null) {
    const dir = change > 0 ? '增加' : change < 0 ? '减少' : '持平'
    lines.push(`支出比上月${dir} ${Math.abs(change)}%（上月支出 ${summary.previous.expense} 元）`)
  } else if (summary.previous.expense === 0) {
    lines.push('上月没有支出记录，无法计算环比')
  }

  if (summary.topCategories.length) {
    const parts = summary.topCategories.map((c, i) => {
      const ch = PERCENT(c.changeRate)
      const trend = ch === null ? '无上月对比' : ch > 0 ? `比上月多 ${ch}%` : ch < 0 ? `比上月少 ${Math.abs(ch)}%` : '与上月持平'
      return `${i + 1}. ${c.name} ${c.amount} 元（${trend}）`
    })
    lines.push(`支出前 ${summary.topCategories.length} 的分类：`)
    lines.push(...parts)
  } else {
    lines.push('本月没有支出记录')
  }

  if (summary.budget) {
    const b = summary.budget
    lines.push(`预算：${b.amount} 元，已花 ${b.spent} 元，使用 ${b.percent}%${b.over ? '（已超支）' : `，剩余 ${b.remaining} 元`}`)
  } else {
    lines.push('本月未设置预算')
  }

  return lines.join('\n')
}

export const SYSTEM_PROMPT = `你是一个个人记账助手，负责根据用户提供的支出统计数据，写一份简短、具体、可执行的分析。

规则：
1. 只能依据提供的数据说话，绝对不要编造数据里没有的信息（比如没有的消费场景、没有的分类）。
2. 不要重复罗列所有数字，要给出"结论"和"建议"。
3. 语气像朋友提醒，不要说教；不要用"亲"、"宝子"这类词。
4. 金额保留两位小数，百分比取整。
5. 必须返回且只返回一个 JSON 对象，不要加任何解释文字、不要用 markdown 代码块包裹。

JSON 结构：
{
  "summary": "一句话总览，包含总支出和环比变化，不超过 50 字",
  "highlights": [
    { "type": "overspend", "text": "指出超支或异常的项，不超过 40 字" },
    { "type": "trend", "text": "指出变化趋势，不超过 40 字" }
  ],
  "suggestions": ["具体可执行的建议，不超过 30 字"]
}

约束：
- highlights 2 到 4 条，type 只能是 overspend（超支/异常）、trend（趋势变化）、positive（值得肯定的）、warning（需要注意）四者之一。
- suggestions 1 到 3 条，要具体，不要写"合理消费"这种空话。
- 如果数据里记录很少（少于 3 条），summary 里要说明"数据较少，仅供参考"，并且 highlights 最多 2 条。`

export function buildUserPrompt(summary) {
  return `以下是本月记账数据，请据此生成分析报告：\n\n${describeSummary(summary)}\n\n请按系统提示中的 JSON 结构返回。`
}
