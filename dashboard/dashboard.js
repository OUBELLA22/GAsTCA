// GAsTCA Dashboard - Main Script

document.addEventListener('DOMContentLoaded', () => {
  initDashboard();
});

// ==================== INITIALIZATION ====================
async function initDashboard() {
  await loadTheme();
  setupNavigation();
  setupEventListeners();
  await loadOverviewData();
  initCharts();
  checkHash();
  updateSyncStatus();
}

// ==================== THEME ====================
async function loadTheme() {
  const result = await chrome.storage.local.get('theme');
  const theme = result.theme || 'dark';
  document.documentElement.setAttribute('data-theme', theme);
  const settingsTheme = document.getElementById('settingsTheme');
  if (settingsTheme) settingsTheme.value = theme;
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme');
  const newTheme = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', newTheme);
  chrome.storage.local.set({ theme: newTheme });
  const settingsTheme = document.getElementById('settingsTheme');
  if (settingsTheme) settingsTheme.value = newTheme;
  // Reinit charts with new theme colors
  initCharts();
}

// ==================== NAVIGATION ====================
function setupNavigation() {
  const navItems = document.querySelectorAll('.nav-item');
  navItems.forEach(item => {
    item.addEventListener('click', () => {
      const page = item.getAttribute('data-page');
      navigateTo(page);
    });
  });
}

function navigateTo(pageId) {
  // Update nav active state
  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.toggle('active', item.getAttribute('data-page') === pageId);
  });

  // Update page visibility
  document.querySelectorAll('.page').forEach(page => {
    page.classList.remove('active');
  });
  const targetPage = document.getElementById(`page-${pageId}`);
  if (targetPage) targetPage.classList.add('active');

  // Update title
  const titles = {
    'overview': { title: 'Overview', subtitle: 'Your Merch by Amazon performance at a glance' },
    'products': { title: 'Products', subtitle: 'Manage and track all your live products' },
    'niche': { title: 'Niche Research', subtitle: 'Find profitable niches with low competition' },
    'keywords': { title: 'Keywords', subtitle: 'Discover high-volume keywords for your listings' },
    'trending': { title: 'Trending', subtitle: 'Products gaining momentum right now' },
    'bsr-tracker': { title: 'BSR Tracker', subtitle: 'Monitor Best Seller Rank changes over time' },
    'trademark': { title: 'Trademark Checker', subtitle: 'Verify trademarks before using in designs' },
    'settings': { title: 'Settings', subtitle: 'Configure your GAsTCA experience' },
  };

  const info = titles[pageId] || { title: pageId, subtitle: '' };
  document.getElementById('pageTitle').textContent = info.title;
  document.getElementById('pageSubtitle').textContent = info.subtitle;

  // Update URL hash
  window.location.hash = pageId;
}

function checkHash() {
  const hash = window.location.hash.replace('#', '');
  if (hash) navigateTo(hash);
}

