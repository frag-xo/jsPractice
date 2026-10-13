/**
 * 记账本数据层单元测试（Vitest）
 *
 * 运行：npm test
 *
 * 为什么要在测试里 stub localStorage：
 *   js/storage.js 直接操作浏览器的 localStorage，而 Node 里没有这个全局对象。
 *   用几十行代码顶替它即可，不需要装 jsdom，跑起来也快得多。
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { ExpenseTracker, parseCSV, formatDate, formatMonth, isValidDate } from '../js/tracker.js'

// ---------- 内存版 localStorage ----------
let memory = {}
globalThis.localStorage = {
  getItem: (key) => (key in memory ? memory[key] : null),
  setItem: (key, value) => { memory[key] = String(value) },
  removeItem: (key) => { delete memory[key] },
  clear: () => { memory = {} }
}

/** 每个用例开始前清空存储，保证互不干扰 */
beforeEach(() => { memory = {} })

/** 造一个装了若干记录的 tracker */
function makeTracker(records = []) {
  const tracker = new ExpenseTracker()
  records.forEach(r => tracker.add(r))
  return tracker
}

/** 记录工厂 */
const rec = (date, amount, extra = {}) => ({
  type: 'expense', amount, category: '餐饮', date, note: '', ...extra
})

// ============================================================
describe('parseCSV：按 RFC 4180 解析', () => {
  it('引号内的逗号不会被切开', () => {
    expect(parseCSV('a,b,c\n1,"含,逗号",3')[1][1]).toBe('含,逗号')
  })

  it('引号内的换行保留在同一格里', () => {
    expect(parseCSV('a,b\n1,"第一行\n第二行"')[1][1]).toBe('第一行\n第二行')
  })

  it('转义的双引号被还原', () => {
    expect(parseCSV('"说""引号""吧",x')[0][0]).toBe('说"引号"吧')
  })

  it('去掉 BOM、兼容 CRLF、忽略末尾空行', () => {
    const rows = parseCSV('\uFEFF类型,金额\r\n支出,10\r\n')
    expect(rows).toHaveLength(2)
    expect(rows[0][0]).toBe('类型')
  })
})

// ============================================================
describe('日期工具：必须用本地时间', () => {
  it('formatDate 在凌晨不会退回前一天', () => {
    // 本地时间 2026-11-01 00:30。
    // 旧实现 new Date().toISOString().slice(0,10) 在东八区会得到 2026-10-31
    expect(formatDate(new Date(2026, 10, 1, 0, 30))).toBe('2026-11-01')
  })

  it('formatMonth 在月初凌晨不会算成上个月', () => {
    expect(formatMonth(new Date(2026, 10, 1, 0, 30))).toBe('2026-11')
  })

  it('isValidDate 挡住不存在的日期和错误格式', () => {
    expect(isValidDate('2026-02-30')).toBe(false)
    expect(isValidDate('2026-13-01')).toBe(false)
    expect(isValidDate('2026/10/12')).toBe(false)
    expect(isValidDate('2026-02-28')).toBe(true)
  })
})

// ============================================================
describe('新增 / 修改：非法数据一律拒绝', () => {
  it('金额不是数字时不写入', () => {
    const t = new ExpenseTracker()
    expect(t.add(rec('2026-05-01', 'abc'))).toBeNull()
    expect(t.records).toHaveLength(0)
  })

  it('日期不合法时不写入', () => {
    expect(new ExpenseTracker().add(rec('2026-13-40', 10))).toBeNull()
  })

  it('字符串金额会被归一化成数字', () => {
    const created = new ExpenseTracker().add(rec('2026-05-01', '12.5'))
    expect(created.amount).toBe(12.5)
    expect(typeof created.amount).toBe('number')
  })

  it('金额按两位小数归一化', () => {
    expect(new ExpenseTracker().add(rec('2026-05-01', 10.567)).amount).toBe(10.57)
  })

  it('读旧数据时字符串金额也会被修正，不会让 toFixed 崩掉', () => {
    localStorage.setItem('accountBook_records', JSON.stringify([
      { id: 'x', type: 'expense', amount: '10.5', category: '餐饮', date: '2026-05-03' }
    ]))
    const t = new ExpenseTracker()
    expect(t.records[0].amount).toBe(10.5)
    expect(typeof t.getStats().expense).toBe('number')
  })
})

// ============================================================
describe('筛选', () => {
  const build = () => makeTracker([
    rec('2026-05-03', 10),
    rec('2025-05-20', 20, { category: '交通' }),
    rec('2026-07-01', 99, { type: 'income', category: '工资' })
  ])

  it('不选年份只选月份，能跨年份命中', () => {
    expect(build().filter({ month: '05', year: 'all' })).toHaveLength(2)
  })

  it('年份 + 月份同时筛选', () => {
    expect(build().filter({ month: '05', year: '2026' })).toHaveLength(1)
  })

  it('未补零的月份也能用', () => {
    expect(build().filter({ month: '5', year: 'all' })).toHaveLength(2)
  })

  it('关键词能同时搜备注和分类', () => {
    expect(build().filter({ keyword: '工资' })).toHaveLength(1)
  })

  it('类型 + 分类组合筛选', () => {
    expect(build().filter({ type: 'expense', category: '交通' })).toHaveLength(1)
  })
})

