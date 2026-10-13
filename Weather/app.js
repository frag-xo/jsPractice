// ============================================================
// 高德 JS API 服务层
// 用的是「Web端(JS API)」类型的 Key，安全性由高德控制台的「域名白名单」
// 保证：别的域名即使拿到 Key，调用也会被 Referer 校验拒绝。
// Key 与安全密钥配置在 index.html 里（JS API 要求在前端可见，这是设计如此）。
// ============================================================

let amapServices = null   // 加载插件的 Promise，只初始化一次
let autoComplete = null
let geocoder = null
let amapErrorShown = false

/** 等 JS API 就绪并加载 AutoComplete / Geocoder 两个插件 */
function loadAmapServices() {
  if (amapServices) return amapServices
  amapServices = new Promise((resolve, reject) => {
    let waited = 0
    const timer = setInterval(() => {
      if (window.AMap) {
        clearInterval(timer)
        window.AMap.plugin(['AMap.AutoComplete', 'AMap.Geocoder'], () => resolve(window.AMap))
      } else if ((waited += 100) >= 10000) {
        clearInterval(timer)
        reject(new Error('高德 JS API 加载超时'))
      }
    }, 100)
  })
  return amapServices
}

/** 只提示一次，避免用户每敲一个字就刷屏 */
function reportAmapError(err) {
  console.error('[天气] 高德服务调用失败：', err)
  if (amapErrorShown) return
  amapErrorShown = true
  statusEl.textContent = '城市搜索不可用：请检查高德 Key 的「域名白名单」是否包含当前域名'
}

/** AutoComplete 的 location 可能是 LngLat 对象，也可能是 "lng,lat" 字符串 */
function tipLocation(tip) {
  const loc = tip && tip.location
  if (!loc) return null
  if (typeof loc === 'string') {
    const [lng, lat] = loc.split(',').map(Number)
    return Number.isFinite(lng) && Number.isFinite(lat) ? { longitude: lng, latitude: lat } : null
  }
  if (typeof loc.getLng === 'function' && typeof loc.getLat === 'function') {
    return { longitude: loc.getLng(), latitude: loc.getLat() }
  }
  if (Number.isFinite(loc.lng) && Number.isFinite(loc.lat)) {
    return { longitude: loc.lng, latitude: loc.lat }
  }
  return null
}

/** 逆地理编码的字段有时是数组（比如直辖市的 city），统一取成字符串 */
function asText(value) {
  if (Array.isArray(value)) return String(value[0] ?? '').trim()
  return typeof value === 'string' ? value.trim() : ''
}

/** 经纬度 → 可读地名；失败返回 null，由调用方决定怎么降级 */
async function reverseGeocode(loc) {
  const AMap = await loadAmapServices()
  if (!geocoder) geocoder = new AMap.Geocoder()

  return new Promise(resolve => {
    geocoder.getAddress([loc.longitude, loc.latitude], (status, result) => {
      if (status !== 'complete' || !result || !result.regeocode) { resolve(null); return }
      const comp = result.regeocode.addressComponent || {}
      const district = asText(comp.district)
      const city = asText(comp.city)
      const province = asText(comp.province)
      resolve({
        shortName: district || city || province || '当前位置',
        fullName: [district || city, province].filter(Boolean).join(' · ') || '当前位置'
      })
    })
  })
}

// ===== Open-Meteo weathercode → emoji / 描述 / 背景 =====
const weatherCodeMap = {
  0:  { emoji: '☀️', text: '晴',           bg: 'clear'  },
  1:  { emoji: '🌤️', text: '大部晴朗',     bg: 'clear'  },
  2:  { emoji: '⛅',  text: '多云',         bg: 'cloudy' },
  3:  { emoji: '☁️', text: '阴',           bg: 'cloudy' },
  45: { emoji: '🌫️', text: '雾',           bg: 'fog'    },
  48: { emoji: '🌫️', text: '雾凇',         bg: 'fog'    },
  51: { emoji: '🌦️', text: '毛毛雨',       bg: 'rain'   },
  53: { emoji: '🌦️', text: '小雨',         bg: 'rain'   },
  55: { emoji: '🌧️', text: '中雨',         bg: 'rain'   },
  61: { emoji: '🌧️', text: '小雨',         bg: 'rain'   },
  63: { emoji: '🌧️', text: '中雨',         bg: 'rain'   },
  65: { emoji: '🌧️', text: '大雨',         bg: 'rain'   },
  71: { emoji: '🌨️', text: '小雪',         bg: 'snow'   },
  73: { emoji: '❄️', text: '中雪',         bg: 'snow'   },
  75: { emoji: '❄️', text: '大雪',         bg: 'snow'   },
  77: { emoji: '🌨️', text: '雪粒',         bg: 'snow'   },
  80: { emoji: '🌦️', text: '阵雨',         bg: 'rain'   },
  81: { emoji: '🌧️', text: '强阵雨',       bg: 'rain'   },
  82: { emoji: '⛈️', text: '暴雨',         bg: 'storm'  },
  85: { emoji: '🌨️', text: '小阵雪',       bg: 'snow'   },
  86: { emoji: '❄️', text: '大阵雪',       bg: 'snow'   },
  95: { emoji: '⛈️', text: '雷阵雨',       bg: 'storm'  },
  96: { emoji: '⛈️', text: '雷阵雨伴冰雹', bg: 'storm'  },
  99: { emoji: '⛈️', text: '强雷暴',       bg: 'storm'  }
}