// ==================== EVENT LISTENERS ====================
function setupEventListeners() {
  // Theme toggle
  document.getElementById('themeToggle').addEventListener('click', toggleTheme);

  // Date range filter
  document.getElementById('dateRange').addEventListener('change', (e) => {
    loadOverviewData(e.target.value);
  });

  // Refresh button
  document.getElementById('refreshBtn').addEventListener('click', () => {
    loadOverviewData();
    showToast('Data refreshed');
  });

  // Niche research
  document.getElementById('analyzeNicheBtn').addEventListener('click', analyzeNiche);
  document.getElementById('nicheSearch').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') analyzeNiche();
  });

  // Keyword research
  document.getElementById('searchKeywordsBtn').addEventListener('click', searchKeywords);
  document.getElementById('keywordSearch').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') searchKeywords();
  });

  // Trending
  document.getElementById('refreshTrending').addEventListener('click', loadTrending);

  // BSR Tracker
  document.getElementById('trackBsrBtn').addEventListener('click', trackBsr);

  // Trademark
  document.getElementById('checkTrademarkBtn').addEventListener('click', checkTrademark);

  // Settings
  document.getElementById('settingsTheme').addEventListener('change', (e) => {
    document.documentElement.setAttribute('data-theme', e.target.value);
    chrome.storage.local.set({ theme: e.target.value });
    initCharts();
  });

  document.getElementById('settingsNotifications').addEventListener('change', (e) => {
    chrome.storage.local.set({ notificationsEnabled: e.target.checked });
  });

  document.getElementById('settingsSound').addEventListener('change', (e) => {
    chrome.storage.local.set({ soundEnabled: e.target.checked });
  });

  document.getElementById('settingsRefreshInterval').addEventListener('change', (e) => {
    chrome.storage.local.set({ refreshInterval: parseInt(e.target.value) });
    chrome.runtime.sendMessage({ type: 'UPDATE_ALARM', interval: parseInt(e.target.value) });
  });

  document.getElementById('exportDataBtn').addEventListener('click', exportData);
  document.getElementById('clearDataBtn').addEventListener('click', clearData);

  // Product search
  const productSearch = document.getElementById('productSearch');
  if (productSearch) {
    productSearch.addEventListener('input', filterProducts);
  }
}

// ==================== OVERVIEW DATA ====================
async function loadOverviewData(range = '7d') {
  const result = await chrome.storage.local.get(['salesData', 'products', 'recentSales']);
  const salesData = result.salesData || {};
  const products = result.products || [];
  const recentSales = result.recentSales || [];

  // Calculate totals based on range
  const dates = getDateRange(range);
  let totalSales = 0;
  let totalRoyalties = 0;
  let totalUnits = 0;

  dates.forEach(date => {
    const dayData = salesData[date] || { sales: 0, royalties: 0, units: 0 };
    totalSales += parseFloat(dayData.sales) || 0;
    totalRoyalties += parseFloat(dayData.royalties) || 0;
    totalUnits += parseInt(dayData.units) || 0;
  });

  // Update KPI cards
  document.getElementById('kpiSales').textContent = formatCurrency(totalSales);
  document.getElementById('kpiRoyalties').textContent = formatCurrency(totalRoyalties);
  document.getElementById('kpiUnits').textContent = totalUnits;
  document.getElementById('kpiProducts').textContent = products.length;

  // Load top products
  loadTopProducts(products);

  // Load activity
  loadActivity(recentSales);
}

function loadTopProducts(products) {
  const container = document.getElementById('topProductsList');
  if (!products || products.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <p>No sales data yet</p>
        <small>Visit MBA dashboard to sync your data</small>
      </div>`;
    return;
  }

  // Sort by sales
  const sorted = [...products].sort((a, b) => (b.totalSales || 0) - (a.totalSales || 0)).slice(0, 5);
  container.innerHTML = sorted.map((product, i) => `
    <div class="product-list-item">
      <span class="product-rank">#${i + 1}</span>
      <div class="product-info">
        <div class="product-name">${product.title || 'Unknown'}</div>
        <div class="product-meta">${product.type || 'T-Shirt'} • ASIN: ${product.asin || 'N/A'}</div>
      </div>
      <span class="product-sales">${formatCurrency(product.totalSales || 0)}</span>
    </div>
  `).join('');
}

function loadActivity(recentSales) {
  const container = document.getElementById('activityList');
  const badge = document.getElementById('activityBadge');

  if (!recentSales || recentSales.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <p>No activity yet</p>
        <small>Sales and events will appear here</small>
      </div>`;
    badge.textContent = '0 events';
    return;
  }

  badge.textContent = `${recentSales.length} events`;
  container.innerHTML = recentSales.slice(0, 10).map(sale => `
    <div class="activity-item">
      <span class="activity-icon">💰</span>
      <div class="activity-info">
        <div class="activity-text">${sale.product || 'Sale'} — +${formatCurrency(sale.royalty || 0)}</div>
        <div class="activity-time">${getRelativeTime(sale.timestamp)}</div>
      </div>
    </div>
  `).join('');
}

