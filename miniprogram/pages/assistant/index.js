const store = require('../../utils/store')
const catalog = require('../../utils/catalog')
const { getCampus, getDiscoveryCampus } = require('../../utils/campus')
const { go, toast } = require('../../utils/nav')
const { selectImages, toggleVoice, cancelVoice, availableSamples } = require('../publish/media')

const prompts = {
  find: [
    { text: '大一上高数教材', label: '找高数教材', icon: 'book' },
    { text: '找宿舍用小冰箱，预算 150 元', label: '找小冰箱', icon: 'search' },
    { text: '帮我求购轻微使用的机械键盘，预算 80 元', label: '生成求购单', icon: 'clipboard' }
  ],
  ask: [
    { text: '我想看看卖家信用', label: '查卖家信用', icon: 'shield' },
    { text: '平台托管是怎么回事？', label: '问交易规则', icon: 'receipt' },
    { text: '帮我写一句约自提的话', label: '写沟通话术', icon: 'message' }
  ],
  publish: [
    { text: '怎么拍照上架？', label: '拍照上架', icon: 'camera' },
    { text: '怎么批量发布？', label: '批量上架', icon: 'box' },
    { text: '帮我写一段二手台灯描述', label: '写商品描述', icon: 'edit' }
  ]
}

const voiceSamples = {
  find: '帮我找宿舍用小冰箱，预算 150 元',
  ask: '平台托管和确认收货是怎么回事？',
  publish: '帮我写一段二手台灯描述'
}

const introductions = {
  find: '可以一起告诉我预算和校区。',
  ask: '交易、信用和自提都可以问。',
  publish: '发张实物照，先整理一份草稿。'
}

const modes = [{ key: 'find', title: '找闲置' }, { key: 'publish', title: '发闲置' }, { key: 'ask', title: '问问题' }]

const publishUrl = '/pages/publish/index'
const wantsUrl = '/pages/wants/index'
const batchUrl = '/pages/batch/index'
const browseUrl = '/pages/browse/index'
const motionKey = 'tcj:reduce-motion'
let messageIndex = 0

function message(role, values) {
  messageIndex += 1
  return { id: 'm-' + Date.now() + '-' + messageIndex, role, ...values }
}

function action(label, url) {
  return { label, url }
}

function itemContext(text, contextId) {
  const exact = store.getProducts().find(product => {
    const seller = store.getSeller(product.sellerId)
    return [product.title, seller && seller.nickname, seller && seller.name].some(label => label && text.includes(label))
  })
  if (exact) return exact
  const subject = text.replace(/棠小助|帮我|我想看(?:看)?|想看(?:看)?|请问|查查|查询|查一下|查|卖家|信用分?|认证了吗|认证|怎么样|如何|这位|这件|上一个|最近看的|对方|一下|多少|的|吗/g, '')
    .replace(/[\s，。！？,.!?]/g, '')
  if (subject.length >= 2) {
    const matched = catalog.matchProducts(subject)
    return matched[0]
  }
  return store.getProduct(contextId) || store.getProduct(store.latestProductId())
}

function helpWithCredit(text, contextId) {
  const product = itemContext(text, contextId)
  const seller = product && store.getSeller(product.sellerId)
  if (!seller) {
    return { text: '你想查谁的信用呀？告诉我卖家昵称或商品名称，也可以从商品详情打开棠小助。', actions: [action('去找闲置', browseUrl)] }
  }
  const label = seller.verified ? '已完成模拟融合门户认证' : '尚未完成融合门户认证'
  return {
    mood: 'happy',
    text: `「${product.title}」卖家是${seller.college}的${seller.nickname || seller.name}，信用分 ${seller.credit}（${catalog.creditLevel(seller.credit)}），${label}。`,
    actions: [action('查看商品和卖家', `/pages/detail/index?id=${encodeURIComponent(product.id)}`)]
  }
}

function helpWithAuth() {
  const user = store.getUser()
  return {
    text: '发布、下单和私聊需要校园认证。体验时请使用预置身份，确认后保留脱敏学籍信息。',
    actions: [user && user.verified ? action('查看我的认证', '/pages/profile/index') : action('打开认证引导', '/pages/auth/index')]
  }
}

