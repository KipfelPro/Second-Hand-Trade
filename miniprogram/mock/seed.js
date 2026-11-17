const { colleges, campusesForCollege, fixtureGrade } = require('../utils/schools')
const { getCampus, pickupOptions, formatPickup } = require('../utils/campus')
const stock = require('./stock')

const campusCatalogVersion = 7
// Give replacement items their own IDs so old conversations and orders keep referring to the original item.
const replacedStockSlots = new Set([2, 6, 11, 12, 17, 18, 19, 20, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40])
const retiredDemoIds = new Set(['p-dorm', ...Array.from(replacedStockSlots, slot => 'p-stock-' + slot)])

const student = {
  id: 'demo-student', name: '唐宁', nickname: '唐同学', studentNo: '3025****001', college: '机械工程学院',
  grade: '大一', residence: '北洋园校区修园', dorm: '北洋园校区修园11斋', campus: '北洋园校区', avatar: '/images/avatar-me.png',
  campusId: 'beiyang', credit: 100, verified: true
}

const sellers = [
  { id: 'lin', name: '林禾', nickname: '林同学', college: '机械工程学院', grade: '大二', residence: student.residence, dorm: student.dorm, campus: student.campus, credit: 102 },
  { id: 'zhou', name: '周然', nickname: '周同学', college: '智能与计算学部', grade: '大一', residence: '北洋园校区格园', dorm: '北洋园校区格园2斋', campus: student.campus, credit: 96 },
  { id: 'xu', name: '徐书', nickname: '徐同学', college: '建筑学院', grade: '大四', residence: '卫津路校区鹏翔学生公寓', dorm: '卫津路校区鹏翔4斋', campus: '卫津路校区', credit: 82 },
  { id: 'chen', name: '陈一', nickname: '陈同学', college: '机械工程学院', grade: '大四', residence: student.residence, dorm: '北洋园校区修园12斋', campus: student.campus, credit: 99 }
].map(seller => Object.assign(seller, { avatar: '/images/avatar-' + seller.id + '.png', verified: true }))

const surnames = ['林','许','周','顾','邵','秦','王','郑','宋','赵','苏','唐','陈','沈','姜','何','李','罗','陶','梁']
const portraits = ['lin','zhou','xu','chen','me']
const campusSellers = colleges.map((college, i) => {
  const campusId = campusesForCollege(college)[0]
  const campus = getCampus(campusId).name
  const nickname = surnames[i % surnames.length] + '同学'
  return { id: 'campus-seller-' + (i + 1), name: nickname, nickname, college, grade: fixtureGrade(college, i + Math.floor(i / 8) * 2),
    campus, campusId, avatar: '/images/avatar-' + portraits[i % portraits.length] + '.png', verified: true, credit: 89 + (i * 7 % 17) }
})

function campusProducts(now = Date.now()) {
  return campusSellers.map((seller, i) => {
    const [title,category,asset,price,description,course='',grade=''] = stock[i]
    const sites = pickupOptions(seller.campusId)
    const slot = i + 1
    return {
      id: (replacedStockSlots.has(slot) ? 'p-stock-new-' : 'p-stock-') + slot, title, category,
      condition: i % 4 === 1 ? '几乎全新' : '轻微使用', price,
      images: ['/images/stock/' + asset + '.jpg'],
      sellerId: seller.id, campusId: seller.campusId, campus: seller.campus,
      location: sites[i % sites.length], description,
      course, grade, tags: category === 'graduation' ? ['毕业清仓'] : [],
      time: '工作日 17:30–20:00', bargain: i % 2 === 0, status: 'active',
      createdAt: now - (i + 1) * 1800000
    }
  })
}

