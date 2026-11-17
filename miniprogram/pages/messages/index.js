const store = require('../../utils/store');
const { go, requireAuth, takeTabQuery, toast } = require('../../utils/nav');
const { formatDate } = require('../../utils/catalog');
const { appointmentTime } = require('../../utils/pickup');

const sections = [
  { id: 'chat', label: '私聊' },
  { id: 'order', label: '订单通知' },
  { id: 'system', label: '系统通知' }
];

const roles = [
  { id: 'buyer', label: '我买的' },
  { id: 'seller', label: '我卖的' }
];

function chatStatus(thread, product, order) {
  if (order) {
    if (order.status === 'completed') return { text: '已完成', tone: 'closed' };
    if (order.status === 'aftersale') return { text: order.afterSale && order.afterSale.reviewedAt ? '售后已处理' : '售后中', tone: 'warning' };
    if (order.status === 'pending') {
      return order.handoffAt ? { text: '待确认收货', tone: 'live' } : { text: '待面交', tone: 'live' };
    }
  }
  if (!product || product.status === 'offline') return { text: '已下架', tone: 'muted' };
  if (product.status === 'sold') return { text: '已售出', tone: 'muted' };
  if (thread.pickup && thread.pickup.status === 'confirmed' && appointmentTime(thread.pickup.date, thread.pickup.time) > Date.now()) {
    return { text: '已约自提', tone: 'closed' };
  }
  if (thread.pickup && ['proposed', 'counter'].includes(thread.pickup.status)) return { text: '待确认自提', tone: 'live' };
  return { text: '商谈中', tone: 'muted' };
}

function listTime(timestamp, today) {
  const stamp = formatDate(timestamp);
  if (!stamp) return '';
  if (stamp.slice(0, 10) === today) return stamp.slice(11);
  return stamp.slice(0, 4) === today.slice(0, 4) ? stamp.slice(5, 10) : stamp.slice(0, 10);
}

Page({
  data: { sections, roles, selected: 'chat', role: 'buyer', entries: [], verified: false, unread: {}, roleUnread: {} },

  onShow() {
    this.visible = true;
    const { section, role } = takeTabQuery('messages');
    if (sections.some(item => item.id === section)) this.setData({ selected: section });
    if (roles.some(item => item.id === role)) this.setData({ role });
    this.reload();
  },

  onHide() {
    this.visible = false;
    this.stopRefresh();
  },
  onUnload() { this.onHide(); },

  stopRefresh() {
    clearTimeout(this.refreshTimer);
  },

  reload() {
    this.stopRefresh();
    const user = store.getUser();
    const verified = Boolean(user && user.verified);
    const threads = verified ? store.getThreads() : [];
    const awaitingReply = threads.some(thread => (thread.replies && thread.replies.length) ||
      (thread.pickup && thread.pickup.responseAt));
    if (this.visible && awaitingReply) {
      this.refreshTimer = setTimeout(() => this.reload(), 850);
    }
    const notices = store.getNotices();
    const unread = {
      chat: threads.reduce((total, thread) => total + Number(thread.unread || 0), 0),
      order: notices.filter((notice) => notice.type === 'order' && !notice.read).length,
      system: notices.filter((notice) => notice.type === 'system' && !notice.read).length
    };
    const roleUnread = { buyer: 0, seller: 0 };
    threads.forEach(thread => { roleUnread[thread.role || 'buyer'] += Number(thread.unread || 0); });
    const { selected, role } = this.data;
    const today = formatDate(Date.now()).slice(0, 10);
    const entries = selected === 'chat'
      ? threads.filter(thread => (thread.role || 'buyer') === role).map((thread) => {
        const peer = store.getSeller(thread.peerId || thread.sellerId);
        const order = store.getOrderForThread(thread.id);
        const product = order && order.product || store.getProduct(thread.productId);
        const last = thread.messages[thread.messages.length - 1];
        const title = peer ? (peer.nickname || peer.name) : '天大同学';
        const status = chatStatus(thread, product, order);
        return {
          id: thread.id,
          title,
          peerLabel: role === 'seller' ? '买家' : '卖家',
          avatar: peer && peer.avatar,
          initial: title.charAt(0),
          productTitle: product ? product.title : '原商品已不可查看',
          productCover: product && product.images && product.images[0],
          price: product ? (!order && thread.deal && thread.deal.basePrice === product.price ? thread.deal.price : product.price) : null,
          status: status.text,
          tone: status.tone,
          text: last ? (last.from === 'me' ? '我：' : '') + last.text : '还没有消息',
          time: listTime(last ? last.createdAt : thread.updatedAt, today),
          unread: thread.unread
        };
      })
      : notices.filter((notice) => notice.type === selected).sort((a, b) => b.createdAt - a.createdAt).map((notice) => ({
        ...notice,
        time: listTime(notice.createdAt, today),
        unread: !notice.read
      }));
    this.setData({ verified, entries, unread, roleUnread });
  },

  select(event) {
    this.setData({ selected: event.currentTarget.dataset.section }, () => this.reload());
  },

  chooseRole(event) {
    const { role } = event.currentTarget.dataset;
    if (!roles.some(item => item.id === role) || role === this.data.role) return;
    this.setData({ role }, () => this.reload());
  },

  authenticate() {
    requireAuth(`/pages/messages/index?section=${this.data.selected}&role=${this.data.role}`);
  },

  openItem(event) {
    const { id } = event.currentTarget.dataset;
    const { selected } = this.data;
    if (selected !== 'system' && !requireAuth(`/pages/messages/index?section=${selected}&role=${this.data.role}`)) return;
    if (selected === 'chat') {
      go(`/pages/chat/index?id=${encodeURIComponent(id)}`);
      return;
    }
    const notice = this.data.entries.find((entry) => entry.id === id);
    if (!notice) return;
    try {
      store.readNotice(id);
      this.reload();
      if (notice.url) {
        go(notice.url);
      } else {
        wx.showModal({ title: notice.title, content: notice.text, showCancel: false, confirmColor: '#B8336A' });
      }
    } catch (error) {
      toast(error.message);
    }
  }
});
