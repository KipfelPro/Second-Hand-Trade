const { seed, sellers, student, campusCatalogVersion, retiredDemoIds } = require('../mock/seed')
const { takeProfile } = require('./auth')
const { getCampus, getDiscoveryCampus, pickupOptions, resolvePickupCampus, formatPickup, validatedPickup } = require('./campus')
const { appointmentTime, verifyAppointment, counterAppointment, pickupSummary } = require('./pickup')
const { addSellerInbox } = require('../mock/chat')

const key = 'tongchuangji:v1'
let sequence = 0

function init() {
  const saved = wx.getStorageSync(key)
  const db = saved || seed()
  let changed = !saved
  if ((db.campusCatalogVersion || 0) < campusCatalogVersion) {
    if ((db.campusCatalogVersion || 0) < 3) migrateCampusData(db)
    refreshDemoCatalog(db)
    changed = true
  }
  if (!db.sellerInboxReady) {
    addSellerInbox(db, student)
    db.sellerInboxReady = true
    changed = true
  }
  if (changed) wx.setStorageSync(key, db)
}

function referencedProducts(db) {
  return new Set([
    ...db.favorites, ...db.threads.map(thread => thread.productId), ...db.orders.map(order => order.productId),
    ...db.wants.flatMap(want => want.matchIds || []), ...db.assistant.flatMap(message => message.productIds || []),
    db.latestProduct
  ])
}

function migrateCampusData(db) {
  const defaults = new Map(seed().products.map(product => [product.id, product]))
  const referenced = referencedProducts(db)
  db.products = db.products.filter(product => !product.id.startsWith('p-campus-') || referenced.has(product.id))
    .map(product => {
      const { placeId, ...record } = withProductCampus(db, product)
      if (record.id.startsWith('p-campus-') && record.status === 'active') record.status = 'offline'
      const current = defaults.get(record.id)
      // 保留用户编辑数据、交易状态和商品 ID。只刷新示例商品的资料。
      if (current && record.sellerId !== student.id) return { ...current, status: record.status, createdAt: record.createdAt }
      if (record.id.startsWith('p-campus-')) {
        const seller = sellerFrom(db, record.sellerId)
        if (seller) return { ...record, campusId: seller.campusId, campus: seller.campus, location: pickupOptions(seller.campusId)[0] }
      }
      return migratePickup(record)
    })
  if (db.user && db.user.id === student.id) {
    if (db.profileLocation) {
      delete db.user.placeId
      db.user.campusId = student.campusId
      db.user.campus = student.campus
    }
    db.user.dorm = student.dorm
  }
  delete db.profileLocation
  db.threads.forEach(thread => {
    thread.messages = thread.messages.map(message => {
      if (message.id === 'demo-message' && message.from === 'seller') {
        return { ...message, text: '你好呀，课本还在。今晚方便在北洋园校区竹园餐厅门口见吗？' }
      }
      if (message.type !== 'location' && !message.location) return message
      const { type, location, ...record } = message
      record.text = (record.text || '').replace(/^\[自提地图\]/, '自提地点：').trim() || '曾分享一个自提地点'
      return record
    })
  })
  db.orders.forEach(order => {
    if (!order.product) return
    const { placeId, ...snapshot } = withProductCampus(db, order.product)
    const current = productOf(db, order.productId)
    order.product = current && snapshot.sellerId !== student.id
      ? { ...snapshot, location: current.location, campus: current.campus, campusId: current.campusId }
      : migratePickup(snapshot)
  })
}

function refreshDemoCatalog(db) {
  const referenced = referencedProducts(db)
  const activeDemo = seed().products.filter(product => product.status === 'active')
  const otherDemo = new Set(activeDemo.filter(product => product.category === 'other').map(product => product.id))
  db.products = db.products.filter(product => !retiredDemoIds.has(product.id) || referenced.has(product.id))
  for (const product of db.products) {
    if (retiredDemoIds.has(product.id) && product.status === 'active') product.status = 'offline'
    if (product.id === 'p-fridge' && product.status === 'active') product.bargain = true
    if (otherDemo.has(product.id)) product.category = 'other'
  }
  const existing = new Set(db.products.map(product => product.id))
  db.products.push(...activeDemo.filter(product => !existing.has(product.id)))
  archiveDuplicateListings(db, referenced)
  if (db.user && db.user.id === student.id && !db.user.residence) db.user.residence = student.residence
  db.campusCatalogVersion = campusCatalogVersion
}

function listingIdentity(product) {
  const cover = product.images && product.images[0]
  const title = String(product.title || '').trim().replace(/\s+/g, '').toLowerCase()
  if (!cover || !title) return ''
  const digest = /\/tcj-photo-([a-f0-9]{64})\.[a-z0-9]+$/.exec(cover)
  return JSON.stringify([product.sellerId, title, digest ? digest[1] : cover])
}

