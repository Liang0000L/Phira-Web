import {
  apiFile, createCollection, currentUser, downloadFile, getChart, getCollection, getSession,
  leaderboard, listCharts, listCollections, login, logout, patchCollection, popularCharts, request
} from './api.js';

const $ = selector => document.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const LOCAL_FAVORITES = 'phira-web-favorites';

const state = {
  page: 1,
  pageSize: 18,
  count: 0,
  query: '',
  order: '-updated',
  type: '-1',
  charts: [],
  view: 'charts',
  activeChart: null,
  collections: [],
  selectedCollection: null,
  favoriteCharts: readFavorites(),
  cloudFavoriteCharts: new Set(),
  user: null
};

function readFavorites() {
  try { return new Set(JSON.parse(localStorage.getItem(LOCAL_FAVORITES) || '[]').map(Number)); }
  catch { return new Set(); }
}

function saveFavorites() {
  localStorage.setItem(LOCAL_FAVORITES, JSON.stringify([...state.favoriteCharts]));
}

function notify(message, tone = 'normal') {
  const toast = document.createElement('div');
  toast.className = `toast ${tone}`;
  toast.textContent = message;
  $('#toasts').append(toast);
  setTimeout(() => toast.remove(), 3600);
}

function setBusy(container, label = '正在载入谱面…') {
  container.innerHTML = `<div class="loading-state"><span class="spinner"></span><span>${esc(label)}</span></div>`;
}

function fileUrl(file) {
  return typeof file === 'string' ? file : file?.url || '';
}

function rating(chart) {
  const value = Number(chart.rating || 0);
  return value <= 1 ? (value * 20).toFixed(1) : value.toFixed(1);
}

function difficultyLabel(chart) {
  return chart.level || `${chart.difficulty ?? '—'}`;
}

function chartCard(chart, { favorite = false, removable = false } = {}) {
  const art = apiFile(fileUrl(chart.illustration));
  const title = chart.name || '未命名谱面';
  return `<article class="chart-card" data-chart="${Number(chart.id)}">
    <button class="artwork-button" data-open-chart="${Number(chart.id)}" aria-label="查看 ${esc(title)}" style="--artwork:url('${esc(art)}')"><span class="artwork-cover"></span><span class="artwork-shade"></span><span class="artwork-level">${esc(difficultyLabel(chart))}</span><span class="artwork-id">#${Number(chart.id)}</span></button>
    <div class="chart-card-body"><button class="chart-title" data-open-chart="${Number(chart.id)}">${esc(title)}</button><div class="chart-credit">${esc(chart.composer || '未知曲师')} <span>·</span> ${esc(chart.charter || '未知谱师')}</div>
      <div class="chart-card-footer"><span class="rating"><span>✳</span> ${rating(chart)}</span><span class="chart-tag">${chart.ranked ? 'RANKED' : chart.stable ? 'SPECIAL' : 'COMMUNITY'}</span><button class="favorite-button ${favorite ? 'is-favorite' : ''}" data-favorite="${Number(chart.id)}" aria-label="${favorite ? '移出收藏' : '收藏谱面'}" title="${favorite ? '移出收藏' : '收藏谱面'}">${favorite ? '♥' : '♡'}</button>${removable ? `<button class="favorite-button" data-remove-favorite="${Number(chart.id)}" aria-label="从此收藏夹移除" title="从此收藏夹移除">−</button>` : ''}</div>
    </div>
  </article>`;
}