function draftWant(text, campusId) {
  const draft = catalog.parseWant(text)
  const category = catalog.getCategory(draft.category)
  const campus = getCampus(draft.campusId || campusId)
  const details = [draft.title, campus && campus.name, category && category.name, draft.budget !== '' && `预算 ¥${draft.budget}`, draft.condition].filter(Boolean)
  const summary = details.length ? '\n' + details.join(' · ') + '\n' : ''
  return {
    mood: 'happy',
    text: '我帮你整理了一张求购单。' + summary + '打开后核对品类、预算和成色，发布时会匹配现有闲置。',
    actions: [action('核对并发布求购', `${wantsUrl}?q=${encodeURIComponent(text)}${campus ? '&campus=' + campus.id : ''}`)]
  }
}

function searchGoods(text, campusId) {
  const request = text.replace(/^(?:请问|棠小助[，、, ]*)/, '')
    .replace(/谢谢|可以吗|有吗|吗[？?]?$/g, '').trim()
  const namedCampus = /卫津路/.test(request) ? 'weijin' : /北洋园/.test(request) ? 'beiyang' : campusId
  const campus = getCampus(namedCampus)
  const resultsUrl = `${browseUrl}?q=${encodeURIComponent(request)}${campus ? '&campus=' + campus.id : ''}`
  const products = catalog.matchProducts(request, { campus: namedCampus })
  if (!products.length) {
    return {
      text: '这次没找到符合条件的闲置。你可以改一下关键词或预算，也可以让我帮你整理求购单。',
      actions: [action('查看搜索结果', resultsUrl), action('去发布求购', `${wantsUrl}?q=${encodeURIComponent(request)}${campus ? '&campus=' + campus.id : ''}`)]
    }
  }
  return {
    mood: 'happy', text: `我在${campus ? campus.name : '校园集市'}找到了 ${products.length} 件相关闲置。点开商品可以看成色、自提地点和卖家信用。`,
    productIds: products.slice(0, 3).map(product => product.id),
    actions: [action('查看全部匹配结果', resultsUrl)]
  }
}

// 本地意图识别先识别明确的任务，再把找货请求交给共用的商品匹配器。
function respond(text, image, contextId, mode, campus) {
  if (image) {
    const draft = catalog.identify([image], campus)
    const category = catalog.getCategory(draft.category)
    const description = draft.title
      ? `样图收到啦！我准备了「${draft.title}」的示例商品信息${category ? `，分类为「${category.name}」` : ''}。打开草稿就可以逐项修改。`
      : '照片收到啦！我可以准备一份描述模板。品名、成色和价格请按实物填写。'
    return {
      mood: 'happy',
      text: description,
      actions: [action('用这张图创建草稿', `${publishUrl}?image=${encodeURIComponent(image)}`)]
    }
  }
  if (/我要认证|(?:怎么|如何|去|开始)认证|融合门户.*认证流程/.test(text) && !/卖家/.test(text)) {
    return helpWithAuth()
  }
  if (/信用|查.*认证|卖家.*认证|认证.*卖家/.test(text)) return helpWithCredit(text, contextId)
  if (/求购|发布需求|想收[份套本件个台一]/.test(text)) return draftWant(text, campus)
  if (/批量|一次.*上架|毕业.*发布/.test(text)) {
    return { text: '在批量上架页选多张照片，每张会生成一条草稿。你可以一键应用成色、价格区间和自提地点，也可以打开任意草稿单独修改。', actions: [action('打开批量上架', batchUrl)] }
  }
  if (/话术|怎么开口|怎么说|怎么问|写一句|写一段.*(消息|私聊)|约自提|沟通/.test(text)) {
    const product = store.getProduct(contextId)
    const title = product ? `你的${product.title}` : '这件闲置'
    return { text: `可以这样问对方。\n“你好同学，我对${title}感兴趣！方便发一下使用痕迹的照片吗？我可以在校内自提，你哪天方便，我们约个有人的地点当面检查吧。”`, copy: true }
  }
  if (/担保|托管|确认收货|售后|退款|下单|怎么交易|怎么付款|交易流程|交易规则|支付/.test(text)) {
    return { text: '下单后，货款显示为「平台托管」。面交验货后确认收货，系统模拟划款；如果有问题，可在订单详情申请售后。', actions: [action('查看我的订单', '/pages/orders/index')] }
  }
  if (/融合门户|实名|学籍/.test(text)) return helpWithAuth()
  if (/描述|怎么介绍|写文案/.test(text)) {
    const { title, category } = catalog.parseWant(text.replace(/^.*?(?:一段|描述|写个|介绍)/, ''))
    const productCategory = catalog.getCategory(category)
    return {
      text: `发布时可以这样写。\n“出闲置${productCategory ? title : '商品'}，购入时间【填写】，使用情况【填写】，附件和瑕疵【填写】，可在【自提地点】当面查看。”` +
        (productCategory ? '\n' + productCategory.suggestion : ''), copy: true, actions: [action('打开发布表单', publishUrl)]
    }
  }
  if (/上架|发闲置|发布商品|拍照|怎么发/.test(text)) {
    return { text: '可以在发布页选样图体验自动预填，也可以把实物照发给我，先整理一份描述模板。草稿里的内容都能修改。', actions: [action('拍照上架', publishUrl), action('批量上架', batchUrl)] }
  }
  if (/^(你好呀?|在吗|嗨|哈[喽啰]|你好棠小助)[！!。？?]*$/.test(text)) {
    return { text: '你好呀，我是棠小助。想找闲置、发求购，或者了解校内交易规则，都可以直接跟我说。', mood: 'happy' }
  }
  if (mode === 'ask' && /^(规则|安全|问题)$/.test(text)) {
    return { text: '你想了解货款托管、当面交付、售后，还是卖家信用？选下面的问题也可以。' }
  }
  return searchGoods(text, campus)
}