function archiveDuplicateListings(db, referenced) {
  const visible = new Map()
  const duplicates = new Map()
  const active = db.products.filter(product => product.status === 'active')
    .sort((a, b) => a.createdAt - b.createdAt)
  for (const product of active) {
    const identity = listingIdentity(product)
    if (!identity) continue
    if (visible.has(identity)) duplicates.set(product.id, visible.get(identity))
    else visible.set(identity, product.id)
  }
  if (!duplicates.size) return
  db.favorites = [...new Set(db.favorites.map(value => duplicates.get(value) || value))]
  db.products = db.products.filter(product => !duplicates.has(product.id) || referenced.has(product.id))
  for (const product of db.products) {
    if (!duplicates.has(product.id)) continue
    // 收藏指向保留的商品。旧会话和订单仍可按原 ID 查看历史商品。
    product.status = 'offline'
    product.duplicateOf = duplicates.get(product.id)
  }
}

function migratePickup(product) {
  const campus = resolvePickupCampus(product.location, product.campusId)
  if (!campus) return product
  return {
    ...product, campusId: campus.id, campus: campus.name,
    location: formatPickup(product.location, campus.id) || product.location
  }
}

function read() {
  init()
  return wx.getStorageSync(key)
}

// Apply related changes (inventory, order and notifications) in one local write.
function update(change) {
  const db = read()
  const result = change(db)
  wx.setStorageSync(key, db)
  return result
}

function id(prefix) {
  sequence = (sequence + 1) % 10000
  return prefix + Date.now().toString(36) + '-' + sequence.toString(36)
}

function userOf(db) {
  if (!db.user || !db.user.verified) throw new Error('请先完成融合门户认证')
  return db.user
}

function productOf(db, value) {
  return db.products.find(product => product.id === value)
}

function ownOrder(db, value) {
  const user = userOf(db)
  const order = db.orders.find(item => item.id === value && item.buyerId === user.id)
  if (!order) throw new Error('找不到这个订单')
  return order
}

function notice(db, type, title, text, url) {
  db.notices.unshift({ id: id('notice-'), type, title, text, url, createdAt: Date.now(), read: false })
}

function withCampus(person) {
  if (!person) return person
  const campus = getCampus(person.campusId || person.campus)
  return campus ? { ...person, campusId: campus.id, campus: campus.name } : person
}
function getUser() { return withCampus(read().user) }
function signIn() {
  const profile = takeProfile()
  if (!profile) throw new Error('模拟核验已过期，请重新验证')
  return update(db => {
    db.user = Object.assign(profile, { credit: db.selfCredit == null ? student.credit : db.selfCredit })
    return db.user
  })
}
function signOut() { update(db => { db.user = null }) }
function reset() { wx.setStorageSync(key, seed()) }
function getSeller(value) {
  const db = read()
  return sellerFrom(db, value)
}
function sellerFrom(db, value) {
  if (value === student.id) return withCampus(db.user || { ...student, credit: db.selfCredit == null ? student.credit : db.selfCredit })
  const seller = sellers.find(item => item.id === value)
  return seller && withCampus({ ...seller, credit: (db.sellerCredit || {})[value] ?? seller.credit })
}
function withProductCampus(db, product) {
  if (!product || (product.campusId && product.campus)) return product
  const seller = sellerFrom(db, product.sellerId)
  const campus = getCampus(product.campusId || product.campus) || (seller && getCampus(seller.campus))
  return campus ? { ...product, campus: campus.name, campusId: campus.id } : product
}
function getProducts() {
  const db = read()
  return db.products.filter(product => !product.duplicateOf).map(product => withProductCampus(db, product))
}
function getProduct(value) { const db = read(); return withProductCampus(db, productOf(db, value)) }
function latestProductId() { return read().latestProduct }
function rememberProduct(value) {
  update(db => { if (productOf(db, value)) db.latestProduct = value })
}

function checkListingConflict(db, product, checkSamples = true) {
  const { sampleImages, legacySampleImages } = require('./catalog')
  const identity = listingIdentity(product)
  const otherListings = db.products.filter(other => other.id !== product.id && other.sellerId === product.sellerId && other.status === 'active')
  if (identity && otherListings.some(other => listingIdentity(other) === identity)) {
    throw new Error('这件闲置已在售，请到「我的发布」编辑')
  }
  if (!checkSamples) return
  const samples = product.images.filter(path => sampleImages.includes(path) || legacySampleImages.includes(path))
  if (samples.length && otherListings.some(other => samples.some(sample => other.images.includes(sample)))) {
    throw new Error('这张样图已有在售商品，请到「我的发布」编辑')
  }
}

