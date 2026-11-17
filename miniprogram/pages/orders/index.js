const store = require('../../utils/store');
const { go, requireAuth } = require('../../utils/nav');
const { formatDate } = require('../../utils/catalog');

const statuses = [
  { id: 'all', label: '全部' },
  { id: 'pending', label: '待收货' },
  { id: 'completed', label: '已完成' },
  { id: 'aftersale', label: '售后' }
];
const labels = { pending: '待收货', completed: '已完成', aftersale: '平台介入' };

Page({
  data: { statuses, selected: 'all', orders: [], verified: false },

  onLoad(options) {
    if (statuses.some((status) => status.id === options.status)) this.setData({ selected: options.status });
  },

  onShow() {
    this.refresh();
  },

  refresh() {
    const user = store.getUser();
    if (!user || !user.verified) {
      this.setData({ verified: false, orders: [] });
      return;
    }
    const { selected } = this.data;
    const orders = store.getOrders()
      .filter((order) => selected === 'all' || order.status === selected)
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((order) => ({
        ...order,
        date: formatDate(order.createdAt).slice(0, 10),
        label: order.afterSale && order.afterSale.reviewedAt ? '售后已处理'
          : order.status === 'pending' && order.handoffAt ? '待确认' : labels[order.status] || order.status
      }));
    this.setData({ verified: true, orders });
  },

  select(event) {
    this.setData({ selected: event.currentTarget.dataset.status }, () => this.refresh());
  },

  openOrder(event) {
    go(`/pages/order/index?id=${event.currentTarget.dataset.id}`);
  },

  authenticate() {
    requireAuth('/pages/orders/index');
  },

  browse() {
    go('/pages/browse/index');
  }
});