async function loadCharts() {
  const grid = $('#chart-grid');
  setBusy(grid);
  const params = { page: state.page, pageNum: state.pageSize, order: state.order, type: state.type };
  if (state.query.trim()) params.search = state.query.trim();
  try {
    const response = await listCharts(params);
    state.charts = response.results || [];
    state.count = Number(response.count || 0);
    $('#chart-count').textContent = state.count.toLocaleString('zh-CN');
    $('#result-count').textContent = `${state.count.toLocaleString('zh-CN')} 个谱面`;
    $('#page-indicator').textContent = `第 ${state.page} 页 · 共 ${Math.max(1, Math.ceil(state.count / state.pageSize))} 页`;
    $('#page-prev').disabled = state.page <= 1;
    $('#page-next').disabled = state.page * state.pageSize >= state.count;
    grid.innerHTML = state.charts.map(chart => chartCard(chart, { favorite: state.favoriteCharts.has(Number(chart.id)) || state.cloudFavoriteCharts.has(Number(chart.id)) })).join('');
    grid.classList.toggle('hidden', !state.charts.length);
    $('#empty-state').classList.toggle('hidden', !!state.charts.length);
  } catch (error) {
    grid.innerHTML = `<div class="error-state"><strong>暂时无法载入谱面</strong><span>${esc(error.message)}</span><button class="secondary-button" id="retry-charts">重新载入</button></div>`;
    $('#retry-charts').addEventListener('click', loadCharts);
  }
}

