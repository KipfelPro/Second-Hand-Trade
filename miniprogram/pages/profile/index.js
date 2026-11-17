const store = require('../../utils/store')
const { creditLevel } = require('../../utils/catalog')
const { go, requireAuth } = require('../../utils/nav')

const menu = [
  { title: '我的发布', icon: 'box', path: '/pages/listings/index' },
  { title: '我的订单', icon: 'receipt', path: '/pages/orders/index' },
  { title: '我的求购', icon: 'clipboard', path: '/pages/wants/index?mode=mine' },
  { title: '收藏夹', icon: 'heart', path: '/pages/favorites/index' },
  { title: '设置', icon: 'settings', path: '/pages/settings/index', guestAllowed: true }
]

Page({
  data: { user: null, menu, level: '', counts: [] },
  onShow() {
    const user = store.getUser()
    const counts = user ? [
      store.getProducts().filter(product => product.sellerId === user.id).length,
      store.getOrders().length,
      store.getWants().length,
      store.favoriteIds().length
    ] : []
    this.setData({ user, counts, level: user ? creditLevel(user.credit) : '' })
  },
  verify() { requireAuth('/pages/profile/index') },
  open(event) {
    const item = this.data.menu[Number(event.currentTarget.dataset.index)]
    if (item && (item.guestAllowed || requireAuth(item.path))) go(item.path)
  },
  publish() {
    const path = '/pages/publish/index'
    if (requireAuth(path)) go(path)
  }
})
