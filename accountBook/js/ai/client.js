/**
 * 大模型调用层（双模式）
 *
 *   proxy 模式：请求发到自己的代理（边缘函数 / 小后端），Key 存在服务端，浏览器不接触
 *   direct 模式：用户自己填 Key，浏览器直连智谱开放平台（仅适合本地演示）
 *
 * ⚠️ 关于 direct 模式的限制（面试会问）：
 *   1. Key 存在 localStorage，理论上可被 XSS 读取
 *   2. 部分厂商的开放平台未对浏览器开放 CORS，直连可能失败
 *   所以生产环境应该只走 proxy。这里保留 direct 只是为了本地能立刻跑起来。
 */

import {
  ZHIPU_ENDPOINT,
  DEFAULT_MODEL,
  getApiKey,
  getProxyUrl,
  getMode,
  addUsage
} from './config.js'

export class AIError extends Error {
  constructor(code, message, detail) {
    super(message)
    this.name = 'AIError'
    this.code = code
    this.detail = detail
  }
}

const DEFAULT_TIMEOUT = 30000

function buildRequestBody(messages, model) {
  return {
    model: model || DEFAULT_MODEL,
    messages,
    temperature: 0.7,
    max_tokens: 800,
    stream: false
  }
}

/**
 * 统一的对话调用入口。
 * @param {Array<{role: string, content: string}>} messages
 * @param {{timeout?: number, model?: string}} options
 * @returns {Promise<{content: string, usage: {promptTokens: number, completionTokens: number}}>}
 */
export async function chat(messages, options = {}) {
  const mode = getMode()
  if (mode === 'none') {
    throw new AIError('NO_KEY', '尚未配置 AI，请到「设置」里填写 API Key 或代理地址')
  }

  const timeout = options.timeout || DEFAULT_TIMEOUT
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeout)

  const isProxy = mode === 'proxy'
  const url = isProxy ? getProxyUrl() : ZHIPU_ENDPOINT
  const headers = { 'Content-Type': 'application/json' }
  if (!isProxy) {
    headers.Authorization = `Bearer ${getApiKey()}`
  }

  let response
  try {
    response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(buildRequestBody(messages, options.model)),
      signal: controller.signal
    })
  } catch (error) {
    clearTimeout(timer)
    if (error.name === 'AbortError') {
      throw new AIError('TIMEOUT', `请求超时（${timeout / 1000} 秒），可能是网络较慢`)
    }
    // 浏览器直连第三方 API 时，CORS 失败会走到这里（TypeError: Failed to fetch）
    if (isProxy) {
      throw new AIError('NETWORK', '代理服务连不上，请检查地址是否正确、服务是否已启动')
    }
    throw new AIError(
      'CORS_OR_NETWORK',
      '直连失败：可能是网络问题，或该平台未开放浏览器跨域访问。建议改用代理模式'
    )
  }

  clearTimeout(timer)

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    if (response.status === 401 || response.status === 403) {
      throw new AIError('AUTH', 'API Key 无效或已过期', text)
    }
    if (response.status === 429) {
      throw new AIError('RATE_LIMIT', '请求太频繁或额度已用完，请稍后再试', text)
    }
    if (response.status >= 500) {
      throw new AIError('SERVER', `模型服务异常（${response.status}）`, text)
    }
    throw new AIError('HTTP', `请求失败（${response.status}）`, text)
  }

  let data
  try {
    data = await response.json()
  } catch {
    throw new AIError('PARSE', '接口返回的不是合法 JSON')
  }

  const content = data?.choices?.[0]?.message?.content
  if (typeof content !== 'string' || !content.trim()) {
    throw new AIError('EMPTY', '模型没有返回内容')
  }

  const usage = {
    promptTokens: Number(data?.usage?.prompt_tokens) || 0,
    completionTokens: Number(data?.usage?.completion_tokens) || 0
  }
  if (usage.promptTokens || usage.completionTokens) {
    addUsage(usage)
  }

  return { content, usage }
}

/** 把错误翻译成给用户看的一句话 */
export function describeError(error) {
  if (!(error instanceof AIError)) return '生成失败，请稍后重试'
  const map = {
    NO_KEY: '还没有配置 AI，已用本地规则生成分析',
    TIMEOUT: '模型响应超时，已用本地规则生成分析',
    AUTH: 'API Key 无效，请到设置里检查',
    RATE_LIMIT: '调用太频繁或额度用完了，已用本地规则生成分析',
    SERVER: '模型服务暂时不可用，已用本地规则生成分析',
    NETWORK: '连不上代理服务，已用本地规则生成分析',
    CORS_OR_NETWORK: '直连被浏览器拦截，建议改用代理模式（已用本地规则生成分析）',
    PARSE: '模型返回格式异常，已用本地规则生成分析',
    EMPTY: '模型返回为空，已用本地规则生成分析',
    HTTP: '请求失败，已用本地规则生成分析'
  }
  return map[error.code] || error.message || '生成失败，已用本地规则生成分析'
}
