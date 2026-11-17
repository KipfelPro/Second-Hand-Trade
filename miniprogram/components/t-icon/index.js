const aliases = {
  sparkles: 'spark', books: 'book', graduation: 'box', digital: 'devices', life: 'lamp', style: 'racket',
  wants: 'clipboard', pin: 'location', arrow: 'arrow-right', chat: 'message', profile: 'user'
}
const supported = 'search bell chevron-right arrow-right arrow-left check shield spark book box devices lamp racket clipboard camera image mic send close plus upload edit location message heart heart-filled clock star info smile receipt wallet user alert settings logout grid lock'.split(' ')

Component({
  properties: {
    name: { type: String, value: 'spark' },
    size: { type: Number, value: 36 },
    color: { type: String, value: 'pink' }
  },
  data: { src: '/images/icons/spark-pink.png' },
  observers: {
    'name,color': function (name, color) {
      const icon = aliases[name] || name
      const value = color.toLowerCase()
      let tone = 'pink'
      if (/white|^#fff(?:fff)?$/.test(value)) tone = 'white'
      else if (/green|^#(?:3b|43|4b|2f|36|27|38|37|2e|48|44|41|52)/.test(value)) tone = 'green'
      else if (/muted|gr[ae]y|^#(?:7|8|9|a[0-9])/.test(value)) tone = 'muted'
      else if (/ink|black|^#(?:1|2|3|4)/.test(value)) tone = 'ink'
      this.setData({ src: '/images/icons/' + (supported.includes(icon) ? icon : 'spark') + '-' + tone + '.png' })
    }
  }
})