function persistProduct(db, input) {
  const user = userOf(db)
  const previous = input.id ? productOf(db, input.id) : null
  if (input.id && (!previous || previous.sellerId !== user.id || previous.status === 'sold')) {
    throw new Error('这件闲置无法编辑')
  }
  const price = Number(input.price)
  if (!Number.isFinite(price) || price < 0 || price > 99999 || input.price === '' || input.price == null) {
    throw new Error('请输入 0 至 99999 元的有效价格')
  }
  const fields = ['title', 'category', 'condition', 'description', 'location', 'time']
  const product = {}
  fields.concat(['course', 'grade']).forEach(field => { product[field] = String(input[field] || '').trim() })
  if (fields.some(field => !product[field])) throw new Error('请填写完整的商品信息')
  const catalog = require('./catalog')
  if (!catalog.getCategory(product.category) || !catalog.conditions.includes(product.condition)) {
    throw new Error('请选择商品分类和成色')
  }
  if (!Array.isArray(input.images) || !input.images.length || input.images.some(path => typeof path !== 'string' || !path)) {
    throw new Error('请至少上传一张商品图片')
  }
  Object.assign(product, {
    price: Math.round(price * 100) / 100, images: [...new Set(input.images)].slice(0, 9), bargain: Boolean(input.bargain),
    tags: Array.isArray(input.tags) ? input.tags : [], sellerId: user.id,
    id: previous ? previous.id : id('p-'), createdAt: previous ? previous.createdAt : Date.now(),
    status: previous ? previous.status : 'active'
  })
  const campus = getCampus((previous && previous.campusId) || input.campusId)
    || getCampus(getDiscoveryCampus()) || getCampus(user.campusId || user.campus)
  const pickup = validatedPickup(product.location, campus && campus.id)
  if (!pickup || (campus && campus.id !== pickup.campus.id)) throw new Error('请选择本校区的自提地点')
  Object.assign(product, { location: pickup.location, campus: pickup.campus.name, campusId: pickup.campus.id })
  if (product.status === 'active') {
    const changedImages = !previous || product.images.some(path => !previous.images.includes(path))
    checkListingConflict(db, product, changedImages)
  }
  if (previous) db.products[db.products.indexOf(previous)] = product
  else db.products.unshift(product)
  return product
}
function saveProduct(input) { return update(db => persistProduct(db, input)) }
function saveProducts(inputs) {
  if (!Array.isArray(inputs) || !inputs.length) throw new Error('请先准备商品草稿')
  return update(db => {
    userOf(db)
    if (!db.publishedDrafts) db.publishedDrafts = {}
    let added = 0
    const products = inputs.map(input => {
      const draftId = input.draftId && String(input.draftId)
      const previousId = draftId && Object.prototype.hasOwnProperty.call(db.publishedDrafts, draftId) && db.publishedDrafts[draftId]
      if (previousId) return productOf(db, previousId)
      const draft = Object.assign({}, input)
      delete draft.id
      const product = persistProduct(db, draft)
      if (draftId) db.publishedDrafts[draftId] = product.id
      added++
      return product
    })
    if (added) notice(db, 'system', '批量上架完成', added + ' 件闲置已发布。', '/pages/listings/index')
    return products
  })
}
function setProductStatus(value, status) {
  return update(db => {
    const user = userOf(db)
    const product = productOf(db, value)
    if (!product || product.sellerId !== user.id || product.status === 'sold') throw new Error('这件闲置无法变更状态')
    if (!['active', 'offline'].includes(status)) throw new Error('无效的商品状态')
    if (status === 'active' && product.status !== 'active') {
      checkListingConflict(db, product)
      delete product.duplicateOf
    }
    product.status = status
    return product
  })
}
function favoriteIds() { const db = read(); return db.user ? db.favorites : [] }
function toggleFavorite(value) {
  return update(db => {
    userOf(db)
    if (!productOf(db, value)) throw new Error('商品不存在')
    if (db.favorites.includes(value)) {
      db.favorites = db.favorites.filter(item => item !== value)
      return false
    }
    db.favorites.unshift(value)
    return true
  })
}

function getOrders() { const db = read(); return db.user ? db.orders.filter(order => order.buyerId === db.user.id) : [] }
function getOrder(value) { return getOrders().find(order => order.id === value) }
function quoteFor(product, thread) {
  const deal = thread && thread.deal
  return deal && deal.basePrice === product.price && deal.price <= product.price ? deal.price : product.price
}

