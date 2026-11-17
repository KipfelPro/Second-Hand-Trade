const store = require('../../utils/store')
const auth = require('../../utils/auth')
const { go, toast } = require('../../utils/nav')

Page({
  data: { user: null, reducedMotion: false },
  onShow() { this.setData({ user: store.getUser(), reducedMotion: Boolean(wx.getStorageSync('tcj:reduce-motion')) }) },
  changeMotion(event) {
    const reducedMotion = Boolean(event.detail.value)
    wx.setStorageSync('tcj:reduce-motion', reducedMotion)
    this.setData({ reducedMotion })
  },
  explain() {
    wx.showModal({
      title: '关于演示数据',
      content: '认证资料、闲置、订单及对话保存在当前设备。棠小助通过本地规则模拟识别、语音转写及问答，交易使用模拟托管。',
      showCancel: false
    })
  },
  logout() {
    wx.showModal({ title: '退出校园身份？', content: '可以继续浏览商品，使用交易功能时需要重新认证。', success: ({ confirm }) => {
      if (!confirm) return
      store.signOut()
      auth.clearProfile()
      this.setData({ user: null })
      toast('已退出')
      go('/pages/profile/index')
    } })
  },
  reset() {
    wx.showModal({ title: '重置本地演示？', content: '将清除本机发布、订单、求购、收藏与聊天记录，并恢复示例数据。', confirmColor: '#b8336a', success: ({ confirm }) => {
      if (!confirm) return
      store.reset()
      auth.clearProfile()
      wx.removeStorageSync('tcj:batch-drafts')
      wx.removeStorageSync('tcj:discovery-campus')
      wx.removeStorageSync('tcj:pet')
      const fs = wx.getFileSystemManager()
      const folder = wx.env.USER_DATA_PATH
      fs.readdir({ dirPath: folder, success: ({ files }) => files.filter(name => name.startsWith('tcj-')).forEach(name => fs.unlink({ filePath: folder + '/' + name })) })
      toast('已恢复初始数据')
      go('/pages/start/index', 'reset')
    } })
  }
})
