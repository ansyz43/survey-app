/**
 * Generates 1923 realistic survey responses for stress-testing analytics.
 * Distributions loosely model Chinese students in Vladivostok.
 *
 * Run:  npx tsx prisma/seed-responses.ts
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

// ── Helpers ──────────────────────────────────────────────────

function pick<T>(arr: T[], weights?: number[]): T {
  if (!weights) return arr[Math.floor(Math.random() * arr.length)]
  const total = weights.reduce((a, b) => a + b, 0)
  let r = Math.random() * total
  for (let i = 0; i < arr.length; i++) {
    r -= weights[i]
    if (r <= 0) return arr[i]
  }
  return arr[arr.length - 1]
}

function pickN<T>(arr: T[], min: number, max: number, weights?: number[]): T[] {
  const count = min + Math.floor(Math.random() * (max - min + 1))
  const pool = [...arr]
  const result: T[] = []
  for (let i = 0; i < Math.min(count, pool.length); i++) {
    const idx = weights
      ? (() => {
          const w = weights.slice(0, pool.length)
          const t = w.reduce((a, b) => a + b, 0)
          let r = Math.random() * t
          for (let j = 0; j < w.length; j++) { r -= w[j]; if (r <= 0) return j }
          return w.length - 1
        })()
      : Math.floor(Math.random() * pool.length)
    result.push(pool.splice(idx, 1)[0])
    if (weights) weights.splice(idx, 1)
  }
  return result
}

function pickOrdered<T>(arr: T[], count: number, weights?: number[]): T[] {
  return pickN(arr, count, count, weights)
}

// ── Option pools ──────────────────────────────────────────────

const ages = ['under18', '18-22', '23-27', '28-35', '36plus']
const ageW = [3, 50, 30, 12, 5] // mostly students

const genders = ['male', 'female', 'prefer_not']
const genderW = [45, 52, 3]

const occupations = ['bachelor', 'master_phd', 'worker', 'freelancer', 'other']
const occupW = [50, 25, 12, 8, 5]

const paidContent = ['music', 'short_video', 'long_video', 'photo', 'design', 'livestream', 'never_pay']
const paidW = [30, 35, 20, 10, 8, 15, 20]

const spends = ['0', '1-30', '31-100', '101-300', '300plus']
const spendW = [20, 35, 25, 15, 5]

const platforms = ['douyin', 'red', 'bilibili', 'wechat_ch', 'netease', 'qq_music', 'kuaishou', 'taobao_live', 'youtube_ig', 'other']
const platW = [40, 30, 35, 20, 25, 20, 15, 10, 12, 5]

const topics = ['exotic_culture', 'city_vlog', 'food', 'music_covers', 'photo_art', 'winter_sport', 'fashion', 'education', 'cn_ru_exchange', 'gaming_anime']
const topicW = [25, 30, 35, 15, 12, 18, 22, 20, 28, 25]

const appeals = ['unique_angle', 'high_quality', 'cultural_fresh', 'practical', 'emotional', 'fair_price']
const appealW = [25, 30, 28, 20, 15, 22]

const vlkAware = ['often', 'sometimes', 'never']
const vlkW = [8, 35, 57]

const desired = ['city_explore', 'ru_music', 'street_photo', 'ru_food', 'nature', 'ru_lang', 'shopping', 'student_life']
const desiredW = [30, 15, 12, 25, 28, 20, 10, 30]

const prefPlat = ['douyin', 'red', 'bilibili', 'wechat_ch', 'kuaishou', 'other']
const prefPlatW = [35, 25, 30, 15, 8, 3]

const buyVlk = ['definitely', 'probably', 'depends', 'unlikely', 'no']
const buyVlkW = [10, 25, 40, 18, 7]

const channels = ['poizon', 'taobao', '1688', 'pinduoduo', 'red_store', 'buyer', 'direct_ru', 'other']
const channelW = [15, 35, 10, 20, 12, 18, 25, 5]

const prices = ['under50', '50-150', '151-300', '301-500', '500plus']
const priceW = [15, 35, 30, 15, 5]

const purchaseF = ['price', 'quality', 'design', 'brand_story', 'friend_rec', 'kol_rec', 'eco']
const purchaseFW = [30, 35, 25, 15, 20, 18, 10]

// Open text pools for realistic answers
const openProductTexts = [
  '希望能看到海参崴的城市风光摄影集',
  '俄罗斯风格的原创音乐和翻唱',
  '海参崴美食教程视频',
  '俄式甜品和面包的做法',
  '海参崴冬季极地风光的视频和照片',
  '中俄双语教学内容',
  '关于留学生活的真实Vlog',
  '俄罗斯传统手工艺品',
  '海参崴当地设计师的服装品牌',
  '俄罗斯艺术和绘画教程',
  '关于海参崴历史文化的纪录片',
  '俄罗斯电子音乐和DJ文化',
  '符拉迪沃斯托克的户外探险视频',
  '俄式家居装饰灵感',
  '海参崴的街头文化和涂鸦艺术',
  '关于在俄罗斯创业的经验分享',
  '海参崴海鲜市场和料理视频',
  '俄罗斯冬季运动教学',
  '符拉迪沃斯托克日落和海景摄影',
  '中俄文化对比的趣味内容',
  '海参崴本地咖啡馆文化指南',
  '俄罗斯文学经典的短视频解读',
  '更多关于海参崴大学生活的内容',
  '海参崴的夜生活和娱乐指南',
  '想看到优质的俄罗斯纪录片中文字幕',
  '符拉迪沃斯托克的建筑和城市设计',
  '希望看到关于滨海边疆区自然保护区的内容',
  '俄罗斯当代艺术展览介绍',
  '关于在海参崴旅游的实用攻略',
  '想了解海参崴的二手市场和复古文化',
]

const cities = [
  '北京', '上海', '广州', '深圳', '杭州', '成都', '武汉', '南京',
  '重庆', '西安', '苏州', '天津', '长沙', '郑州', '东莞', '青岛',
  '沈阳', '宁波', '昆明', '大连', '福州', '厦门', '哈尔滨', '济南',
  '温州', '合肥', '佛山', '长春', '兰州', '贵阳', '太原', '乌鲁木齐',
  '石家庄', '南昌', '南宁', '无锡', '常州', '烟台', '珠海', '中山',
  '黑龙江', '吉林省', '辽宁', '山东', '河北', '河南', '浙江省', '江苏省',
  '湖北省', '四川省',
]
const cityW = [
  15, 12, 10, 10, 8, 8, 7, 7,
  6, 6, 5, 5, 5, 5, 4, 4,
  6, 4, 4, 5, 3, 3, 8, 4,
  3, 3, 3, 5, 3, 3, 3, 3,
  3, 3, 3, 3, 2, 2, 2, 2,
  7, 5, 5, 4, 3, 3, 3, 3,
  3, 3,
]

// ── Device simulation ──────────────────────────────────────

const devices = ['mobile', 'desktop', 'tablet']
const deviceW = [70, 25, 5]

const uas = [
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
  'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 Chrome/120.0',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15',
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/120.0',
  'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
]

// ── Generate one response ──────────────────────────────────

function generateResponse(index: number) {
  const sessionId = `load-test-${String(index).padStart(5, '0')}`

  // ~5% partial / suspicious
  const isPartial = Math.random() < 0.05
  const isSuspicious = Math.random() < 0.03

  const durationBase = 120 + Math.floor(Math.random() * 480) // 2-10 min
  const duration = isSuspicious ? 15 + Math.floor(Math.random() * 30) : durationBase

  const startDate = new Date('2026-03-01T00:00:00Z')
  startDate.setMinutes(startDate.getMinutes() + Math.floor(Math.random() * 40320)) // spread over 28 days

  const completed = !isPartial
  const completedAt = completed ? new Date(startDate.getTime() + duration * 1000) : null

  // Determine how far partial respondents got
  const completionRate = isPartial ? 0.2 + Math.random() * 0.6 : 1.0
  const dropOff = isPartial ? pick(['B2', 'B4', 'C1', 'C3', 'D1', 'D2']) : null

  // Choose paid content — handle "never_pay" exclusive logic
  let selectedPaid = pickN([...paidContent], 1, 3, [...paidW])
  if (selectedPaid.includes('never_pay')) selectedPaid = ['never_pay']

  return {
    sessionId,
    // Block A
    age: pick(ages, [...ageW]),
    gender: pick(genders, [...genderW]),
    occupation: pick(occupations, [...occupW]),
    // Block B
    paidContentTypes: selectedPaid,
    monthlySpend: selectedPaid.includes('never_pay') ? '0' : pick(spends, [...spendW]),
    platforms: pickN([...platforms], 2, 5, [...platW]),
    contentTopics: pickN([...topics], 2, 5, [...topicW]),
    appealFactors: pickOrdered([...appeals], 3, [...appealW]),
    // Block C
    vlkContentAware: pick(vlkAware, [...vlkW]),
    desiredContent: pickN([...desired], 1, 3, [...desiredW]),
    preferredPlatform: pick(prefPlat, [...prefPlatW]),
    buyVlkProduct: pick(buyVlk, [...buyVlkW]),
    // Block D
    purchaseChannels: pickN([...channels], 1, 4, [...channelW]),
    priceWillingness: pick(prices, [...priceW]),
    purchaseFactors: pickOrdered([...purchaseF], 3, [...purchaseFW]),
    // Block E — open text (~70% fill product, ~90% fill city)
    openProduct: Math.random() < 0.7 ? pick(openProductTexts) : null,
    openCity: Math.random() < 0.9 ? pick(cities, [...cityW]) : null,
    // System
    startedAt: startDate,
    completedAt,
    durationSeconds: duration,
    deviceType: pick(devices, [...deviceW]),
    userAgent: pick(uas),
    isSuspicious,
    suspicionReasons: isSuspicious ? ['speed_too_fast'] : [],
    completionRate,
    dropOffQuestion: dropOff,
    isPartial,
  }
}

// ── Main ────────────────────────────────────────────────────

const TOTAL = parseInt(process.env.SEED_COUNT || '3255', 10)
const BATCH = 200

async function main() {
  // Clear previous load-test data
  const deleted = await prisma.surveyResponse.deleteMany({
    where: { sessionId: { startsWith: 'load-test-' } },
  })
  console.log(`Cleared ${deleted.count} previous load-test responses`)

  let created = 0
  for (let offset = 0; offset < TOTAL; offset += BATCH) {
    const batchSize = Math.min(BATCH, TOTAL - offset)
    const data = Array.from({ length: batchSize }, (_, i) => generateResponse(offset + i))
    await prisma.surveyResponse.createMany({ data })
    created += batchSize
    console.log(`  ${created} / ${TOTAL}`)
  }

  const total = await prisma.surveyResponse.count()
  console.log(`\n✅ Done! ${TOTAL} responses seeded. Total in DB: ${total}`)
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
