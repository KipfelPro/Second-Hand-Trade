const store = require('../../utils/store');
const { go, requireAuth, toast } = require('../../utils/nav');
const { formatDate } = require('../../utils/catalog');

const filters = [
  { id: 'all', label: '全部' }, { id: 'active', label: '在售' }, { id: 'offline', label: '已下架' }, { id: 'sold', label: '已售出' }
];
const labels = { active: '在售', offline: '已下架', sold: '已售出' };

Page({
  data: { filters, selected: 'all', products: [], verified: false },

  onShow() {
    this.refresh();
  },

  refresh() {
    const user = store.getUser();
    if (!user || !user.verified) {
      this.setData({ verified: false, products: [] });
      return;
    }
    const { selected } = this.data;
    const products = store.getProducts()
      .filter((product) => product.sellerId === user.id && (selected === 'all' || product.status === selected))
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((product) => ({ ...product, date: formatDate(product.createdAt), label: labels[product.status] }));
    this.setData({ products, verified: true });
  },

  select(event) {
    this.setData({ selected: event.currentTarget.dataset.status }, () => this.refresh());
  },

  authenticate() {
    requireAuth('/pages/listings/index');
  },

  publish() {
    const url = '/pages/publish/index';
    if (requireAuth(url)) go(url);
  },

  viewProduct(event) {
    go(`/pages/detail/index?id=${event.currentTarget.dataset.id}`);
  },

  editProduct(event) {
    const url = `/pages/publish/index?id=${event.currentTarget.dataset.id}`;
    if (requireAuth(url)) go(url);
  },

  changeStatus(event) {
    const { id, status } = event.currentTarget.dataset;
    if (!requireAuth('/pages/listings/index')) return;
    const product = store.getProduct(id);
    if (!product || product.status === 'sold') return;
    const action = status === 'offline' ? '下架' : '重新上架';
    wx.showModal({
      title: `确认${action}？`,
      content: product.title,
      confirmText: action,
      confirmColor: '#B8336A',
      success: ({ confirm }) => {
        if (!confirm) return;
        try {
          store.setProductStatus(id, status);
          this.refresh();
          toast(`已${action}`);
        } catch (error) {
          toast(error.message);
        }
      }
    });
  }
});
