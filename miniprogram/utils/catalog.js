const store = require('./store')
const { getCampus, getDiscoveryCampus, pickupOptions } = require('./campus')
const { matchesCollege, matchesGrade } = require('./schools')
const { proximity } = require('./proximity')

const categories = [
  { id: 'books', name: '教材专区', icon: 'book', average: 25, suggestion: '可补充版次、课程、笔记划线情况，以及附赠的习题或资料。' },
  { id: 'graduation', name: '毕业清仓', icon: 'box', average: 45, suggestion: '可补充最晚取货时间、是否方便搬运和能否打包带走。' },
  { id: 'digital', name: '数码配件', icon: 'devices', average: 85, suggestion: '可补充型号、配件、电池续航、使用痕迹及是否支持当面试用。' },
  { id: 'life', name: '生活用品', icon: 'lamp', average: 60, suggestion: '可补充尺寸、容量、使用状态和搬运方式。' },
  { id: 'style', name: '文体美妆', icon: 'racket', average: 48, suggestion: '可补充规格、使用次数、配件和保质情况。' },
  { id: 'other', name: '其他', icon: 'grid', suggestion: '可补充用途、尺寸和随附物品。' }
]
const conditions = ['全新', '几乎全新', '轻微使用', '明显使用']
const sampleImages = [
  '/images/stock/multimeter.jpg', '/images/stock/phone-stand.jpg', '/images/stock/clip-lamp.jpg'
]
const legacySampleImages = ['books', 'fridge', 'lamp', 'keyboard', 'earbuds', 'racket']
  .map(name => '/images/' + name + '.jpg')
const vocab = [
  { words: /高数|高等数学/, term: '高等数学', category: 'books' },
  { words: /线性代数|线代/, term: '线性代数', category: 'books' },
  { words: /大学物理|大物/, term: '大学物理', category: 'books' },
  { words: /有机化学|有机化/, term: '有机化学', category: 'books' },
  { words: /工程制图|工图/, term: '工程制图', category: 'books' },
  { words: /计算机网络|计网/, term: '计算机网络', category: 'books' },
  { words: /细胞生物学|细胞生物/, term: '细胞生物学', category: 'books' },
  { words: /教材|课本|书籍/, term: '教材', category: 'books', generic: true },
  { words: /冰箱|冷藏柜/, term: '冰箱', category: 'life' },
  { words: /台灯|护眼灯|桌灯/, term: '台灯', category: 'life' },
  { words: /风扇|电扇|风机/, term: '风扇', category: 'life' },
  { words: /电饭煲|电饭锅/, term: '电饭煲', category: 'life' },
  { words: /微波炉/, term: '微波炉', category: 'life' },
  { words: /挂烫机|熨斗/, term: '挂烫机', category: 'life' },
  { words: /保温杯|保温瓶/, term: '保温杯', category: 'life' },
  { words: /雨伞|折叠伞/, term: '雨伞', category: 'graduation' },
  { words: /显示器|电脑屏幕|备用屏/, term: '显示器', category: 'digital' },
  { words: /扩展坞|拓展坞|USB[ -]?Hub/i, term: '扩展坞', category: 'digital' },
  { words: /计算器/, term: '计算器', category: 'digital' },
  { words: /无线鼠标|鼠标/, term: '鼠标', category: 'digital' },
  { words: /标签打印机|打标机/, term: '标签打印机', category: 'digital' },
  { words: /打印机|打印扫描/, term: '打印机', category: 'digital', matchName: true },
  { words: /扬声器|音响|音箱/, term: '扬声器', category: 'digital' },
  { words: /键盘|机械轴/, term: '键盘', category: 'digital' },
  { words: /耳机|耳塞/, term: '耳机', category: 'digital' },
  { words: /羽毛球/, term: '羽毛球', category: 'style' },
  { words: /乒乓球|乒乓拍/, term: '乒乓球', category: 'style' },
  { words: /球拍|双拍/, term: '球拍', category: 'style', matchName: true },
  { words: /自行车|单车|折叠车/, term: '自行车', category: 'style' },
  { words: /游泳眼镜|泳镜/, term: '游泳眼镜', category: 'style' },
  { words: /尤克里里|乌克丽丽|四弦学生琴/, term: '尤克里里', category: 'style' },
  { words: /清仓|毕业/, term: '毕业清仓', category: 'graduation', generic: true },
  { words: /数码|电子配件/, term: '数码配件', category: 'digital', generic: true },
  { words: /生活用品|宿舍用品/, term: '生活用品', category: 'life', generic: true },
  { words: /体育用品|文体|美妆/, term: '文体美妆', category: 'style', generic: true },
  { words: /其他闲置|其他商品|其他类|^其他$/, term: '其他', category: 'other', generic: true }
]