function getCheckoutPrice(productId, threadId) {
  const db = read()
  const product = productOf(db, productId)
  if (!product) return undefined
  const thread = db.user && (threadId ? db.threads.find(item => item.id === threadId && item.productId === productId && roleForThread(db, item) === 'buyer')
    : findProductThread(db, product))
  if (thread && settleChatReplies(db, thread, Date.now())) wx.setStorageSync(key, db)
  return quoteFor(product, thread)
}

function placeOrder(value, threadId, expectedPrice) {
  return update(db => {
    const user = userOf(db)
    const product = productOf(db, value)
    if (!product || product.status !== 'active') throw new Error('该商品已下架或售出')
    if (product.sellerId === user.id) throw new Error('不能购买自己的闲置')
    const thread = threadId ? threadOf(db, threadId) : findProductThread(db, product)
    if (thread && thread.productId !== value) throw new Error('预约与当前商品不一致')
    if (thread) {
      const now = Date.now()
      settlePickupResponse(db, thread, now)
      settleChatReplies(db, thread, now)
    }
    const price = quoteFor(product, thread)
    if (expectedPrice != null && expectedPrice !== price) throw new Error('交易金额已更新，请重新确认')
    const pickup = thread && thread.pickup && thread.pickup.status === 'confirmed' &&
      appointmentTime(thread.pickup.date, thread.pickup.time) > Date.now() ? thread.pickup : null
    product.status = 'sold'
    const order = {
      id: id('TJ').toUpperCase(), productId: value, buyerId: user.id, sellerId: product.sellerId,
      product: { ...product, price }, threadId: thread ? thread.id : '', pickup, handoffAt: 0,
      status: 'pending', createdAt: Date.now(), completedAt: 0, afterSale: null, rating: null
    }
    db.orders.unshift(order)
    if (thread) addChatEvent(thread, 'system', pickup ? '买家已下单，演示款进入托管。已确认的自提预约同步到订单。'
      : '买家已下单，演示款进入托管。双方可以继续预约自提。')
    notice(db, 'order', '已下单 · 平台托管', product.title + ' 已进入待收货状态。', '/pages/order/index?id=' + order.id)
    return order
  })
}

function recordHandoff(db, order) {
  if (order.handoffAt) return
  order.handoffAt = Date.now()
  const thread = findOrderThread(db, order)
  if (thread) {
    if (thread.pickup && ['proposed', 'counter'].includes(thread.pickup.status)) {
      thread.pickup = { ...thread.pickup, status: 'cancelled', responseAt: 0, updatedAt: order.handoffAt }
    }
    const from = order.sellerId === db.user.id ? 'me' : 'seller'
    addChatEvent(thread, from, '闲置已当面交付，请验货后确认收货。')
  }
}

function markOrderHandoff(value) {
  return update(db => {
    const user = userOf(db)
    const order = db.orders.find(item => item.id === value && (item.buyerId === user.id || item.sellerId === user.id))
    if (!order) throw new Error('找不到这个订单')
    if (order.status !== 'pending') throw new Error('当前订单无法登记面交')
    recordHandoff(db, order)
    return order
  })
}
function bumpCredit(db, sellerId, delta) {
  const baseline = sellers.find(item => item.id === sellerId)
  if (!baseline) return
  if (!db.sellerCredit) db.sellerCredit = {}
  const current = db.sellerCredit[sellerId] ?? baseline.credit
  db.sellerCredit[sellerId] = Math.min(120, Math.max(0, current + delta))
}
function confirmOrder(value) {
  return update(db => {
    const order = ownOrder(db, value)
    if (order.status !== 'pending') throw new Error('当前订单无法确认收货')
    recordHandoff(db, order)
    return completeOrder(db, order)
  })
}

function simulateBuyerReceipt(value) {
  return update(db => {
    const user = userOf(db)
    const order = db.orders.find(item => item.id === value && item.sellerId === user.id)
    if (!order || order.status !== 'pending' || !order.handoffAt) throw new Error('请先登记交付')
    const thread = findOrderThread(db, order)
    if (thread) addChatEvent(thread, 'buyer', '已经验收了，谢谢！我确认收货。')
    return completeOrder(db, order)
  })
}