function showView(name) {
  state.view = name;
  state.activeChart = null;
  document.querySelectorAll('.view').forEach(view => view.classList.remove('active'));
  $(`#${name}-view`)?.classList.add('active');
  if (name === 'favorites') loadFavorites();
  if (name === 'account') renderAccount();
  document.querySelectorAll('[data-view]').forEach(button => button.classList.toggle('active', button.dataset.view === name));
  $('#sidebar').classList.remove('open');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function setDetail(chart) {
  state.activeChart = chart;
  document.querySelectorAll('.view').forEach(view => view.classList.remove('active'));
  $('#detail-view').classList.add('active');
  renderDetail(chart);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function openChart(id) {
  document.querySelectorAll('.view').forEach(view => view.classList.remove('active'));
  $('#detail-view').classList.add('active');
  setBusy($('#detail-content'), '正在载入谱面详情…');
  try {
    const chart = await getChart(id);
    setDetail(chart);
  } catch (error) {
    $('#detail-content').innerHTML = `<div class="error-state"><strong>无法载入谱面</strong><span>${esc(error.message)}</span></div>`;
  }
}

function renderDetail(chart) {
  const art = apiFile(fileUrl(chart.illustration));
  const id = Number(chart.id);
  const isFavorite = state.favoriteCharts.has(id) || state.cloudFavoriteCharts.has(id);
  const content = $('#detail-content');
  content.innerHTML = `<div class="detail-hero"><img class="detail-artwork" src="${esc(art)}" alt="${esc(chart.name || '谱面曲绘')}" /><div class="detail-shade"></div><div class="detail-info"><span class="detail-badge">${chart.ranked ? 'RANKED' : chart.stable ? 'SPECIAL' : 'COMMUNITY CHART'}</span><h1 id="detail-title">${esc(chart.name || '未命名谱面')}</h1><p>${esc(chart.composer || '未知曲师')} <span>·</span> 谱师 ${esc(chart.charter || '未知')}</p><div class="detail-stats"><span><b>${esc(difficultyLabel(chart))}</b>难度</span><span><b>${rating(chart)}</b>社区评分</span><span><b>${Number(chart.ratingCount || 0).toLocaleString('zh-CN')}</b>评价</span><span><b>#${id}</b>谱面编号</span></div></div></div>
    <div class="detail-actions"><button class="primary-button" id="download-button">↓ 下载谱面</button><button class="secondary-button detail-favorite ${isFavorite ? 'is-favorite' : ''}" id="detail-favorite">${isFavorite ? '♥ 已收藏' : '♡ 收藏'}</button><span class="detail-updated">更新于 ${esc((chart.updated || '').slice(0, 10) || '—')}</span></div>
    <div class="detail-columns"><section class="detail-section"><div class="section-heading"><div><p class="eyebrow">CHART INFORMATION</p><h2>谱面信息</h2></div></div><dl class="metadata-list"><div><dt>谱师</dt><dd>${esc(chart.charter || '—')}</dd></div><div><dt>曲师</dt><dd>${esc(chart.composer || '—')}</dd></div><div><dt>画师</dt><dd>${esc(chart.illustrator || '—')}</dd></div><div><dt>谱面说明</dt><dd>${esc(chart.description || '暂无说明')}</dd></div><div><dt>标签</dt><dd class="tag-list">${(chart.tags || []).map(tag => `<span>${esc(tag)}</span>`).join('') || '—'}</dd></div></dl></section>
    <section class="detail-section leaderboard-section"><div class="section-heading"><div><p class="eyebrow">TOP 15 / ${id}</p><h2>谱面排行榜</h2></div><label class="standard-toggle"><input type="checkbox" id="standard-score" /><span>标准分</span></label></div><div id="leaderboard-list" class="leaderboard-list"><div class="loading-state"><span class="spinner"></span><span>正在读取排行榜…</span></div></div></section></div>`;
  $('#detail-favorite').addEventListener('click', () => toggleFavorite(id));
  $('#download-button').addEventListener('click', () => downloadChart(chart));
  $('#standard-score').addEventListener('change', event => loadLeaderboard(id, event.target.checked));
  loadLeaderboard(id);
}

async function downloadChart(chart) {
  const button = $('#download-button');
  const original = button?.textContent;
  if (button) { button.disabled = true; button.textContent = '准备下载…'; }
  try {
    await downloadFile(fileUrl(chart.file), `${chart.name || `phira-${chart.id}`}.zip`);
    notify('谱面包已下载。', 'success');
  } catch (error) {
    notify(error.message, 'error');
  } finally {
    if (button) { button.disabled = false; button.textContent = original || '↓ 下载谱面'; }
  }
}

async function loadLeaderboard(id, standard = false) {
  const list = $('#leaderboard-list');
  if (!list) return;
  setBusy(list, '正在读取排行榜…');
  try {
    const entries = await leaderboard(id, standard);
    if (!Array.isArray(entries) || !entries.length) {
      list.innerHTML = '<div class="empty-inline">暂无线上成绩</div>';
      return;
    }
    list.innerHTML = entries.slice(0, 15).map((record, index) => {
      const place = record.rank || index + 1;
      const player = typeof record.player === 'object' ? record.player.name || record.player.id : record.player;
      const score = record.std_score ?? record.stdScore ?? record.score ?? '—';
      const accuracy = Number(record.accuracy);
      return `<div class="leaderboard-row"><span class="leaderboard-place ${place <= 3 ? 'top-place' : ''}">${String(place).padStart(2, '0')}</span><span class="leaderboard-player">${esc(player ? `玩家 ${player}` : '未知玩家')}</span><span class="leaderboard-score">${Number(score).toLocaleString('zh-CN')}</span><span class="leaderboard-accuracy">${Number.isFinite(accuracy) ? `${(accuracy * 100).toFixed(2)}%` : ''}</span></div>`;
    }).join('');
  } catch (error) {
    list.innerHTML = `<div class="error-state compact"><span>${esc(error.message)}</span><button class="text-button" id="retry-leaderboard">重试</button></div>`;
    $('#retry-leaderboard').addEventListener('click', () => loadLeaderboard(id, standard));
  }
}

async function toggleFavorite(id) {
  if (!getSession()) {
    const existing = state.favoriteCharts.has(id);
    if (existing) state.favoriteCharts.delete(id);
    else state.favoriteCharts.add(id);
    saveFavorites();
    notify(existing ? '已从本地收藏移除。' : '已保存到本地收藏。', 'success');
    if (state.activeChart) renderDetail(state.activeChart);
    else loadCharts();
    return;
  }
  const existing = state.cloudFavoriteCharts.has(id);
  const picker = $('#collection-picker');
  if (!state.collections.length) await loadCollections();
  if (!state.collections.length) {
    notify('请先新建一个云端收藏夹。', 'error');
    $('#collection-dialog').showModal();
    return;
  }
  if (!state.selectedCollection) state.selectedCollection = state.collections[0].id;
  await updateCloudFavorite(id, existing);
}

async function updateCloudFavorite(chartId, existing) {
  try {
    const collection = await getCollection(state.selectedCollection);
    const ids = (collection.charts || []).map(value => Number(typeof value === 'object' ? value.id : value)).filter(Number.isFinite);
    const next = existing ? ids.filter(id => id !== chartId) : ids.includes(chartId) ? ids : [...ids, chartId];
    await patchCollection(collection.id || state.selectedCollection, next, collection.updated);
    if (existing) state.cloudFavoriteCharts.delete(chartId);
    else state.cloudFavoriteCharts.add(chartId);
    notify(existing ? '已从云端收藏夹移除。' : '已加入云端收藏夹。', 'success');
    if (state.activeChart) renderDetail(state.activeChart);
    if (state.view === 'favorites') await loadFavorites();
    else await loadCharts();
  } catch (error) {
    notify(error.message, 'error');
  }
}

async function loadCollections() {
  if (!getSession()) return [];
  const result = await listCollections();
  state.collections = Array.isArray(result) ? result : result.results || [];
  if (!state.selectedCollection && state.collections.length) state.selectedCollection = state.collections[0].id;
  return state.collections;
}

async function loadFavorites() {
  const grid = $('#favorite-grid');
  const picker = $('#collection-picker');
  $('#favorites-empty').classList.add('hidden');
  setBusy(grid, '正在载入收藏…');
  if (!getSession()) {
    picker.innerHTML = '<div class="local-note">本地收藏仅保存在此浏览器。<button class="text-button" id="open-login-from-fav">登录以同步云端收藏 <span>→</span></button></div>';
    $('#open-login-from-fav').addEventListener('click', openLogin);
    const ids = [...state.favoriteCharts];
    if (!ids.length) return showEmptyFavorites();
    try {
      const response = await request(`/chart/multi-get?ids=${ids.join(',')}`);
      renderFavoriteCharts(Array.isArray(response) ? response : response.results || [], true);
    } catch (error) {
      grid.innerHTML = `<div class="error-state"><span>${esc(error.message)}</span></div>`;
    }
    return;
  }
  try {
    await loadCollections();
    picker.innerHTML = `<label class="select-control collection-select"><span>收藏夹</span><select id="collection-select">${state.collections.map(collection => `<option value="${Number(collection.id)}" ${Number(collection.id) === Number(state.selectedCollection) ? 'selected' : ''}>${esc(collection.name || `收藏夹 ${collection.id}`)}</option>`).join('')}</select></label>${state.collections.length ? `<span class="collection-size">${state.collections.find(item => Number(item.id) === Number(state.selectedCollection))?.public ? '公开收藏夹' : '私有收藏夹'}</span>` : '<span class="collection-size">新建收藏夹以同步谱面</span>'}`;
    $('#create-collection').classList.remove('hidden');
    $('#collection-select')?.addEventListener('change', async event => {
      state.selectedCollection = Number(event.target.value);
      await loadFavorites();
    });
    if (!state.collections.length) return showEmptyFavorites('尚未创建云端收藏夹', '创建一个收藏夹，保存并同步喜欢的谱面。');
    const collection = await getCollection(state.selectedCollection);
    const ids = (collection.charts || []).map(chart => Number(typeof chart === 'object' ? chart.id : chart)).filter(Number.isFinite);
    state.cloudFavoriteCharts = new Set(ids);
    if (!ids.length) return showEmptyFavorites();
    const charts = await request(`/chart/multi-get?ids=${ids.join(',')}`);
    renderFavoriteCharts(Array.isArray(charts) ? charts : charts.results || [], false);
  } catch (error) {
    grid.innerHTML = `<div class="error-state"><strong>无法载入收藏夹</strong><span>${esc(error.message)}</span></div>`;
  }
}

function showEmptyFavorites(title = '还没有收藏', message = '在谱面上点按收藏，将它留在这里。') {
  $('#favorite-grid').classList.add('hidden');
  const empty = $('#favorites-empty');
  empty.querySelector('h2').textContent = title;
  empty.querySelector('p').textContent = message;
  empty.classList.remove('hidden');
}

function renderFavoriteCharts(charts, local) {
  const grid = $('#favorite-grid');
  if (!charts.length) return showEmptyFavorites();
  grid.classList.remove('hidden');
  $('#favorites-empty').classList.add('hidden');
  grid.innerHTML = charts.map(chart => chartCard(chart, { favorite: true, removable: !local })).join('');
}

async function removeFromCollection(id) {
  try {
    const collection = await getCollection(state.selectedCollection);
    const ids = (collection.charts || []).map(value => Number(typeof value === 'object' ? value.id : value)).filter(chartId => chartId !== id);
    await patchCollection(collection.id || state.selectedCollection, ids, collection.updated);
    await loadFavorites();
  } catch (error) {
    notify(error.message, 'error');
  }
}

async function renderAccount() {
  const content = $('#account-content');
  if (!getSession()) {
    content.innerHTML = '<div class="account-prompt"><div class="account-prompt-icon">◎</div><div><p class="eyebrow">SIGN IN</p><h2>连接你的 Phira 账户</h2><p>管理云端收藏夹，查看个人最佳成绩。</p></div><button class="primary-button" id="account-login">登录 Phira</button></div><p class="account-footnote">账户凭证仅用于向 Phira API 发起登录请求。</p>';
    $('#account-login').addEventListener('click', openLogin);
    return;
  }
  setBusy(content, '正在读取账户…');
  try {
    state.user = await currentUser();
    const user = state.user;
    const avatar = fileUrl(user.avatar);
    content.innerHTML = `<div class="profile-panel"><div class="profile-avatar">${avatar ? `<img src="${esc(avatar)}" alt="账户头像" />` : '◎'}</div><div class="profile-details"><p class="eyebrow">SIGNED IN</p><h2>${esc(user.name || `玩家 ${user.id}`)}</h2><p>Phira ID ${Number(user.id || getSession().id)}</p></div><button class="secondary-button" id="logout-button">退出登录</button></div><div class="account-metrics"><div><span>账户 ID</span><strong>${Number(user.id || getSession().id)}</strong></div><div><span>个人 RKS</span><strong>${Number(user.rks || 0).toFixed(2)}</strong></div><div><span>本地收藏</span><strong>${state.favoriteCharts.size}</strong></div></div><div class="account-tools"><div><p class="eyebrow">CLOUD COLLECTIONS</p><h3>云端收藏夹</h3></div><button class="secondary-button" data-view="favorites">打开收藏夹 →</button></div>`;
    $('#logout-button').addEventListener('click', () => { logout(); state.user = null; renderAccount(); notify('已退出登录。'); });
  } catch (error) {
    content.innerHTML = `<div class="error-state"><strong>无法读取账户</strong><span>${esc(error.message)}</span><button class="secondary-button" id="logout-button">退出登录</button></div>`;
    $('#logout-button').addEventListener('click', () => { logout(); renderAccount(); });
  }
}

function syncAccount() {
  const session = getSession();
  $('#account-label').textContent = session ? `玩家 ${session.id}` : '登录';
  $('.account-avatar').textContent = session ? '◎' : '访';
  $('#favorites-subtitle').textContent = session ? '本地与云端收藏夹。' : '将喜欢的谱面收在一起。';
  $('#create-collection').classList.toggle('hidden', !session);
}

function openLogin() {
  $('#login-error').textContent = '';
  $('#login-dialog').showModal();
}

function bindEvents() {
  document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => showView(button.dataset.view)));
  $('#search').addEventListener('input', event => {
    state.query = event.target.value;
    state.page = 1;
    clearTimeout(bindEvents.searchTimer);
    bindEvents.searchTimer = setTimeout(loadCharts, 280);
  });
  $('#order').addEventListener('change', event => { state.order = event.target.value; state.page = 1; loadCharts(); });
  $('#type').addEventListener('change', event => { state.type = event.target.value; state.page = 1; loadCharts(); });
  $('#reset-filters').addEventListener('click', resetFilters);
  $('#empty-reset').addEventListener('click', resetFilters);
  $('#page-prev').addEventListener('click', () => { if (state.page > 1) { state.page -= 1; loadCharts(); } });
  $('#page-next').addEventListener('click', () => { if (state.page * state.pageSize < state.count) { state.page += 1; loadCharts(); } });
  $('#popular-link').addEventListener('click', async () => {
    showView('charts');
    setBusy($('#chart-grid'), '正在读取热门谱面…');
    try {
      const result = await popularCharts();
      state.charts = Array.isArray(result) ? result : result.results || [];
      $('#chart-grid').innerHTML = state.charts.map(chart => chartCard(chart, { favorite: state.favoriteCharts.has(Number(chart.id)) || state.cloudFavoriteCharts.has(Number(chart.id)) })).join('');
      $('#result-count').textContent = '热门谱面';
      $('#chart-grid').classList.toggle('hidden', !state.charts.length);
      $('#empty-state').classList.toggle('hidden', !!state.charts.length);
    } catch (error) { notify(error.message, 'error'); loadCharts(); }
  });
  $('#chart-grid').addEventListener('click', handleChartClick);
  $('#favorite-grid').addEventListener('click', handleChartClick);
  $('#detail-content').addEventListener('click', event => {
    const button = event.target.closest('[data-open-chart]');
    if (button) openChart(button.dataset.openChart);
  });
  $('#detail-back').addEventListener('click', () => showView('charts'));
  $('#account-button').addEventListener('click', () => getSession() ? showView('account') : openLogin());
  $('#mobile-menu').addEventListener('click', () => $('#sidebar').classList.toggle('open'));
  $('#create-collection').addEventListener('click', () => $('#collection-dialog').showModal());
  $('#cancel-login').addEventListener('click', () => $('#login-dialog').close());
  $('#cancel-collection').addEventListener('click', () => $('#collection-dialog').close());
  $('#login-form').addEventListener('submit', handleLogin);
  $('#collection-form').addEventListener('submit', handleCreateCollection);
  window.addEventListener('sessionchange', () => { syncAccount(); state.collections = []; });
  window.addEventListener('keydown', event => {
    if (event.key === '/' && !['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) {
      event.preventDefault(); $('#search').focus();
    }
    if (event.key === 'Escape') $('#sidebar').classList.remove('open');
  });
}

function handleChartClick(event) {
  const favorite = event.target.closest('[data-favorite]');
  const remove = event.target.closest('[data-remove-favorite]');
  const open = event.target.closest('[data-open-chart]');
  if (favorite) { toggleFavorite(Number(favorite.dataset.favorite)); return; }
  if (remove) { removeFromCollection(Number(remove.dataset.removeFavorite)); return; }
  if (open) openChart(Number(open.dataset.openChart));
}

function resetFilters() {
  state.query = '';
  state.order = '-updated';
  state.type = '-1';
  state.page = 1;
  $('#search').value = '';
  $('#order').value = state.order;
  $('#type').value = state.type;
  loadCharts();
}

async function handleLogin(event) {
  event.preventDefault();
  const button = $('#login-submit');
  button.disabled = true;
  button.textContent = '正在登录…';
  $('#login-error').textContent = '';
  try {
    await login($('#email').value.trim(), $('#password').value);
    $('#password').value = '';
    $('#login-dialog').close();
    notify('已连接 Phira 账户。', 'success');
    await renderAccount();
  } catch (error) {
    $('#login-error').textContent = error.message;
  } finally {
    button.disabled = false;
    button.textContent = '登录';
  }
}

async function handleCreateCollection(event) {
  event.preventDefault();
  const button = $('#collection-form button[type="submit"]');
  button.disabled = true;
  try {
    const collection = await createCollection($('#collection-name').value.trim(), $('#collection-description').value.trim());
    state.selectedCollection = Number(collection.id);
    state.collections = [];
    $('#collection-name').value = '';
    $('#collection-description').value = '';
    $('#collection-dialog').close();
    notify('已创建云端收藏夹。', 'success');
    if (state.view === 'favorites') await loadFavorites();
  } catch (error) { notify(error.message, 'error'); }
  finally { button.disabled = false; }
}

function init() {
  bindEvents();
  syncAccount();
  loadCharts();
  if (getSession()) currentUser().then(user => { state.user = user; }).catch(() => {});
}

init();
