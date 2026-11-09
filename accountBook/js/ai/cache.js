/**
 * 报告缓存
 *
 * 为什么要缓存（面试点）：
 *   同一份数据反复点"生成"，没必要重复调模型 —— 既慢又花钱。
 *   用数据指纹做 key，只要流水有变化，指纹就变，缓存自动失效，不会给出过期结论。
 */

import { KEYS } from './config.js'

const TTL = 24 * 60 * 60 * 1000 // 24 小时
const MAX_ENTRIES = 12

function cacheKey(fingerprint) {
  return KEYS.cachePrefix + fingerprint
}

function listCacheKeys() {
  const keys = []
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key && key.startsWith(KEYS.cachePrefix)) keys.push(key)
    }
  } catch {
    /* ignore */
  }
  return keys
}

/** 缓存条目太多时，删掉最早写入的几条，避免撑爆 localStorage */
function prune() {
  const keys = listCacheKeys()
  if (keys.length <= MAX_ENTRIES - 1) return
  const entries = keys
    .map(key => {
      try {
        const raw = JSON.parse(localStorage.getItem(key))
        return { key, ts: Number(raw?.ts) || 0 }
      } catch {
        return { key, ts: 0 }
      }
    })
    .sort((a, b) => a.ts - b.ts)

  const needRemove = entries.length - (MAX_ENTRIES - 1)
  entries.slice(0, needRemove).forEach(e => {
    try {
      localStorage.removeItem(e.key)
    } catch {
      /* ignore */
    }
  })
}

/**
 * 读取缓存。
 * @returns {{report: object, ts: number} | null}
 */
export function readCache(fingerprint, { allowExpired = false } = {}) {
  try {
    const raw = localStorage.getItem(cacheKey(fingerprint))
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed?.report) return null
    if (!allowExpired && Date.now() - Number(parsed.ts || 0) > TTL) return null
    return { report: parsed.report, ts: Number(parsed.ts) || 0 }
  } catch {
    return null
  }
}

/** 写入缓存 */
export function writeCache(fingerprint, report) {
  try {
    prune()
    localStorage.setItem(
      cacheKey(fingerprint),
      JSON.stringify({ report, ts: Date.now() })
    )
    return true
  } catch {
    return false
  }
}

/** 清空所有 AI 报告缓存 */
export function clearAllCache() {
  let count = 0
  listCacheKeys().forEach(key => {
    try {
      localStorage.removeItem(key)
      count++
    } catch {
      /* ignore */
    }
  })
  return count
}

/** 当前缓存条目数（给设置页展示） */
export function cacheCount() {
  return listCacheKeys().length
}