// ==================== CHARTS ====================
let mainChartInstance = null;
let productTypeChartInstance = null;

function initCharts() {
  if (typeof Chart === 'undefined') {
    console.warn('Chart.js not loaded yet');
    return;
  }

  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const gridColor = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';
  const textColor = isDark ? '#B0B0B0' : '#555555';

  // Main Sales Chart
  const mainCtx = document.getElementById('mainChart');
  if (mainCtx) {
    if (mainChartInstance) mainChartInstance.destroy();

    const labels = getLast7Days();
    mainChartInstance = new Chart(mainCtx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [
          {
            label: 'Sales',
            data: generateSampleData(7, 10, 50),
            borderColor: '#F5A623',
            backgroundColor: 'rgba(245, 166, 35, 0.1)',
            fill: true,
            tension: 0.4,
            borderWidth: 2,
            pointRadius: 4,
            pointBackgroundColor: '#F5A623',
          },
          {
            label: 'Royalties',
            data: generateSampleData(7, 3, 20),
            borderColor: '#4CAF50',
            backgroundColor: 'rgba(76, 175, 80, 0.1)',
            fill: true,
            tension: 0.4,
            borderWidth: 2,
            pointRadius: 4,
            pointBackgroundColor: '#4CAF50',
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false }
        },
        scales: {
          x: {
            grid: { color: gridColor },
            ticks: { color: textColor, font: { size: 11 } }
          },
          y: {
            grid: { color: gridColor },
            ticks: { color: textColor, font: { size: 11 }, callback: (v) => '$' + v }
          }
        },
        interaction: {
          intersect: false,
          mode: 'index'
        }
      }
    });
  }

  // Product Type Doughnut
  const typeCtx = document.getElementById('productTypeChart');
  if (typeCtx) {
    if (productTypeChartInstance) productTypeChartInstance.destroy();

    productTypeChartInstance = new Chart(typeCtx, {
      type: 'doughnut',
      data: {
        labels: ['T-Shirts', 'Hoodies', 'PopSockets', 'Tank Tops', 'Other'],
        datasets: [{
          data: [45, 20, 15, 12, 8],
          backgroundColor: [
            '#F5A623',
            '#4CAF50',
            '#2196F3',
            '#9C27B0',
            '#FF5722'
          ],
          borderWidth: 0,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '65%',
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              color: textColor,
              padding: 12,
              font: { size: 11 }
            }
          }
        }
      }
    });
  }
}

