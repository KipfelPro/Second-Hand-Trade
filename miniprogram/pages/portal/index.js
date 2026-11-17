const auth = require('../../utils/auth')
const { go, toast } = require('../../utils/nav')
const campus = require('../auth/campus')

Page({
  data: { account: '', password: '', busy: false, error: '', showPassword: false },
  onShow() { campus.showCampus(this, 1) },
  onHide() { campus.hideCampus(this) },
  selectCampus: campus.selectCampus,
  toggleMotion: campus.toggleMotion,
  keyboardChanged(event) {
    this.keyboardOpen = event.detail.height > 0
    campus.scheduleCampus(this)
  },
  back() { wx.navigateBack({ fail: () => go('/pages/auth/index', 'replace') }) },
  fill() { if (!this.data.busy) this.setData({ account: auth.demoAccount, password: auth.demoPassword, error: '' }) },
  togglePassword() { this.setData({ showPassword: !this.data.showPassword }) },
  account(event) { this.setData({ account: event.detail.value, error: '' }) },
  password(event) { this.setData({ password: event.detail.value, error: '' }) },
  submit() {
    if (this.data.busy) return
    const { account, password } = this.data
    if (!account || !password) {
      this.setData({ error: '请填写账号和密码。' })
      return
    }
    this.setData({ busy: true, password: '', error: '', showPassword: false })
    this.timer = setTimeout(() => {
      if (!auth.verifyDemo(account, password)) {
        this.setData({ busy: false, error: '账号或密码有误，请点「自动填入」。' })
        return
      }
      const stack = getCurrentPages()
      if (stack.length > 1 && stack[stack.length - 2].route === 'pages/auth/index') wx.navigateBack()
      else go('/pages/auth/index', 'replace')
      toast('核验通过')
    }, 300)
  },
  onUnload() { clearTimeout(this.timer); campus.hideCampus(this) }
})
