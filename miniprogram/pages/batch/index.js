const { getUser, saveProducts } = require('../../utils/store')
const { requireAuth, go, toast } = require('../../utils/nav')
const { conditions, identify, sampleImages, legacySampleImages } = require('../../utils/catalog')
const { selectImages, readBatch, writeBatch, availableSamples } = require('../publish/media')
const { getCampus, getDiscoveryCampus, pickupOptions, resolvePickupCampus, validatedPickup } = require('../../utils/campus')

const route = '/pages/batch/index'
const maxDrafts = 18
const aiKeys = ['title', 'category', 'condition', 'price', 'description', 'location', 'time', 'bargain', 'course', 'grade']
const allSamples = [...sampleImages, ...legacySampleImages]

Page({
  data: {
    drafts: [],
    conditionOptions: ['保持原成色', ...conditions],
    conditionIndex: 0,
    pickupSites: [],
    pickupIndex: 0,
    settings: { condition: '', low: '', high: '', location: '' },
    busy: false,
    choosingPhotos: false,
    submitting: false,
    sampleCount: 0,
    hint: '',
    verified: false
  },

  onShow() {
    const user = getUser()
    const verified = Boolean(user && user.verified)
    if (!verified) {
      this.setData({ verified, drafts: [] })
      return
    }
    this.batchCampus = getCampus(getDiscoveryCampus()) || getCampus(user.campusId) || getCampus('beiyang')
    const drafts = readBatch().map(draft => {
      const campus = getCampus(draft.campusId) || resolvePickupCampus(draft.location) || this.batchCampus
      const pickup = validatedPickup(draft.location, campus.id)
      return { ...draft, campusId: campus.id, location: pickup && pickup.campus.id === campus.id ? pickup.location : '' }
    })
    this.sampleUserId = user.id
    this.updateDrafts(drafts)
    const pickupSites = ['保留各草稿自提点', ...pickupOptions(this.batchCampus.id)]
    const pickupIndex = Math.max(0, pickupSites.indexOf(this.data.settings.location))
    this.setData({ verified, pickupSites, pickupIndex, 'settings.location': pickupIndex ? pickupSites[pickupIndex] : '' })
  },

  authenticate() { requireAuth(route) },

  onUnload() {
    clearTimeout(this.batchTimer)
    if (this.data.busy) wx.hideLoading()
  },

  updateDrafts(drafts) {
    writeBatch(drafts)
    this.setData({ drafts, sampleCount: this.availableSamples(drafts).length })
  },

  availableSamples(drafts) {
    return availableSamples(sampleImages, this.sampleUserId, drafts).slice(0, maxDrafts - drafts.length)
  },

  async upload() {
    if (this.data.choosingPhotos || this.data.busy || this.data.submitting || !requireAuth(route)) return
    const room = maxDrafts - this.data.drafts.length
    if (room <= 0) return toast('请先处理已有草稿')
    this.setData({ choosingPhotos: true })
    try {
      const paths = await selectImages(Math.min(room, 9))
      this.generate(paths)
    } catch (error) {
      if (!/cancel/i.test(error.errMsg || '')) toast('图片保存失败，请重试')
    } finally {
      this.setData({ choosingPhotos: false })
    }
  },

  samples() {
    if (this.data.choosingPhotos || this.data.busy || this.data.submitting || !requireAuth(route)) return
    const available = this.availableSamples(readBatch())
    if (!available.length) return
    this.generate(available)
  },

  generate(paths) {
    const existing = new Set(readBatch().flatMap(draft => draft.images))
    const newPaths = [...new Set(paths)].filter(path => !existing.has(path))
    if (!newPaths.length) return toast('这些照片已有草稿')
    this.setData({ busy: true, hint: '' })
    wx.showLoading({ title: '棠小助整理中', mask: true })
    this.batchTimer = setTimeout(() => {
      let result
      try {
        const saved = readBatch()
        const batchKey = Date.now()
        const drafts = newPaths.map((image, index) => {
          const generated = identify([image], this.batchCampus.id)
          const aiFields = {}
          aiKeys.forEach(field => { if (generated[field] !== undefined && generated[field] !== '') aiFields[field] = true })
          return { ...generated, images: [image], draftId: `${batchKey}-${index}`, aiFields }
        })
        this.updateDrafts(saved.concat(drafts))
        const hint = drafts.every(draft => draft.title)
          ? `已生成 ${drafts.length} 条草稿，可逐条编辑`
          : `已填入 ${drafts.length} 条描述模板，请补充品名和价格`
        this.setData({ hint })
        result = `已生成 ${drafts.length} 条草稿`
      } catch (error) {
        result = error.message || '识别失败，请重试'
      } finally {
        wx.hideLoading()
        this.setData({ busy: false })
      }
      toast(result)
    }, 800)
  },

  changeSetting(event) {
    const field = event.currentTarget.dataset.field
    this.setData({ [`settings.${field}`]: event.detail.value })
  },

  chooseCondition(event) {
    const conditionIndex = Number(event.detail.value)
    this.setData({ conditionIndex, 'settings.condition': conditions[conditionIndex - 1] || '' })
  },

  choosePickup(event) {
    const pickupIndex = Number(event.detail.value)
    this.setData({ pickupIndex, 'settings.location': pickupIndex ? this.data.pickupSites[pickupIndex] : '' })
  },

  // Keep draft prices inside the selected interval without replacing in-range prices.
  applySettings() {
    if (this.data.choosingPhotos || this.data.busy || this.data.submitting || !requireAuth(route)) return
    const { drafts, settings } = this.data
    if (!drafts.length) return toast('先添加商品照片')
    const location = settings.location.trim()
    if (location && drafts.some(draft => draft.campusId !== this.batchCampus.id)) return toast('草稿来自不同校区，请逐条选择自提点')
    if (!settings.condition && !location && settings.low === '' && settings.high === '') return toast('请至少填写一项全局设置')
    const low = settings.low === '' ? null : Number(settings.low)
    const high = settings.high === '' ? null : Number(settings.high)
    if ((low !== null && (!Number.isFinite(low) || low < 0 || low > 99999)) || (high !== null && (!Number.isFinite(high) || high < 0 || high > 99999)) || (low !== null && high !== null && low > high)) return toast('请填写有效的价格区间')
    const updated = drafts.map(draft => {
      const changed = { ...draft, aiFields: { ...draft.aiFields } }
      if (settings.condition) {
        changed.condition = settings.condition
        changed.aiFields.condition = false
      }
      if (location) {
        changed.location = location
        changed.aiFields.location = false
      }
      if (low !== null || high !== null) {
        const hasPrice = changed.price !== '' && Number.isFinite(Number(changed.price))
        const price = hasPrice ? Number(changed.price) : (low ?? high)
        const adjusted = Math.max(low === null ? 0 : low, Math.min(high === null ? Infinity : high, price))
        if (adjusted !== price || !hasPrice) {
          changed.price = adjusted
          changed.aiFields.price = false
        }
      }
      return changed
    })
    this.updateDrafts(updated)
    toast(`已应用到 ${updated.length} 条草稿`)
  },

  editDraft(event) {
    const url = `/pages/publish/index?draft=${encodeURIComponent(event.currentTarget.dataset.id)}`
    if (!this.data.choosingPhotos && !this.data.busy && !this.data.submitting && requireAuth(url)) go(url)
  },

  removeDraft(event) {
    if (this.data.choosingPhotos || this.data.busy || this.data.submitting || !requireAuth(route)) return
    const id = event.currentTarget.dataset.id
    wx.showModal({
      title: '删除这条草稿',
      content: '草稿中的编辑内容也会删除。',
      confirmText: '删除',
      confirmColor: '#B8336A',
      success: ({ confirm }) => {
        if (!confirm) return
        this.updateDrafts(readBatch().filter(draft => draft.draftId !== id))
        toast('草稿已删除')
      }
    })
  },

  showDraftIssue(draft, title, content) {
    wx.showModal({
      title,
      content,
      confirmText: '去编辑',
      success: ({ confirm }) => {
        if (confirm) go(`/pages/publish/index?draft=${encodeURIComponent(draft.draftId)}`)
      }
    })
  },

  submit() {
    if (this.data.choosingPhotos || this.data.busy || this.data.submitting || !requireAuth(route)) return
    const drafts = readBatch()
    if (!drafts.length) return toast('先添加商品照片')
    const incomplete = drafts.findIndex(draft => {
      const price = Number(draft.price)
      const pickup = validatedPickup(draft.location, draft.campusId)
      return !draft.images.length || !draft.title.trim() || !draft.category || !draft.condition ||
        draft.price === '' || !Number.isFinite(price) || price < 0 || price > 99999 ||
        !draft.description.trim() || !draft.time.trim() || !pickup || pickup.campus.id !== draft.campusId
    })
    if (incomplete !== -1) return this.showDraftIssue(
      drafts[incomplete], `请补全第 ${incomplete + 1} 条草稿`, '请核对商品信息，并选择该校区的自提点。'
    )
    const turnAvailable = new Set(availableSamples(allSamples, this.sampleUserId, []))
    const duplicate = drafts.findIndex(draft => {
      const samples = draft.images.filter(path => allSamples.includes(path))
      if (samples.some(path => !turnAvailable.has(path))) return true
      samples.forEach(path => turnAvailable.delete(path))
      return false
    })
    if (duplicate !== -1) return this.showDraftIssue(
      drafts[duplicate], `第 ${duplicate + 1} 条草稿的样图重复`, '这张样图已用于另一条草稿或在售商品，请更换照片。'
    )
    this.setData({ submitting: true })
    wx.showModal({
      title: `发布 ${drafts.length} 件闲置`,
      content: '发布后同窗就能看到商品。请先确认草稿内容与实物一致。',
      confirmText: '全部发布',
      success: ({ confirm }) => {
        if (!confirm) {
          this.setData({ submitting: false })
          return
        }
        try {
          // The store validates and saves the whole batch in one write.
          const products = drafts.map(({ aiFields, ...form }) => ({
            ...form,
            price: Number(form.price),
            title: form.title.trim(),
            description: form.description.trim(),
            location: form.location.trim(),
            time: form.time.trim()
          }))
          saveProducts(products)
          this.updateDrafts([])
          toast(`成功发布 ${drafts.length} 件闲置`)
          wx.redirectTo({ url: '/pages/listings/index' })
        } catch (error) {
          toast(error.message || '发布失败，请重试')
        } finally {
          this.setData({ submitting: false })
        }
      },
      fail: () => this.setData({ submitting: false })
    })
  }
})
