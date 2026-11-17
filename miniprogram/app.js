const store = require('./utils/store')

App({
  globalData: { tabQuery: {} },
  onLaunch() {
    store.init()
  }
})
