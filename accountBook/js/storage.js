const PREFIX = 'accountBook_'

export const storage = {
  get(key, defaultValue = null) {
    try {
      const raw = localStorage.getItem(PREFIX + key)
      return raw ? JSON.parse(raw) : defaultValue
    } catch (e) {
      console.error('storage.get 失败:', e)
      return defaultValue
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(PREFIX + key, JSON.stringify(value))
      return true
    } catch (e) {
      console.error('storage.set 失败:', e)
      return false
    }
  },
  remove(key) {
    localStorage.removeItem(PREFIX + key)
  }
}