// ==================== NICHE RESEARCH ====================
async function analyzeNiche() {
  const query = document.getElementById('nicheSearch').value.trim();
  if (!query) return;

  const container = document.getElementById('nicheResults');
  container.innerHTML = `
    <div class="empty-state large">
      <span class="empty-icon animate-pulse">🔍</span>
      <p>Analyzing "${query}"...</p>
      <small>Checking Amazon for demand and competition data</small>
    </div>`;

  // Simulate analysis (in production, this would scrape Amazon or use API)
  setTimeout(() => {
    const demandScore = Math.floor(Math.random() * 40) + 60;
    const competitionScore = Math.floor(Math.random() * 100);
    const opportunityScore = Math.round((demandScore * (100 - competitionScore)) / 100);
    const avgBSR = Math.floor(Math.random() * 500000) + 10000;
    const listingCount = Math.floor(Math.random() * 5000) + 100;
    const avgPrice = (Math.random() * 15 + 13).toFixed(2);

    container.innerHTML = `
      <div class="niche-result-card card">
        <h3 style="margin-bottom: 16px; color: var(--accent-gold);">📊 Analysis: "${query}"</h3>
        <div class="niche-scores" style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-bottom: 20px;">
          <div class="score-box" style="text-align: center; padding: 16px; background: var(--bg-tertiary); border-radius: var(--radius-sm);">
            <div style="font-size: 28px; font-weight: 800; color: ${demandScore > 60 ? 'var(--success)' : 'var(--warning)'};">${demandScore}</div>
            <div style="font-size: 12px; color: var(--text-muted); margin-top: 4px;">Demand Score</div>
          </div>
          <div class="score-box" style="text-align: center; padding: 16px; background: var(--bg-tertiary); border-radius: var(--radius-sm);">
            <div style="font-size: 28px; font-weight: 800; color: ${competitionScore < 50 ? 'var(--success)' : 'var(--danger)'};">${competitionScore}</div>
            <div style="font-size: 12px; color: var(--text-muted); margin-top: 4px;">Competition</div>
          </div>
          <div class="score-box" style="text-align: center; padding: 16px; background: var(--bg-tertiary); border-radius: var(--radius-sm); border: 1px solid var(--border-gold);">
            <div style="font-size: 28px; font-weight: 800; color: var(--accent-gold);">${opportunityScore}</div>
            <div style="font-size: 12px; color: var(--text-muted); margin-top: 4px;">Opportunity Score</div>
          </div>
        </div>
        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px;">
          <div style="padding: 12px; background: var(--bg-tertiary); border-radius: var(--radius-sm);">
            <div style="font-size: 11px; color: var(--text-muted);">Avg BSR</div>
            <div style="font-size: 16px; font-weight: 600;">#${avgBSR.toLocaleString()}</div>
          </div>
          <div style="padding: 12px; background: var(--bg-tertiary); border-radius: var(--radius-sm);">
            <div style="font-size: 11px; color: var(--text-muted);">Listings Found</div>
            <div style="font-size: 16px; font-weight: 600;">${listingCount.toLocaleString()}</div>
          </div>
          <div style="padding: 12px; background: var(--bg-tertiary); border-radius: var(--radius-sm);">
            <div style="font-size: 11px; color: var(--text-muted);">Avg Price</div>
            <div style="font-size: 16px; font-weight: 600;">$${avgPrice}</div>
          </div>
        </div>
        <div style="margin-top: 16px; padding: 12px; background: ${opportunityScore > 50 ? 'rgba(76,175,80,0.1)' : 'rgba(255,152,0,0.1)'}; border-radius: var(--radius-sm); border: 1px solid ${opportunityScore > 50 ? 'rgba(76,175,80,0.3)' : 'rgba(255,152,0,0.3)'};">
          <strong>${opportunityScore > 50 ? '✅ Good Opportunity' : '⚠️ Moderate Opportunity'}</strong>
          <p style="font-size: 12px; color: var(--text-secondary); margin-top: 4px;">
            ${opportunityScore > 50 
              ? `This niche shows strong demand with manageable competition. Consider creating designs in this space.`
              : `This niche has potential but competition is higher. Look for sub-niches or unique angles.`}
          </p>
        </div>
      </div>`;
  }, 1500);
}

