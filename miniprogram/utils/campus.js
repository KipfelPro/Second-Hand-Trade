const campuses = [
  { id: 'weijin', name: '卫津路校区' },
  { id: 'beiyang', name: '北洋园校区' }
]
const preferenceKey = 'tcj:discovery-campus'
// 用学校导览、场馆中心和图书馆公布的公开建筑名作为自提点。
const pickupNames = {
  weijin: ['北洋广场', '第九教学楼门口', '大学生活动中心门口', '科学图书馆门口', '春水图书馆门口', '体育馆门口', '东门'],
  beiyang: ['大通学生中心门口', '郑东图书馆门口', '竹园餐厅门口', '梅园餐厅门口', '北区综合体育馆门口', '求实会堂门口', '东门']
}
const legacyNames = {
  weijin: { '大学生活动中心': '大学生活动中心门口', '综合体育馆门口': '体育馆门口' },
  beiyang: { '大通学生中心': '大通学生中心门口', '综合体育馆门口': '北区综合体育馆门口', '体育馆门口': '北区综合体育馆门口' }
}

function getCampus(value) {
  return campuses.find(campus => campus.id === value || campus.name === value || campus.name === value + '校区')
}

function getDiscoveryCampus() {
  const campus = getCampus(wx.getStorageSync(preferenceKey))
  return campus ? campus.id : 'all'
}

function setDiscoveryCampus(value) {
  const campus = getCampus(value)
  wx.setStorageSync(preferenceKey, campus ? campus.id : 'all')
}

function pickupOptions(campusId) {
  const campus = getCampus(campusId)
  return campus ? pickupNames[campus.id].map(name => campus.name + name) : []
}

function resolvePickupCampus(value, fallback) {
  const input = String(value || '').trim()
  const campus = campuses.find(entry => input.startsWith(entry.name.slice(0, -2)))
  return campus || getCampus(fallback)
}

function formatPickup(value, campusId) {
  const input = String(value || '').trim()
  const campus = resolvePickupCampus(input, campusId)
  if (!campus || !input) return ''
  const location = input.replace(/^(?:卫津路|北洋园)(?:校区)?[\s·：:、，-]*/, '')
  return location ? campus.name + (legacyNames[campus.id][location] || location) : ''
}

function validatedPickup(value, fallback) {
  const campus = resolvePickupCampus(value, fallback)
  if (!campus) return null
  const location = formatPickup(value, campus.id)
  return pickupOptions(campus.id).includes(location) ? { campus, location } : null
}

module.exports = { campuses, preferenceKey, getCampus, getDiscoveryCampus, setDiscoveryCampus,
  pickupOptions, resolvePickupCampus, formatPickup, validatedPickup }
