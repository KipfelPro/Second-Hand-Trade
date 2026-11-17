const { getUser } = require('../../utils/store')
const { go } = require('../../utils/nav')
const campus = require('../auth/campus')

Page({
  onShow() {
    campus.showCampus(this, 0, false)
    if (!this.entered) this.timer = setTimeout(() => this.enter(), 2000)
  },
  onHide() { clearTimeout(this.timer); campus.hideCampus(this) },
  onUnload() { clearTimeout(this.timer); campus.hideCampus(this) },
  enter() {
    if (this.entered) return
    this.entered = true
    go(getUser() ? '/pages/home/index' : '/pages/auth/index?first=1', 'replace')
  }
})