function completeOrder(db, order) {
  const selling = order.sellerId === db.user.id
  order.status = 'completed'
  order.completedAt = Date.now()
  db.user.credit = Math.min(120, db.user.credit + 1)
  db.selfCredit = db.user.credit
  bumpCredit(db, selling ? order.buyerId : order.sellerId, 1)
  const thread = findOrderThread(db, order)
  if (thread) closeChatTrade(thread, '买家已确认收货，模拟托管款已划转，交易完成。')
  const url = selling && thread ? '/pages/chat/index?id=' + thread.id : '/pages/order/index?id=' + order.id
  notice(db, 'order', '交易完成', selling ? '买家已确认收货。' : '已模拟将托管款项转给卖家。', url)
  return order
}
function openAfterSale(value, reason) {
  return update(db => {
    const order = ownOrder(db, value)
    if (order.status !== 'pending') throw new Error('当前订单无法发起售后')
    if (!String(reason || '').trim()) throw new Error('请描述遇到的问题')
    order.status = 'aftersale'
    order.afterSale = { reason: reason.trim(), createdAt: Date.now(), reviewedAt: 0 }
    const thread = findOrderThread(db, order)
    if (thread) closeChatTrade(thread, '买家已提交售后申请，订单进入平台介入。')
    notice(db, 'order', '平台已介入', '售后申请已收到，款项保持托管，等待模拟审核。', '/pages/order/index?id=' + value)
    return order
  })
}
function reviewAfterSale(value) {
  return update(db => {
    const order = ownOrder(db, value)
    if (order.status !== 'aftersale' || !order.afterSale) throw new Error('当前订单没有售后申请')
    if (!order.afterSale.reviewedAt) {
      order.afterSale.reviewedAt = Date.now()
      bumpCredit(db, order.sellerId, -2)
      notice(db, 'order', '平台已审核售后申请', '模拟审核通过，平台已将托管款原路退回。', '/pages/order/index?id=' + value)
    }
    return order
  })
}
function rateOrder(value, { rating, comment }) {
  return update(db => {
    const order = ownOrder(db, value)
    if (order.status !== 'completed' || order.rating) throw new Error('当前订单无法再次评价')
    const score = Number(rating)
    if (!Number.isInteger(score) || score < 1 || score > 5) throw new Error('请为本次交易评分')
    order.rating = { rating: score, comment: String(comment || '').trim(), createdAt: Date.now() }
    bumpCredit(db, order.sellerId, [0, -4, -2, 0, 1, 2][score])
    return order
  })
}

function threadOf(db, value) {
  const thread = db.threads.find(item => item.id === value)
  if (!thread || !roleForThread(db, thread)) throw new Error('会话不存在')
  return thread
}

function buyerForThread(thread) { return thread.buyerId || student.id }

function roleForThread(db, thread) {
  if (!db.user || !db.user.verified) return ''
  if (thread.sellerId === db.user.id) return 'seller'
  return buyerForThread(thread) === db.user.id ? 'buyer' : ''
}

function threadView(db, thread) {
  const role = roleForThread(db, thread)
  const buyerId = buyerForThread(thread)
  return { ...thread, buyerId, role, peerId: role === 'seller' ? buyerId : thread.sellerId }
}

function findProductThread(db, product) {
  return db.threads.find(thread => thread.productId === product.id && thread.sellerId === product.sellerId &&
    roleForThread(db, thread) === 'buyer')
}

function findOrderThread(db, order) {
  return db.threads.find(thread => thread.id === order.threadId) ||
    db.threads.find(thread => thread.productId === order.productId && thread.sellerId === order.sellerId &&
      buyerForThread(thread) === order.buyerId)
}

function orderForThread(db, thread) {
  return db.orders.find(order => order.buyerId === buyerForThread(thread) && order.sellerId === thread.sellerId &&
    order.productId === thread.productId &&
    (!order.threadId || order.threadId === thread.id))
}

function getOrderForThread(threadId) {
  const db = read()
  const thread = db.threads.find(item => item.id === threadId)
  return thread && roleForThread(db, thread) ? orderForThread(db, thread) : null
}

function getThreadForProduct(productId) {
  return chatState().find(thread => thread.productId === productId)
}

function ensureThread(db, sellerId, productId) {
  const user = userOf(db)
  const product = productOf(db, productId)
  if (!product || product.sellerId !== sellerId || sellerId === user.id) throw new Error('无法联系这个卖家')
  const previous = findProductThread(db, product)
  if (previous) return previous
  const thread = { id: id('thread-'), buyerId: user.id, sellerId, productId, unread: 0, updatedAt: Date.now(), messages: [] }
  db.threads.unshift(thread)
  return thread
}

function addChatEvent(thread, from, text) {
  const now = Date.now()
  thread.messages.push({ id: id('msg-'), from, text, createdAt: now })
  thread.updatedAt = now
  if (from !== 'me') thread.unread++
}

function closeChatTrade(thread, text) {
  thread.replies = []
  if (thread.pickup && ['proposed', 'counter'].includes(thread.pickup.status)) {
    thread.pickup = { ...thread.pickup, status: 'cancelled', responseAt: 0, updatedAt: Date.now() }
  }
  addChatEvent(thread, 'system', text)
}

function canBookPickup(product, order) {
  return product && (order ? order.status === 'pending' && !order.handoffAt : product.status === 'active')
}