function getCategory(id) { return categories.find(category => category.id === id) }
function creditLevel(score) { return score >= 100 ? '优秀' : score >= 90 ? '良好' : '一般' }
function formatDate(ms) {
  if (!ms) return ''
  const date = new Date(ms)
  const pad = value => String(value).padStart(2, '0')
  return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate()) + ' ' +
    pad(date.getHours()) + ':' + pad(date.getMinutes())
}

function intentOf(query) {
  const raw = String(query || '').trim()
  const hasWeijin = /卫津路/.test(raw)
  const hasBeiyang = /北洋园/.test(raw)
  const campus = hasWeijin === hasBeiyang ? '' : hasWeijin ? 'weijin' : 'beiyang'
  const text = raw.replace(/卫津路(?:校区)?|北洋园(?:校区)?/g, '').trim()
  const hits = vocab.filter(item => item.words.test(text))
  const semester = (text.match(/大[一二三四](?:上|下)/) || [])[0] || ''
  const grade = (text.match(/大[一二三四]|研[一二三]|博士/) || [])[0] || ''
  const amount = (text.match(/(?:预算|不超过|小于|低于|最多)\s*[¥￥]?\s*(\d+(?:\.\d+)?)/) ||
    text.match(/(\d+(?:\.\d+)?)\s*(?:元|块钱|块)(?:以内|以下|左右)?/) || [])[1]
  return { text, hits, semester, grade, amount, campus }
}

function visibleCategory(product, category) {
  return !category || category === 'all' || product.category === category ||
    (category === 'graduation' && (product.tags || []).includes('毕业清仓'))
}

function scoreText(product, intent, haystack, identity) {
  if (!intent.text) return 0
  if (product.category === 'books') {
    if (intent.grade && product.grade && product.grade !== intent.grade) return -1
    const volume = (product.title.match(/([上下])册/) || [])[1]
    if (intent.semester && volume && volume !== intent.semester.slice(-1)) return -1
  }
  const graduation = intent.hits.some(item => item.category === 'graduation')
  if (graduation && !visibleCategory(product, 'graduation')) return -1
  const specifics = intent.hits.filter(item => !item.generic && !item.matchName)
  if (specifics.length) {
    if (specifics.some(item => !item.words.test(identity))) return -1
    return 32 + (intent.semester && haystack.includes(intent.semester) ? 12 : 0) +
      (intent.grade && product.grade === intent.grade ? 5 : 0)
  }
  const named = intent.hits.filter(item => item.matchName)
  if (named.length) return named.every(item => item.words.test(identity)) ? 22 : -1
  const simplified = intent.text.replace(/我想|想找|想买|求购|需要|想要|有没有|请问|给我|帮我|找个|一个|一台|一件|一本|一把|一只|一套|一下|谢谢|宿舍用的|宿舍用|能不能|适合|想在/g, '')
    .replace(/(?:^|\s)(?:在|买|找)\s*/g, '')
    .replace(/(?:预算|不超过|小于|低于|最多)\s*[¥￥]?\s*\d+(?:\.\d+)?(?:\s*(?:元|块钱|块))?|\d+(?:\.\d+)?\s*(?:元|块钱|块)(?:以内|以下|左右)?/g, '')
    .replace(/教材|课本|书籍|生活用品|宿舍用品|数码配件|电子配件|文体美妆|体育用品|毕业(?:清仓|闲置)?/g, '')
  const words = simplified.split(/[\s，。？！、,!?]+/).filter(Boolean)
  if (!words.length) {
    return !intent.hits.length || intent.hits.some(item => visibleCategory(product, item.category)) ? 16 : -1
  }
  const matched = words.filter(word => haystack.toLowerCase().includes(word.toLowerCase()))
  return matched.length ? matched.length * 12 : -1
}

