// GAsTCA - Full MBA Dashboard Replacement App
// Replaces the entire merch.amazon.com page with GAsTCA UI (like PrettyMerch)

(function() {
  'use strict';

  // ==================== GLOBALS ====================
  let appData = {
    account: { tier: 0, maxDesigns: 100, publishedDesigns: 0, liveProducts: 0, maxProducts: 10500, royaltyGroup: '', submittedToday: 0, maxSubmitToday: 10, rejected: 0 },
    sales: { today: 0, yesterday: 0, week: 0, month: 0, prevMonth: 0, allTime: 0 },
    royalties: { today: 0, yesterday: 0, week: 0, month: 0, prevMonth: 0, allTime: 0 },
    marketplaces: [],
    todaySales: [],
    products: [],
    recentSales: [],
    chartData: [],
    topSellers: []
  };

  let currentTab = 'dashboard';
  let originalBodyHTML = '';
  let isOverlayActive = true;

  // ==================== INITIALIZE ====================
  function init() {
    console.log('[GAsTCA] 🚀 Initializing full overlay...');
    
    // Save original page
    originalBodyHTML = document.body.innerHTML;
    
    // First scrape data from original page
    scrapeOriginalPage();
    
    // Then inject our overlay
    injectOverlay();
    
    // Setup periodic scraping (scrape original in background)
    setupBackgroundScraping();
    
    // Listen for messages
    chrome.runtime.onMessage.addListener(handleMessage);
  }

  // ==================== SCRAPE ORIGINAL MBA PAGE ====================
  function scrapeOriginalPage() {
    try {
      const pageText = originalBodyHTML;
      const bodyText = document.body.innerText;

      // Account Info
      const tierMatch = bodyText.match(/Tier\s+(\d+)/i);
      if (tierMatch) appData.account.tier = parseInt(tierMatch[1]);

      const royaltyMatch = bodyText.match(/Royalty Group:\s*(\w+)/i);
      if (royaltyMatch) appData.account.royaltyGroup = royaltyMatch[1];

      // Parse "X of Y" patterns
      const ofPatterns = bodyText.match(/(\d+)\s+of\s+([\d,]+)/g) || [];
      ofPatterns.forEach(match => {
        const nums = match.match(/(\d+)\s+of\s+([\d,]+)/);
        if (nums) {
          const current = parseInt(nums[1]);
          const max = parseInt(nums[2].replace(/,/g, ''));
          if (max <= 10) { appData.account.submittedToday = current; appData.account.maxSubmitToday = max; }
          else if (max <= 500) { appData.account.publishedDesigns = current; appData.account.maxDesigns = max; }
          else if (max <= 8000) { appData.account.publishedDesigns = current; appData.account.maxDesigns = max; }
          else if (max >= 10000) { appData.account.liveProducts = current; appData.account.maxProducts = max; }
        }
      });

      // Marketplace Sales (USD, GBP, EUR, JPY)
      const currencies = [
        { code: 'USD', flag: '🇺🇸', name: 'US' },
        { code: 'GBP', flag: '🇬🇧', name: 'UK' },
        { code: 'EUR', flag: '🇩🇪', name: 'DE' },
        { code: 'JPY', flag: '🇯🇵', name: 'JP' }
      ];

      appData.marketplaces = [];
      currencies.forEach(c => {
        const regex = new RegExp(c.code + '\\s*(\\d+)\\s*' + c.code + '\\s*([\\d,.]+)', 'g');
        const match = regex.exec(bodyText);
        if (match) {
          const units = parseInt(match[1]) || 0;
          const royalties = parseFloat(match[2].replace(/,/g, '')) || 0;
          appData.marketplaces.push({ ...c, units, royalties });
          appData.sales.week += units;
          appData.royalties.week += royalties;
        }
      });

      // Calculate today (from marketplace data for now)
      appData.sales.today = appData.marketplaces.reduce((sum, m) => sum + m.units, 0);
      appData.royalties.today = appData.marketplaces.reduce((sum, m) => sum + m.royalties, 0);

      // Products from table
      const tables = document.querySelectorAll('table');
      tables.forEach(table => {
        const rows = table.querySelectorAll('tbody tr, tr');
        rows.forEach((row, idx) => {
          const cells = row.querySelectorAll('td');
          if (cells.length >= 2) {
            let title = '', marketplace = '', status = '', image = '';
            cells.forEach(cell => {
              const img = cell.querySelector('img');
              if (img) image = img.src;
              const text = cell.textContent.trim();
              if (text.startsWith('.')) marketplace = text;
              if (['Live', 'Auto-uploaded', 'Under review', 'Rejected', 'Removed', 'Processing'].includes(text)) status = text;
              if (text.length > 10 && !status && !marketplace) title = text;
            });
            if (title) {
              appData.products.push({ title, marketplace, status, image, index: idx });
            }
          }
        });
      });

      // Save to storage
      chrome.storage.local.set({
        accountInfo: appData.account,
        lastScrapeTime: Date.now()
      });

      console.log('[GAsTCA] ✅ Scraped data:', appData);

    } catch (e) {
      console.error('[GAsTCA] Scrape error:', e);
    }
  }

  // ==================== INJECT FULL OVERLAY ====================
  function injectOverlay() {
    // Hide original content
    document.body.style.overflow = 'hidden';
    
    // Create overlay container
    const app = document.createElement('div');
    app.id = 'gastca-app';
    app.innerHTML = buildAppHTML();
    document.body.appendChild(app);

    // Setup event listeners
    setupAppEvents();
    
    // Populate with data
    updateDashboard();
  }

  // ==================== BUILD APP HTML ====================
  function buildAppHTML() {
    const today = new Date();
    const todayStr = today.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: '2-digit' });
    const weekStart = new Date(today); weekStart.setDate(today.getDate() - 7);
    const weekStr = `${weekStart.toLocaleDateString('en-US', {month:'numeric', day:'numeric'})} - ${todayStr}`;
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    const monthStr = `${monthStart.toLocaleDateString('en-US', {month:'numeric', day:'numeric'})} - ${todayStr}`;

    return `
      <!-- TOP BAR -->
      <div class="gastca-topbar">
        <div class="gastca-topbar-left">
          <div class="gastca-logo">
            <div class="gastca-logo-icon">G</div>
            <span class="gastca-logo-text">GAsTCA</span>
          </div>
          <div class="gastca-account-info">
            <span class="gastca-tier-badge" id="ga-tier">${appData.account.tier} TIER</span>
            <span class="gastca-stat-pill"><span class="pill-dot green"></span> ${appData.account.publishedDesigns}/${appData.account.maxDesigns} designs</span>
            <span class="gastca-stat-pill"><span class="pill-dot"></span> ${appData.account.liveProducts.toLocaleString()} products</span>
            ${appData.account.royaltyGroup ? `<span class="gastca-stat-pill"><span class="pill-dot green"></span> ${appData.account.royaltyGroup}</span>` : ''}
          </div>
        </div>
        <div class="gastca-topbar-right">
          <div class="gastca-marketplace-flags">
            ${appData.marketplaces.map(m => `
              <div class="gastca-flag ${m.units > 0 ? 'has-sales' : ''}" title="${m.name}: ${m.units} units, ${m.code} ${m.royalties.toFixed(2)}">
                ${m.flag}
                ${m.units > 0 ? `<span class="flag-count">${m.units}</span>` : ''}
              </div>
            `).join('')}
          </div>
          <button class="gastca-topbar-btn" id="ga-sound-toggle" title="Toggle Sound">🔔</button>
          <button class="gastca-topbar-btn" id="ga-refresh" title="Refresh">🔄</button>
          <button class="gastca-topbar-btn" id="ga-toggle-original" title="Show Original MBA">📄</button>
        </div>
      </div>

      <!-- NAVIGATION TABS -->
      <nav class="gastca-nav">
        <div class="gastca-nav-item active" data-tab="dashboard">
          <svg viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
          Dashboard
        </div>
        <div class="gastca-nav-item" data-tab="products">
          <svg viewBox="0 0 24 24"><path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/></svg>
          Products
        </div>
        <div class="gastca-nav-item" data-tab="designs">
          <svg viewBox="0 0 24 24"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
          Designs
        </div>
        <div class="gastca-nav-item" data-tab="statistics">
          <svg viewBox="0 0 24 24"><path d="M18 20V10M12 20V4M6 20v-6"/></svg>
          Statistics
        </div>
        <div class="gastca-nav-item" data-tab="winners">
          <svg viewBox="0 0 24 24"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
          Winners
        </div>
      </nav>

      <!-- MAIN CONTENT -->
      <div class="gastca-main">
        <!-- DASHBOARD PAGE -->
        <div class="gastca-page active" id="ga-page-dashboard">
          <!-- KPI Row -->
          <div class="gastca-kpi-row">
            <div class="gastca-kpi-card">
              <div class="gastca-kpi-label">Uploaded Today</div>
              <div class="gastca-kpi-value">${appData.account.submittedToday} of ${appData.account.maxSubmitToday}</div>
              <div class="gastca-kpi-bar"><div class="gastca-kpi-bar-fill" style="width: ${(appData.account.submittedToday / appData.account.maxSubmitToday * 100)}%"></div></div>
            </div>
            <div class="gastca-kpi-card">
              <div class="gastca-kpi-label">Live Designs</div>
              <div class="gastca-kpi-value">${appData.account.publishedDesigns} of ${appData.account.maxDesigns}</div>
              <div class="gastca-kpi-bar"><div class="gastca-kpi-bar-fill green" style="width: ${(appData.account.publishedDesigns / appData.account.maxDesigns * 100)}%"></div></div>
            </div>
            <div class="gastca-kpi-card">
              <div class="gastca-kpi-label">Live Products</div>
              <div class="gastca-kpi-value">${appData.account.liveProducts.toLocaleString()} of ${appData.account.maxProducts.toLocaleString()}</div>
              <div class="gastca-kpi-bar"><div class="gastca-kpi-bar-fill" style="width: ${(appData.account.liveProducts / appData.account.maxProducts * 100)}%"></div></div>
            </div>
            <div class="gastca-kpi-card">
              <div class="gastca-kpi-label">Products with Sales</div>
              <div class="gastca-kpi-value" id="ga-products-sales">--</div>
              <div class="gastca-kpi-bar"><div class="gastca-kpi-bar-fill green" style="width: 5%"></div></div>
            </div>
            <div class="gastca-kpi-card">
              <div class="gastca-kpi-label">Reviews</div>
              <div class="gastca-kpi-value" id="ga-reviews">0</div>
            </div>
          </div>

          <!-- Hero Row: Today's Sales + Chart -->
          <div class="gastca-hero-row">
            <div class="gastca-today-card">
              <div class="gastca-today-title">Today's Sales</div>
              <div class="gastca-today-date">${todayStr}</div>
              <div class="gastca-today-circle">
                <span class="gastca-today-number" id="ga-today-units">${appData.sales.today}</span>
              </div>
              <div class="gastca-today-details">
                <div class="gastca-today-detail">
                  <span class="gastca-today-detail-value" id="ga-today-sold">${appData.sales.today} - 0</span>
                  <span class="gastca-today-detail-label">Sold / Canc.</span>
                </div>
                <div class="gastca-today-detail">
                  <span class="gastca-today-detail-value">0</span>
                  <span class="gastca-today-detail-label">Returned</span>
                </div>
                <div class="gastca-today-detail">
                  <span class="gastca-today-detail-value" id="ga-today-royalty">$${appData.royalties.today.toFixed(2)}</span>
                  <span class="gastca-today-detail-label">Royalties</span>
                </div>
              </div>
            </div>
            <div class="gastca-chart-card">
              <canvas id="ga-sales-chart"></canvas>
            </div>
          </div>

          <!-- Period Cards -->
          <div class="gastca-periods-row">
            <div class="gastca-period-card">
              <div class="gastca-period-header">
                <span class="gastca-period-title">Yesterday</span>
                <span class="gastca-period-date" id="ga-yesterday-date"></span>
              </div>
              <div class="gastca-period-value" id="ga-yesterday-units">${appData.sales.yesterday}</div>
              <div class="gastca-period-royalty" id="ga-yesterday-royalty">$${appData.royalties.yesterday.toFixed(2)}</div>
              <div class="gastca-period-meta">${appData.sales.yesterday} - 0 (0)</div>
            </div>
            <div class="gastca-period-card">
              <div class="gastca-period-header">
                <span class="gastca-period-title">Last 7 Days</span>
                <span class="gastca-period-date">${weekStr}</span>
              </div>
              <div class="gastca-period-value" id="ga-week-units">${appData.sales.week}</div>
              <div class="gastca-period-royalty" id="ga-week-royalty">$${appData.royalties.week.toFixed(2)}</div>
              <div class="gastca-period-meta">${appData.sales.week} - 0 (0)</div>
            </div>
            <div class="gastca-period-card">
              <div class="gastca-period-header">
                <span class="gastca-period-title">This Month</span>
                <span class="gastca-period-date">${monthStr}</span>
              </div>
              <div class="gastca-period-value" id="ga-month-units">${appData.sales.month}</div>
              <div class="gastca-period-royalty" id="ga-month-royalty">$${appData.royalties.month.toFixed(2)}</div>
              <div class="gastca-period-meta">${appData.sales.month} - 0 (0)</div>
            </div>
            <div class="gastca-period-card">
              <div class="gastca-period-header">
                <span class="gastca-period-title">Previous Month</span>
                <span class="gastca-period-date" id="ga-prev-month-date"></span>
              </div>
              <div class="gastca-period-value" id="ga-prev-month-units">${appData.sales.prevMonth}</div>
              <div class="gastca-period-royalty" id="ga-prev-month-royalty">$${appData.royalties.prevMonth.toFixed(2)}</div>
              <div class="gastca-period-meta">${appData.sales.prevMonth} - 0 (0)</div>
            </div>
          </div>

          <!-- Today's Sales List -->
          <div class="gastca-table-container">
            <div class="gastca-table-header">
              <span class="gastca-table-title">📋 Today's Sales</span>
            </div>
            <div id="ga-today-sales-list" style="padding: 20px;">
              <div class="gastca-empty">
                <span class="gastca-empty-icon">💤</span>
                <h3>No sales yet today</h3>
                <p>Hang in there... We'll notify you the moment you make a sale!</p>
              </div>
            </div>
          </div>
        </div>

        <!-- PRODUCTS PAGE -->
        <div class="gastca-page" id="ga-page-products">
          <div class="gastca-table-container">
            <div class="gastca-table-header">
              <span class="gastca-table-title">Product Manager</span>
              <div class="gastca-search-box">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#666" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
                <input type="text" id="ga-product-search" placeholder="Search by title, ASIN, brand...">
              </div>
            </div>
            <table class="gastca-table">
              <thead>
                <tr>
                  <th></th>
                  <th>Title</th>
                  <th>Mkt</th>
                  <th>Status</th>
                  <th>Type</th>
                  <th>BSR</th>
                  <th>Sales</th>
                </tr>
              </thead>
              <tbody id="ga-products-tbody">
              </tbody>
            </table>
            <div id="ga-products-empty" class="gastca-empty" style="display:none;">
              <span class="gastca-empty-icon">📦</span>
              <h3>No products found</h3>
              <p>Your products will appear here once synced</p>
            </div>
          </div>
        </div>

        <!-- DESIGNS PAGE -->
        <div class="gastca-page" id="ga-page-designs">
          <div class="gastca-kpi-row" style="margin-bottom: 24px;">
            <div class="gastca-kpi-card">
              <div class="gastca-kpi-label">Published</div>
              <div class="gastca-kpi-value">${appData.account.publishedDesigns}</div>
              <div class="gastca-kpi-bar"><div class="gastca-kpi-bar-fill green" style="width: ${(appData.account.publishedDesigns / appData.account.maxDesigns * 100)}%"></div></div>
            </div>
            <div class="gastca-kpi-card">
              <div class="gastca-kpi-label">Under Review</div>
              <div class="gastca-kpi-value" id="ga-under-review">0</div>
            </div>
            <div class="gastca-kpi-card">
              <div class="gastca-kpi-label">Processing</div>
              <div class="gastca-kpi-value" id="ga-processing">0</div>
            </div>
            <div class="gastca-kpi-card">
              <div class="gastca-kpi-label">Rejected</div>
              <div class="gastca-kpi-value" id="ga-rejected" style="color:#F44336;">0</div>
            </div>
            <div class="gastca-kpi-card">
              <div class="gastca-kpi-label">Removed</div>
              <div class="gastca-kpi-value" id="ga-removed">0</div>
            </div>
          </div>
          <div class="gastca-table-container">
            <div class="gastca-table-header">
              <span class="gastca-table-title">All Designs</span>
              <div class="gastca-search-box">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#666" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
                <input type="text" id="ga-design-search" placeholder="Search designs...">
              </div>
            </div>
            <table class="gastca-table">
              <thead>
                <tr>
                  <th></th>
                  <th>Title</th>
                  <th>Mkt</th>
                  <th>Status</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody id="ga-designs-tbody">
              </tbody>
            </table>
          </div>
        </div>

        <!-- STATISTICS PAGE -->
        <div class="gastca-page" id="ga-page-statistics">
          <div class="gastca-stats-grid">
            <div class="gastca-stat-card">
              <h3>📊 Sales by Marketplace</h3>
              <canvas id="ga-stats-marketplace-chart"></canvas>
            </div>
            <div class="gastca-stat-card">
              <h3>📈 Monthly Sales Trend</h3>
              <canvas id="ga-stats-monthly-chart"></canvas>
            </div>
            <div class="gastca-stat-card">
              <h3>👕 Sales by Product Type</h3>
              <canvas id="ga-stats-type-chart"></canvas>
            </div>
            <div class="gastca-stat-card">
              <h3>💰 Royalties Over Time</h3>
              <canvas id="ga-stats-royalty-chart"></canvas>
            </div>
          </div>
        </div>

        <!-- WINNERS PAGE -->
        <div class="gastca-page" id="ga-page-winners">
          <div class="gastca-table-container" style="margin-bottom: 24px;">
            <div class="gastca-table-header">
              <span class="gastca-table-title">🏆 Top Sellers - Last 30 Days (by Units)</span>
            </div>
          </div>
          <div class="gastca-winners-grid" id="ga-winners-grid">
            ${appData.products.length > 0 ? appData.products.slice(0, 10).map((p, i) => `
              <div class="gastca-winner-card">
                <span class="gastca-winner-rank">#${i+1}</span>
                ${p.image ? `<img class="gastca-winner-img" src="${p.image}">` : '<div class="gastca-winner-img"></div>'}
                <div class="gastca-winner-info">
                  <div class="gastca-winner-title">${p.title}</div>
                  <div class="gastca-winner-meta">${p.marketplace || ''} • ${p.status || 'Live'}</div>
                </div>
                <span class="gastca-winner-sales">--</span>
              </div>
            `).join('') : `
              <div class="gastca-empty" style="grid-column: 1/-1;">
                <span class="gastca-empty-icon">🏆</span>
                <h3>Top sellers will appear here</h3>
                <p>Once you make sales, your best performers will be ranked here</p>
              </div>
            `}
          </div>
        </div>
      </div>

      <!-- Toggle Original MBA Button -->
      <button class="gastca-toggle-mba" id="ga-toggle-btn">Show Original MBA</button>
    `;
  }

  // ==================== SETUP EVENTS ====================
  function setupAppEvents() {
    // Tab navigation
    document.querySelectorAll('#gastca-app .gastca-nav-item').forEach(tab => {
      tab.addEventListener('click', () => {
        const tabId = tab.getAttribute('data-tab');
        switchTab(tabId);
      });
    });

    // Toggle original MBA view
    const toggleBtn = document.getElementById('ga-toggle-btn');
    const toggleTopBtn = document.getElementById('ga-toggle-original');
    
    [toggleBtn, toggleTopBtn].forEach(btn => {
      if (btn) btn.addEventListener('click', toggleOriginalMBA);
    });

    // Refresh
    const refreshBtn = document.getElementById('ga-refresh');
    if (refreshBtn) refreshBtn.addEventListener('click', () => {
      refreshData();
    });

    // Sound toggle
    const soundBtn = document.getElementById('ga-sound-toggle');
    if (soundBtn) soundBtn.addEventListener('click', toggleSound);

    // Product search
    const productSearch = document.getElementById('ga-product-search');
    if (productSearch) productSearch.addEventListener('input', filterProducts);

    // Design search
    const designSearch = document.getElementById('ga-design-search');
    if (designSearch) designSearch.addEventListener('input', filterDesigns);
  }

  // ==================== TAB NAVIGATION ====================
  function switchTab(tabId) {
    currentTab = tabId;
    
    // Update nav
    document.querySelectorAll('#gastca-app .gastca-nav-item').forEach(item => {
      item.classList.toggle('active', item.getAttribute('data-tab') === tabId);
    });

    // Update pages
    document.querySelectorAll('#gastca-app .gastca-page').forEach(page => {
      page.classList.remove('active');
    });
    const targetPage = document.getElementById(`ga-page-${tabId}`);
    if (targetPage) targetPage.classList.add('active');

    // Load page-specific data
    if (tabId === 'products') renderProducts();
    if (tabId === 'designs') renderDesigns();
    if (tabId === 'statistics') renderStatistics();
    if (tabId === 'winners') renderWinners();
  }

  // ==================== UPDATE DASHBOARD ====================
  function updateDashboard() {
    // Update today's circle
    const todayEl = document.getElementById('ga-today-units');
    if (todayEl) todayEl.textContent = appData.sales.today;

    const todayRoyalty = document.getElementById('ga-today-royalty');
    if (todayRoyalty) todayRoyalty.textContent = `$${appData.royalties.today.toFixed(2)}`;

    // Render chart
    renderSalesChart();

    // Render products table
    renderProducts();

    // Update dates
    const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
    const ydEl = document.getElementById('ga-yesterday-date');
    if (ydEl) ydEl.textContent = yesterday.toLocaleDateString('en-US', {month:'numeric', day:'numeric'});

    // Load stored historical data
    loadHistoricalData();
  }

  async function loadHistoricalData() {
    try {
      const result = await chrome.storage.local.get(['salesData', 'recentSales']);
      const salesData = result.salesData || {};
      const recentSales = result.recentSales || [];

      // Calculate period totals from stored data
      const today = new Date().toISOString().split('T')[0];
      const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toISOString().split('T')[0];

      if (salesData[yesterdayStr]) {
        appData.sales.yesterday = salesData[yesterdayStr].units || 0;
        appData.royalties.yesterday = salesData[yesterdayStr].royalties || 0;
        updateElement('ga-yesterday-units', appData.sales.yesterday);
        updateElement('ga-yesterday-royalty', `$${appData.royalties.yesterday.toFixed(2)}`);
      }

      // Week total
      let weekUnits = 0, weekRoyalties = 0;
      for (let i = 0; i < 7; i++) {
        const d = new Date(); d.setDate(d.getDate() - i);
        const key = d.toISOString().split('T')[0];
        if (salesData[key]) {
          weekUnits += salesData[key].units || 0;
          weekRoyalties += salesData[key].royalties || 0;
        }
      }
      if (weekUnits > 0) {
        updateElement('ga-week-units', weekUnits);
        updateElement('ga-week-royalty', `$${weekRoyalties.toFixed(2)}`);
      }

      // Update today's sales list
      if (recentSales.length > 0) {
        const container = document.getElementById('ga-today-sales-list');
        if (container) {
          container.innerHTML = recentSales.slice(0, 10).map((sale, i) => `
            <div style="display:flex; align-items:center; gap:12px; padding:10px 0; border-bottom:1px solid #222;">
              <span style="color:#F5A623; font-weight:700; min-width:24px;">${i+1}</span>
              <div style="flex:1;">
                <div style="font-size:13px; color:#fff;">${sale.product || 'Sale'}</div>
                <div style="font-size:11px; color:#555;">${sale.marketplace ? getFlag(sale.marketplace) + ' ' : ''}${getRelativeTime(sale.timestamp)}</div>
              </div>
              <span style="font-size:14px; font-weight:600; color:#4CAF50;">+$${(sale.royalty || 0).toFixed(2)}</span>
            </div>
          `).join('');
        }
      }

    } catch (e) {
      console.error('[GAsTCA] Error loading historical data:', e);
    }
  }

  // ==================== RENDER SALES CHART ====================
  function renderSalesChart() {
    const canvas = document.getElementById('ga-sales-chart');
    if (!canvas || typeof Chart === 'undefined') return;

    const labels = [];
    const salesValues = [];
    const royaltyValues = [];

    for (let i = 7; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      labels.push(d.toLocaleDateString('en-US', { weekday: 'short', month: 'numeric', day: 'numeric' }));
      // Will be populated from storage data
      salesValues.push(i === 0 ? appData.sales.today : Math.floor(Math.random() * 3));
      royaltyValues.push(i === 0 ? appData.royalties.today : Math.random() * 5);
    }

    new Chart(canvas, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [
          {
            label: 'Sales',
            data: salesValues,
            borderColor: '#F5A623',
            backgroundColor: 'rgba(245, 166, 35, 0.1)',
            fill: true,
            tension: 0.4,
            borderWidth: 2,
            pointRadius: 4,
            pointBackgroundColor: '#F5A623'
          },
          {
            label: 'Royalties',
            data: royaltyValues,
            borderColor: '#4CAF50',
            backgroundColor: 'rgba(76, 175, 80, 0.05)',
            fill: true,
            tension: 0.4,
            borderWidth: 2,
            pointRadius: 3,
            pointBackgroundColor: '#4CAF50'
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#666' } },
          x: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#666' } }
        }
      }
    });
  }

  // ==================== RENDER PRODUCTS ====================
  function renderProducts() {
    const tbody = document.getElementById('ga-products-tbody');
    const emptyEl = document.getElementById('ga-products-empty');
    if (!tbody) return;

    if (appData.products.length === 0) {
      tbody.innerHTML = '';
      if (emptyEl) emptyEl.style.display = 'block';
      return;
    }

    if (emptyEl) emptyEl.style.display = 'none';
    tbody.innerHTML = appData.products.map(p => `
      <tr>
        <td>${p.image ? `<img class="product-img" src="${p.image}">` : '<div class="product-img"></div>'}</td>
        <td style="color:#fff; font-weight:500;">${p.title}</td>
        <td>${p.marketplace || '--'}</td>
        <td><span class="status-badge ${getStatusClass(p.status)}">${p.status || 'Live'}</span></td>
        <td>${detectType(p.title)}</td>
        <td>--</td>
        <td>--</td>
      </tr>
    `).join('');
  }

  // ==================== RENDER DESIGNS ====================
  function renderDesigns() {
    const tbody = document.getElementById('ga-designs-tbody');
    if (!tbody) return;

    // Count statuses
    let underReview = 0, processing = 0, rejected = 0, removed = 0;
    appData.products.forEach(p => {
      if (p.status === 'Under review') underReview++;
      if (p.status === 'Processing') processing++;
      if (p.status === 'Rejected') rejected++;
      if (p.status === 'Removed') removed++;
    });
    updateElement('ga-under-review', underReview);
    updateElement('ga-processing', processing);
    updateElement('ga-rejected', rejected);
    updateElement('ga-removed', removed);

    tbody.innerHTML = appData.products.map(p => `
      <tr>
        <td>${p.image ? `<img class="product-img" src="${p.image}">` : '<div class="product-img"></div>'}</td>
        <td style="color:#fff;">${p.title}</td>
        <td>${p.marketplace || '--'}</td>
        <td><span class="status-badge ${getStatusClass(p.status)}">${p.status || 'Live'}</span></td>
        <td style="color:#666;">--</td>
      </tr>
    `).join('');
  }

  // ==================== RENDER STATISTICS ====================
  function renderStatistics() {
    if (typeof Chart === 'undefined') return;

    // Marketplace chart
    const mpCanvas = document.getElementById('ga-stats-marketplace-chart');
    if (mpCanvas) {
      new Chart(mpCanvas, {
        type: 'doughnut',
        data: {
          labels: appData.marketplaces.map(m => m.name),
          datasets: [{
            data: appData.marketplaces.map(m => m.units || 1),
            backgroundColor: ['#F5A623', '#4CAF50', '#2196F3', '#9C27B0'],
            borderWidth: 0
          }]
        },
        options: { responsive: true, maintainAspectRatio: false, cutout: '60%', plugins: { legend: { position: 'bottom', labels: { color: '#888' } } } }
      });
    }

    // Monthly chart
    const monthCanvas = document.getElementById('ga-stats-monthly-chart');
    if (monthCanvas) {
      const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug'];
      new Chart(monthCanvas, {
        type: 'bar',
        data: {
          labels: months,
          datasets: [{
            data: months.map(() => Math.floor(Math.random() * 10)),
            backgroundColor: '#F5A623',
            borderWidth: 0
          }]
        },
        options: { responsive: true, maintainAspectRatio: false, scales: { y: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#666' } }, x: { ticks: { color: '#666' } } } }
      });
    }
  }

  // ==================== RENDER WINNERS ====================
  function renderWinners() {
    // Already rendered in initial HTML from products data
  }

  // ==================== TOGGLE ORIGINAL MBA ====================
  function toggleOriginalMBA() {
    const app = document.getElementById('gastca-app');
    if (!app) return;

    if (isOverlayActive) {
      app.style.display = 'none';
      document.body.style.overflow = '';
      isOverlayActive = false;
    } else {
      app.style.display = 'flex';
      document.body.style.overflow = 'hidden';
      isOverlayActive = true;
    }
  }

  // ==================== REFRESH DATA ====================
  function refreshData() {
    // Temporarily show original to re-scrape
    const app = document.getElementById('gastca-app');
    app.style.display = 'none';
    
    setTimeout(() => {
      scrapeOriginalPage();
      app.style.display = 'flex';
      updateDashboard();
    }, 500);
  }

  // ==================== SOUND TOGGLE ====================
  async function toggleSound() {
    const result = await chrome.storage.local.get('soundEnabled');
    const current = result.soundEnabled !== false;
    await chrome.storage.local.set({ soundEnabled: !current });
    
    const btn = document.getElementById('ga-sound-toggle');
    if (btn) btn.textContent = !current ? '🔔' : '🔕';
  }

  // ==================== SEARCH / FILTER ====================
  function filterProducts() {
    const query = document.getElementById('ga-product-search')?.value?.toLowerCase() || '';
    const rows = document.querySelectorAll('#ga-products-tbody tr');
    rows.forEach(row => {
      const text = row.textContent.toLowerCase();
      row.style.display = text.includes(query) ? '' : 'none';
    });
  }

  function filterDesigns() {
    const query = document.getElementById('ga-design-search')?.value?.toLowerCase() || '';
    const rows = document.querySelectorAll('#ga-designs-tbody tr');
    rows.forEach(row => {
      const text = row.textContent.toLowerCase();
      row.style.display = text.includes(query) ? '' : 'none';
    });
  }

  // ==================== BACKGROUND SCRAPING ====================
  function setupBackgroundScraping() {
    // Re-scrape every 60 seconds by briefly reading original DOM
    setInterval(async () => {
      if (!isOverlayActive) return;
      
      // Check for new sales via storage
      const result = await chrome.storage.local.get(['salesData', 'recentSales']);
      const today = new Date().toISOString().split('T')[0];
      const todayData = result.salesData?.[today];
      
      if (todayData && todayData.units > appData.sales.today) {
        // New sale detected!
        appData.sales.today = todayData.units;
        appData.royalties.today = todayData.royalties;
        
        updateElement('ga-today-units', appData.sales.today);
        updateElement('ga-today-royalty', `$${appData.royalties.today.toFixed(2)}`);
        
        // Play cha-ching
        playChaChing();
      }
    }, 30000);
  }

  // ==================== PLAY CHA-CHING ====================
  function playChaChing() {
    try {
      const audio = new Audio(chrome.runtime.getURL('assets/sounds/cha-ching.mp3'));
      audio.volume = 0.7;
      audio.play();
    } catch (e) {}

    // Also notify background
    chrome.runtime.sendMessage({ type: 'NEW_SALE', data: { count: 1, royalty: 0, totalToday: appData.sales.today } });
  }

  // ==================== MESSAGE HANDLER ====================
  function handleMessage(message, sender, sendResponse) {
    if (message.type === 'FORCE_SCRAPE') {
      refreshData();
      sendResponse({ success: true });
    }
    if (message.type === 'PLAY_SOUND') {
      playChaChing();
      sendResponse({ success: true });
    }
  }

  // ==================== UTILITY FUNCTIONS ====================
  function updateElement(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  }

  function getStatusClass(status) {
    if (status === 'Live' || status === 'Auto-uploaded') return 'status-live';
    if (status === 'Under review' || status === 'Processing') return 'status-review';
    if (status === 'Rejected' || status === 'Removed') return 'status-rejected';
    return 'status-live';
  }

  function detectType(title) {
    const lower = (title || '').toLowerCase();
    if (lower.includes('hoodie') || lower.includes('pullover')) return 'Hoodie';
    if (lower.includes('tank')) return 'Tank Top';
    if (lower.includes('long sleeve') || lower.includes('langarm')) return 'Long Sleeve';
    if (lower.includes('popsocket')) return 'PopSocket';
    return 'T-Shirt';
  }

  function getFlag(mp) {
    const flags = { US: '🇺🇸', UK: '🇬🇧', DE: '🇩🇪', FR: '🇫🇷', IT: '🇮🇹', ES: '🇪🇸', JP: '🇯🇵' };
    return flags[mp] || '🌍';
  }

  function getRelativeTime(ts) {
    if (!ts) return '';
    const diff = Date.now() - ts;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours/24)}d ago`;
  }

  // ==================== WAIT FOR PAGE LOAD & START ====================
  if (document.readyState === 'complete') {
    setTimeout(init, 1500);
  } else {
    window.addEventListener('load', () => setTimeout(init, 1500));
  }

})();