function render(messages) {
  const products = new Map(store.getProducts().map(product => [product.id, product]))
  return messages.map(item => ({
    ...item,
    products: (item.productIds || []).map(id => products.get(id)).filter(Boolean)
  }))
}

Page({
  data: {
    mode: 'find',
    modes,
    introduction: introductions.find,
    prompts: prompts.find,
    messages: [],
    draft: '',
    hasText: false,
    attachment: '',
    thinking: false,
    recording: false,
    reducedMotion: false,
    keyboardHeight: 0,
    animatedMessageId: '',
    anchor: ''
  },

  onLoad(options) {
    this._draft = ''
    this._contextId = options.id || ''
    this._campus = options.campus || getDiscoveryCampus()
    this.setMode(options.mode)
  },

  setMode(requestedMode) {
    const mode = Object.prototype.hasOwnProperty.call(prompts, requestedMode) ? requestedMode : this.data.mode
    this.setData({ mode, introduction: introductions[mode], prompts: prompts[mode] })
  },

  changeMode(e) {
    this.setMode(e.currentTarget.dataset.mode)
  },

  onShow() {
    this._visible = true
    this.setData({ reducedMotion: Boolean(wx.getStorageSync(motionKey)), animatedMessageId: '' })
    this.refresh()
  },

  onHide() {
    this._visible = false
    clearTimeout(this._thinkTimer)
    cancelVoice(this)
    this.setData({ keyboardHeight: 0 })
  },

  onUnload() {
    this._visible = false
    this._destroyed = true
    clearTimeout(this._thinkTimer)
    cancelVoice(this)
  },

  onKeyboard(e) {
    this.resizeKeyboard(e.detail.height)
  },

  focusInput(e) {
    if (e.detail.height) this.resizeKeyboard(e.detail.height)
  },

  blurInput() {
    this.resizeKeyboard(0)
  },

  resizeKeyboard(value) {
    const keyboardHeight = Math.max(0, Number(value) || 0)
    if (this._visible && keyboardHeight !== this.data.keyboardHeight) {
      this.setData({ keyboardHeight }, () => this.scrollToEnd())
    }
  },

  scrollToEnd() {
    this.setData({ anchor: '' }, () => this.setData({ anchor: 'conversation-end' }))
  },

  refresh(animatedMessageId = '') {
    this.setData({ messages: render(store.getAssistant()), thinking: false, animatedMessageId }, () => this.scrollToEnd())
  },

  input(e) {
    // 原生输入框控制文字与光标，避免在中文输入法选词时回写旧值。
    this._draft = e.detail.value
    const hasText = Boolean(this._draft.trim())
    if (hasText !== this.data.hasText) this.setData({ hasText })
  },

  sendCurrent(e) {
    const value = e && e.detail && e.detail.value
    if (typeof value === 'string') this.input(e)
    const draft = this._draft
    if (!this.send(draft, this.data.attachment)) return
    this._draft = ''
    // 先同步输入框现值，再清空，确保只在原生侧存在的草稿也会被清除。
    this.setData({ draft, hasText: false, attachment: '' }, () => {
      if (!this._draft) this.setData({ draft: '' })
    })
  },

  sendPrompt(e) {
    this.send(e.currentTarget.dataset.text, '')
  },

  send(value, image) {
    if (this.data.thinking || this.data.recording) return
    const text = value.trim()
    if (!text && !image) return
    const outgoing = message('user', { text, image })
    const history = store.getAssistant().concat(outgoing)
    const reply = message('assistant', respond(text, image, this._contextId, this.data.mode, this._campus))
    // 先缓存完整问答。用户在“思考中”离开再回来，也能继续查看结果。
    store.setAssistant(history.concat(reply))
    this.setData({ messages: render(history.slice(-60)), thinking: true, animatedMessageId: outgoing.id }, () => this.scrollToEnd())
    this._thinkTimer = setTimeout(() => this.refresh(reply.id), this.data.reducedMotion ? 0 : 320)
    return true
  },

  chooseImage() {
    if (this.data.thinking || this.data.recording) return
    wx.showActionSheet({
      itemList: ['拍摄或从相册选图', '使用示例商品图'],
      success: ({ tapIndex }) => {
        if (tapIndex === 1) {
          const user = store.getUser()
          const [attachment] = availableSamples(catalog.sampleImages, user && user.id)
          if (!attachment) return toast('样图都在草稿或在售商品里了，可以上传实物图')
          this.setData({ attachment })
          return
        }
        selectImages(1).then(([attachment]) => {
          if (!this._destroyed && attachment) this.setData({ attachment })
        }).catch(error => {
          if (!this._destroyed && !/cancel/i.test(error.errMsg || '')) toast('选图失败，可以试试示例商品图')
        })
      }
    })
  },

  removeAttachment() {
    this.setData({ attachment: '' })
  },

  previewImage(e) {
    const url = e.currentTarget.dataset.url
    wx.previewImage({ current: url, urls: [url] })
  },

  chooseVoice() {
    if (this.data.thinking) return
    const startOrStop = () => toggleVoice(this, voiceSamples[this.data.mode], text => this.insertTranscript(text))
    if (this.data.recording) return startOrStop()
    wx.showActionSheet({
      itemList: ['开始录音（模拟转写）', '使用示例转写'],
      success: ({ tapIndex }) => tapIndex === 0 ? startOrStop() : this.insertTranscript(voiceSamples[this.data.mode])
    })
  },

  insertTranscript(sample) {
    if (!this._visible) return
    const draft = this._draft ? this._draft + ' ' + sample : sample
    this._draft = draft.slice(0, 300)
    this.setData({ draft: this._draft, hasText: Boolean(this._draft.trim()) })
    toast('已填入模拟转写，可修改后发送')
  },

  openAction(e) {
    const { url } = e.currentTarget.dataset
    const imageQuery = `${publishUrl}?image=`
    if (url.startsWith(imageQuery)) {
      const image = decodeURIComponent(url.slice(imageQuery.length))
      if (!image.startsWith('/images/')) {
        try {
          wx.getFileSystemManager().accessSync(image)
        } catch (error) {
          toast('图片已移除，请重新选图')
          return
        }
      }
    }
    go(url)
  },

  copyReply(e) {
    wx.setClipboardData({ data: e.currentTarget.dataset.text })
  }
})
