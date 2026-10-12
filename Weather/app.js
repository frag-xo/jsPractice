const AMAP_KEY = 'ec366946308685f51ea408719d17b928'

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

// ===== 搜索城市（高德地理编码） =====
async function searchCity(query) {
  if (!query) {
    resultsEl.classList.add('hidden')
    return
  }

  try {
    const res = await fetch(
      `https://restapi.amap.com/v3/geocode/geo?address=${encodeURIComponent(query)}&key=${AMAP_KEY}`
    )
    const data = await res.json()

    if (data.status !== '1' || !data.geocodes || data.geocodes.length === 0) {
      resultsEl.classList.add('hidden')
      return
    }

    renderResults(data.geocodes)
  } catch (err) {
    console.error(err)
  }
}

function renderResults(results) {
  resultsEl.innerHTML = ''

  results.forEach(r => {
    const li = document.createElement('li')
    li.innerHTML = `${r.formatted_address}`

    const [lng, lat] = r.location.split(',')

    li.addEventListener('click', () => {
      resultsEl.classList.add('hidden')
      cityInput.value = ''
      
      let name = r.district || r.city || r.province || '未知' || r.formatted_address
      name = name.trim() || '未知'
      
      fetchWeather({
        latitude: parseFloat(lat),
        longitude: parseFloat(lng),
        shortName: name,
        fullName: r.formatted_address
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
        const regeoRes = await fetch(
          `https://restapi.amap.com/v3/geocode/regeo?location=${loc.longitude},${loc.latitude}&key=${AMAP_KEY}`
        )
        const regeoData = await regeoRes.json()

        if (regeoData.status === '1' && regeoData.regeocode) {
          const addressComp = regeoData.regeocode.addressComponent
          const district = addressComp.district || ''
          const city = addressComp.city || ''
          const province = addressComp.province || ''

          loc.shortName = district || city || province || '当前位置'
          loc.fullName = [district || city, province].filter(Boolean).join(' · ') || '当前位置'
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