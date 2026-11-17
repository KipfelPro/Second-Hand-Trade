const { validatedPickup } = require('./campus')

function dateValue(date = new Date()) {
  const two = value => String(value).padStart(2, '0')
  return date.getFullYear() + '-' + two(date.getMonth() + 1) + '-' + two(date.getDate())
}

function appointmentTime(date, time) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time)) return NaN
  const [year, month, day] = date.split('-').map(Number)
  const [hour, minute] = time.split(':').map(Number)
  const parsed = new Date(year, month - 1, day, hour, minute)
  return dateValue(parsed) === date ? parsed.getTime() : NaN
}

function verifyAppointment(input, campusId) {
  const pickup = validatedPickup(input.location, campusId)
  if (!pickup || pickup.campus.id !== campusId) throw new Error('请选择商品所在校区的自提点')
  const date = String(input.date || '')
  const time = String(input.time || '')
  const timestamp = appointmentTime(date, time)
  if (!(timestamp > Date.now())) throw new Error('请选择晚于当前时间的预约')
  return { location: pickup.location, date, time }
}

function counterAppointment({ location, date, time }) {
  const altTime = '19:00'
  if (time < altTime && appointmentTime(date, altTime) > Date.now()) return { location, date, time: altTime }
  const next = new Date(appointmentTime(date, time))
  next.setDate(next.getDate() + 1)
  return { location, date: dateValue(next), time: altTime }
}

function pickupSummary(pickup) {
  return [pickup.date, pickup.time, pickup.location].join(' ')
}

module.exports = { dateValue, appointmentTime, verifyAppointment, counterAppointment, pickupSummary }
