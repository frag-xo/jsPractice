/**
 * AI 模块统一入口
 *
 * 对外只暴露 generateReport()。内部编排：
 *   聚合数据 → 查缓存 → 调模型(失败重试一次) → 校验 → 写缓存
 *                                            ↘ 任何一步失败 → 规则版降级
 */

import { buildSummary, fingerprint, isTooThin } from './aggregate.js'
import { SYSTEM_PROMPT, buildUserPrompt, describeSummary } from './prompt.js'
import { chat, describeError, AIError } from './client.js'
import { parseReport } from './schema.js'
import { buildFallbackReport } from './fallback.js'
import { readCache, writeCache, clearAllCache, cacheCount } from './cache.js'
import { getMode, getUsage, getApiKey, setApiKey, getProxyUrl, setProxyUrl, resetUsage } from './config.js'

export {
  buildSummary,
  fingerprint,
  describeSummary,
  buildFallbackReport,
  getMode,
  getUsage,
  getApiKey,
  setApiKey,
  getProxyUrl,
  setProxyUrl,
  resetUsage,
  clearAllCache,
  cacheCount
}

/**
 * 生成一份财务分析报告。
 *
 * @param {import('../tracker.js').ExpenseTracker} tracker
 * @param {{year?: string|number, month?: string|number, force?: boolean}} options
 *        force=true 时忽略缓存（用于"重新生成"）
 * @returns {Promise<{
 *   report: {summary: string, highlights: Array, suggestions: string[]},
 *   source: 'ai' | 'fallback',
 *   reason: string|null,
 *   fromCache: boolean,
 *   data: object
 * }>}
 */
export async function generateReport(tracker, options = {}) {
  const summary = buildSummary(tracker, options)

  // ① 没有记录，不值得调模型
  if (isTooThin(summary)) {
    return {
      report: buildFallbackReport(summary, { reason: 'empty' }),
      source: 'fallback',
      reason: 'empty',
      fromCache: false,
      data: summary
    }
  }

  const fp = fingerprint(summary)

  // ② 命中缓存
  if (!options.force) {
    const cached = readCache(fp)
    if (cached) {
      return {
        report: cached.report,
        source: 'ai',
        reason: null,
        fromCache: true,
        data: summary
      }
    }
  }

  // ③ 没配置 AI，直接降级
  if (getMode() === 'none') {
    return {
      report: buildFallbackReport(summary, { reason: 'no-key' }),
      source: 'fallback',
      reason: 'no-key',
      fromCache: false,
      data: summary
    }
  }

  // ④ 调模型，解析失败重试一次
  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: buildUserPrompt(summary) }
  ]

  let lastError = null
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const retryHint =
        attempt === 0
          ? ''
          : '\n\n注意：你上一次的输出无法被解析为 JSON。请只返回一个合法的 JSON 对象，不要加任何文字或代码块标记。'
      const { content } = await chat(
        retryHint
          ? [...messages, { role: 'user', content: retryHint }]
          : messages
      )

      const report = parseReport(content)
      if (report) {
        writeCache(fp, report)
        return {
          report,
          source: 'ai',
          reason: null,
          fromCache: false,
          data: summary
        }
      }
      lastError = new AIError('PARSE', '模型返回的内容不是合法报告结构')
    } catch (error) {
      lastError = error
      // 认证/额度问题重试也没用，直接降级
      if (error instanceof AIError && ['AUTH', 'RATE_LIMIT', 'NO_KEY'].includes(error.code)) {
        break
      }
    }
  }

  return {
    report: buildFallbackReport(summary, { reason: lastError?.code || 'error' }),
    source: 'fallback',
    reason: lastError?.code || 'error',
    message: lastError ? describeError(lastError) : null,
    fromCache: false,
    data: summary
  }
}