function getWeatherInfo(code) {
  return weatherCodeMap[code] || { emoji: '❓', text: '未知', bg: 'cloudy' }
}

// ===== DOM =====
const cityInput  = document.getElementById('cityInput')
const resultsEl  = document.getElementById('results')
const historyEl  = document.getElementById('history')
const statusEl   = document.getElementById('status')
const locateBtn  = document.getElementById('locateBtn')
const weatherEl  = document.getElementById('weather')
const cityNameEl = document.getElementById('cityName')
const emojiEl    = document.getElementById('weatherEmoji')
const tempEl     = document.getElementById('temperature')
const descEl     = document.getElementById('description')
const tempMinEl  = document.getElementById('tempMin')
const tempMaxEl  = document.getElementById('tempMax')
const feelsEl    = document.getElementById('feelsLike')
const humidityEl = document.getElementById('humidity')
const windEl     = document.getElementById('wind')
const forecastEl = document.getElementById('forecast')

// ===== 历史记录 =====
let history = JSON.parse(localStorage.getItem('weatherHistory') || '[]')

function saveHistory() {
  localStorage.setItem('weatherHistory', JSON.stringify(history))
}

function addToHistory(loc) {
  if (!loc || typeof loc.latitude !== 'number' || typeof loc.longitude !== 'number') {
    return
  }

  history = history.filter(item =>
    Math.abs(item.latitude - loc.latitude) > 0.001 ||
    Math.abs(item.longitude - loc.longitude) > 0.001
  )

  history.unshift({
    latitude: loc.latitude,
    longitude: loc.longitude,
    shortName: (loc.shortName || '').trim() || '未知',
    fullName: (loc.fullName || loc.shortName || '').trim() || '未知'
  })

  history = history.slice(0, 8)
  saveHistory()
  renderHistory()
}

function renderHistory() {
  historyEl.innerHTML = ''
  if (!history.length) return

  history.forEach(loc => {
    const tag = document.createElement('span')
    tag.className = 'history-tag'
    tag.textContent = (loc.shortName || '').trim()|| '未知'
    tag.addEventListener('click', () => {
      cityInput.value = ''
      resultsEl.classList.add('hidden')
      fetchWeather(loc)
    })
    historyEl.appendChild(tag)
  })
}

// ===== 防抖 =====
function debounce(fn, delay) {
  let timer = null
  return function (...args) {
    clearTimeout(timer)
    timer = setTimeout(() => fn.apply(this, args), delay)
  }
}

// ===== 搜索城市（高德输入提示 AutoComplete） =====
async function searchCity(query) {
  if (!query) {
    resultsEl.classList.add('hidden')
    return
  }

  try {
    const AMap = await loadAmapServices()
    if (!autoComplete) autoComplete = new AMap.AutoComplete({ city: '全国' })

    autoComplete.search(query, (status, result) => {
      // error 通常意味着 Key 无效 / 域名白名单没放行 / 配额用尽
      // —— 这种情况必须让用户看见，否则就是"输了城市没反应"
      if (status === 'error') {
        reportAmapError(new Error('AutoComplete 返回 error：请检查 Key 与域名白名单'))
        resultsEl.classList.add('hidden')
        return
      }

      if (status !== 'complete' || !result || !result.tips || !result.tips.length) {
        resultsEl.classList.add('hidden')
        return
      }

      // 过滤掉没有经纬度的结果（公交站、商铺之类）
      const tips = result.tips
        .map(tip => ({ tip, loc: tipLocation(tip) }))
        .filter(item => item.loc && item.tip.name)

      if (!tips.length) {
        resultsEl.classList.add('hidden')
        return
      }

      renderResults(tips)
    })
  } catch (err) {
    reportAmapError(err)
    resultsEl.classList.add('hidden')
  }
}

function renderResults(items) {
  resultsEl.innerHTML = ''

  items.forEach(({ tip, loc }) => {
    const li = document.createElement('li')

    // 名称 + 所在区域（用 textContent，接口返回的文本不当 HTML 解析）
    const nameEl = document.createElement('span')
    nameEl.textContent = tip.name
    li.appendChild(nameEl)

    // 只在名称里还没包含区县时才补一个灰字，避免出现"乌鲁木齐市新市区 新市区"
    const district = asText(tip.district)
    if (district && !tip.name.includes(district)) {
      const small = document.createElement('small')
      small.textContent = district
      li.appendChild(small)
    }

    li.addEventListener('click', () => {
      resultsEl.classList.add('hidden')
      cityInput.value = ''

      // 优先用 district 或 name 作为城市名
      const name = (district || tip.name || '未知').trim() || '未知'

      fetchWeather({
        ...loc,
        shortName: name,
        fullName: district || tip.name
      })
    })

    resultsEl.appendChild(li)
  })

  resultsEl.classList.remove('hidden')
}

