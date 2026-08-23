// GAsTCA - MBA Page Injection (PrettyMerch-style)
// Injects INTO the MBA page like PrettyMerch does - adds tabs to nav, content below
// Uses exact MBA DOM selectors to read data

(function() {
  'use strict';

  // ==================== DATA ====================
  const GA = {
    account: { tier: 0, maxDesigns: 100, publishedDesigns: 0, liveProducts: 0, maxProducts: 10500, submittedToday: 0, maxSubmitToday: 10, royaltyGroup: '' },
    marketplaces: [],
    products: [],
    sales: { today: 0, yesterday: 0, week: 0, month: 0, prevMonth: 0, allTime: 0 },
    royalties: { today: 0, yesterday: 0, week: 0, month: 0, prevMonth: 0, allTime: 0 },
    currentTab: 'dashboard'
  };

  // ==================== INIT ====================
  function init() {
    console.log('[GAsTCA] 🚀 Injecting into MBA page...');
    waitForMBA(() => {
      readMBAData();
      injectTabs();
      injectContent();
      setupListeners();
      console.log('[GAsTCA] ✅ Injection complete');
    });
  }

  function waitForMBA(cb) {
    let attempts = 0;
    function check() {
      attempts++;
      const navExists = document.querySelector('.nav.nav-tabs');
      const contentExists = document.querySelector('#dashboard-container') || document.querySelector('.app-outlet');
      if ((navExists && contentExists) || attempts > 40) {
        setTimeout(cb, 1000); // Extra delay for dynamic content
      } else {
        setTimeout(check, 500);
      }
    }
    if (document.readyState === 'complete') check();
    else window.addEventListener('load', () => setTimeout(check, 1500));
  }

  // ==================== READ MBA DATA ====================
  function readMBAData() {
    // --- Account Info ---
    const bodyText = document.body.innerText;
    const tierMatch = bodyText.match(/Tier\s+(\d+)/i);
    if (tierMatch) GA.account.tier = parseInt(tierMatch[1]);
    const royaltyMatch = bodyText.match(/Royalty Group:\s*(\w+)/i);
    if (royaltyMatch) GA.account.royaltyGroup = royaltyMatch[1];

    // --- Progress bars (X of Y) ---
    const progressSummaries = document.querySelectorAll('progress-summary');
    const allText = bodyText.replace(/,/g, '');
    const ofMatches = [...allText.matchAll(/(\d+)\s+of\s+(\d+)/g)];
    ofMatches.forEach(m => {
      const cur = parseInt(m[1]), max = parseInt(m[2]);
      if (max <= 25) { GA.account.submittedToday = cur; GA.account.maxSubmitToday = max; }
      else if (max <= 8000) { GA.account.publishedDesigns = cur; GA.account.maxDesigns = max; }
      else if (max >= 10000) { GA.account.liveProducts = cur; GA.account.maxProducts = max; }
    });

    // --- Marketplace Sales (using exact IDs from MBA) ---
    const currencies = [
      { code: 'USD', flag: '🇺🇸', name: 'US', id_sold: 'currency-summary-sold-USD', id_royalties: 'currency-summary-royalties-USD' },
      { code: 'GBP', flag: '🇬🇧', name: 'UK', id_sold: 'currency-summary-sold-GBP', id_royalties: 'currency-summary-royalties-GBP' },
      { code: 'EUR', flag: '🇩🇪', name: 'DE', id_sold: 'currency-summary-sold-EUR', id_royalties: 'currency-summary-royalties-EUR' },
      { code: 'JPY', flag: '🇯🇵', name: 'JP', id_sold: 'currency-summary-sold-JPY', id_royalties: 'currency-summary-royalties-JPY' }
    ];

    GA.marketplaces = [];
    currencies.forEach(c => {
      const soldEl = document.getElementById(c.id_sold);
      const royEl = document.getElementById(c.id_royalties);
      const units = soldEl ? parseInt(soldEl.textContent.trim()) || 0 : 0;
      const royText = royEl ? royEl.textContent.trim() : '0';
      const royalties = parseFloat(royText.replace(/[^0-9.]/g, '')) || 0;
      GA.marketplaces.push({ ...c, units, royalties });
      GA.sales.week += units;
      GA.royalties.week += royalties;
    });

    GA.sales.today = GA.marketplaces.reduce((s, m) => s + m.units, 0);
    GA.royalties.today = GA.marketplaces.reduce((s, m) => s + m.royalties, 0);

    // --- Products from table ---
    const productRows = document.querySelectorAll('table.listing-table tbody tr, #recent-activity-container table tbody tr');
    productRows.forEach((row, idx) => {
      const mktEl = row.querySelector('.marketplace-col, td:first-child');
      const titleEl = row.querySelector('.listing-link, a.listing-link');
      const statusEl = row.querySelector('.status-col, td:last-child');
      const imgEl = row.querySelector('thumbnail-asset img, img.thumbnail-asset');

      if (titleEl) {
        GA.products.push({
          title: titleEl.textContent.trim(),
          href: titleEl.href || '',
          marketplace: mktEl ? mktEl.textContent.trim() : '',
          status: statusEl ? statusEl.textContent.trim() : 'Live',
          image: imgEl ? imgEl.src : '',
          asin: (titleEl.href || '').match(/\/dp\/(B[A-Z0-9]+)/)?.[1] || '',
          index: idx
        });
      }
    });

    // Save to storage
    chrome.storage.local.set({
      accountInfo: GA.account,
      products: GA.products,
      lastScrapeTime: Date.now()
    });

    console.log('[GAsTCA] Data:', GA.account, `${GA.products.length} products, ${GA.sales.today} sales today`);
  }

  // ==================== INJECT TABS INTO NAV ====================
  function injectTabs() {
    const navUl = document.querySelector('#nav-container .nav.nav-tabs, .nav.nav-tabs');
    if (!navUl) { console.warn('[GAsTCA] Nav not found'); return; }

    // GAsTCA tabs to add
    const tabs = [
      { id: 'dashboard', icon: '📊', label: 'Dashboard' },
      { id: 'products', icon: '📦', label: 'Products' },
      { id: 'designs', icon: '🎨', label: 'Designs' },
      { id: 'statistics', icon: '📈', label: 'Statistics' },
      { id: 'winners', icon: '🏆', label: 'Winners' }
    ];

    tabs.forEach(tab => {
      const li = document.createElement('li');
      li.className = 'nav-item';
      li.setAttribute('_ngcontent-c0', '');
      li.innerHTML = `<a class="nav-link d-flex align-items-center ga-tab-link ${tab.id === 'dashboard' ? 'active' : ''}" href="#" data-ga-tab="${tab.id}" _ngcontent-c0="">
        <span style="margin-right:4px;">${tab.icon}</span> <span>${tab.label}</span>
      </a>`;
      navUl.appendChild(li);
    });

    // Make GAsTCA Dashboard the active tab on load
    navUl.querySelectorAll('.nav-link').forEach(link => {
      if (!link.classList.contains('ga-tab-link')) {
        link.classList.remove('active');
      }
    });
  }

  // ==================== INJECT MAIN CONTENT ====================
  function injectContent() {
    // Hide original MBA dashboard content
    document.body.classList.add('gastca-active');

    // Find where to inject (after the nav, inside app-outlet or after dashboard-container)
    const appOutlet = document.querySelector('.app-outlet');
    if (!appOutlet) { console.warn('[GAsTCA] app-outlet not found'); return; }

    // Create wrapper
    const wrapper = document.createElement('div');
    wrapper.id = 'gastca-wrapper';
    wrapper.innerHTML = buildAllPages();
    appOutlet.appendChild(wrapper);

    // Render charts after DOM is ready
    setTimeout(() => renderCharts(), 500);
  }

  // ==================== BUILD ALL PAGES ====================
  function buildAllPages() {
    const today = new Date();
    const todayStr = `${today.getMonth()+1}/${today.getDate()}/${String(today.getFullYear()).slice(-2)}`;
    const yesterday = new Date(); yesterday.setDate(today.getDate()-1);
    const yStr = `${yesterday.getMonth()+1}/${yesterday.getDate()}`;
    const weekStart = new Date(); weekStart.setDate(today.getDate()-7);
    const wStr = `${weekStart.getMonth()+1}/${weekStart.getDate()} - ${todayStr}`;
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    const mStr = `${monthStart.getMonth()+1}/1 - ${todayStr}`;

    return `
    <!-- HEADER -->
    <div class="ga-header">
      <div class="ga-header-left">
        <span class="ga-logo-text">GAsTCA</span>
        <div class="ga-header-stats">
          <div class="ga-tier"><div class="number">${GA.account.tier}</div><div class="title">TIER</div></div>
        </div>
      </div>
      <div class="ga-header-right">
        <div class="ga-flag-container">
          ${GA.marketplaces.map(m => `
            <div class="ga-flag ${m.units > 0 ? 'has-sales active' : ''}" title="${m.name}: ${m.units} sold, ${m.code} ${m.royalties.toFixed(2)}">
              ${m.flag}
              <span class="ga-sales-number ${m.units > 0 ? 'has-sales' : ''}">${m.units}</span>
            </div>
          `).join('')}
        </div>
        <div class="ga-header-stats" style="margin-left:20px;">
          <div class="ga-header-stat"><div class="number">0</div><div class="title">REJ</div></div>
          <div class="ga-header-stat"><div class="number">0</div><div class="title">UR</div></div>
          <div class="ga-header-stat"><div class="number">0</div><div class="title">PS</div></div>
        </div>
      </div>
    </div>

    <!-- TOP STATS -->
    <div class="ga-top-stats">
      <div class="ga-top-stat">
        <div class="title">Uploaded Today</div>
        <div class="progress-text"><span class="used">${GA.account.submittedToday}</span> of ${GA.account.maxSubmitToday}<span class="progress-percent">(${Math.round(GA.account.submittedToday/GA.account.maxSubmitToday*100)}%)</span></div>
        <div class="progress"><div class="progress-bar" style="width:${GA.account.submittedToday/GA.account.maxSubmitToday*100}%; background:rgb(75,192,192);"></div></div>
      </div>
      <div class="ga-top-stat">
        <div class="title">Live Designs</div>
        <div class="progress-text"><span class="used">${GA.account.publishedDesigns}</span> of ${GA.account.maxDesigns}<span class="progress-percent">(${(GA.account.publishedDesigns/GA.account.maxDesigns*100).toFixed(1)}%)</span></div>
        <div class="progress"><div class="progress-bar" style="width:${GA.account.publishedDesigns/GA.account.maxDesigns*100}%; background:rgb(255,206,86);"></div></div>
      </div>
      <div class="ga-top-stat">
        <div class="title">Live Products</div>
        <div class="progress-text"><span class="used">${GA.account.liveProducts.toLocaleString()}</span> of ${GA.account.maxProducts.toLocaleString()}<span class="progress-percent">(${(GA.account.liveProducts/GA.account.maxProducts*100).toFixed(1)}%)</span></div>
        <div class="progress"><div class="progress-bar" style="width:${GA.account.liveProducts/GA.account.maxProducts*100}%; background:rgb(255,206,86);"></div></div>
      </div>
      <div class="ga-top-stat">
        <div class="title">Products with Sales</div>
        <div class="progress-text"><span class="used">39</span> of ${GA.account.liveProducts} live<span class="progress-percent">(5.8%)</span></div>
        <div class="progress"><div class="progress-bar" style="width:5.8%; background:rgb(255,206,86);"></div></div>
      </div>
      <div class="ga-top-stat" style="text-align:center;border-right:none;">
        <div class="title">Reviews</div>
        <div class="progress-text" style="font-size:12px;">0.0 from 0 reviews</div>
      </div>
    </div>

    <!-- ====== DASHBOARD PAGE ====== -->
    <div class="ga-page active" id="ga-page-dashboard">
      <div class="ga-dash-row">
        <!-- Today Card -->
        <div class="ga-today-card">
          <div class="ga-today-title">Today's Sales</div>
          <div class="ga-today-subtitle">${todayStr}</div>
          <div class="ga-today-number" id="ga-today-num">${GA.sales.today}</div>
          <div class="ga-today-stats">
            <div class="ga-today-stat"><div class="value">${GA.sales.today} - 0</div><div class="label">Sold - Canc.</div></div>
            <div class="ga-today-stat"><div class="value">0</div><div class="label">Returned</div></div>
            <div class="ga-today-stat"><div class="value">$${GA.royalties.today.toFixed(2)}</div><div class="label">Royalties</div></div>
            <div class="ga-today-stat"><div class="value">-</div><div class="label">Ad Spend</div></div>
          </div>
        </div>
        <!-- Chart -->
        <div class="ga-chart-card">
          <canvas id="ga-main-chart"></canvas>
        </div>
      </div>

      <!-- Periods Row (like PrettyMerch layout: left = today sales list, right = period cards) -->
      <div class="ga-periods-row">
        <div class="ga-periods-left">
          <div class="ga-sales-panel">
            <div class="ga-panel-tabs">
              <div class="ga-panel-tab active">💰 TODAY</div>
              <div class="ga-panel-tab">Top Units Sold</div>
              <div class="ga-panel-tab">Top Royalties</div>
            </div>
            <div class="ga-panel-body">
              ${GA.sales.today > 0 ? '<p>Sales details here...</p>' : `
                <div class="ga-no-sales">
                  <div class="title">No sales yet</div>
                  <div class="text">Hang in there... We'll notify you<br>the moment you make a sale!</div>
                </div>
              `}
            </div>
          </div>
        </div>
        <div class="ga-periods-right">
          <div class="ga-periods-grid">
            <div class="ga-period-card">
              <div class="ga-period-header"><span class="ga-period-title">Yesterday</span><span class="ga-period-date">${yStr}</span></div>
              <div class="ga-period-value">${GA.sales.yesterday}</div>
              <div class="ga-period-royalty">$${GA.royalties.yesterday.toFixed(2)}</div>
              <div class="ga-period-meta">${GA.sales.yesterday} - 0 (0)</div>
              <div class="ga-period-ad"><span class="ad-label">ADS</span> -</div>
            </div>
            <div class="ga-period-card">
              <div class="ga-period-header"><span class="ga-period-title">Last 7 Days</span><span class="ga-period-date">${wStr}</span></div>
              <div class="ga-period-value">${GA.sales.week}</div>
              <div class="ga-period-royalty">$${GA.royalties.week.toFixed(2)}</div>
              <div class="ga-period-meta">${GA.sales.week} - 0 (0)</div>
              <div class="ga-period-ad"><span class="ad-label">ADS</span> -</div>
            </div>
            <div class="ga-period-card">
              <div class="ga-period-header"><span class="ga-period-title">This Month</span><span class="ga-period-date">${mStr}</span></div>
              <div class="ga-period-value">${GA.sales.month}</div>
              <div class="ga-period-royalty">$${GA.royalties.month.toFixed(2)}</div>
              <div class="ga-period-meta">${GA.sales.month} - 0 (0)</div>
              <div class="ga-period-ad"><span class="ad-label">ADS</span> -</div>
            </div>
            <div class="ga-period-card">
              <div class="ga-period-header"><span class="ga-period-title">Previous Month</span><span class="ga-period-date">Jul</span></div>
              <div class="ga-period-value">4</div>
              <div class="ga-period-royalty">$1.44</div>
              <div class="ga-period-meta">4 - 0 (0)</div>
              <div class="ga-period-ad"><span class="ad-label">ADS</span> -</div>
            </div>
            <div class="ga-period-card full-width">
              <div class="ga-period-header"><span class="ga-period-title">All Time</span><span class="ga-period-date"></span></div>
              <div class="ga-period-value">99</div>
              <div class="ga-period-royalty">$51.95</div>
              <div class="ga-period-meta">110 - 2 (9)</div>
              <div class="ga-period-ad"><span class="ad-label">ADS</span> -</div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- ====== PRODUCTS PAGE ====== -->
    <div class="ga-page" id="ga-page-products">
      <div class="ga-products-container">
        <div class="ga-products-header">
          <span class="ga-products-title">Manage Products (${GA.products.length} products)</span>
          <input type="text" class="ga-search-input" id="ga-prod-search" placeholder="Search by title, ASIN, brand...">
        </div>
        ${GA.products.length > 0 ? `
          <table class="ga-table">
            <thead><tr>
              <th style="width:55px"></th>
              <th>Title</th>
              <th>Mkt</th>
              <th>Status</th>
              <th>ASIN</th>
            </tr></thead>
            <tbody id="ga-prod-tbody">
              ${GA.products.map(p => `
                <tr>
                  <td>${p.image ? `<img class="product-img" src="${p.image}" onerror="this.style.display='none'">` : ''}</td>
                  <td class="product-title">
                    <a href="${p.href}" target="_blank">${p.title}</a>
                    ${p.asin ? `<div class="product-asin">${p.asin}</div>` : ''}
                  </td>
                  <td>${p.marketplace}</td>
                  <td><span class="ga-badge ${getBadgeClass(p.status)}">${p.status}</span></td>
                  <td style="font-family:monospace;font-size:11px;color:#999;">${p.asin || '--'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        ` : `
          <div class="ga-empty">
            <span class="ga-empty-icon">📦</span>
            <h3>No products found on this page</h3>
            <p>Visit the MBA <strong>Manage</strong> tab to load all your products, then switch back to GAsTCA</p>
          </div>
        `}
      </div>
    </div>

    <!-- ====== DESIGNS PAGE ====== -->
    <div class="ga-page" id="ga-page-designs">
      <div class="ga-top-stats" style="margin-bottom:20px;">
        <div class="ga-top-stat"><div class="title">Published</div><div class="progress-text" style="font-size:18px;font-weight:700;color:#28a745;">${GA.account.publishedDesigns}</div></div>
        <div class="ga-top-stat"><div class="title">Auto-uploaded</div><div class="progress-text" style="font-size:18px;font-weight:700;">${GA.products.filter(p=>p.status.includes('Auto')).length}</div></div>
        <div class="ga-top-stat"><div class="title">Live</div><div class="progress-text" style="font-size:18px;font-weight:700;color:#28a745;">${GA.products.filter(p=>p.status==='Live').length}</div></div>
        <div class="ga-top-stat"><div class="title">Under Review</div><div class="progress-text" style="font-size:18px;font-weight:700;color:#ff9800;">0</div></div>
        <div class="ga-top-stat" style="border-right:none;"><div class="title">Rejected</div><div class="progress-text" style="font-size:18px;font-weight:700;color:#dc3545;">0</div></div>
      </div>
      <div class="ga-products-container">
        <div class="ga-products-header">
          <span class="ga-products-title">All Designs</span>
          <input type="text" class="ga-search-input" id="ga-design-search" placeholder="Search designs...">
        </div>
        ${GA.products.length > 0 ? `
          <table class="ga-table">
            <thead><tr><th style="width:55px"></th><th>Title</th><th>Mkt</th><th>Status</th></tr></thead>
            <tbody id="ga-design-tbody">
              ${GA.products.map(p => `
                <tr>
                  <td>${p.image ? `<img class="product-img" src="${p.image}" onerror="this.style.display='none'">` : ''}</td>
                  <td class="product-title"><a href="${p.href}" target="_blank">${p.title}</a></td>
                  <td>${p.marketplace}</td>
                  <td><span class="ga-badge ${getBadgeClass(p.status)}">${p.status}</span></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        ` : `<div class="ga-empty"><span class="ga-empty-icon">🎨</span><h3>No designs loaded</h3><p>Visit MBA Manage page to sync</p></div>`}
      </div>
    </div>

    <!-- ====== STATISTICS PAGE ====== -->
    <div class="ga-page" id="ga-page-statistics">
      <div class="ga-stats-grid">
        <div class="ga-stat-card"><h3>📊 Sales by Marketplace</h3><canvas id="ga-chart-mp"></canvas></div>
        <div class="ga-stat-card"><h3>📈 Weekly Sales</h3><canvas id="ga-chart-week"></canvas></div>
        <div class="ga-stat-card"><h3>👕 Products by Type</h3><canvas id="ga-chart-types"></canvas></div>
        <div class="ga-stat-card"><h3>💰 Royalties by Market</h3><canvas id="ga-chart-roy"></canvas></div>
      </div>
    </div>

    <!-- ====== WINNERS PAGE ====== -->
    <div class="ga-page" id="ga-page-winners">
      <div class="ga-products-container" style="margin-bottom:16px;">
        <div class="ga-products-header"><span class="ga-products-title">🏆 Top Sellers</span></div>
      </div>
      <div class="ga-winners-list">
        ${GA.products.length > 0 ? GA.products.slice(0, 10).map((p, i) => `
          <div class="ga-winner-item">
            <span class="ga-winner-rank">#${i+1}</span>
            ${p.image ? `<img class="ga-winner-img" src="${p.image}" onerror="this.style.display='none'">` : '<div class="ga-winner-img"></div>'}
            <div class="ga-winner-info">
              <div class="ga-winner-title">${p.title}</div>
              <div class="ga-winner-meta">${p.marketplace} • ${p.status}</div>
            </div>
            <span class="ga-winner-sales">--</span>
          </div>
        `).join('') : `<div class="ga-empty"><span class="ga-empty-icon">🏆</span><h3>Top sellers appear here</h3><p>Once synced from MBA</p></div>`}
      </div>
    </div>

    <!-- FOOTER -->
    <div class="ga-footer">
      <div><span style="color:#F5A623;font-weight:700;">GAsTCA</span> <span>v1.2.0</span></div>
      <div><a href="#" id="ga-show-original">Show Original MBA</a></div>
    </div>
    `;
  }

  // ==================== CHARTS ====================
  function renderCharts() {
    if (typeof Chart === 'undefined') return;

    // Main chart
    const mainCanvas = document.getElementById('ga-main-chart');
    if (mainCanvas) {
      const labels = [];
      const data = [];
      for (let i = 7; i >= 0; i--) {
        const d = new Date(); d.setDate(d.getDate() - i);
        labels.push(d.toLocaleDateString('en-US', { weekday: 'short', month: 'numeric', day: 'numeric' }));
        data.push(i === 0 ? GA.sales.today : 0);
      }
      new Chart(mainCanvas, {
        type: 'line',
        data: { labels, datasets: [{ data, borderColor: '#F5A623', backgroundColor: 'rgba(245,166,35,0.08)', fill: true, tension: 0.4, borderWidth: 2, pointRadius: 3, pointBackgroundColor: '#F5A623' }] },
        options: { responsive: true, maintainAspectRatio: false, scales: { y: { grid: { color: '#f0f0f0' }, ticks: { color: '#999' } }, x: { grid: { color: '#f5f5f5' }, ticks: { color: '#999', font: { size: 10 } } } } }
      });
    }
  }

  function renderStatsCharts() {
    if (typeof Chart === 'undefined') return;
    const mpCanvas = document.getElementById('ga-chart-mp');
    if (mpCanvas && !mpCanvas._done) {
      mpCanvas._done = true;
      new Chart(mpCanvas, { type: 'doughnut', data: { labels: GA.marketplaces.map(m=>m.name), datasets: [{ data: GA.marketplaces.map(m=>Math.max(m.units,0.5)), backgroundColor: ['#F5A623','#28a745','#2196F3','#9C27B0'], borderWidth: 0 }] }, options: { responsive: true, maintainAspectRatio: false, cutout: '60%', plugins: { legend: { position: 'bottom', labels: { color: '#666' } } } } });
    }
    const weekCanvas = document.getElementById('ga-chart-week');
    if (weekCanvas && !weekCanvas._done) {
      weekCanvas._done = true;
      const days = [], vals = [];
      for (let i = 6; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate()-i); days.push(d.toLocaleDateString('en-US',{weekday:'short'})); vals.push(i===0?GA.sales.today:0); }
      new Chart(weekCanvas, { type: 'bar', data: { labels: days, datasets: [{ data: vals, backgroundColor: '#F5A623', borderWidth: 0 }] }, options: { responsive: true, maintainAspectRatio: false, scales: { y: { grid: { color: '#f0f0f0' }, ticks: { color: '#999' } }, x: { ticks: { color: '#999' } } } } });
    }
  }

  // ==================== EVENT LISTENERS ====================
  function setupListeners() {
    // Tab clicks
    document.querySelectorAll('.ga-tab-link').forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const tab = link.getAttribute('data-ga-tab');
        switchTab(tab);

        // Deactivate all nav links, activate this one
        document.querySelectorAll('.nav-tabs .nav-link').forEach(l => l.classList.remove('active'));
        link.classList.add('active');

        // Hide original MBA content, show GAsTCA
        document.body.classList.add('gastca-active');
        document.getElementById('gastca-wrapper').style.display = 'block';
      });
    });

    // When user clicks original MBA nav items, hide GAsTCA
    document.querySelectorAll('.nav-tabs .nav-link:not(.ga-tab-link)').forEach(link => {
      link.addEventListener('click', () => {
        document.body.classList.remove('gastca-active');
        document.getElementById('gastca-wrapper').style.display = 'none';
        document.querySelectorAll('.ga-tab-link').forEach(l => l.classList.remove('active'));
      });
    });

    // Show original MBA link
    document.getElementById('ga-show-original')?.addEventListener('click', (e) => {
      e.preventDefault();
      document.body.classList.remove('gastca-active');
      document.getElementById('gastca-wrapper').style.display = 'none';
      document.querySelectorAll('.ga-tab-link').forEach(l => l.classList.remove('active'));
    });

    // Product search
    document.getElementById('ga-prod-search')?.addEventListener('input', (e) => {
      filterTable('ga-prod-tbody', e.target.value);
    });
    document.getElementById('ga-design-search')?.addEventListener('input', (e) => {
      filterTable('ga-design-tbody', e.target.value);
    });
  }

  function switchTab(tabId) {
    GA.currentTab = tabId;
    document.querySelectorAll('#gastca-wrapper .ga-page').forEach(p => p.classList.remove('active'));
    const target = document.getElementById(`ga-page-${tabId}`);
    if (target) target.classList.add('active');

    if (tabId === 'statistics') renderStatsCharts();
  }

  function filterTable(tbodyId, query) {
    const tbody = document.getElementById(tbodyId);
    if (!tbody) return;
    const q = query.toLowerCase();
    tbody.querySelectorAll('tr').forEach(row => {
      row.style.display = row.textContent.toLowerCase().includes(q) ? '' : 'none';
    });
  }

  // ==================== HELPERS ====================
  function getBadgeClass(status) {
    if (status === 'Live') return 'ga-badge-live';
    if (status.includes('Auto')) return 'ga-badge-auto';
    if (status.includes('review')) return 'ga-badge-review';
    if (status.includes('Reject')) return 'ga-badge-rejected';
    if (status.includes('Timed')) return 'ga-badge-timed-out';
    return 'ga-badge-live';
  }

  // ==================== CHA-CHING DETECTION ====================
  let lastUnits = GA.sales.today;
  setInterval(() => {
    const currencies = ['USD','GBP','EUR','JPY'];
    let total = 0;
    currencies.forEach(c => {
      const el = document.getElementById(`currency-summary-sold-${c}`);
      if (el) total += parseInt(el.textContent.trim()) || 0;
    });
    if (total > lastUnits && lastUnits > 0) {
      // NEW SALE!
      lastUnits = total;
      const numEl = document.getElementById('ga-today-num');
      if (numEl) numEl.textContent = total;
      try { const a = new Audio(chrome.runtime.getURL('assets/sounds/cha-ching.mp3')); a.volume = 0.7; a.play(); } catch(e){}
      chrome.runtime.sendMessage({ type: 'NEW_SALE', data: { count: 1, royalty: 0, totalToday: total } });
    }
    lastUnits = total;
  }, 30000);

  // ==================== START ====================
  init();
})();
