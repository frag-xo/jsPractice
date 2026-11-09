/**
 * 本地开发代理（Node 原生，无需任何依赖）
 *
 * 为什么需要它：
 *   智谱开放平台的接口没有对浏览器开放 CORS，前端直连会被浏览器拦截。
 *   走代理后，浏览器请求的是本机服务，Key 只存在这个进程的环境变量里，
 *   既不进前端代码，也不进 localStorage。
 *
 * 用法：
 *   export ZHIPU_API_KEY=你的key
 *   node proxy/server.mjs
 *
 *   然后在记账本「AI 分析 → AI 设置」的"代理地址"里填：
 *   http://127.0.0.1:8787/api/chat
 *
 * 生产环境建议把这份逻辑搬到 Vercel Edge Function / Cloudflare Workers，
 * 把 Key 配在平台的环境变量里，见 README。
 */

import { createServer } from 'node:http'

const PORT = process.env.PORT || 8787
const API_KEY = process.env.ZHIPU_API_KEY
const UPSTREAM = 'https://open.bigmodel.cn/api/paas/v4/chat/completions'

if (!API_KEY) {
  console.error('❌ 缺少环境变量 ZHIPU_API_KEY')
  console.error('   请先执行：export ZHIPU_API_KEY=你的key')
  process.exit(1)
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400'
}

function json(res, status, payload) {
  res.writeHead(status, { ...CORS_HEADERS, 'Content-Type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(payload))
}

async function readBody(req) {
  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  return Buffer.concat(chunks).toString('utf8')
}

const server = createServer(async (req, res) => {
  // 预检
  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS_HEADERS)
    res.end()
    return
  }

  if (req.url !== '/api/chat') {
    json(res, 404, { error: 'Not Found，请把请求发到 /api/chat' })
    return
  }

  if (req.method !== 'POST') {
    json(res, 405, { error: 'Method Not Allowed' })
    return
  }

  const started = Date.now()
  try {
    const raw = await readBody(req)
    if (!raw) {
      json(res, 400, { error: '请求体为空' })
      return
    }

    // 只透传必要字段，避免客户端塞入奇怪的参数
    const incoming = JSON.parse(raw)
    const payload = {
      model: incoming.model || 'glm-4-flash',
      messages: incoming.messages,
      temperature: typeof incoming.temperature === 'number' ? incoming.temperature : 0.7,
      max_tokens: typeof incoming.max_tokens === 'number' ? incoming.max_tokens : 800,
      stream: false
    }

    if (!Array.isArray(payload.messages) || payload.messages.length === 0) {
      json(res, 400, { error: 'messages 不能为空' })
      return
    }

    const upstream = await fetch(UPSTREAM, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${API_KEY}`
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(30000)
    })

    const text = await upstream.text()
    console.log(
      `[proxy] ${upstream.status} ${Date.now() - started}ms ` +
      `messages=${payload.messages.length} tokens_in≈${Math.round(raw.length / 4)}`
    )

    res.writeHead(upstream.status, {
      ...CORS_HEADERS,
      'Content-Type': 'application/json; charset=utf-8'
    })
    res.end(text)
  } catch (error) {
    console.error('[proxy] 转发失败：', error.message)
    const isTimeout = error.name === 'AbortError' || error.name === 'TimeoutError'
    json(res, isTimeout ? 504 : 502, {
      error: isTimeout ? '上游超时' : '转发失败',
      detail: error.message
    })
  }
})

server.listen(PORT, () => {
  console.log(`✅ 代理已启动：http://127.0.0.1:${PORT}/api/chat`)
  console.log('   把这个地址填到记账本「AI 设置 → 代理地址」里')
})