// ===== 查天气（高德定坐标 + Open-Meteo 查天气） =====
async function fetchWeather(loc) {
  statusEl.textContent = '查询中...'
  weatherEl.classList.add('hidden')

  try {
    // ===== 第 1 步：高德逆地理编码，补全城市名 =====
    if (!loc.fullName || loc.fullName === '当前位置') {
      try {
        const info = await reverseGeocode(loc)
        if (info) {
          loc.shortName = info.shortName
          loc.fullName = info.fullName
        }
      } catch (err) {
        console.error('高德逆地理编码失败:', err)
        // 失败不阻断，继续用经纬度查天气
      }
    }

    // ===== 第 2 步：Open-Meteo 查天气 =====
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${loc.latitude}&longitude=${loc.longitude}` +
      `&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m` +
      `&daily=weather_code,temperature_2m_max,temperature_2m_min` +
      `&timezone=auto&forecast_days=7`

    const res = await fetch(url)
    const data = await res.json()

    if (!data.current || !data.daily) {
      throw new Error('天气数据异常')
    }

    // ===== 第 3 步：渲染 =====
    renderWeather(data, loc)
    addToHistory(loc)
    statusEl.textContent = ''
    weatherEl.classList.remove('hidden')
  } catch (err) {
    console.error(err)
    statusEl.textContent = '查询失败，请检查网络后重试'
  }
}

// ===== 渲染天气（Open-Meteo 数据结构） =====
function renderWeather(data, loc) {
  const current = data.current
  const daily = data.daily
  const info = getWeatherInfo(current.weather_code)

  cityNameEl.textContent = loc.fullName || loc.shortName

  emojiEl.textContent = info.emoji
  tempEl.textContent = `${Math.round(current.temperature_2m)}°`
  descEl.textContent = info.text

  tempMinEl.textContent = `${Math.round(daily.temperature_2m_min[0])}°`
  tempMaxEl.textContent = `${Math.round(daily.temperature_2m_max[0])}°`

  // 体感温度：Open-Meteo 直接给
  feelsEl.textContent = `${Math.round(current.apparent_temperature)}°`
  humidityEl.textContent = `${current.relative_humidity_2m}%`
  windEl.textContent = `${current.wind_speed_10m} km/h`

  setBackground(info.bg)
  renderForecast(daily)
}

function setBackground(bg) {
  const classes = ['bg-clear', 'bg-cloudy', 'bg-fog', 'bg-rain', 'bg-snow', 'bg-storm']
  document.body.classList.remove(...classes)
  document.body.classList.add(`bg-${bg}`)
}

function renderForecast(daily) {
  forecastEl.innerHTML = ''
  const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

  daily.time.forEach((dateStr, i) => {
    const date = new Date(dateStr)
    const dayName = i === 0 ? '今天' : weekdays[date.getDay()]
    const info = getWeatherInfo(daily.weather_code[i])
    const max = Math.round(daily.temperature_2m_max[i])
    const min = Math.round(daily.temperature_2m_min[i])

    const div = document.createElement('div')
    div.className = 'forecast-day'
    div.innerHTML = `
      <div class="day-name">${dayName}</div>
      <div class="day-emoji">${info.emoji}</div>
      <div class="day-temp"><b>${max}°</b><br>${min}°</div>
    `
    forecastEl.appendChild(div)
  })
}

// ===== 定位 =====
async function locateMe() {
  if (!navigator.geolocation) {
    statusEl.textContent = '浏览器不支持定位'
    return
  }

  statusEl.textContent = '定位中...'
  weatherEl.classList.add('hidden')

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const { latitude, longitude } = pos.coords

      cityInput.value = ''
      resultsEl.classList.add('hidden')

      fetchWeather({
        latitude,
        longitude,
        shortName: '当前位置',
        fullName: '当前位置'
      })
    },
    (err) => {
      console.error('定位失败:', err)
      statusEl.textContent = '定位失败，请手动搜索城市'
    },
    { timeout: 10000, maximumAge: 60000 }
  )
}

// ===== 事件绑定 =====
cityInput.addEventListener('input', debounce((e) => {
  searchCity(e.target.value.trim())
}, 500))

cityInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    const first = resultsEl.querySelector('li')
    if (first) first.click()
  }
})

cityInput.addEventListener('focus', () => {
  if (resultsEl.children.length > 0) {
    resultsEl.classList.remove('hidden')
  }
})

document.addEventListener('click', (e) => {
  if (!e.target.closest('.search-box')) {
    resultsEl.classList.add('hidden')
  }
})

locateBtn.addEventListener('click', locateMe)

// ===== 初始化 =====
renderHistory()