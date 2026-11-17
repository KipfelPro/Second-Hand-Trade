const places = [
  { photo: '/images/auth-weijin.jpg', name: '第九教学楼', campus: '卫津路校区' },
  { photo: '/images/auth-library.jpg', name: '郑东图书馆', campus: '北洋园校区' },
  { photo: '/images/auth-beiyang.jpg', name: '北洋园主楼', campus: '北洋园校区' }
]

const motionKey = 'tcj:reduce-motion'

function showCampus(page, index = 0, autoplay = true) {
  const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
  const capsule = wx.getMenuButtonBoundingClientRect ? wx.getMenuButtonBoundingClientRect() : null
  const top = capsule && capsule.top > 0 ? capsule.top : (info.statusBarHeight || 0) + 8
  const height = capsule && capsule.height > 0 ? capsule.height : 32
  const reducedMotion = Boolean(wx.getStorageSync(motionKey))
  page.setData({
    places,
    placeIndex: page.data.places ? page.data.placeIndex : index,
    navStyle: 'padding-top:' + top + 'px;min-height:' + height + 'px;',
    reducedMotion,
    campusPaused: Boolean(page.data.campusPaused)
  })
  if (autoplay) scheduleCampus(page)
}

function hideCampus(page) {
  clearTimeout(page.campusTimer)
}

function scheduleCampus(page) {
  hideCampus(page)
  if (page.data.reducedMotion || page.data.campusPaused || page.data.safetyOpen || page.keyboardOpen) return
  page.campusTimer = setTimeout(() => {
    page.setData({ placeIndex: (page.data.placeIndex + 1) % places.length })
    scheduleCampus(page)
  }, 3900)
}

function selectCampus(event) {
  this.setData({ placeIndex: Number(event.currentTarget.dataset.index) })
  scheduleCampus(this)
}

function toggleMotion() {
  if (this.data.reducedMotion) return
  this.setData({ campusPaused: !this.data.campusPaused })
  scheduleCampus(this)
}

module.exports = { showCampus, hideCampus, scheduleCampus, selectCampus, toggleMotion }
