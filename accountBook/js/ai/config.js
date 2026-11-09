/**
 * AI 模块配置
 *
 * 双模式：
 *   1. 代理模式（proxy）：请求发到自己的后端/边缘函数，Key 不落在前端 —— 生产推荐
 *   2. 直连模式（direct）：用户自己填 Key，存 localStorage —— 本地演示用
 *   3. 未配置（none）：走规则版降级，功能仍可用
 *
 * 优先级：代理 > 直连 > 降级
 */

// 智谱 GLM-4-Flash（免费额度，中文表现好）
export const ZHIPU_ENDPOINT = 'https://open.bigmodel.cn/api/paas/v4/chat/completions'
export const DEFAULT_MODEL = 'glm-4-flash'

export const KEYS = {
  apiKey: 'accountBook_aiKey',
  proxy: 'accountBook_aiProxy',
  cachePrefix: 'accountBook_aiCache_',
  usage: 'accountBook_aiUsage'
}

function safeGet(key) {
  try {
    return localStorage.getItem(key) || ''
  } catch {
    return ''
  }
}

function safeSet(key, value) {
  try {
    if (value) localStorage.setItem(key, value)
    else localStorage.removeItem(key)
    return true
  } catch {
    return false
  }
}

export function getApiKey() {
  return safeGet(KEYS.apiKey)
}

export function setApiKey(key) {
  return safeSet(KEYS.apiKey, String(key || '').trim())
}

export function getProxyUrl() {
  return safeGet(KEYS.proxy)
}

export function setProxyUrl(url) {
  return safeSet(KEYS.proxy, String(url || '').trim())
}

/** 当前生效的模式：'proxy' | 'direct' | 'none' */
export function getMode() {
  if (getProxyUrl()) return 'proxy'
  if (getApiKey()) return 'direct'
  return 'none'
}

/** 读取累计用量（token / 调用次数），用于成本可见 */
export function getUsage() {
  try {
    const raw = localStorage.getItem(KEYS.usage)
    if (!raw) return { calls: 0, promptTokens: 0, completionTokens: 0 }
    const parsed = JSON.parse(raw)
    return {
      calls: Number(parsed.calls) || 0,
      promptTokens: Number(parsed.promptTokens) || 0,
      completionTokens: Number(parsed.completionTokens) || 0
    }
  } catch {
    return { calls: 0, promptTokens: 0, completionTokens: 0 }
  }
}

/** 累加一次调用的用量 */
export function addUsage({ promptTokens = 0, completionTokens = 0 } = {}) {
  const usage = getUsage()
  usage.calls += 1
  usage.promptTokens += Number(promptTokens) || 0
  usage.completionTokens += Number(completionTokens) || 0
  try {
    localStorage.setItem(KEYS.usage, JSON.stringify(usage))
  } catch {
    /* 配额满就放弃统计，不影响主流程 */
  }
  return usage
}

export function resetUsage() {
  try {
    localStorage.removeItem(KEYS.usage)
  } catch {
    /* ignore */
  }
}
