/* ============================================================
   Service Worker
   ------------------------------------------------------------
   之前的版本有这几个问题，直接导致"刷新一次一个样"：
   1. 缓存名一直叫 account-book-v1，从没升过版 → 永远命中旧缓存。
   2. 全部请求 cache-first，且从不把新响应写回缓存 → 页面被永久冻结在
      安装那一刻的版本，新功能（比如"批量管理"按钮）永远不出现。
   3. install 里 addAll 没有 catch，任何一个文件 404，整个 SW 安装失败。
   所以你会遇到：普通刷新拿到旧 HTML（没有批量按钮），
   强制刷新绕过 SW 拿到新 JS，新旧文件混用 → 各种诡异现象。

   现在：HTML/JS/CSS 走"网络优先"（保证拿到最新版本，断网回退缓存），
   图片/字体等静态资源走"缓存优先"。缓存名升级到 v2，activate 时清掉旧缓存。
   ============================================================ */

const CACHE = 'account-book-v2'

const PRECACHE = [
  './',
  './index.html',
  './style.css',
  './manifest.json',
  './icon.svg',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png',
  './vendor/echarts.min.js',
  './js/app.js',
  './js/tracker.js',
  './js/storage.js',
  './js/render.js',
  './js/charts.js'
]

// 这些文件要求"先联网拿最新的"，拿不到再回退缓存
const NETWORK_FIRST = /\.(?:html|css|js|json)$/i

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE)
    // 用 allSettled 的思路逐个缓存：少一个文件不影响整个 SW 安装成功
    await Promise.all(PRECACHE.map(async (url) => {
      try {
        await cache.add(new Request(url, { cache: 'reload' }))
      } catch (error) {
        console.warn('[sw] 预缓存失败（已跳过）：', url, error)
      }
    }))
    await self.skipWaiting()
  })())
})

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys()
    await Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)))
    await self.clients.claim()
  })())
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  // 只处理同源请求，跨域的交给浏览器自己走网络
  if (url.origin !== self.location.origin) return

  const isNavigation = request.mode === 'navigate'

  if (isNavigation || NETWORK_FIRST.test(url.pathname)) {
    event.respondWith((async () => {
      try {
        const response = await fetch(request)
        if (response && response.ok) {
          const cache = await caches.open(CACHE)
          cache.put(request, response.clone())
        }
        return response
      } catch (error) {
        const cached = await caches.match(request)
        if (cached) return cached
        if (isNavigation) {
          const shell = await caches.match('./index.html')
          if (shell) return shell
        }
        throw error
      }
    })())
    return
  }

  event.respondWith((async () => {
    const cached = await caches.match(request)
    if (cached) return cached
    const response = await fetch(request)
    if (response && response.ok) {
      const cache = await caches.open(CACHE)
      cache.put(request, response.clone())
    }
    return response
  })())
})