// ============================================================
describe('排序', () => {
  it('同一天的记录按添加顺序排列，结果稳定', () => {
    const t = makeTracker([
      rec('2026-05-03', 10, { note: '先' }),
      rec('2026-05-03', 20, { note: '后' })
    ])
    expect(t.sort(t.records, 'date', 'desc').map(r => r.note)).toEqual(['后', '先'])
    expect(t.sort(t.records, 'date', 'asc').map(r => r.note)).toEqual(['先', '后'])
  })

  it('按金额排序', () => {
    const t = makeTracker([rec('2026-05-03', 30), rec('2026-05-04', 10), rec('2026-05-05', 20)])
    expect(t.sort(t.records, 'amount', 'asc').map(r => r.amount)).toEqual([10, 20, 30])
  })

  it('排序不会改动原数组', () => {
    const t = makeTracker([rec('2026-05-03', 30), rec('2026-05-04', 10)])
    const before = t.records.map(r => r.id).join()
    t.sort(t.records, 'amount', 'asc')
    expect(t.records.map(r => r.id).join()).toBe(before)
  })
})

// ============================================================
describe('CSV 导出 / 导入', () => {
  it('备注里带换行，导出再导入不丢数据', () => {
    const source = new ExpenseTracker()
    source.add(rec('2026-05-03', 12.5, { note: '含,逗号 和"引号"\n还有换行' }))
    source.add(rec('2026-05-01', 8000, { type: 'income', category: '工资', note: '月薪' }))

    const csv = source.exportCSV()
    memory = {}                              // 模拟换一台设备导入
    const target = new ExpenseTracker()
    const result = target.importCSV(csv)

    expect(result.added).toBe(2)
    expect(target.records.find(r => r.date === '2026-05-03').note)
      .toBe('含,逗号 和"引号"\n还有换行')
  })

  it('重复记录会被跳过（同一文件内 + 再次导入）', () => {
    const t = new ExpenseTracker()
    const csv = '类型,金额,分类,日期,备注\n支出,10,餐饮,2026-06-01,a\n支出,10,餐饮,2026-06-01,a'
    expect(t.importCSV(csv)).toMatchObject({ added: 1, duplicates: 1 })
    expect(t.importCSV(csv)).toMatchObject({ added: 0, duplicates: 2 })
  })

  it('负数、非法金额、非法日期都被跳过', () => {
    const t = new ExpenseTracker()
    const csv = [
      '类型,金额,分类,日期,备注',
      '支出,-50,餐饮,2026-06-02,负数',
      '支出,abc,餐饮,2026-06-03,金额非法',
      '支出,10,餐饮,2026-13-01,日期非法'
    ].join('\n')
    expect(t.importCSV(csv)).toMatchObject({ added: 0, skipped: 3 })
  })

  it('新分类会自动登记到分类列表', () => {
    const t = new ExpenseTracker()
    t.importCSV('类型,金额,分类,日期,备注\n支出,30,宠物,2026-06-04,猫粮')
    expect(t.categories).toContain('宠物')
  })

  it('表头列顺序可以调换', () => {
    const t = new ExpenseTracker()
    t.importCSV('日期,备注,类型,金额,分类\n2026-06-05,乱序,支出,66,购物')
    expect(t.records[0]).toMatchObject({ amount: 66, category: '购物', date: '2026-06-05' })
  })

  it('空文件不会抛错', () => {
    expect(new ExpenseTracker().importCSV('')).toMatchObject({ added: 0, skipped: 0 })
  })
})

// ============================================================
describe('预算', () => {
  it('按月份分别保存，互不覆盖', () => {
    const t = new ExpenseTracker()
    t.setBudget('2026-05', 1000)
    t.setBudget('2026-06', 2000)
    expect(t.getBudget('2026-05')).toBe(1000)
    expect(t.getBudget('2026-06')).toBe(2000)
  })

  it('超支时 over 为 true，进度条封顶 100%', () => {
    const t = makeTracker([rec('2026-05-10', 300)])
    t.setBudget('2026-05', 100)
    const status = t.getBudgetStatus('2026-05')
    expect(status.over).toBe(true)
    expect(status.percent).toBe(100)
    expect(status.rawPercent).toBe(300)
    expect(status.remaining).toBe(-200)
  })

  it('没有预算的月份返回 null', () => {
    expect(new ExpenseTracker().getBudgetStatus('2026-05')).toBeNull()
  })
})

// ============================================================
describe('统计', () => {
  it('收入、支出、结余计算正确', () => {
    const t = makeTracker([
      rec('2026-05-01', 100),
      rec('2026-05-02', 30.5),
      rec('2026-05-03', 500, { type: 'income', category: '工资' })
    ])
    expect(t.getStats()).toEqual({ income: 500, expense: 130.5, balance: 369.5 })
  })

  it('分类统计只算支出，并按金额倒序', () => {
    const t = makeTracker([
      rec('2026-05-01', 100, { category: '餐饮' }),
      rec('2026-05-02', 300, { category: '居住' }),
      rec('2026-05-03', 500, { type: 'income', category: '工资' })
    ])
    expect(t.getCategoryStats()).toEqual([
      { name: '居住', value: 300 },
      { name: '餐饮', value: 100 }
    ])
  })
})
