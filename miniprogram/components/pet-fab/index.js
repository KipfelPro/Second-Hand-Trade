const { go, requireAuth } = require('../../utils/nav')

const petKey = 'tcj:pet'
const motionKey = 'tcj:reduce-motion'
const idlePet = { energy: 72, affection: 24 }
const defaultCaption = '今天想找点什么？'
const panelLeaveMs = 130

function readPet() {
  const stored = wx.getStorageSync(petKey)
  return stored && Number.isFinite(stored.energy) && Number.isFinite(stored.affection) ? stored : idlePet
}

function getWindow() {
  return wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
}

function dockAnchor({ windowWidth, windowHeight }, bottom) {
  const unit = windowWidth / 750
  return {
    x: windowWidth - 100 * unit,
    y: Math.max(30 * unit, windowHeight - (bottom + 80) * unit)
  }
}

Component({
  properties: {
    hint: String, productId: String, bottom: { type: Number, value: 142 }, delay: { type: Number, value: 450 }, inConversation: Boolean,
    motionPaused: Boolean, inline: Boolean
  },
  data: {
    expanded: false, closing: false, dragging: false, showingHint: false, reducedMotion: false, active: true, x: null, y: null,
    dockStyle: '', panelStyle: '', hintStyle: '', motionStyle: '--pet-leave-ms:' + panelLeaveMs + 'ms;', energy: idlePet.energy, affection: idlePet.affection, mood: '', caption: defaultCaption
  },
  observers: {
    hint(value) {
      if (this._ready && value) this.queueHint()
      else if (this._ready) this.hideHint()
    },
    bottom() {
      if (!this._ready) return
      // Composer height can change while a panel or a drag offset is stored.
      this.close(true)
      this.resetAnchor()
    },
    motionPaused() {
      if (this._ready) this.syncPet()
    }
  },
  lifetimes: {
    attached() {
      this._ready = true
      this.resetAnchor()
      this.syncPet()
      if (this.data.hint) this.queueHint()
    },
    detached() {
      this._ready = false
      this.stopTimers()
    }
  },
  pageLifetimes: {
    hide() {
      this.stopTimers()
      this.setData({ active: false, showingHint: false, expanded: false, closing: false, dragging: false, mood: '', caption: defaultCaption })
    },
    show() {
      this.syncPet()
      this.setData({ active: true })
      if (this._ready && this.data.hint && this.data.hint !== this._seenHint) this.queueHint()
    },
    resize() {
      this.close(true)
      this.resetAnchor()
    }
  },
  methods: {
    resetAnchor() {
      if (this.data.inline) return
      const { y } = dockAnchor(getWindow(), this.data.bottom)
      this.setData({ x: null, y: null, dockStyle: 'right:22rpx;top:' + Math.round(y) + 'px;' })
    },
    syncPet() {
      const { energy, affection } = readPet()
      this.setData({ energy, affection, reducedMotion: this.data.motionPaused || Boolean(wx.getStorageSync(motionKey)) })
    },
    stopTimers() {
      clearTimeout(this._show)
      clearTimeout(this._hide)
      clearTimeout(this._mood)
      clearTimeout(this._replay)
      clearTimeout(this._suppress)
      clearTimeout(this._panelLeave)
      this._suppressTap = false
      this._drag = null
    },
    hideHint() {
      clearTimeout(this._show)
      clearTimeout(this._hide)
      if (this.data.showingHint) this.setData({ showingHint: false })
    },
    queueHint() {
      this.hideHint()
      this._show = setTimeout(() => {
        if (!this.data.active) return
        this._seenHint = this.data.hint
        this.setData({ showingHint: !this.data.expanded && !this.data.closing, hintStyle: this.overlayStyle(true) })
        this._hide = setTimeout(() => this.setData({ showingHint: false }), 5600)
      }, this.data.delay)
    },
    touchStart(event) {
      if (this.data.inline) return
      const touch = event.touches[0]
      if (!touch) return
      const info = getWindow()
      const unit = info.windowWidth / 750
      const anchor = dockAnchor(info, this.data.bottom)
      this._drag = {
        startX: touch.clientX, startY: touch.clientY,
        fromX: this.data.x == null ? anchor.x : this.data.x,
        fromY: this.data.y == null ? anchor.y : this.data.y,
        width: info.windowWidth, height: info.windowHeight, unit, moved: false, patted: false
      }
    },
    touchMove(event) {
      const drag = this._drag
      const touch = event.touches[0]
      if (!drag || !touch || drag.patted) return
      const dx = touch.clientX - drag.startX
      const dy = touch.clientY - drag.startY
      if (!drag.moved && Math.abs(dx) + Math.abs(dy) < 9) return
      if (!drag.moved) {
        drag.moved = true
        this.close(true)
      }
      const pad = 12 * drag.unit
      const x = Math.round(Math.max(pad, Math.min(drag.fromX + dx, drag.width - 88 * drag.unit - pad)))
      const y = Math.round(Math.max(30 * drag.unit, Math.min(drag.fromY + dy, drag.height - (90 + this.data.bottom) * drag.unit)))
      this.setData({ x, y, dragging: true })
    },
    touchEnd() {
      if (this.data.inline) return
      this._suppressTap = Boolean(this._drag && (this._drag.moved || this._drag.patted))
      this._drag = null
      if (this.data.dragging) this.setData({ dragging: false })
      if (this._suppressTap) {
        clearTimeout(this._suppress)
        this._suppress = setTimeout(() => { this._suppressTap = false }, 320)
      }
    },
    toggle() {
      if (this._suppressTap) return
      if (this.data.expanded) {
        this.close()
        return
      }
      clearTimeout(this._panelLeave)
      this.syncPet()
      this.hideHint()
      this.setData({ expanded: true, closing: false, panelStyle: this.overlayStyle(false) })
      this.react('perk', defaultCaption)
    },
    overlayStyle(hint) {
      const info = getWindow()
      const { windowWidth, windowHeight, screenTop, safeArea, statusBarHeight } = info
      const { x, y, inline, bottom, inConversation } = this.data
      const unit = windowWidth / 750
      const gap = 10
      const width = Math.min(hint ? 240 : 310, windowWidth - 2 * gap)
      const anchor = dockAnchor(info, bottom)
      const dockX = x == null ? anchor.x : x
      const dockY = y == null ? anchor.y : y
      const left = Math.max(gap, Math.min(windowWidth - width - gap, dockX + 88 * unit - width))
      const topSafe = Math.max(0, (statusBarHeight || 0) - (screenTop || 0)) + gap
      const safeBottom = Number.isFinite(screenTop) && safeArea ? safeArea.bottom - screenTop : windowHeight
      // windowHeight is the page viewport. Cap both the position and height before the native bar.
      const pageBottom = Math.min(windowHeight, safeBottom > topSafe ? safeBottom : windowHeight) - gap
      const maxHeight = Math.max(1, Math.min(hint ? 66 : inConversation ? 126 : 230, pageBottom - topSafe))
      const preferredTop = inline ? 58 : dockY - maxHeight - gap
      const top = Math.max(topSafe, Math.min(pageBottom - maxHeight, preferredTop))
      return 'width:' + width + 'px;left:' + left + 'px;top:' + top + 'px;max-height:' + maxHeight + 'px;'
    },
    close(immediate) {
      if (this.data.closing && immediate !== true) return
      clearTimeout(this._panelLeave)
      const closing = this.data.expanded && immediate !== true && !this.data.reducedMotion
      this.setData({ expanded: false, closing, showingHint: false })
      if (closing) this._panelLeave = setTimeout(() => this.setData({ closing: false }), panelLeaveMs)
    },
    longPat() {
      if (this._drag && this._drag.moved) return
      if (this._drag) this._drag.patted = true
      if (this.data.inline) {
        this._suppressTap = true
        clearTimeout(this._suppress)
        this._suppress = setTimeout(() => { this._suppressTap = false }, 650)
      }
      this.hideHint()
      this.care('pat')
      if (!this.data.expanded) this.setData({ showingHint: true, hintStyle: this.overlayStyle(true) })
    },
    feed() { this.care('feed') },
    pat() { this.care('pat') },
    care(action) {
      const now = Date.now()
      if (this._lastCare && now - this._lastCare < 360) return
      this._lastCare = now
      const { energy, affection } = readPet()
      const feed = action === 'feed'
      const next = {
        energy: Math.min(100, energy + (feed ? 8 : 0)),
        affection: Math.min(100, affection + (feed ? 1 : 5))
      }
      try {
        wx.setStorageSync(petKey, next)
      } catch (error) {
        wx.showToast({ title: '这次互动暂未保存', icon: 'none' })
      }
      this.setData(next)
      const caption = feed ? (energy >= 100 ? '吃饱啦，谢谢！' : '好甜！精神满满。') : '嘿嘿，再陪你逛逛。'
      this.react(action, caption)
    },
    react(mood, caption) {
      clearTimeout(this._mood)
      clearTimeout(this._replay)
      const animate = () => {
        this.setData({ mood, caption })
        this._mood = setTimeout(() => this.setData({ mood: '', caption: defaultCaption, showingHint: false }), 1900)
      }
      if (this.data.mood === mood && !this.data.reducedMotion) {
        this.setData({ mood: '', caption })
        this._replay = setTimeout(animate, 32)
      } else animate()
    },
    shortcut(event) {
      const mode = event.currentTarget.dataset.mode || 'ask'
      const product = this.data.productId ? '&id=' + encodeURIComponent(this.data.productId) : ''
      const url = '/pages/assistant/index?mode=' + mode + product
      this.close(true)
      if (this.data.inConversation) {
        this.triggerEvent('shortcut', { mode })
        return
      }
      if (mode !== 'publish' || requireAuth(url)) go(url)
    }
  }
})