function changePickup(db, thread, choice) {
  const current = thread.pickup
  const isSeller = current.status === 'proposed'
  const order = orderForThread(db, thread)
  if (!canBookPickup(productOf(db, thread.productId), order)) throw new Error('当前交易已结束预约')
  if (choice === 'accept' && appointmentTime(current.date, current.time) <= Date.now()) throw new Error('预约时间已过，请重新预约')
  const updatedAt = Date.now()
  let pickup
  let text
  if (choice === 'accept') {
    pickup = { ...current, status: 'confirmed', responseAt: 0, updatedAt }
    if (order) order.pickup = pickup
    text = (isSeller ? '可以，确认按这个时间和地点自提。' : '可以，改到这个时间没问题。') + ' ' + pickupSummary(pickup)
  } else if (choice === 'counter' && isSeller) {
    const counter = counterAppointment(current)
    pickup = { ...current, ...counter, requested: { date: current.date, time: current.time, location: current.location },
      status: 'counter', responseAt: 0, updatedAt }
    text = '原来的时间我赶不上，改到 ' + pickupSummary(pickup) + ' 方便吗？'
  } else if (choice === 'decline') {
    pickup = { ...current, status: 'declined', responseAt: 0, updatedAt }
    text = isSeller ? '这个时间我没法面交。可以重新选一个白天或晚饭后的时间。' : '这个新时间我不方便，我再发一个预约。'
  } else {
    throw new Error('请选择有效的预约操作')
  }
  thread.pickup = pickup
  const respondingRole = isSeller ? 'seller' : 'buyer'
  addChatEvent(thread, respondingRole === roleForThread(db, thread) ? 'me' : respondingRole, text)
  return pickup
}

function settlePickupResponse(db, thread, now) {
  const pickup = thread.pickup
  if (!pickup || !['proposed', 'counter'].includes(pickup.status) || !pickup.responseAt || pickup.responseAt > now) return false
  if (!canBookPickup(productOf(db, thread.productId), orderForThread(db, thread))) {
    closeChatTrade(thread, '交易已进入下一阶段，预约请求已结束。')
    return true
  }
  const unavailable = pickup.time < '08:00' || pickup.time >= '22:00' || appointmentTime(pickup.date, pickup.time) <= now
  const suggestAnotherTime = pickup.status === 'proposed' && thread.scenario === 'reschedule' && pickup.time !== '19:00'
  const choice = unavailable ? 'decline' : suggestAnotherTime ? 'counter' : 'accept'
  changePickup(db, thread, choice)
  return true
}

function proposePickup(threadId, input) {
  return update(db => {
    userOf(db)
    const thread = threadOf(db, threadId)
    const product = productOf(db, thread.productId)
    if (!canBookPickup(product, orderForThread(db, thread))) throw new Error('当前交易已结束预约')
    const details = verifyAppointment(input, withProductCampus(db, product).campusId)
    const now = Date.now()
    const selling = roleForThread(db, thread) === 'seller'
    const previous = thread.pickup
    const pickup = { ...details, id: id('pickup-'), status: selling ? 'counter' : 'proposed', responseAt: now + 1800, updatedAt: now }
    if (selling && previous && previous.status === 'proposed') {
      pickup.requested = { location: previous.location, date: previous.date, time: previous.time }
    }
    thread.pickup = pickup
    addChatEvent(thread, 'me', (selling ? '我可以在 ' : '我想约在 ') + pickupSummary(pickup) + ' 面交，方便吗？')
    return pickup
  })
}

function respondPickup(threadId, choice, appointmentId) {
  return update(db => {
    userOf(db)
    const thread = threadOf(db, threadId)
    const current = thread.pickup
    const canRespond = roleForThread(db, thread) === 'seller' ? 'proposed' : 'counter'
    if (!current || (appointmentId && current.id !== appointmentId) || current.status !== canRespond) {
      throw new Error('这个预约已更新，请查看最新消息')
    }
    return changePickup(db, thread, choice)
  })
}

function cancelPickup(threadId, appointmentId) {
  return update(db => {
    userOf(db)
    const thread = threadOf(db, threadId)
    const pickup = thread.pickup
    const order = orderForThread(db, thread)
    if (!pickup || (appointmentId && pickup.id !== appointmentId) ||
      !['proposed', 'counter', 'confirmed'].includes(pickup.status)) throw new Error('这个预约已更新，请查看最新消息')
    if (!canBookPickup(productOf(db, thread.productId), order)) throw new Error('当前交易已结束预约')
    if (order && order.pickup && order.pickup.id === pickup.id) order.pickup = null
    thread.pickup = { ...pickup, status: 'cancelled', responseAt: 0, updatedAt: Date.now() }
    addChatEvent(thread, 'me', '我取消了这次自提预约。')
    return thread.pickup
  })
}