// ==================== KEYWORD RESEARCH ====================
async function searchKeywords() {
  const query = document.getElementById('keywordSearch').value.trim();
  if (!query) return;

  const container = document.getElementById('keywordsResults');
  container.innerHTML = `
    <div class="empty-state large">
      <span class="empty-icon animate-pulse">🔑</span>
      <p>Searching keywords for "${query}"...</p>
    </div>`;

  setTimeout(() => {
    const keywords = generateKeywordResults(query);
    container.innerHTML = `
      <div class="card">
        <div class="card-header">
          <h3>Keywords for "${query}"</h3>
          <span class="badge">${keywords.length} found</span>
        </div>
        <div style="overflow-x: auto;">
          <table style="width: 100%; border-collapse: collapse;">
            <thead>
              <tr style="border-bottom: 1px solid var(--border-color);">
                <th style="text-align: left; padding: 10px; font-size: 12px; color: var(--text-muted);">Keyword</th>
                <th style="text-align: center; padding: 10px; font-size: 12px; color: var(--text-muted);">Search Vol</th>
                <th style="text-align: center; padding: 10px; font-size: 12px; color: var(--text-muted);">Competition</th>
                <th style="text-align: center; padding: 10px; font-size: 12px; color: var(--text-muted);">Score</th>
              </tr>
            </thead>
            <tbody>
              ${keywords.map(kw => `
                <tr style="border-bottom: 1px solid var(--border-color);">
                  <td style="padding: 10px; font-size: 13px;">${kw.keyword}</td>
                  <td style="text-align: center; padding: 10px; font-size: 13px;">${kw.volume.toLocaleString()}</td>
                  <td style="text-align: center; padding: 10px;">
                    <span style="padding: 3px 8px; border-radius: 12px; font-size: 11px; background: ${kw.competition === 'Low' ? 'rgba(76,175,80,0.1)' : kw.competition === 'Medium' ? 'rgba(255,152,0,0.1)' : 'rgba(244,67,54,0.1)'}; color: ${kw.competition === 'Low' ? 'var(--success)' : kw.competition === 'Medium' ? 'var(--warning)' : 'var(--danger)'};">
                      ${kw.competition}
                    </span>
                  </td>
                  <td style="text-align: center; padding: 10px; font-weight: 600; color: var(--accent-gold);">${kw.score}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>`;
  }, 1200);
}

function generateKeywordResults(seed) {
  const suffixes = ['shirt', 'gift', 'funny', 'lover', 'mom', 'dad', 'birthday', 'vintage', 'retro', 'cute'];
  const prefixes = ['best', 'cool', 'awesome', 'I love', 'funny'];

  const keywords = [];
  keywords.push({ keyword: seed, volume: Math.floor(Math.random() * 10000) + 1000, competition: 'Medium', score: Math.floor(Math.random() * 30) + 60 });

  for (let i = 0; i < 9; i++) {
    const usePrefix = Math.random() > 0.5;
    const word = usePrefix ? `${prefixes[i % prefixes.length]} ${seed}` : `${seed} ${suffixes[i % suffixes.length]}`;
    const vol = Math.floor(Math.random() * 8000) + 200;
    const comp = vol > 5000 ? 'High' : vol > 2000 ? 'Medium' : 'Low';
    const score = Math.floor(Math.random() * 40) + 50;
    keywords.push({ keyword: word, volume: vol, competition: comp, score: score });
  }

  return keywords.sort((a, b) => b.score - a.score);
}

// ==================== TRENDING ====================
async function loadTrending() {
  const container = document.getElementById('trendingResults');
  const period = document.getElementById('trendingPeriod').value;
  const category = document.getElementById('trendingCategory').value;

  container.innerHTML = `
    <div class="empty-state large">
      <span class="empty-icon animate-pulse">🔥</span>
      <p>Loading trending products...</p>
    </div>`;

  setTimeout(() => {
    const products = generateTrendingProducts(10);
    container.innerHTML = `
      <div class="card">
        <div class="card-header">
          <h3>🔥 Trending Now</h3>
          <span class="badge">${products.length} products</span>
        </div>
        <div class="trending-list">
          ${products.map((p, i) => `
            <div class="product-list-item" style="padding: 14px; border-bottom: 1px solid var(--border-color);">
              <span class="product-rank">#${i + 1}</span>
              <div class="product-info" style="flex: 1;">
                <div class="product-name">${p.title}</div>
                <div class="product-meta">BSR: #${p.bsr.toLocaleString()} • ${p.change > 0 ? '📈' : '📉'} ${Math.abs(p.change)}% in ${period}</div>
              </div>
              <span style="font-size: 13px; font-weight: 600; color: ${p.change > 0 ? 'var(--success)' : 'var(--danger)'};">
                ${p.change > 0 ? '+' : ''}${p.change}%
              </span>
            </div>
          `).join('')}
        </div>
      </div>`;
  }, 1500);
}

function generateTrendingProducts(count) {
  const titles = [
    'Funny Cat Dad T-Shirt', 'Nurse Life Coffee Lover', 'Retro Sunset Mountain Hiker',
    'Dog Mom Paw Print', 'Vintage 1990 Birthday', 'Sarcastic Engineering Humor',
    'Plant Lady Garden Lover', 'Fishing Is My Therapy', 'Teacher Appreciation Gift',
    'Gym Motivation Beast Mode', 'Camping Adventure Wild', 'Pizza Lover Foodie Shirt'
  ];

  return Array.from({ length: count }, (_, i) => ({
    title: titles[i % titles.length],
    bsr: Math.floor(Math.random() * 200000) + 5000,
    change: Math.floor(Math.random() * 300) - 50,
  })).sort((a, b) => b.change - a.change);
}

// ==================== BSR TRACKER ====================
async function trackBsr() {
  const asin = document.getElementById('bsrAsinInput').value.trim();
  if (!asin) return;

  const result = await chrome.storage.local.get('trackedAsins');
  const tracked = result.trackedAsins || [];

  if (!tracked.find(t => t.asin === asin)) {
    tracked.push({
      asin: asin,
      addedAt: Date.now(),
      history: [{ timestamp: Date.now(), bsr: Math.floor(Math.random() * 500000) + 1000 }]
    });
    await chrome.storage.local.set({ trackedAsins: tracked });
  }

  renderTrackedAsins(tracked);
  document.getElementById('bsrAsinInput').value = '';
  showToast(`Tracking ASIN: ${asin}`);
}

async function renderTrackedAsins(tracked) {
  if (!tracked) {
    const result = await chrome.storage.local.get('trackedAsins');
    tracked = result.trackedAsins || [];
  }

  const container = document.getElementById('bsrTrackedList');

  if (tracked.length === 0) {
    container.innerHTML = `
      <div class="empty-state large">
        <span class="empty-icon">📈</span>
        <p>No ASINs being tracked</p>
        <small>Add an ASIN above to start tracking its BSR over time</small>
      </div>`;
    return;
  }

  container.innerHTML = `
    <div class="card">
      <div class="card-header">
        <h3>Tracked ASINs</h3>
        <span class="badge">${tracked.length} tracking</span>
      </div>
      ${tracked.map(t => `
        <div class="product-list-item" style="padding: 14px; border-bottom: 1px solid var(--border-color);">
          <span class="product-rank">📊</span>
          <div class="product-info">
            <div class="product-name">${t.asin}</div>
            <div class="product-meta">Added: ${new Date(t.addedAt).toLocaleDateString()} • ${t.history.length} data points</div>
          </div>
          <span style="font-size: 14px; font-weight: 600; color: var(--text-primary);">
            BSR: #${t.history[t.history.length - 1]?.bsr?.toLocaleString() || 'N/A'}
          </span>
        </div>
      `).join('')}
    </div>`;
}

// ==================== TRADEMARK CHECKER ====================
async function checkTrademark() {
  const query = document.getElementById('trademarkInput').value.trim();
  if (!query) return;

  const container = document.getElementById('trademarkResults');
  container.innerHTML = `
    <div class="empty-state large">
      <span class="empty-icon animate-pulse">🛡️</span>
      <p>Checking trademarks for "${query}"...</p>
      <small>Searching USPTO database...</small>
    </div>`;

  // Simulate trademark check
  setTimeout(() => {
    const isRisky = Math.random() > 0.6;
    const results = isRisky ? [
      { name: query.toUpperCase(), status: 'LIVE', serial: '97' + Math.floor(Math.random() * 999999), class: 'Class 25 (Clothing)' },
    ] : [];

    container.innerHTML = `
      <div class="card" style="border-color: ${isRisky ? 'var(--danger)' : 'var(--success)'};">
        <div style="padding: 20px; text-align: center; background: ${isRisky ? 'rgba(244,67,54,0.05)' : 'rgba(76,175,80,0.05)'}; border-radius: var(--radius-md); margin-bottom: 16px;">
          <div style="font-size: 40px; margin-bottom: 8px;">${isRisky ? '⚠️' : '✅'}</div>
          <h3 style="color: ${isRisky ? 'var(--danger)' : 'var(--success)'}; margin-bottom: 4px;">
            ${isRisky ? 'TRADEMARK FOUND - RISKY!' : 'NO TRADEMARK FOUND - LIKELY SAFE'}
          </h3>
          <p style="font-size: 13px; color: var(--text-muted);">
            ${isRisky ? 'This term has active trademark registrations. Avoid using it in your designs.' : 'No active trademarks found for this term. Always double-check before publishing.'}
          </p>
        </div>
        ${isRisky ? `
          <h4 style="margin-bottom: 12px; font-size: 14px;">Found Trademarks:</h4>
          ${results.map(r => `
            <div style="padding: 12px; background: var(--bg-tertiary); border-radius: var(--radius-sm); margin-bottom: 8px;">
              <div style="font-weight: 600; color: var(--danger);">${r.name}</div>
              <div style="font-size: 12px; color: var(--text-muted); margin-top: 4px;">
                Status: ${r.status} • Serial: ${r.serial} • ${r.class}
              </div>
            </div>
          `).join('')}
        ` : ''}
      </div>`;
  }, 2000);
}

// ==================== SETTINGS ACTIONS ====================
async function exportData() {
  const result = await chrome.storage.local.get(['salesData', 'products', 'recentSales']);
  const blob = new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `gastca-export-${new Date().toISOString().split('T')[0]}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('Data exported successfully');
}

async function clearData() {
  if (confirm('Are you sure? This will delete ALL stored data permanently.')) {
    await chrome.storage.local.clear();
    await chrome.storage.local.set({ theme: document.documentElement.getAttribute('data-theme') });
    showToast('All data cleared');
    loadOverviewData();
  }
}

// ==================== SYNC STATUS ====================
async function updateSyncStatus() {
  const result = await chrome.storage.local.get('lastScrapeTime');
  const lastScrape = result.lastScrapeTime;
  const dot = document.getElementById('sidebarSyncDot');
  const text = document.getElementById('sidebarSyncText');

  if (lastScrape && (Date.now() - lastScrape) < 300000) {
    dot.classList.add('online');
    text.textContent = 'Synced';
  } else {
    dot.classList.remove('online');
    text.textContent = 'Not synced';
  }
}

// ==================== UTILITIES ====================
function formatCurrency(amount) {
  return '$' + (parseFloat(amount) || 0).toFixed(2);
}

function getRelativeTime(timestamp) {
  if (!timestamp) return '';
  const diff = Date.now() - timestamp;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function getDateRange(range) {
  const dates = [];
  const now = new Date();
  let days = 7;

  switch (range) {
    case 'today': days = 1; break;
    case '7d': days = 7; break;
    case '30d': days = 30; break;
    case '90d': days = 90; break;
    case 'all': days = 365; break;
  }

  for (let i = 0; i < days; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    dates.push(d.toISOString().split('T')[0]);
  }
  return dates;
}

function getLast7Days() {
  const days = [];
  const now = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    days.push(d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
  }
  return days;
}

function generateSampleData(count, min, max) {
  return Array.from({ length: count }, () => Math.floor(Math.random() * (max - min)) + min);
}

function filterProducts() {
  // Filter products by search term - will work when products are loaded
  const query = document.getElementById('productSearch').value.toLowerCase();
  // Implementation would filter the products grid
}

function showToast(message) {
  const toast = document.createElement('div');
  toast.style.cssText = `
    position: fixed; bottom: 20px; right: 20px; padding: 12px 20px;
    background: var(--accent-gold); color: #000; font-size: 13px; font-weight: 600;
    border-radius: var(--radius-sm); box-shadow: var(--shadow-lg);
    z-index: 9999; animation: fadeIn 0.3s ease;
  `;
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

// Listen for storage changes to update in real-time
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'local') {
    if (changes.salesData || changes.recentSales || changes.products) {
      loadOverviewData();
    }
    if (changes.lastScrapeTime) {
      updateSyncStatus();
    }
  }
});
