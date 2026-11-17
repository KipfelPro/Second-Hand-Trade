const tabs = ['home', 'browse', 'messages', 'profile']
const prefix = '/pages/'
const validPage = /^\/pages\/[a-z]+\/index(?:\?|$)/

function toast(title) {
  wx.showToast({ title, icon: 'none' })
}

function split(url) {
  const divider = url.indexOf('?')
  const path = divider < 0 ? url : url.slice(0, divider)
  const query = {}
  if (divider >= 0) {
    url.slice(divider + 1).split('&').forEach(pair => {
      const equals = pair.indexOf('=')
      if (equals < 0) return
      const value = pair.slice(equals + 1)
      try { query[pair.slice(0, equals)] = decodeURIComponent(value) }
      catch (error) { query[pair.slice(0, equals)] = value }
    })
  }
  return { name: path.slice(prefix.length).split('/')[0], path, query }
}

function go(url, mode) {
  if (!validPage.test(url)) return
  const { name, path, query } = split(url)
  const fail = () => toast('暂时无法打开此页面')
  if (tabs.includes(name)) {
    getApp().globalData.tabQuery[name] = query
    wx.switchTab({ url: path, fail })
    return
  }
  if (mode === 'reset') wx.reLaunch({ url, fail })
  else if (mode === 'replace' || getCurrentPages().length >= 9) wx.redirectTo({ url, fail })
  else wx.navigateTo({ url, fail })
}

function takeTabQuery(name) {
  const queries = getApp().globalData.tabQuery
  const result = queries[name] || {}
  delete queries[name]
  return result
}

function requireAuth(returnUrl) {
  const user = require('./store').getUser()
  if (user && user.verified) return true
  const next = returnUrl || '/pages/home/index'
  go('/pages/auth/index?next=' + encodeURIComponent(next))
  return false
}

function resumeAfterAuth(next) {
  const url = validPage.test(next || '') ? next : '/pages/home/index'
  if (tabs.includes(split(url).name)) {
    go(url)
    return
  }
  const stack = getCurrentPages()
  const previous = stack[stack.length - 2]
  const destination = split(url)
  const samePage = previous && '/' + previous.route === destination.path
  const sameQuery = samePage && Object.keys(destination.query).every(key =>
    String((previous.options || {})[key]) === destination.query[key]
  )
  if (sameQuery) wx.navigateBack()
  else go(url, 'replace')
}

module.exports = { go, requireAuth, resumeAfterAuth, takeTabQuery, toast }
