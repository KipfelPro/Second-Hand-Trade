const { getUser } = require('../../utils/store')
const { categories, matchProducts } = require('../../utils/catalog')
const { go, requireAuth, takeTabQuery } = require('../../utils/nav')
const { getDiscoveryCampus, getCampus } = require('../../utils/campus')

const scopes = [
  { id: 'all', label: '全校' },
  { id: 'weijin', label: '卫津路校区' },
  { id: 'beiyang', label: '北洋园校区' },
  { id: 'college', label: '同学院' }
]
const sorts = [
  { label: '综合排序', id: 'recommended' },
  { label: '价格从低到高', id: 'priceAsc' },
  { label: '价格从高到低', id: 'priceDesc' },
  { label: '最新发布', id: 'newest' }
]
const allCategories = [{ id: 'all', name: '全部商品' }, ...categories]
const pageSize = 12

Page({
  data: {
    scopes,
    scope: 'all',
    categories: allCategories,
    categoryIndex: 0,
    sorts,
    sortIndex: 0,
    query: '',
    submittedQuery: '',
    verified: false,
    products: [],
    resultCount: 0,
    hasMore: false
  },

  onLoad(options) {
    this.initialQuery = options
  },

  onShow() {
    const incoming = { ...this.initialQuery, ...takeTabQuery('browse') }
    this.initialQuery = null
    const preference = getDiscoveryCampus()
    const requestedCampus = getCampus(incoming.campus)
    const linkedScope = scopes.find(scope => scope.id === incoming.scope)
    const user = getUser()
    const settings = { verified: Boolean(user && user.verified) }
    if (linkedScope) settings.scope = linkedScope.id
    else if (requestedCampus || incoming.campus === 'all') settings.scope = requestedCampus ? requestedCampus.id : 'all'
    else if (this.lastPreference !== preference) settings.scope = preference
    this.lastPreference = preference

    if (incoming.category || Object.prototype.hasOwnProperty.call(incoming, 'q')) {
      settings.categoryIndex = Math.max(0, allCategories.findIndex(category => category.id === incoming.category))
      settings.sortIndex = 0
      settings.query = settings.submittedQuery = incoming.q || ''
    }
    this.setData(settings)
    this.loadResults()
  },

  onPullDownRefresh() {
    this.loadResults()
    wx.stopPullDownRefresh()
  },

  onReachBottom() {
    if (!this.data.hasMore) return
    this.visibleCount += pageSize
    this.showResults()
  },

  chooseScope(event) {
    const { id } = event.currentTarget.dataset
    if (!scopes.some(scope => scope.id === id)) return
    this.setData({ scope: id })
    this.loadResults()
  },

  authenticate() {
    const { categoryIndex, submittedQuery } = this.data
    requireAuth(`/pages/browse/index?scope=college&category=${allCategories[categoryIndex].id}&q=${encodeURIComponent(submittedQuery)}`)
  },

  inputQuery(event) {
    this.setData({ query: event.detail.value })
  },

  submitQuery() {
    const query = this.data.query.trim()
    this.setData({ query, submittedQuery: query })
    this.loadResults()
  },

  clearQuery() {
    this.setData({ query: '', submittedQuery: '' })
    this.loadResults()
  },

  chooseCategory(event) {
    const categoryIndex = Number(event.detail.value)
    if (!allCategories[categoryIndex]) return
    this.setData({ categoryIndex })
    this.loadResults()
  },

  changeSort(event) {
    const sortIndex = Number(event.detail.value)
    if (!sorts[sortIndex]) return
    this.setData({ sortIndex })
    this.loadResults()
  },

  showAll() {
    this.setData({ query: '', submittedQuery: '', categoryIndex: 0, sortIndex: 0 })
    this.loadResults()
  },

  loadResults() {
    const { scope, verified, categoryIndex, submittedQuery, sortIndex } = this.data
    const sameCollege = scope === 'college'
    const campus = getCampus(scope)
    this.visibleCount = pageSize
    this.matches = sameCollege && !verified ? [] : matchProducts(submittedQuery, {
      category: allCategories[categoryIndex].id,
      campus: campus ? campus.id : 'all',
      sort: sorts[sortIndex].id,
      scope: sameCollege ? 'college' : 'all'
    })
    this.showResults()
  },

  showResults() {
    this.setData({
      products: this.matches.slice(0, this.visibleCount),
      resultCount: this.matches.length,
      hasMore: this.matches.length > this.visibleCount
    })
  },

  openWant() {
    const campus = getCampus(this.data.scope)
    go(`/pages/wants/index?q=${encodeURIComponent(this.data.submittedQuery)}&campus=${campus ? campus.id : 'all'}`)
  }
})