function chatState() {
  const db = read()
  if (!db.user || !db.user.verified) return []
  const now = Date.now()
  let changed = false
  const threads = db.threads.filter(thread => roleForThread(db, thread))
  threads.forEach(thread => {
    if (settlePickupResponse(db, thread, now)) changed = true
    if (settleChatReplies(db, thread, now)) changed = true
  })
  if (changed) wx.setStorageSync(key, db)
  return threads.sort((a, b) => b.updatedAt - a.updatedAt).map(thread => threadView(db, thread))
}

function settleChatReplies(db, thread, now) {
  const due = (thread.replies || []).filter(message => message.createdAt <= now)
  if (!due.length) return false
  thread.replies = thread.replies.filter(message => message.createdAt > now)
  const product = productOf(db, thread.productId)
  const replies = due.map(({ offer, ...message }) => {
    if (offer) {
      if (product && product.status === 'active' && product.price === offer.basePrice) thread.deal = offer
      else message.text = '商品状态或价格有变动，请以订单金额为准。'
    }
    return message
  })
  thread.messages = thread.messages.concat(replies).sort((a, b) => a.createdAt - b.createdAt)
  thread.updatedAt = thread.messages[thread.messages.length - 1].createdAt
  thread.unread += due.length
  return true
}
function getThreads(role) { return chatState().filter(thread => !role || role === thread.role) }
function getThread(value) { return chatState().find(thread => thread.id === value) }
function openThread(sellerId, productId) {
  return update(db => ensureThread(db, sellerId, productId))
}
function pushChat(thread, message, reply, offer, from = 'seller') {
  thread.messages.push(message)
  if (!thread.replies) thread.replies = []
  thread.replies.push({ id: id('msg-'), from, text: reply, offer, createdAt: message.createdAt + 750 })
  thread.updatedAt = message.createdAt
  return message
}
function sendChat(value, text) {
  const content = String(text || '').trim()
  if (!content || content.length > 500) throw new Error('请输入 1 至 500 字的消息')
  return update(db => {
    userOf(db)
    const thread = threadOf(db, value)
    const product = productOf(db, thread.productId)
    const now = Date.now()
    const message = { id: id('msg-'), from: 'me', text: content, createdAt: now }
    const order = orderForThread(db, thread)
    if (roleForThread(db, thread) === 'seller') {
      return pushChat(thread, message, buyerChatReply(product, thread, order, content), undefined, 'buyer')
    }
    const amount = /(?:¥|￥)\s*(\d+(?:\.\d{1,2})?)|(\d+(?:\.\d{1,2})?)\s*(?:元|块钱|块)/.exec(content)
    if (!order && product && product.bargain && product.status === 'active' && amount &&
      !/多少钱|原价|已经|之前/.test(content) && /能|行吗|成吗|可以|预算|出|最低|还价/.test(content)) {
      const price = Number(amount[1] || amount[2])
      if (price < Math.ceil(product.price * 90) / 100) {
        return pushChat(thread, message, '谢谢出价，这个价格有点低。你可以再报个价，或者按标价 ¥' + product.price + ' 下单。')
      }
      if (price < product.price) {
        return pushChat(thread, message, '可以，¥' + price + ' 成交。这个价格已为当前会话保留，点下单时会带过去。',
          { basePrice: product.price, price })
      }
    }
    const reply = sellerChatReply(product, thread, order, content)
    return pushChat(thread, message, reply)
  })
}

function buyerChatReply(product, thread, order, text) {
  if (order && order.status === 'completed') return '谢谢，物品我已经收到了。'
  if (order && order.status === 'aftersale') return '好的，我会在订单里留意售后进展。'
  if (order && order.handoffAt) return '收到，我验一下物品，没问题就确认收货。'
  if (!product || (product.status !== 'active' && !order)) return '明白了，谢谢告诉我。'
  const pickup = order && order.pickup || thread.pickup
  if (/成色|实物|质量|照片|配件|试|划痕|稳|底座/.test(text)) return '了解了，谢谢。见面时我想再看看实物。'
  if (/自提|见面|改约|地址|哪里|方便|时间/.test(text) || order) {
    return pickup && pickup.status === 'confirmed' ? '好，按预约的时间地点见。'
      : '好，我们在预约里把时间和地点定下来吧。'
  }
  return '收到，我还想了解一下成色和取货时间。'
}

