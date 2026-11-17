const { student } = require('../mock/seed')

const demoAccount = 'tju-demo'
const demoPassword = 'demo2026'
let pending = null

// Both demo credentials are synthetic. Only the already-masked profile leaves this mock portal.
function verifyDemo(account, password) {
  if (account.trim() !== demoAccount || password !== demoPassword) return null
  pending = { profile: Object.assign({}, student), expires: Date.now() + 5 * 60 * 1000 }
  return pending.profile
}

function peekProfile() {
  return pending && Date.now() < pending.expires ? pending.profile : null
}

function takeProfile() {
  const profile = peekProfile()
  pending = null
  return profile
}

function clearProfile() {
  pending = null
}

module.exports = { demoAccount, demoPassword, verifyDemo, peekProfile, takeProfile, clearProfile }