const templates = [
  ['p-books', '高等数学（上册）· 同济第七版', 'books', '轻微使用', 18, 'books', 'lin', '竹园餐厅门口',
    '上学期使用过，内页完整，部分例题有铅笔划线。工作日晚饭后可自提。', '高等数学', '大一', ['高数','大一上','理工通用']],
  ['p-fridge', '46 L 单门小冰箱', 'life', '轻微使用', 136, 'fridge', 'chen', '大通学生中心门口',
    '宿舍用的 46L 小冰箱，冷藏正常，边角有轻微使用痕迹。建议两个人一起来搬。', '', '', ['宿舍','小冰箱','毕业清仓']],
  ['p-lamp', '可调光护眼充电台灯', 'life', '几乎全新', 36, 'lamp', 'zhou', '郑东图书馆门口',
    '浅绿色，三档亮度，适合宿舍书桌。充电线随灯一起给，现场可以试。', '', '', ['宿舍','台灯']],
  ['p-keyboard', '奶油粉 68 键机械键盘', 'digital', '几乎全新', 88, 'keyboard', 'zhou', '梅园餐厅门口',
    '线性轴，键帽已经清洁，原装数据线和拔键器都在。可以约在食堂门口试用。', '', '', ['键盘','数码']],
  ['p-earbuds', '奶白色蓝牙耳机', 'digital', '轻微使用', 59, 'earbuds', 'xu', '春水图书馆门口',
    '左右耳配对和充电正常，充电盒有小划痕。附未拆封备用耳塞。', '', '', ['耳机','蓝牙','毕业清仓']],
  ['p-racket', '轻量羽毛球拍＋两只球', 'style', '轻微使用', 48, 'racket', 'lin', '北区综合体育馆门口',
    '平时上体育课用，拍框轻微掉漆，线况良好。适合入门和同学打球。', '', '', ['羽毛球','体育']],
  ['p-linear', '《线性代数》教材', 'books', '几乎全新', 16, 'books', 'chen', '求实会堂门口',
    '正规出版教材，内页完整。', '线性代数', '大一', ['线代','大一下','教材']],
  ['p-graduation-umbrella', '藏蓝色折叠雨伞', 'graduation', '轻微使用', 21, 'stock/folding-umbrella', 'xu', '大学生活动中心门口',
    '毕业搬家清出一把折叠伞，开合顺滑，伞骨牢固，收好可扣住绑带。', '', '', ['毕业清仓','雨伞']]
]

function seed() {
  const now = Date.now()
  const products = templates.map((row, i) => {
    const campus = getCampus(sellers.find(seller => seller.id === row[6]).campus)
    const assetName = row[0] === 'p-linear' ? 'stock/linear-book' : row[5]
    const asset = '/images/' + assetName + '.jpg'
    return {
      id: row[0], title: row[1], category: row[2], condition: row[3], price: row[4],
      images: assetName.startsWith('stock/') ? [asset] : [asset, '/images/' + assetName + '-detail.jpg'],
      sellerId: row[6], location: formatPickup(row[7], campus.id), campus: campus.name, campusId: campus.id,
      description: row[8], course: row[9], grade: row[10], tags: row[11],
      time: i % 2 === 0 ? '工作日 18:00–21:00' : '周末 14:00–18:00', bargain: row[0] === 'p-fridge' || i % 2 === 0,
      status: 'active', createdAt: now - (i + 1) * 3600000
    }
  })
  const personalProduct = Object.assign({}, products[2], {
    id: 'p-owned', title: '针织护套热水袋', status: 'offline', sellerId: student.id, price: 18,
    images: ['/images/stock/hot-water-bottle.jpg'], tags: ['热水袋', '宿舍'],
    description: '橘色针织套可拆洗。瓶身与旋盖完好，装水可现场检查。',
    createdAt: now - 86400000
  })
  const orderStatuses = ['pending', 'completed', 'aftersale']
  const orders = orderStatuses.map((status, index) => {
    const original = products[[4, 5, 2][index]]
    const product = Object.assign({}, original, { id: 'p-demo-sold-' + index, status: 'sold' })
    products.push(product)
    return {
      id: 'TJDEMO000' + (index + 1), productId: product.id, buyerId: student.id,
      sellerId: product.sellerId, product, status, createdAt: now - (index + 1) * 86400000,
      completedAt: status === 'completed' ? now - 86400000 : 0,
      afterSale: status === 'aftersale' ? { reason: '交接时发现充电线缺失，希望协商处理。', createdAt: now - 7200000, reviewedAt: 0 } : null,
      rating: null
    }
  })
  return {
    user: null, products: products.concat(personalProduct, campusProducts(now)), orders, wants: [], favorites: [], assistant: [], latestProduct: '',
    threads: [{
      id: 'thread-demo', sellerId: 'lin', productId: 'p-books', unread: 1, updatedAt: now - 1800000,
      messages: [{ id: 'demo-message', from: 'seller', text: '你好呀，课本还在。今晚方便在北洋园校区竹园餐厅门口见吗？', createdAt: now - 1800000 }]
    }],
    notices: [{
      id: 'notice-demo', type: 'system', title: '欢迎来到同窗集', text: '闲置面交前可以先聊好地点和时间。有问题可以问棠小助。',
      createdAt: now - 3600000, read: false, url: '/pages/assistant/index?mode=ask'
    }, {
      id: 'notice-demo-order', type: 'order', title: '演示订单 · 待收货', text: '线下面交、确认物品后，即可在订单里确认收货。',
      createdAt: now - 86400000, read: false, url: '/pages/order/index?id=' + orders[0].id
    }],
    sellerNotices: [], publishedDrafts: {}, campusCatalogVersion
  }
}

module.exports = { seed, sellers: sellers.concat(campusSellers), student, campusCatalogVersion, retiredDemoIds }
