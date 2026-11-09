/**
 * 模型输出的解析与校验
 *
 * 为什么需要：模型不一定听话 —— 可能加解释文字、可能用 ```json 包裹、
 * 可能字段拼错、可能 type 给个不在约定范围内的值。
 * 这里做三件事：容错提取 JSON → 结构校验 → 归一化，保证 UI 拿到的一定是合法结构。
 */

export const ALLOWED_TYPES = ['overspend', 'trend', 'positive', 'warning']

const MAX = {
  summary: 80,
  highlight: 60,
  suggestion: 50,
  highlights: 4,
  suggestions: 3
}

function clip(text, max) {
  const str = String(text || '').trim()
  return str.length > max ? str.slice(0, max) + '…' : str
}

/**
 * 从模型返回的文本里尽力提取出一个 JSON 对象。
 * 返回 null 表示完全提不出来。
 */
export function extractJSON(raw) {
  if (!raw || typeof raw !== 'string') return null

  const text = raw.trim()

  // ① 本身就是合法 JSON
  try {
    const direct = JSON.parse(text)
    if (direct && typeof direct === 'object') return direct
  } catch {
    /* 继续尝试其他方式 */
  }

  // ② 被 ```json ... ``` 或 ``` ... ``` 包裹
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fence) {
    try {
      const parsed = JSON.parse(fence[1].trim())
      if (parsed && typeof parsed === 'object') return parsed
    } catch {
      /* 继续 */
    }
  }

  // ③ 前后有额外文字，截取第一个 { 到最后一个 }
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start !== -1 && end > start) {
    try {
      const parsed = JSON.parse(text.slice(start, end + 1))
      if (parsed && typeof parsed === 'object') return parsed
    } catch {
      /* 放弃 */
    }
  }

  return null
}

/**
 * 校验并归一化报告结构。
 * 校验失败抛错，由上层触发"重试"或"降级"。
 *
 * @returns {{summary: string, highlights: Array<{type: string, text: string}>, suggestions: string[]}}
 */
export function normalizeReport(input) {
  if (!input || typeof input !== 'object') {
    throw new Error('报告不是对象')
  }

  const summaryRaw = input.summary ?? input.overview ?? input.text
  if (typeof summaryRaw !== 'string' || !summaryRaw.trim()) {
    throw new Error('缺少 summary 字段')
  }
  const summary = clip(summaryRaw, MAX.summary)

  const rawHighlights = Array.isArray(input.highlights) ? input.highlights : []
  const highlights = rawHighlights
    .map(item => {
      if (!item) return null
      // 兼容模型把对象写成字符串的情况
      if (typeof item === 'string') {
        return { type: 'trend', text: clip(item, MAX.highlight) }
      }
      const text = item.text ?? item.content ?? item.desc
      if (typeof text !== 'string' || !text.trim()) return null
      const type = ALLOWED_TYPES.includes(item.type) ? item.type : 'trend'
      return { type, text: clip(text, MAX.highlight) }
    })
    .filter(Boolean)
    .slice(0, MAX.highlights)

  const rawSuggestions = Array.isArray(input.suggestions)
    ? input.suggestions
    : Array.isArray(input.advice)
      ? input.advice
      : []
  const suggestions = rawSuggestions
    .map(s => (typeof s === 'string' ? clip(s, MAX.suggestion) : null))
    .filter(Boolean)
    .slice(0, MAX.suggestions)

  if (highlights.length === 0 && suggestions.length === 0) {
    throw new Error('报告内容为空')
  }

  return { summary, highlights, suggestions }
}

/** 一次性完成"提取 + 校验"，失败返回 null（不抛错，方便重试逻辑复用） */
export function parseReport(raw) {
  const json = extractJSON(raw)
  if (!json) return null
  try {
    return normalizeReport(json)
  } catch {
    return null
  }
}
