const { getUser, getProduct, saveProduct } = require('../../utils/store')
const { requireAuth, go, toast } = require('../../utils/nav')
const { categories, conditions, getCategory, identify, sampleImages } = require('../../utils/catalog')
const { selectImages, previewImage, toggleVoice, cancelVoice, readBatch, writeBatch, availableSamples } = require('./media')
const { getCampus, getDiscoveryCampus, pickupOptions, formatPickup } = require('../../utils/campus')

const aiKeys = ['title', 'category', 'condition', 'price', 'description', 'location', 'time', 'bargain', 'course', 'grade']
const emptyForm = { images: [], title: '', category: '', condition: '', price: '', description: '', location: '', time: '', bargain: true, course: '', grade: '' }
const sampleLabels = ['数字万用表', '折叠手机支架', '夹式阅读灯']

Page({
  data: {
    form: emptyForm,
    categoryOptions: [{ id: '', name: '请选择分类' }, ...categories],
    conditionOptions: ['请选择成色', ...conditions],
    categoryIndex: 0,
    conditionIndex: 0,
    pickupSites: [],
    pickupIndex: 0,
    campusName: '',
    categoryName: '',
    suggestion: '',
    aiFields: {},
    mode: 'new',
    busy: false,
    choosingPhotos: false,
    submitting: false,
    recording: false,
    batch: false,
    missing: false,
    hint: '',
    sampleOptions: [],
    pageTitle: '发布闲置'
  },

  onLoad(options) {
    this.returnUrl = '/pages/publish/index'
    if (options.draft) {
      const id = options.draft
      this.returnUrl += `?draft=${encodeURIComponent(id)}`
      this.draftId = id
      this.setData({ mode: 'draft', pageTitle: '编辑单条草稿' })
      wx.setNavigationBarTitle({ title: '编辑草稿' })
      return
    }
    if (options.id) {
      const id = options.id
      this.returnUrl += `?id=${encodeURIComponent(id)}`
      this.productId = id
      this.setData({ mode: 'edit', pageTitle: '编辑商品' })
      wx.setNavigationBarTitle({ title: '编辑商品' })
      return
    }
    if (options.image) {
      let image = options.image
      try { image = decodeURIComponent(image) } catch (error) { /* Use the received path. */ }
      this.returnUrl += `?image=${encodeURIComponent(image)}`
      this.showForm({ images: [image] })
      this.pendingHandoff = true
    }
  },

  onShow() {
    const user = getUser()
    const verified = Boolean(user && user.verified)
    const needsAuth = this.data.mode !== 'new' && !verified
    const unused = availableSamples(sampleImages, user && user.id)
    this.setData({ needsAuth, sampleOptions: sampleImages.flatMap((path, index) =>
      unused.includes(path) ? [{ path, label: sampleLabels[index] }] : []
    ) })
    if (needsAuth) return
    if (!this.data.campusName && this.data.mode === 'new') this.showForm(this.data.form, this.data.aiFields)

    if (!this.loadedEditor && (this.draftId || this.productId)) {
      const draft = this.draftId && readBatch().find(item => item.draftId === this.draftId)
      const product = this.productId && getProduct(this.productId)
      const editable = draft || (product && product.sellerId === user.id && product.status !== 'sold' && product)
      this.setData({ missing: !editable })
      if (editable) this.showForm(editable, editable.aiFields || {})
      this.loadedEditor = true
    }
    if (this.pendingHandoff && verified) {
      this.pendingHandoff = false
      this.runRecognition()
    }
  },

  onUnload() {
    clearTimeout(this.recognitionTimer)
    if (this.data.busy) wx.hideLoading()
    cancelVoice(this)
  },

  onHide() { cancelVoice(this) },

  authenticate() { requireAuth(this.returnUrl) },

  showForm(values, aiFields = {}) {
    const form = { ...emptyForm, ...values }
    const user = getUser()
    const campus = getCampus(form.campusId) || getCampus(getDiscoveryCampus()) || getCampus(user && user.campusId) || getCampus('beiyang')
    const pickupSites = ['选择自提点', ...pickupOptions(campus.id)]
    form.campusId = campus.id
    const location = formatPickup(form.location, campus.id)
    form.location = pickupSites.includes(location) ? location : ''
    const categoryIndex = categories.findIndex(category => category.id === form.category)
    const category = categoryIndex < 0 ? null : categories[categoryIndex]
    this.setData({
      form,
      campusName: campus.name,
      pickupSites,
      pickupIndex: Math.max(0, pickupSites.indexOf(form.location)),
      categoryIndex: categoryIndex + 1,
      conditionIndex: conditions.indexOf(form.condition) + 1,
      categoryName: category ? category.name : '',
      suggestion: category ? category.suggestion : '',
      aiFields
    })
  },

  // Each field loses its AI marker only after the seller edits that field.
  setField(field, value) {
    if (aiKeys.includes(field)) this.edited = true
    this.setData({ [`form.${field}`]: value, [`aiFields.${field}`]: false })
    this.persistDraft()
  },

  persistDraft() {
    if (this.data.mode !== 'draft') return
    const { form, aiFields } = this.data
    writeBatch(readBatch().map(draft => draft.draftId === form.draftId ? { ...form, aiFields } : draft))
  },

  inputField(event) {
    this.setField(event.currentTarget.dataset.field, event.detail.value)
  },

  chooseCategory(event) {
    const categoryIndex = Number(event.detail.value)
    const category = categories[categoryIndex - 1]
    this.setData({ categoryIndex, categoryName: category ? category.name : '', suggestion: category ? category.suggestion : '' })
    this.setField('category', category ? category.id : '')
  },

  chooseCondition(event) {
    const conditionIndex = Number(event.detail.value)
    this.setData({ conditionIndex })
    this.setField('condition', conditions[conditionIndex - 1] || '')
  },

  choosePickup(event) {
    const pickupIndex = Number(event.detail.value)
    const location = this.data.pickupSites[pickupIndex]
    if (!pickupIndex || !location) return
    this.setData({ pickupIndex })
    this.setField('location', location)
  },

  toggleBargain(event) {
    this.setField('bargain', event.detail.value)
  },

  toggleBatch(event) {
    this.setData({ batch: false })
    if (event.detail.value && requireAuth('/pages/batch/index')) go('/pages/batch/index')
  },

  async addImages() {
    if (this.data.choosingPhotos || this.data.busy || this.data.submitting || !requireAuth(this.returnUrl)) return
    const room = 9 - this.data.form.images.length
    if (room <= 0) return
    this.setData({ choosingPhotos: true })
    try {
      const selected = await selectImages(room)
      const { form, mode } = this.data
      const additions = selected.filter(path => !form.images.includes(path))
      if (!additions.length) return toast('这些照片已添加')
      this.attachImages(form.images.concat(additions), !form.images.length && mode === 'new' && !this.edited && !form.title && !form.description)
    } catch (error) {
      if (!/cancel/i.test(error.errMsg || '')) toast('图片保存失败，请重试')
    } finally {
      this.setData({ choosingPhotos: false })
    }
  },

  useSample(event) {
    if (this.data.choosingPhotos || this.data.busy || this.data.form.images.length || !requireAuth(this.returnUrl)) return
    const path = event.currentTarget.dataset.path
    if (!this.data.sampleOptions.some(sample => sample.path === path)) return
    const images = [path]
    const { form, mode } = this.data
    this.attachImages(images, mode === 'new' && !this.edited && !form.title && !form.description)
  },

  attachImages(images, generate) {
    this.setField('images', images)
    if (generate) this.runRecognition()
  },

  removeImage(event) {
    this.setField('images', this.data.form.images.filter((path, index) => index !== Number(event.currentTarget.dataset.index)))
  },

  previewImage,

  recognize() {
    if (this.data.choosingPhotos || this.data.busy || !requireAuth(this.returnUrl)) return
    if (!this.data.form.images.length) return toast('先上传一张实物图')
    if (this.edited || this.data.form.title || this.data.form.description) {
      wx.showModal({
        title: '重新生成商品草稿',
        content: '样图会重新填充商品信息，其他照片会更新描述模板。原照片会保留。',
        confirmText: '重新生成',
        success: result => { if (result.confirm) this.runRecognition() }
      })
      return
    }
    this.runRecognition()
  },

  runRecognition() {
    this.setData({ busy: true, hint: '' })
    wx.showLoading({ title: '棠小助识别中', mask: true })
    this.recognitionTimer = setTimeout(() => {
      let failure
      try {
        const { form } = this.data
        const generated = identify(form.images, form.campusId)
        const isSample = Boolean(generated.title)
        const aiFields = {}
        const fields = isSample ? generated : { description: generated.description }
        if (!isSample && !form.location) fields.location = generated.location
        aiKeys.forEach(field => { if (fields[field] !== undefined && fields[field] !== '') aiFields[field] = true })
        this.showForm({ ...form, ...fields, images: form.images }, aiFields)
        this.persistDraft()
        this.setData({ hint: isSample ? '初稿已填入，可逐项修改' : '描述模板已填入，请补充实物信息' })
      } catch (error) {
        failure = error.message || '生成失败，请重试'
      } finally {
        wx.hideLoading()
        this.setData({ busy: false })
      }
      if (failure) toast(failure)
    }, 650)
  },

  appendVoice() {
    if (!requireAuth(this.returnUrl)) return
    toggleVoice(this, '自用闲置，功能正常。工作日晚上方便在宿舍楼下交接。', text => {
      const description = this.data.form.description.trim()
      this.setField('description', [description, text].filter(Boolean).join('\n').slice(0, 600))
      toast('棠小助已补充描述')
    })
  },

  priceCheck() {
    const price = Number(this.data.form.price)
    const category = this.data.form.category && getCategory(this.data.form.category)
    const average = category && category.average
    if (!average || price <= 0 || (price >= average * 0.4 && price <= average * 1.8)) return
    const signature = `${category.id}-${price}`
    if (signature === this.lastPriceHint) return
    this.lastPriceHint = signature
    wx.showModal({ title: '棠小助的定价提示', content: `${category.name}的参考均价约 ¥${average}。当前价格与均价相差较大，可以按实物情况继续定价。`, showCancel: false, confirmText: '知道了' })
  },

  submit() {
    if (this.data.choosingPhotos || this.data.busy || this.data.submitting || this.data.recording || !requireAuth(this.returnUrl)) return
    const { form, mode } = this.data
    if (mode === 'draft') {
      this.persistDraft()
      toast('草稿已保存')
      wx.navigateBack({ fail: () => wx.redirectTo({ url: '/pages/batch/index' }) })
      return
    }
    if (!form.images.length) return toast('请上传至少一张实物图')
    if (mode === 'new') {
      const samples = form.images.filter(path => sampleImages.includes(path))
      if (availableSamples(samples, getUser().id).length < samples.length) return toast('这张样图已用于商品或批量草稿，请换一张照片')
    }
    if (!form.title.trim() || !form.category || !form.condition) return toast('请填写名称、分类和成色')
    if (form.price === '' || !Number.isFinite(Number(form.price)) || Number(form.price) < 0 || Number(form.price) > 99999) return toast('请输入 0 至 99999 元的有效价格')
    if (!form.description.trim() || !form.location.trim() || !form.time.trim()) return toast('请填写描述、自提地点和交易时间')
    try {
      this.setData({ submitting: true })
      const product = saveProduct({ ...form, price: Number(form.price), title: form.title.trim(), description: form.description.trim(), location: form.location.trim(), time: form.time.trim() })
      // Preserve the saved identity if navigation fails and the seller taps again.
      this.setData({ mode: 'edit', 'form.id': product.id })
      toast(mode === 'edit' ? '修改已保存' : '发布成功')
      wx.redirectTo({
        url: `/pages/detail/index?id=${encodeURIComponent(product.id)}`,
        fail: () => this.setData({ submitting: false })
      })
    } catch (error) {
      this.setData({ submitting: false })
      toast(error.message || '保存失败，请重试')
    }
  }
})
