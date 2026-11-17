const store = require('../../utils/store')
const { creditLevel } = require('../../utils/catalog')
const { go } = require('../../utils/nav')
const { proximity } = require('../../utils/proximity')

Component({
  properties: {
    product: Object, layout: { type: String, value: 'grid' },
    hideCollege: { type: Boolean, value: false },
    hideCampus: { type: Boolean, value: false }
  },
  observers: {
    product(product) {
      if (!product || !product.sellerId) return
      const seller = store.getSeller(product.sellerId)
      const user = store.getUser()
      const tags = []
      if (seller && user && user.id !== seller.id) {
        const { sameCampus, sameDorm, sameCollege } = proximity(user, seller, product)
        if (sameDorm) tags.push('同楼')
        if (sameCollege) tags.push('同院')
        else if (sameCampus && !sameDorm) tags.push('同校区')
      }
      if ((product.tags || []).includes('毕业清仓') || product.category === 'graduation') tags.unshift('毕业清仓')
      this.setData({ seller, tags: tags.slice(0, 2), level: seller ? creditLevel(seller.credit) : '', cover: (product.images || [])[0] })
    }
  },
  methods: {
    open() {
      if (!this.data.product || !this.data.product.id) return
      go('/pages/detail/index?id=' + encodeURIComponent(this.data.product.id))
    }
  }
})
