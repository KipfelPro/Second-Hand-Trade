const { dateValue } = require('../utils/pickup')
const { pickupOptions } = require('../utils/campus')

function addSellerInbox(db, seller, now = Date.now()) {
  const base = {
    sellerId: seller.id, campus: seller.campus, campusId: seller.campusId, condition: '轻微使用',
    category: 'life', time: '工作日 18:00–21:00', course: '', grade: '', tags: [], bargain: false
  }
  const [library, pickupSite] = pickupOptions(seller.campusId).slice(1, 3)
  const enquiry = {
    ...base, id: 'p-seller-stand', title: '可折叠桌面手机支架', price: 12, status: 'active',
    images: ['/images/stock/phone-stand.jpg'], location: library,
    description: '可调角度，底部防滑，适合宿舍桌面。', createdAt: now - 18 * 3600000
  }
  const sale = {
    ...base, id: 'p-seller-lamp', title: '暖光夹式阅读灯', price: 18, status: 'sold',
    images: ['/images/stock/clip-lamp.jpg'], location: pickupSite,
    description: '夹口有软垫，灯头和亮度都可调，附充电线。', createdAt: now - 36 * 3600000
  }
  const nextDay = new Date(now)
  nextDay.setDate(nextDay.getDate() + 1)
  const date = dateValue(nextDay)
  const pickup = {
    id: 'pickup-seller-demo', location: pickupSite, date, time: '18:30',
    status: 'proposed', responseAt: 0, updatedAt: now - 12 * 60000
  }
  const chat = (id, buyerId, productId, entries) => ({
    id, buyerId, productId, sellerId: seller.id, unread: 1, updatedAt: entries[entries.length - 1][2],
    messages: entries.map(([from, text, createdAt], index) => ({ id: id + '-' + index, from, text, createdAt }))
  })
  const open = chat('thread-selling-enquiry', 'zhou', enquiry.id, [
    ['buyer', '你好，手机支架还在吗？底座放在桌面上稳不稳？', now - 25 * 60000]
  ])
  const pending = {
    ...chat('thread-selling-order', 'chen', sale.id, [
      ['system', '买家已下单，款项已模拟托管。', now - 15 * 60000],
      ['buyer', '我已下单，' + date + ' 18:30 在' + pickupSite + '取，方便吗？', pickup.updatedAt]
    ]),
    pickup
  }
  db.products.push(enquiry, sale)
  db.threads.push(open, pending)
  db.orders.push({
    id: 'TJSELLDEMO01', productId: sale.id, product: { ...sale }, buyerId: pending.buyerId,
    sellerId: seller.id, threadId: pending.id, status: 'pending', pickup: null, handoffAt: 0,
    createdAt: now - 15 * 60000, completedAt: 0, afterSale: null, rating: null
  })
}

module.exports = { addSellerInbox }
