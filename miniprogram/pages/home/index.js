const store = require('../../utils/store')
const catalog = require('../../utils/catalog')
const { go, takeTabQuery } = require('../../utils/nav')
const { campuses, getCampus, getDiscoveryCampus, setDiscoveryCampus } = require('../../utils/campus')

const filters = [
  { label: '为你推荐', sort: 'recommended', scope: 'all' },
  { label: '同院', sort: 'distance', scope: 'college' },
  { label: '同楼', sort: 'distance', scope: 'dorm' },
  { label: '最新发布', sort: 'newest', scope: 'all' }
]
const guestFilters = filters.filter(filter => filter.scope === 'all')
const pageSize = 8
const overviewSize = 4

function waterfall(products) {
  const columns = [{ id: 'left', items: [] }, { id: 'right', items: [] }]
  products.forEach((product, index) => {
    const layout = index % 4 === 0 || index % 4 === 3 ? 'tall' : 'grid'
    columns[index % 2].items.push({ id: product.id, product, layout })
  })
  return columns
}

Page({
  data: {
    query: '',
    shortcuts: [...catalog.categories, { id: 'wants', name: '发布求购', icon: 'clipboard' }],
    filters: guestFilters,
    activeFilter: 0,
    verified: false,
    userCampus: '',
    campusId: 'all',
    campusTitle: '全部校区',
    campusIndex: 0,
    reducedMotion: false,
    heroIndex: 0,
    visible: false,
    heroSlides: [
      { title: '闲置好物', subtitle: '就在你身边', label: '棠小助帮你找', action: '找校园闲置', icon: 'sparkles', intent: 'find', image: '/images/home-hero-campus.jpg' },
      { title: '教材换一届', subtitle: '知识接着用', label: '校园教材专区', action: '去逛教材', icon: 'book', intent: 'books', image: '/images/books.jpg' },
      { title: '给闲置找个', subtitle: '新的主人', label: '发布闲置', action: '发布一件闲置', icon: 'camera', intent: 'publish', image: '/images/stock/backpack.jpg' }
    ],
    campusOptions: [{ id: 'all', name: '全部校区' }, ...campuses.map(({ id, name }) => ({ id, name }))],
    sections: [],
    hasMore: false,
    hasUnread: false,
    petHint: ''
  },

  onShow() {
    takeTabQuery('home')
    const user = store.getUser()
    const verified = Boolean(user && user.verified)
    const available = verified ? filters : guestFilters
    const current = this.data.filters[this.data.activeFilter]
    const activeFilter = Math.max(0, available.findIndex(filter => filter.label === current.label))
    this.setData({
      filters: available, activeFilter, verified, userCampus: verified ? user.campusId : '', visible: true,
      reducedMotion: Boolean(wx.getStorageSync('tcj:reduce-motion'))
    })
    const preferredCampus = getDiscoveryCampus()
    if (preferredCampus !== this.data.campusId) this.setCampus(preferredCampus)
    const threads = store.getThreads()
    const notices = store.getNotices()
    this.setData({ hasUnread: [...threads, ...notices].some(item => Boolean(item.unread || item.read === false)) })
    this.loadFeed()
    if (!this._greeted) {
      this._greetingTimer = setTimeout(() => {
        this._greeted = true
        this.setData({ petHint: '有想找的闲置吗？跟我说就行～' })
      }, 3000)
    }
  },

  onHide() {
    clearTimeout(this._greetingTimer)
    this.setData({ petHint: '', visible: false })
  },

  onUnload() {
    clearTimeout(this._greetingTimer)
  },

  onPullDownRefresh() {
    this.loadFeed()
    wx.stopPullDownRefresh()
  },

  onReachBottom() {
    if (!this.data.hasMore) return
    this._visibleCount += pageSize
    this.loadFeed(false)
  },

  loadFeed(reset = true) {
    const all = this.data.campusId === 'all'
    const activeCampus = all ? null : getCampus(this.data.campusId)
    if (reset) {
      this._visibleCount = pageSize
      const { sort, scope } = this.data.filters[this.data.activeFilter]
      this._matches = catalog.matchProducts('', { sort, scope, campus: this.data.campusId })
      this.setData({ campusTitle: activeCampus ? activeCampus.name : '全部校区' })
    }
    const markets = all ? campuses.slice().sort((a, b) =>
      Number(b.id === this.data.userCampus) - Number(a.id === this.data.userCampus)) : [activeCampus]
    const sections = markets.map(campus => {
      const products = this._matches.filter(product => product.campusId === campus.id)
      const preview = products.slice(0, all ? overviewSize : this._visibleCount)
      return { id: campus.id, name: campus.name, count: products.length, columns: waterfall(preview) }
    })
    this.setData({ sections, hasMore: !all && sections[0].count > this._visibleCount })
  },

  setCampus(value) {
    const campus = value === 'all' ? null : getCampus(value)
    const campusId = campus ? campus.id : 'all'
    this.setData({ campusId, campusIndex: this.data.campusOptions.findIndex(option => option.id === campusId), activeFilter: 0 })
  },

  updateHero(event) {
    const { current } = event.detail
    if (current !== this.data.heroIndex) this.setData({ heroIndex: current })
  },
  chooseHero(event) {
    this.setData({ heroIndex: Number(event.currentTarget.dataset.index) })
  },
  openHero(event) {
    const intent = event.currentTarget.dataset.intent
    if (intent === 'publish') this.openPublish()
    else if (intent === 'books') go('/pages/browse/index?category=books&campus=' + this.data.campusId)
    else this.openAssistant()
  },

  selectCampus(e) {
    const { id } = e.currentTarget.dataset
    if (id === this.data.campusId) return
    setDiscoveryCampus(id)
    this.setCampus(id)
    this.loadFeed()
  },

  openCampus(e) {
    go(`/pages/browse/index?category=all&campus=${e.currentTarget.dataset.id}`)
  },

  onQueryInput(e) {
    this.setData({ query: e.detail.value })
  },

  search() {
    const query = this.data.query.trim()
    go(`/pages/browse/index?q=${encodeURIComponent(query)}&campus=${this.data.campusId}`)
  },

  openMessages() {
    go('/pages/messages/index' + (this.data.verified ? '' : '?section=system'))
  },

  openAssistant() {
    go(`/pages/assistant/index?mode=find&campus=${this.data.campusId}`)
  },

  chooseCategory(e) {
    const { id } = e.currentTarget.dataset
    if (id === 'wants') {
      go('/pages/wants/index?campus=' + this.data.campusId)
      return
    }
    go(`/pages/browse/index?category=${id}&campus=${this.data.campusId}`)
  },

  chooseFilter(e) {
    const index = Number(e.currentTarget.dataset.index)
    if (!this.data.filters[index]) return
    this.setData({ activeFilter: index })
    this.loadFeed()
  },

  openBrowse() {
    go(`/pages/browse/index?category=all&campus=${this.data.campusId}`)
  },

  openPublish() {
    go('/pages/publish/index')
  }
})
