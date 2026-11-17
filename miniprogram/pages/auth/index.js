const auth = require('../../utils/auth')
const store = require('../../utils/store')
const { go, resumeAfterAuth, toast } = require('../../utils/nav')
const campus = require('./campus')

Page({
  data: { profile: null, submitting: false, first: false, safetyOpen: false },
  onLoad(options) {
    let next = options.next || '/pages/home/index'
    if (next.startsWith('%2F') || next.startsWith('%2f')) {
      try { next = decodeURIComponent(next) } catch (error) { next = '/pages/home/index' }
    }
    this.next = next
    this.setData({ first: options.first === '1' })
  },
  onShow() {
    this.setData({ profile: auth.peekProfile(), safetyOpen: false })
    campus.showCampus(this)
  },
  onHide() { campus.hideCampus(this) },
  onUnload() { campus.hideCampus(this); auth.clearProfile() },
  selectCampus: campus.selectCampus,
  toggleMotion: campus.toggleMotion,
  openSafety() {
    campus.hideCampus(this)
    this.setData({ safetyOpen: true })
  },
  closeSafety() {
    this.setData({ safetyOpen: false })
    campus.scheduleCampus(this)
  },
  keepSafetyOpen() {},
  back() { wx.navigateBack({ fail: () => this.browse() }) },
  enterPortal() { auth.clearProfile(); go('/pages/portal/index') },
  // The local portal returns only a masked record and registration needs explicit confirmation.
  confirm() {
    if (this.data.submitting) return
    this.setData({ submitting: true })
    try {
      store.signIn()
      toast('实名认证已完成')
      resumeAfterAuth(this.next)
    } catch (error) {
      this.setData({ profile: null, submitting: false })
      toast(error.message)
    }
  },
  browse() { auth.clearProfile(); go('/pages/home/index') }
})
