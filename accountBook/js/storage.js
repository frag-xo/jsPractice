const PREFIX = 'accountBook_'

/**
 * localStorage 的薄封装。
 *
 * 改动点：
 * 1. 读取时区分「没有这个键」和「存的值是 null/0/空串」，不再把 0 当成"没存过"。
 * 2. 写入失败（比如隐私模式、存储配额满）返回 false，由上层提示用户，
 *    不再是 console.error 之后静默丢数据。
 */
export const storage = {
  get(key, defaultValue = null) {
    try {
      const raw = localStorage.getItem(PREFIX + key)
      if (raw === null) return defaultValue
      const parsed = JSON.parse(raw)
      return parsed === null || parsed === undefined ? defaultValue : parsed
    } catch (e) {
      console.error(`[storage] 读取 ${key} 失败：`, e)
      return defaultValue
    }
  },

  set(key, value) {
    try {
      localStorage.setItem(PREFIX + key, JSON.stringify(value))
      return true
    } catch (e) {
      console.error(`[storage] 写入 ${key} 失败：`, e)
      return false
    }
  },

  remove(key) {
    try {
      localStorage.removeItem(PREFIX + key)
      return true
    } catch (e) {
      console.error(`[storage] 删除 ${key} 失败：`, e)
      return false
    }
  }
}
