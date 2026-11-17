const { favoriteIds, getProduct, toggleFavorite } = require('../../utils/store')
const { go, toast } = require('../../utils/nav')

Page({
  data: { products: [] },

  onShow() {
    this.refresh()
  },

  refresh() {
    this.setData({ products: favoriteIds().map(getProduct).filter(Boolean).reverse() })
  },

  remove(e) {
    toggleFavorite(e.currentTarget.dataset.id)
    this.refresh()
    toast('已取消收藏')
  },

  browse() {
    go('/pages/browse/index?category=all')
  }
})