// Rank relevant keywords first, then campus proximity and seller credibility.
function matchProducts(query, options = {}) {
  const user = store.getUser()
  const intent = intentOf(query)
  const alternatives = intent.text.split(/或者|或/).map(value => value.trim()).filter(Boolean)
  const intents = alternatives.length > 1 ? alternatives.map(intentOf) : [intent]
  const selectedCampus = getCampus(options.campus)
  if (selectedCampus && intent.campus && selectedCampus.id !== intent.campus) return []
  const campus = selectedCampus || getCampus(intent.campus)
  const queryPrice = intent.amount == null ? Infinity : Number(intent.amount)
  const filterPrice = options.maxPrice === '' || options.maxPrice == null ? Infinity : Number(options.maxPrice)
  const maxPrice = Math.min(queryPrice, filterPrice)
  const minPrice = options.minPrice === '' || options.minPrice == null ? 0 : Number(options.minPrice)
  const maxCondition = conditions.indexOf(options.condition)
  const results = []
  const sellerCache = {}
  store.getProducts().forEach(product => {
    if (product.status !== 'active' || !visibleCategory(product, options.category)) return
    if (campus && product.campusId !== campus.id) return
    if (product.price < minPrice || product.price > maxPrice) return
    if (maxCondition >= 0 && conditions.indexOf(product.condition) > maxCondition) return
    if (!(product.sellerId in sellerCache)) sellerCache[product.sellerId] = store.getSeller(product.sellerId)
    const seller = sellerCache[product.sellerId]
    if (!seller) return
    const { sameCampus, sameDorm, sameCollege, sameGrade, distance } = proximity(user, seller, product)
    if ((options.scope === 'dorm' && !sameDorm) || (options.scope === 'college' && !sameCollege)) return
    if (!matchesCollege(seller.college, options.college)) return
    if (options.course && options.course !== 'all' && !String(product.course).includes(options.course)) return
    if (!matchesGrade(options.category === 'books' && product.grade ? product.grade : seller.grade, options.grade)) return
    const identity = [product.title, product.course, ...(product.tags || [])].join(' ')
    const haystack = [identity, product.grade, seller.college, seller.grade, product.description, (getCategory(product.category) || {}).name].join(' ')
    const relevance = Math.max(...intents.map(queryIntent => scoreText(product, queryIntent, haystack, identity)))
    if (relevance < 0) return
    results.push({ product, distance, score: relevance + (sameDorm ? 12 : 0) +
      (sameCollege ? 8 : 0) + (sameGrade ? 3 : 0) + (sameCampus ? 4 : 0) + (seller.credit - 90) * .45 })
  })
  const compare = {
    priceAsc: (a, b) => a.product.price - b.product.price,
    priceDesc: (a, b) => b.product.price - a.product.price,
    newest: (a, b) => b.product.createdAt - a.product.createdAt,
    distance: (a, b) => b.distance - a.distance,
    recommended: !intent.text ? (a, b) => b.distance - a.distance : null
  }[options.sort]
  return results.sort((a, b) => (compare ? compare(a, b) : 0) || b.score - a.score ||
    b.product.createdAt - a.product.createdAt).map(item => item.product)
}

function parseWant(value) {
  const intent = intentOf(value)
  const item = intent.hits.find(hit => !hit.generic && !hit.matchName) || intent.hits.find(hit => hit.matchName) || intent.hits[0]
  let condition = ''
  if (/几乎全新|九成新|9成新|九九新/.test(intent.text)) condition = conditions[1]
  else if (/未拆|全新/.test(intent.text)) condition = conditions[0]
  else if (/明显使用|有瑕疵也行|成色不限/.test(intent.text)) condition = conditions[3]
  else if (/八成新|8成新|轻微使用/.test(intent.text)) condition = conditions[2]
  const phrase = intent.text.replace(/^(我想|想要|想买|需要|求购|帮我找|找一个)\s*/g, '')
    .split(/[，。！？,!?]|预算|不超过/)[0].trim()
  return {
    title: item ? ((intent.semester || intent.grade) + (item.term === '冰箱' && /小/.test(intent.text) ? '小' : '') + item.term) : phrase,
    category: item ? item.category : '', budget: intent.amount == null ? '' : Number(intent.amount),
    condition, notes: String(value || '').trim(), campusId: intent.campus
  }
}

const previews = [
  ['便携数字万用表', 'digital', 32, '', ''],
  ['折叠桌面手机支架', 'digital', 15, '', ''],
  ['可调角度夹式阅读灯', 'life', 26, '', '']
]

const legacyPreviews = [
  ['高等数学（上册）教材', 'books', 18, '高等数学', '大一'],
  ['宿舍用迷你冰箱', 'life', 130, '', ''],
  ['充电式护眼台灯', 'life', 35, '', ''],
  ['紧凑型机械键盘', 'digital', 85, '', ''],
  ['无线蓝牙耳机', 'digital', 58, '', ''],
  ['轻量羽毛球拍', 'style', 45, '', '']
]

// Only bundled samples have known metadata. For a camera or gallery photo, prepare editable prompts.
function identify(images, campusId) {
  const sample = previews[sampleImages.indexOf(images[0])] || legacyPreviews[legacySampleImages.indexOf(images[0])]
  const user = store.getUser()
  const campus = getCampus(campusId) || getCampus(getDiscoveryCampus()) || getCampus(user && user.campusId) || getCampus('beiyang')
  const base = { images, campusId: campus.id, location: pickupOptions(campus.id)[0] }
  if (!sample) {
    return {
      ...base, title: '', category: '', price: '', course: '', grade: '', condition: '', time: '', bargain: true,
      description: '使用情况：\n附带配件：\n可见瑕疵：'
    }
  }
  const [title, category, price, course, grade] = sample
  return {
    ...base, title, category, price, course, grade, bargain: true, condition: conditions[2],
    time: '工作日 18:00–21:00', description: '闲置的' + title + '，使用状态以实物为准，可以约时间当面查看。'
  }
}

module.exports = { categories, conditions, getCategory, creditLevel, formatDate, matchProducts, parseWant, identify, sampleImages, legacySampleImages }