function sellerChatReply(product, thread, order, text) {
  if (order && order.status === 'completed') return '谢谢，这单已经完成。希望这件闲置用得顺手！'
  if (order && order.status === 'aftersale') return '售后申请已经交给平台了，处理进度可以在订单里查看。'
  if (!product || (product.status !== 'active' && !order)) return '这件闲置已经结束交易或下架啦，谢谢你来问～'
  if (order && order.handoffAt) return '东西已经当面交给你了，验收后可以在订单里确认收货。'
  const pickup = order && order.pickup || thread.pickup
  if (/^(好[的呀]?|谢谢|收到|行)[！!。]*$/.test(text)) return '好，临时有变动也可以在这里说一声。'
  if (/便宜|议价|少点|最低|还价|包邮|多少钱/.test(text)) {
    if (order) return '订单已经按 ¥' + order.product.price + ' 提交，可以去订单页查看。'
    return product.bargain ? '标价是 ¥' + product.price + '。可以发一个包含金额的报价，商量好后会同步到订单。'
      : '谢谢喜欢，这件按标价 ¥' + product.price + ' 出，见面时可以先检查。'
  }
  if (/成色|实物|质量|照片|崭新|瑕疵|缺页|好用|配件|试|划痕/.test(text)) {
    return '商品成色是「' + product.condition + '」。' + product.description + ' 想细看哪一处可以告诉我。'
  }
  if (/改约|换.{0,6}时间|迟到|赶不上|来不了|取消/.test(text)) {
    return '没问题。点「预约自提」发新的地点和时间，两边确认后再按新预约碰面。'
  }
  if (/自提|见面|在哪|地址|哪里|几点|方便|时间/.test(text) || order) {
    return pickup && pickup.status === 'confirmed' ? '我们已经约好 ' + pickupSummary(pickup) + '。到时先当面验货。'
      : '收到～可以在' + product.location + '见。用「预约自提」选个你方便的时间吧。'
  }
  return '还在。你可以先问成色和配件，方便的话我们也可以约个校内地点当面看。'
}
function readThread(value) {
  if (!getThread(value)) return
  update(db => { threadOf(db, value).unread = 0 })
}
function getNotices() { const db = read(); return db.notices.filter(item => db.user || item.type === 'system') }
function readNotice(value) { update(db => { const item = db.notices.find(n => n.id === value); if (item) item.read = true }) }

function getAssistant() { return read().assistant }
function setAssistant(messages) { update(db => { db.assistant = messages.slice(-60) }) }
function getWants() {
  const db = read()
  return db.user ? db.wants.filter(want => want.ownerId === db.user.id) : []
}
function addWant(input) {
  const { getCategory, matchProducts, conditions } = require('./catalog')
  return update(db => {
    const user = userOf(db)
    const title = String(input.title || '').trim()
    const budget = Number(input.budget)
    const category = getCategory(input.category)
    if (!title || !category || !conditions.includes(input.condition)) throw new Error('请填写求购物品、分类和成色')
    if (input.budget === '' || input.budget == null || !Number.isFinite(budget) || budget < 0 || budget > 99999) throw new Error('请输入有效预算')
    const campus = getCampus(input.campusId)
    const matches = matchProducts(title, { category: category.id, maxPrice: budget, condition: input.condition, campus: campus && campus.id })
      .filter(product => product.sellerId !== user.id)
    const want = {
      id: id('want-'), title, category: category.id, budget, condition: input.condition, campusId: campus ? campus.id : '',
      notes: String(input.notes || '').trim(), matchIds: matches.map(product => product.id),
      ownerId: user.id, createdAt: Date.now()
    }
    db.wants.unshift(want)
    const recipients = [...new Set(matches.map(product => product.sellerId))]
    recipients.forEach(recipientId => db.sellerNotices.unshift({
      id: id('match-'), recipientId, wantId: want.id, title: '有人求购' + title,
      text: '你的闲置与这条求购匹配。', createdAt: Date.now(), mock: true
    }))
    if (recipients.length) notice(db, 'system', '棠小助找到了匹配', '求购已匹配 ' + matches.length + ' 件闲置，已模拟通知 ' + recipients.length + ' 位卖家。', '/pages/wants/index?mode=mine')
    return want
  })
}
function removeWant(value) {
  update(db => {
    const user = userOf(db)
    db.wants = db.wants.filter(want => !(want.id === value && want.ownerId === user.id))
  })
}

module.exports = {
  init, getUser, signIn, signOut, reset, getSeller, getProduct, getProducts, rememberProduct, latestProductId,
  saveProduct, saveProducts, setProductStatus, favoriteIds, toggleFavorite, getOrders, getOrder, getCheckoutPrice, placeOrder,
  markOrderHandoff, confirmOrder, simulateBuyerReceipt, openAfterSale, reviewAfterSale, rateOrder,
  getThreads, getThread, getThreadForProduct, getOrderForThread, openThread, sendChat,
  proposePickup, respondPickup, cancelPickup,
  readThread, getNotices, readNotice, getAssistant, setAssistant, getWants, addWant, removeWant
}
