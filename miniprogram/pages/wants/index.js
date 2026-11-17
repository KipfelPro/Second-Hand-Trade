const { getUser, getWants, getProduct, addWant, removeWant } = require('../../utils/store')
const { requireAuth, toast } = require('../../utils/nav')
const { categories, conditions, getCategory, formatDate, parseWant } = require('../../utils/catalog')
const { toggleVoice, cancelVoice } = require('../publish/media')
const { getCampus, getDiscoveryCampus } = require('../../utils/campus')

const route = '/pages/wants/index'
const emptyForm = { title: '', category: '', budget: '', condition: '', notes: '', campusId: '' }

Page({
  data: {
    categoryOptions: [{ id: '', name: '请选择分类' }, ...categories],
    campusName: '两个校区',
    conditionOptions: ['请选择成色', ...conditions],
    categoryIndex: 0,
    conditionIndex: 0,
    categoryName: '',
    form: emptyForm,
    query: '',
    hint: '',
    verified: false,
    recording: false,
    mode: 'new',
    wants: [],
    expandedId: '',
    matches: []
  },

  onLoad(options) {
    if (options.mode === 'mine') this.setData({ mode: 'mine' })
    const campus = getCampus(options.campus || getDiscoveryCampus())
    if (campus) this.setData({ campusName: campus.name, 'form.campusId': campus.id })
    if (options.q) {
      let query = options.q
      try { query = decodeURIComponent(query) } catch (error) { /* Keep literal percent signs. */ }
      this.setData({ query })
      this.applyQuery(query)
    }
  },

  onShow() {
    this.refresh()
    wx.setNavigationBarTitle({ title: this.data.mode === 'mine' ? '我的求购' : '发布求购' })
  },

  onHide() { cancelVoice(this) },
  onUnload() { cancelVoice(this) },

  refresh() {
    const user = getUser()
    const wants = getWants().map(want => ({
      ...want,
      date: formatDate(want.createdAt),
      categoryName: (getCategory(want.category) || {}).name,
      campusName: (getCampus(want.campusId) || {}).name || '两个校区',
      matches: (want.matchIds || []).map(getProduct).filter(product => product && product.status === 'active')
    }))
    const expanded = wants.find(want => want.id === this.data.expandedId)
    this.setData({ verified: Boolean(user && user.verified), wants, matches: expanded ? expanded.matches : [] })
  },

  authUrl() {
    if (this.data.mode === 'mine') return `${route}?mode=mine`
    const query = this.data.query.trim()
    const fields = []
    if (query) fields.push('q=' + encodeURIComponent(query))
    if (this.data.form.campusId) fields.push('campus=' + this.data.form.campusId)
    return fields.length ? route + '?' + fields.join('&') : route
  },

  authenticate() {
    requireAuth(this.authUrl())
  },

  switchMode(event) {
    cancelVoice(this)
    const mode = event.currentTarget.dataset.mode
    this.setData({ mode })
    if (mode === 'mine') this.refresh()
    wx.setNavigationBarTitle({ title: mode === 'mine' ? '我的求购' : '发布求购' })
  },

  enterQuery(event) {
    this.setData({ query: event.detail.value })
  },

  enterField(event) {
    this.setData({ [`form.${event.currentTarget.dataset.field}`]: event.detail.value })
  },

  chooseCategory(event) {
    const categoryIndex = Number(event.detail.value)
    const category = categories[categoryIndex - 1]
    this.setData({ categoryIndex, categoryName: category ? category.name : '', 'form.category': category ? category.id : '' })
  },

  chooseCondition(event) {
    const conditionIndex = Number(event.detail.value)
    this.setData({ conditionIndex, 'form.condition': conditions[conditionIndex - 1] || '' })
  },

  // Only suggestions actually found in the request replace existing form values.
  applyQuery(query) {
    const parsed = parseWant(query)
    const form = { ...this.data.form }
    if (parsed.title) form.title = parsed.title.slice(0, 42)
    if (parsed.category) form.category = parsed.category
    if (parsed.budget !== '') form.budget = parsed.budget
    if (parsed.condition) form.condition = parsed.condition
    if (parsed.campusId) form.campusId = parsed.campusId
    if (parsed.notes) form.notes = parsed.notes.slice(0, 200)
    const categoryIndex = categories.findIndex(category => category.id === form.category)
    this.setData({
      form,
      categoryIndex: categoryIndex + 1,
      campusName: (getCampus(form.campusId) || {}).name || '两个校区',
      categoryName: categoryIndex >= 0 ? categories[categoryIndex].name : '',
      conditionIndex: conditions.indexOf(form.condition) + 1,
      hint: '草稿已填入，可修改'
    })
  },

  createDraft() {
    const query = this.data.query.trim()
    if (!query) return toast('先描述你想找的闲置')
    this.applyQuery(query)
    toast('已生成求购草稿')
  },

  useVoice() {
    toggleVoice(this, '想找大一上高数教材，预算 30 元，轻微使用也可以。', text => {
      this.setData({ query: text })
      this.applyQuery(text)
      toast('已从语音生成求购草稿')
    })
  },

  submit() {
    if (this.data.mode !== 'new' || this.data.recording || !requireAuth(this.authUrl())) return
    try {
      const record = addWant(this.data.form)
      const count = record.matchIds.length
      this.setData({
        form: { ...emptyForm, campusId: this.data.form.campusId }, query: '', categoryIndex: 0, categoryName: '', conditionIndex: 0, mode: 'mine', expandedId: record.id,
        hint: count ? `已匹配 ${count} 件闲置（已模拟通知卖家）` : '求购已发布，暂无匹配'
      })
      this.refresh()
      wx.setNavigationBarTitle({ title: '我的求购' })
      toast(count ? `求购已发布，匹配 ${count} 件` : '求购已发布')
    } catch (error) {
      toast(error.message || '发布失败，请重试')
    }
  },

  toggleMatches(event) {
    const id = event.currentTarget.dataset.id
    const expandedId = this.data.expandedId === id ? '' : id
    const want = this.data.wants.find(item => item.id === expandedId)
    this.setData({ expandedId, matches: want ? want.matches : [] })
  },

  remove(event) {
    if (!requireAuth(this.authUrl())) return
    const id = event.currentTarget.dataset.id
    wx.showModal({
      title: '撤回这条求购',
      content: '撤回后，这条求购将从你的列表移除。',
      confirmText: '撤回',
      confirmColor: '#B8336A',
      success: ({ confirm }) => {
        if (!confirm) return
        try {
          removeWant(id)
          if (this.data.expandedId === id) this.setData({ expandedId: '', matches: [] })
          this.refresh()
          toast('求购已撤回')
        } catch (error) {
          toast(error.message || '撤回失败，请重试')
        }
      }
    })
  }
})
