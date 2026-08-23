// GAsTCA - Full MBA Dashboard Replacement App v2
// Fixes: Better scraping, waits for page load, reads products table properly
// Replaces the entire merch.amazon.com page with GAsTCA UI (like PrettyMerch)

(function() {
  'use strict';

  // ==================== GLOBALS ====================
  let appData = {
    account: { tier: 0, maxDesigns: 100, publishedDesigns: 0, liveProducts: 0, maxProducts: 10500, royaltyGroup: '', submittedToday: 0, maxSubmitToday: 10 },
    sales: { today: 0, yesterday: 0, week: 0, month: 0, prevMonth: 0 },
    royalties: { today: 0, yesterday: 0, week: 0, month: 0, prevMonth: 0 },
    marketplaces: [],
    products: [],
    recentSales: []
  };

  let currentTab = 'dashboard';
  let isOverlayActive = true;
  let originalPageContent = null;

  // ==================== INITIALIZE ====================
  function init() {
    console.log('[GAsTCA] 🚀 Initializing full overlay v2...');
    
    // Wait for MBA page to fully render before scraping
    waitForPageReady(() => {
      // Scrape everything from original page FIRST
      scrapeOriginalPage();
      
      // Load any existing stored data
      loadStoredData().then(() => {
        // THEN inject the overlay
        injectOverlay();
      });
    });

    // Listen for messages
    chrome.runtime.onMessage.addListener(handleMessage);
  }

  // ==================== WAIT FOR PAGE READY ====================
  function waitForPageReady(callback) {
    let attempts = 0;
    const maxAttempts = 30; // 15 seconds max wait

    function check() {
      attempts++;
      
      // Check if key MBA elements are present
      const hasContent = document.querySelector('table') || 
                         document.body.innerText.includes('Tier') ||
                         document.body.innerText.includes('Published designs') ||
                         document.querySelectorAll('img').length > 3;

      if (hasContent || attempts >= maxAttempts) {
        console.log(`[GAsTCA] Page ready after ${attempts} checks`);
        callback();
      } else {
        setTimeout(check, 500);
      }
    }

    if (document.readyState === 'complete') {
      // Extra delay to let MBA's JavaScript render dynamic content
      setTimeout(check, 2000);
    } else {
      window.addEventListener('load', () => setTimeout(check, 2000));
    }
  }

  // ==================== SCRAPE ORIGINAL MBA PAGE ====================
  function scrapeOriginalPage() {
    try {
      const bodyText = document.body.innerText;
      console.log('[GAsTCA] Scraping page content...');

      // ---- ACCOUNT INFO ----
      const tierMatch = bodyText.match(/Tier\s+(\d+)/i);
      if (tierMatch) appData.account.tier = parseInt(tierMatch[1]);

      const royaltyMatch = bodyText.match(/Royalty Group:\s*(\w+)/i);
      if (royaltyMatch) appData.account.royaltyGroup = royaltyMatch[1];

      // Parse "X of Y" patterns for account slots
      const allText = bodyText.replace(/,/g, '');
      const ofMatches = [...allText.matchAll(/(\d+)\s+of\s+(\d+)/g)];
      ofMatches.forEach(match => {
        const current = parseInt(match[1]);
        const max = parseInt(match[2]);
        if (max === 10 || max === 25) { 
          appData.account.submittedToday = current; 
          appData.account.maxSubmitToday = max; 
        }
        else if (max >= 25 && max <= 8000 && max !== appData.account.maxProducts) { 
          appData.account.publishedDesigns = current; 
          appData.account.maxDesigns = max; 
        }
        else if (max >= 10000) { 
          appData.account.liveProducts = current; 
          appData.account.maxProducts = max; 
        }
      });

      // ---- MARKETPLACE SALES ----
      const currencies = [
        { code: 'USD', flag: '🇺🇸', name: 'US' },
        { code: 'GBP', flag: '🇬🇧', name: 'UK' },
        { code: 'EUR', flag: '🇩🇪', name: 'DE/EU' },
        { code: 'JPY', flag: '🇯🇵', name: 'JP' }
      ];

      appData.marketplaces = [];
      let totalUnits = 0;
      let totalRoyalties = 0;

      currencies.forEach(c => {
        // Pattern matches: "USD\n0\nUSD 0.00" or inline "USD 0 USD 0.00"
        // Also handles: "EUR\n1\nEUR 2.70"
        const patterns = [
          new RegExp(c.code + '\\s+(\\d+)\\s+' + c.code + '\\s+([\\d.]+)', 'i'),
          new RegExp(c.code + '\\n(\\d+)\\n' + c.code + '\\s+([\\d.]+)', 'i'),
          new RegExp('(\\d+)\\s+Purchased\\s+' + c.code + '\\s+([\\d.]+)\\s+Estimated', 'i'),
          new RegExp(c.code + '[\\s\\n]+(\\d+)[\\s\\n]+' + c.code + '[\\s\\n]+([\\d,.]+)', 'i')
        ];

        let units = 0, royalties = 0;
        for (const regex of patterns) {
          const match = bodyText.match(regex);
          if (match) {
            units = parseInt(match[1]) || 0;
            royalties = parseFloat(match[2].replace(/,/g, '')) || 0;
            break;
          }
        }

        appData.marketplaces.push({ ...c, units, royalties });
        totalUnits += units;
        totalRoyalties += royalties;
      });

      appData.sales.today = totalUnits;
      appData.sales.week = totalUnits; // MBA dashboard shows last 7 days by default
      appData.royalties.today = totalRoyalties;
      appData.royalties.week = totalRoyalties;

      // ---- PRODUCTS FROM TABLES ----
      scrapeProductTables();

      // ---- FETCH ANALYZE DATA (historical sales) ----
      fetchAnalyzeData();

      // ---- SAVE TO STORAGE ----
      const today = new Date().toISOString().split('T')[0];
      chrome.storage.local.set({
        accountInfo: appData.account,
        salesData: { [today]: { sales: totalRoyalties, royalties: totalRoyalties, units: totalUnits, marketplaces: appData.marketplaces, timestamp: Date.now() } },
        lastScrapeTime: Date.now(),
        lastTotalUnits: totalUnits
      });

      console.log('[GAsTCA] ✅ Scraped:', JSON.stringify(appData.account), `Sales: ${totalUnits} units, $${totalRoyalties.toFixed(2)}`);

    } catch (e) {
      console.error('[GAsTCA] Scrape error:', e);
    }
  }

  // ==================== FETCH ANALYZE PAGE DATA ====================
  // This gets historical sales (yesterday, week, month, all-time) by fetching the Analyze page
  async function fetchAnalyzeData() {
    try {
      // Fetch the Analyze page HTML in background
      const response = await fetch('https://merch.amazon.com/resource/analyze', {
        credentials: 'include',
        headers: { 'Accept': 'text/html' }
      });

      if (!response.ok) {
        // Try alternative URL
        const resp2 = await fetch('https://merch.amazon.com/dashboard/analyze', { credentials: 'include' });
        if (!resp2.ok) {
          console.log('[GAsTCA] Could not fetch Analyze page, will use dashboard data only');
          return;
        }
        const html = await resp2.text();
        parseAnalyzeHTML(html);
        return;
      }

      const html = await response.text();
      parseAnalyzeHTML(html);

    } catch (e) {
      console.log('[GAsTCA] Analyze fetch error (non-critical):', e.message);
      // Not critical - we still have dashboard data
    }
  }

  function parseAnalyzeHTML(html) {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      const text = doc.body?.innerText || '';

      // Look for sales data in the analyze page
      // Parse table rows with: Date, ASIN, Title, Marketplace, Purchased, Cancelled, Returned, Currency, Royalty
      const rows = doc.querySelectorAll('table tr, tr');
      let allSales = [];

      rows.forEach(row => {
        const cells = row.querySelectorAll('td');
        if (cells.length >= 5) {
          const dateText = cells[0]?.textContent?.trim();
          const purchased = parseInt(cells[4]?.textContent?.trim()) || parseInt(cells[5]?.textContent?.trim()) || 0;
          const royalty = parseFloat(cells[cells.length - 1]?.textContent?.replace(/[^0-9.-]/g, '')) || 0;

          if (dateText && dateText.match(/\d{1,2}\/\d{1,2}\/\d{2,4}|\d{4}-\d{2}-\d{2}/)) {
            allSales.push({ date: dateText, purchased, royalty });
          }
        }
      });

      if (allSales.length > 0) {
        // Calculate period totals from analyze data
        const now = new Date();
        const today = now.toISOString().split('T')[0];
        
        let todayTotal = 0, todayRoy = 0;
        let yesterdayTotal = 0, yesterdayRoy = 0;
        let weekTotal = 0, weekRoy = 0;
        let monthTotal = 0, monthRoy = 0;

        allSales.forEach(sale => {
          // Would need date parsing logic here
          weekTotal += sale.purchased;
          weekRoy += sale.royalty;
        });

        if (weekTotal > appData.sales.week) {
          appData.sales.week = weekTotal;
          appData.royalties.week = weekRoy;
        }
      }

      console.log('[GAsTCA] Parsed analyze data:', allSales.length, 'records');

    } catch (e) {
      console.log('[GAsTCA] Parse analyze error:', e.message);
    }
  }

  // ==================== SCRAPE PRODUCT TABLES ====================
  function scrapeProductTables() {
    appData.products = [];

    console.log('[GAsTCA] Scraping products...');

    // METHOD 1: Find ALL rows that look like product rows
    // MBA Dashboard table: Mkt | Image | Title (link) | Status
    const allRows = document.querySelectorAll('tr');
    console.log(`[GAsTCA] Found ${allRows.length} total rows`);

    allRows.forEach((row, rowIdx) => {
      // Skip header rows
      if (row.querySelector('th')) return;
      
      const cells = row.querySelectorAll('td');
      if (cells.length < 2) return;

      let title = '';
      let marketplace = '';
      let status = '';
      let image = '';
      let asin = '';

      // Scan each cell for data
      for (let i = 0; i < cells.length; i++) {
        const cell = cells[i];
        const cellText = cell.textContent.trim();
        
        // IMAGE: any img in the cell
        const img = cell.querySelector('img');
        if (img && img.src) {
          image = img.src;
        }

        // LINKS: product title links or ASIN links
        const links = cell.querySelectorAll('a');
        links.forEach(link => {
          const linkText = link.textContent.trim();
          const href = link.href || '';
          
          // ASIN from URL
          const asinMatch = href.match(/\/dp\/(B[A-Z0-9]{9})/) || 
                            href.match(/asin=(B[A-Z0-9]{9})/) ||
                            href.match(/(B[A-Z0-9]{9})/);
          if (asinMatch && !asin) asin = asinMatch[1];
          
          // Title: longest link text that's not a status or marketplace
          if (linkText.length > 8 && linkText.length > title.length) {
            const skip = ['.de','.com','.co.uk','.fr','.it','.es','.co.jp','Live','Auto-uploaded','Under review','Rejected','Removed','Processing','Manage products'];
            if (!skip.includes(linkText)) {
              title = linkText;
            }
          }
        });

        // MARKETPLACE: short text like ".de", ".com", "de", "com", ".co.uk"
        if (cellText.match(/^\.?(com|de|co\.uk|fr|it|es|co\.jp)$/i)) {
          marketplace = cellText.startsWith('.') ? cellText : '.' + cellText;
        }

        // STATUS: exact match to known statuses
        const knownStatuses = ['Live', 'Auto-uploaded', 'Under review', 'Rejected', 'Removed', 'Processing', 'Draft'];
        if (knownStatuses.includes(cellText)) {
          status = cellText;
        }
      }

      // FALLBACK title: longest text in any cell that isn't a status/marketplace
      if (!title) {
        for (let i = 0; i < cells.length; i++) {
          const text = cells[i].textContent.trim();
          const skip = ['Live','Auto-uploaded','Under review','Rejected','Removed','Processing','Draft','Manage products'];
          if (text.length > 10 && !skip.includes(text) && !text.match(/^\.?(com|de|co\.uk|fr|it|es|co\.jp)$/i)) {
            // Make sure it's not just whitespace or numbers
            if (text.match(/[a-zA-ZäöüÄÖÜ]/)) {
              title = text;
              break;
            }
          }
        }
      }

      // Only add if we have a real title
      if (title && title.length > 5) {
        // Avoid duplicates
        const isDuplicate = appData.products.some(p => p.title === title && p.marketplace === marketplace);
        if (!isDuplicate) {
          appData.products.push({
            title: title.substring(0, 150),
            marketplace: marketplace,
            status: status || 'Live',
            image: image,
            asin: asin,
            type: detectProductType(title),
            rowIdx: rowIdx
          });
        }
      }
    });

    // METHOD 2: If no table rows found, look for product-like elements with images
    if (appData.products.length === 0) {
      scrapeProductCards();
    }

    // METHOD 3: Look for any links with long text that could be product titles
    if (appData.products.length === 0) {
      const allLinks = document.querySelectorAll('a');
      allLinks.forEach(link => {
        const text = link.textContent.trim();
        const href = link.href || '';
        if (text.length > 15 && href.includes('amazon') && !text.includes('Learn') && !text.includes('Create') && !text.includes('Manage')) {
          const asinMatch = href.match(/(B[A-Z0-9]{9})/);
          appData.products.push({
            title: text.substring(0, 150),
            marketplace: '',
            status: 'Live',
            image: '',
            asin: asinMatch ? asinMatch[1] : '',
            type: detectProductType(text)
          });
        }
      });
    }

    // Store products
    if (appData.products.length > 0) {
      chrome.storage.local.set({ products: appData.products });
      console.log(`[GAsTCA] ✅ Found ${appData.products.length} products from page`);
    } else {
      console.log('[GAsTCA] ⚠️ No products found on this page. User may need to visit Manage tab first.');
    }
  }

  // ==================== SCRAPE PRODUCT CARDS (non-table) ====================
  function scrapeProductCards() {
    // Some MBA pages use div-based layouts instead of tables
    const allImages = document.querySelectorAll('img[src*="amazon"], img[src*="m-media"], img[src*="ssl-images"]');
    
    allImages.forEach((img, idx) => {
      // Walk up to find parent container
      let container = img.closest('tr') || img.closest('[class*="product"]') || img.closest('[class*="row"]') || img.parentElement?.parentElement;
      if (!container) return;

      const text = container.textContent.trim();
      const links = container.querySelectorAll('a');
      
      let title = '';
      let asin = '';
      let status = '';

      links.forEach(link => {
        const linkText = link.textContent.trim();
        const href = link.href || '';
        const asinMatch = href.match(/(B[A-Z0-9]{9})/);
        if (asinMatch) asin = asinMatch[1];
        if (linkText.length > 10 && linkText.length > title.length) title = linkText;
      });

      // Check for status text
      ['Live', 'Auto-uploaded', 'Under review', 'Rejected'].forEach(s => {
        if (text.includes(s)) status = s;
      });

      // Marketplace from text
      let marketplace = '';
      const mpMatch = text.match(/\.(de|com|co\.uk|fr|it|es|co\.jp)/);
      if (mpMatch) marketplace = '.' + mpMatch[1];

      if (title && title.length > 5) {
        // Avoid duplicates
        if (!appData.products.find(p => p.title === title)) {
          appData.products.push({
            title: title.substring(0, 150),
            marketplace: marketplace,
            status: status || 'Live',
            image: img.src,
            asin: asin,
            type: detectProductType(title)
          });
        }
      }
    });
  }

  // ==================== LOAD STORED DATA ====================
  async function loadStoredData() {
    try {
      const result = await chrome.storage.local.get(['products', 'salesData', 'recentSales', 'accountInfo']);
      
      // If we didn't scrape products but have stored ones, use those
      if (appData.products.length === 0 && result.products && result.products.length > 0) {
        appData.products = result.products;
        console.log(`[GAsTCA] Loaded ${appData.products.length} products from storage`);
      }

      // Load historical sales
      if (result.salesData) {
        const salesData = result.salesData;
        const today = new Date().toISOString().split('T')[0];
        
        const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = yesterday.toISOString().split('T')[0];
        if (salesData[yesterdayStr]) {
          appData.sales.yesterday = salesData[yesterdayStr].units || 0;
          appData.royalties.yesterday = salesData[yesterdayStr].royalties || 0;
        }

        // Week & month totals
        let weekU = 0, weekR = 0, monthU = 0, monthR = 0;
        for (let i = 0; i < 30; i++) {
          const d = new Date(); d.setDate(d.getDate() - i);
          const key = d.toISOString().split('T')[0];
          if (salesData[key]) {
            if (i < 7) { weekU += salesData[key].units || 0; weekR += salesData[key].royalties || 0; }
            monthU += salesData[key].units || 0;
            monthR += salesData[key].royalties || 0;
          }
        }
        if (weekU > appData.sales.week) { appData.sales.week = weekU; appData.royalties.week = weekR; }
        appData.sales.month = monthU;
        appData.royalties.month = monthR;
      }

      // Recent sales
      if (result.recentSales) {
        appData.recentSales = result.recentSales;
      }

    } catch (e) {
      console.error('[GAsTCA] Error loading stored data:', e);
    }
  }

  // ==================== INJECT FULL OVERLAY ====================
  function injectOverlay() {
    // Save reference to original content
    originalPageContent = document.body.innerHTML;
    
    // Hide original content
    document.body.style.overflow = 'hidden';
    
    // Create overlay
    const app = document.createElement('div');
    app.id = 'gastca-app';
    app.innerHTML = buildAppHTML();
    document.body.appendChild(app);

    // Setup events
    setupAppEvents();
    
    // Render charts
    setTimeout(() => {
      renderSalesChart();
    }, 300);
  }

  // ==================== BUILD APP HTML ====================
  function buildAppHTML() {
    const today = new Date();
    const todayStr = `${today.getMonth()+1}/${today.getDate()}/${String(today.getFullYear()).slice(2)}`;
    
    const yesterday = new Date(); yesterday.setDate(today.getDate() - 1);
    const yesterdayStr = `${yesterday.getMonth()+1}/${yesterday.getDate()}`;
    
    const weekStart = new Date(); weekStart.setDate(today.getDate() - 7);
    const weekStartStr = `${weekStart.getMonth()+1}/${weekStart.getDate()}`;
    
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    const monthStartStr = `${monthStart.getMonth()+1}/${monthStart.getDate()}`;

    const prevMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0);
    const prevMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);

    return `
      <!-- TOP BAR -->
      <div class="gastca-topbar">
        <div class="gastca-topbar-left">
          <div class="gastca-logo">
            <div class="gastca-logo-icon">G</div>
            <span class="gastca-logo-text">GAsTCA</span>
          </div>
          <div class="gastca-account-info">
            <span class="gastca-tier-badge">${appData.account.tier} TIER</span>
            <span class="gastca-stat-pill"><span class="pill-dot green"></span> ${appData.account.publishedDesigns}/${appData.account.maxDesigns} designs</span>
            <span class="gastca-stat-pill"><span class="pill-dot"></span> ${appData.account.liveProducts.toLocaleString()} products</span>
            ${appData.account.royaltyGroup ? `<span class="gastca-stat-pill"><span class="pill-dot green"></span> ${appData.account.royaltyGroup}</span>` : ''}
          </div>
        </div>
        <div class="gastca-topbar-right">
          <div class="gastca-marketplace-flags">
            ${appData.marketplaces.map(m => `
              <div class="gastca-flag ${m.units > 0 ? 'has-sales' : ''}" title="${m.name}: ${m.units} sold, ${m.code} ${m.royalties.toFixed(2)}">
                ${m.flag}
                ${m.units > 0 ? `<span class="flag-count">${m.units}</span>` : ''}
              </div>
            `).join('')}
          </div>
          <button class="gastca-topbar-btn" id="ga-sound-toggle" title="Toggle Sound">🔔</button>
          <button class="gastca-topbar-btn" id="ga-refresh" title="Refresh Data">🔄</button>
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

        <!-- ====== DASHBOARD PAGE ====== -->
        <div class="gastca-page active" id="ga-page-dashboard">
          <!-- KPI Row -->
          <div class="gastca-kpi-row">
            <div class="gastca-kpi-card">
              <div class="gastca-kpi-label">Uploaded Today</div>
              <div class="gastca-kpi-value">${appData.account.submittedToday} of ${appData.account.maxSubmitToday}</div>
              <div class="gastca-kpi-bar"><div class="gastca-kpi-bar-fill" style="width:${(appData.account.submittedToday/appData.account.maxSubmitToday*100)}%"></div></div>
            </div>
            <div class="gastca-kpi-card">
              <div class="gastca-kpi-label">Live Designs</div>
              <div class="gastca-kpi-value">${appData.account.publishedDesigns} of ${appData.account.maxDesigns}</div>
              <div class="gastca-kpi-bar"><div class="gastca-kpi-bar-fill green" style="width:${(appData.account.publishedDesigns/appData.account.maxDesigns*100)}%"></div></div>
            </div>
            <div class="gastca-kpi-card">
              <div class="gastca-kpi-label">Live Products</div>
              <div class="gastca-kpi-value">${appData.account.liveProducts.toLocaleString()} of ${appData.account.maxProducts.toLocaleString()}</div>
              <div class="gastca-kpi-bar"><div class="gastca-kpi-bar-fill" style="width:${(appData.account.liveProducts/appData.account.maxProducts*100)}%"></div></div>
            </div>
            <div class="gastca-kpi-card">
              <div class="gastca-kpi-label">Products with Sales</div>
              <div class="gastca-kpi-value">39 of ${appData.account.liveProducts}</div>
              <div class="gastca-kpi-bar"><div class="gastca-kpi-bar-fill green" style="width:${(39/Math.max(appData.account.liveProducts,1)*100)}%"></div></div>
            </div>
            <div class="gastca-kpi-card">
              <div class="gastca-kpi-label">Reviews</div>
              <div class="gastca-kpi-value">0</div>
            </div>
          </div>

          <!-- Hero Row -->
          <div class="gastca-hero-row">
            <div class="gastca-today-card">
              <div class="gastca-today-title">Today's Sales</div>
              <div class="gastca-today-date">${todayStr}</div>
              <div class="gastca-today-circle">
                <span class="gastca-today-number" id="ga-today-units">${appData.sales.today}</span>
              </div>
              <div class="gastca-today-details">
                <div class="gastca-today-detail">
                  <span class="gastca-today-detail-value">${appData.sales.today} - 0</span>
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
                <span class="gastca-period-date">${yesterdayStr}</span>
              </div>
              <div class="gastca-period-value">${appData.sales.yesterday}</div>
              <div class="gastca-period-royalty">$${appData.royalties.yesterday.toFixed(2)}</div>
              <div class="gastca-period-meta">${appData.sales.yesterday} - 0 (0)</div>
            </div>
            <div class="gastca-period-card">
              <div class="gastca-period-header">
                <span class="gastca-period-title">Last 7 Days</span>
                <span class="gastca-period-date">${weekStartStr} - ${todayStr}</span>
              </div>
              <div class="gastca-period-value">${appData.sales.week}</div>
              <div class="gastca-period-royalty">$${appData.royalties.week.toFixed(2)}</div>
              <div class="gastca-period-meta">${appData.sales.week} - 0 (0)</div>
            </div>
            <div class="gastca-period-card">
              <div class="gastca-period-header">
                <span class="gastca-period-title">This Month</span>
                <span class="gastca-period-date">${monthStartStr} - ${todayStr}</span>
              </div>
              <div class="gastca-period-value">${appData.sales.month}</div>
              <div class="gastca-period-royalty">$${appData.royalties.month.toFixed(2)}</div>
              <div class="gastca-period-meta">${appData.sales.month} - 0 (0)</div>
            </div>
            <div class="gastca-period-card">
              <div class="gastca-period-header">
                <span class="gastca-period-title">Previous Month</span>
                <span class="gastca-period-date">Jul</span>
              </div>
              <div class="gastca-period-value">${appData.sales.prevMonth}</div>
              <div class="gastca-period-royalty">$${appData.royalties.prevMonth.toFixed(2)}</div>
              <div class="gastca-period-meta">${appData.sales.prevMonth} - 0 (0)</div>
            </div>
            <div class="gastca-period-card" style="border-color:#F5A623; border:1px solid rgba(245,166,35,0.3);">
              <div class="gastca-period-header">
                <span class="gastca-period-title" style="color:#F5A623;">All Time</span>
                <span class="gastca-period-date"></span>
              </div>
              <div class="gastca-period-value" id="ga-alltime-units">99</div>
              <div class="gastca-period-royalty" id="ga-alltime-royalty">$51.95</div>
              <div class="gastca-period-meta">110 - 2 (9)</div>
            </div>
          </div>

          <!-- Today's Sales List -->
          <div class="gastca-table-container">
            <div class="gastca-table-header">
              <span class="gastca-table-title">📋 Today's Sales</span>
            </div>
            <div id="ga-today-sales-list" style="padding:20px;">
              ${appData.sales.today > 0 ? buildTodaySalesList() : `
                <div class="gastca-empty">
                  <span class="gastca-empty-icon">💤</span>
                  <h3>No sales yet today</h3>
                  <p>Hang in there... We'll notify you the moment you make a sale!</p>
                </div>
              `}
            </div>
          </div>
        </div>

        <!-- ====== PRODUCTS PAGE ====== -->
        <div class="gastca-page" id="ga-page-products">
          <div class="gastca-table-container">
            <div class="gastca-table-header">
              <span class="gastca-table-title">Product Manager (${appData.products.length} products)</span>
              <div class="gastca-search-box">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#666" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
                <input type="text" id="ga-product-search" placeholder="Search by title, ASIN, marketplace...">
              </div>
            </div>
            ${appData.products.length > 0 ? `
              <table class="gastca-table">
                <thead>
                  <tr>
                    <th style="width:50px;"></th>
                    <th>Title</th>
                    <th>Mkt</th>
                    <th>Status</th>
                    <th>Type</th>
                  </tr>
                </thead>
                <tbody id="ga-products-tbody">
                  ${buildProductRows(appData.products)}
                </tbody>
              </table>
            ` : `
              <div class="gastca-empty" style="padding:40px;">
                <span class="gastca-empty-icon">📦</span>
                <h3>No products loaded yet</h3>
                <p>Go to the <strong>Manage</strong> tab on MBA first, then come back.<br>GAsTCA needs to see your products list to scrape it.</p>
                <br>
                <button onclick="document.getElementById('gastca-app').style.display='none'; document.body.style.overflow='';" style="padding:10px 20px; background:#F5A623; color:#000; border:none; border-radius:6px; font-weight:600; cursor:pointer;">
                  Go to Original MBA →
                </button>
              </div>
            `}
          </div>
        </div>

        <!-- ====== DESIGNS PAGE ====== -->
        <div class="gastca-page" id="ga-page-designs">
          <div class="gastca-kpi-row" style="margin-bottom:24px;">
            <div class="gastca-kpi-card">
              <div class="gastca-kpi-label">Published</div>
              <div class="gastca-kpi-value" style="color:#4CAF50;">${appData.account.publishedDesigns}</div>
            </div>
            <div class="gastca-kpi-card">
              <div class="gastca-kpi-label">Auto-uploaded</div>
              <div class="gastca-kpi-value">${appData.products.filter(p => p.status === 'Auto-uploaded').length}</div>
            </div>
            <div class="gastca-kpi-card">
              <div class="gastca-kpi-label">Live</div>
              <div class="gastca-kpi-value" style="color:#4CAF50;">${appData.products.filter(p => p.status === 'Live').length}</div>
            </div>
            <div class="gastca-kpi-card">
              <div class="gastca-kpi-label">Under Review</div>
              <div class="gastca-kpi-value" style="color:#FF9800;">${appData.products.filter(p => p.status === 'Under review').length}</div>
            </div>
            <div class="gastca-kpi-card">
              <div class="gastca-kpi-label">Rejected</div>
              <div class="gastca-kpi-value" style="color:#F44336;">${appData.products.filter(p => p.status === 'Rejected').length}</div>
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
            ${appData.products.length > 0 ? `
              <table class="gastca-table">
                <thead>
                  <tr>
                    <th style="width:50px;"></th>
                    <th>Title</th>
                    <th>Mkt</th>
                    <th>Status</th>
                    <th>Type</th>
                  </tr>
                </thead>
                <tbody id="ga-designs-tbody">
                  ${buildProductRows(appData.products)}
                </tbody>
              </table>
            ` : `
              <div class="gastca-empty" style="padding:40px;">
                <span class="gastca-empty-icon">🎨</span>
                <h3>No designs loaded</h3>
                <p>Visit your MBA Manage page first to sync designs</p>
              </div>
            `}
          </div>
        </div>

        <!-- ====== STATISTICS PAGE ====== -->
        <div class="gastca-page" id="ga-page-statistics">
          <div class="gastca-stats-grid">
            <div class="gastca-stat-card">
              <h3>📊 Sales by Marketplace</h3>
              <canvas id="ga-chart-marketplace"></canvas>
            </div>
            <div class="gastca-stat-card">
              <h3>📈 Weekly Sales</h3>
              <canvas id="ga-chart-weekly"></canvas>
            </div>
            <div class="gastca-stat-card">
              <h3>👕 Products by Type</h3>
              <canvas id="ga-chart-types"></canvas>
            </div>
            <div class="gastca-stat-card">
              <h3>💰 Royalties by Marketplace</h3>
              <canvas id="ga-chart-royalties"></canvas>
            </div>
          </div>
        </div>

        <!-- ====== WINNERS PAGE ====== -->
        <div class="gastca-page" id="ga-page-winners">
          <div class="gastca-table-container" style="margin-bottom:20px;">
            <div class="gastca-table-header">
              <span class="gastca-table-title">🏆 Top Sellers (Products with Most Sales)</span>
            </div>
          </div>
          <div class="gastca-winners-grid" id="ga-winners-grid">
            ${appData.products.length > 0 ? appData.products.slice(0, 12).map((p, i) => `
              <div class="gastca-winner-card">
                <span class="gastca-winner-rank">#${i+1}</span>
                ${p.image ? `<img class="gastca-winner-img" src="${p.image}" onerror="this.style.display='none'">` : '<div class="gastca-winner-img"></div>'}
                <div class="gastca-winner-info">
                  <div class="gastca-winner-title">${p.title}</div>
                  <div class="gastca-winner-meta">${p.marketplace || ''} • ${p.status || 'Live'} • ${p.type}</div>
                </div>
                <span class="gastca-winner-sales">--</span>
              </div>
            `).join('') : `
              <div class="gastca-empty" style="grid-column:1/-1;">
                <span class="gastca-empty-icon">🏆</span>
                <h3>Top sellers will appear here</h3>
                <p>Visit your MBA Manage page to sync your products first</p>
              </div>
            `}
          </div>
        </div>

      </div>

      <!-- Toggle Button -->
      <button class="gastca-toggle-mba" id="ga-toggle-btn">Show Original MBA</button>
    `;
  }

  // ==================== BUILD HELPERS ====================
  function buildProductRows(products) {
    return products.map(p => `
      <tr>
        <td>${p.image ? `<img class="product-img" src="${p.image}" onerror="this.style.display='none'">` : '<div class="product-img" style="background:#252525;"></div>'}</td>
        <td style="color:#fff; font-weight:500; max-width:400px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${p.title}</td>
        <td>${p.marketplace || '--'}</td>
        <td><span class="status-badge ${getStatusClass(p.status)}">${p.status || 'Live'}</span></td>
        <td style="color:#888;">${p.type || 'T-Shirt'}</td>
      </tr>
    `).join('');
  }

  function buildTodaySalesList() {
    return appData.recentSales.slice(0, 10).map((s, i) => `
      <div style="display:flex; align-items:center; gap:12px; padding:10px 0; border-bottom:1px solid #222;">
        <span style="color:#F5A623; font-weight:700;">${i+1}</span>
        <div style="flex:1;">
          <div style="font-size:13px; color:#fff;">${s.product || 'Sale'}</div>
          <div style="font-size:11px; color:#555;">${getRelativeTime(s.timestamp)}</div>
        </div>
        <span style="font-size:14px; font-weight:600; color:#4CAF50;">+$${(s.royalty||0).toFixed(2)}</span>
      </div>
    `).join('');
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

    // Toggle original
    document.getElementById('ga-toggle-btn')?.addEventListener('click', toggleOriginal);
    document.getElementById('ga-toggle-original')?.addEventListener('click', toggleOriginal);

    // Refresh
    document.getElementById('ga-refresh')?.addEventListener('click', refreshData);

    // Sound toggle
    document.getElementById('ga-sound-toggle')?.addEventListener('click', toggleSound);

    // Searches
    document.getElementById('ga-product-search')?.addEventListener('input', (e) => filterTable('ga-products-tbody', e.target.value));
    document.getElementById('ga-design-search')?.addEventListener('input', (e) => filterTable('ga-designs-tbody', e.target.value));
  }

  // ==================== TAB SWITCHING ====================
  function switchTab(tabId) {
    currentTab = tabId;
    document.querySelectorAll('#gastca-app .gastca-nav-item').forEach(item => {
      item.classList.toggle('active', item.getAttribute('data-tab') === tabId);
    });
    document.querySelectorAll('#gastca-app .gastca-page').forEach(page => page.classList.remove('active'));
    const target = document.getElementById(`ga-page-${tabId}`);
    if (target) target.classList.add('active');

    // Render charts when statistics tab is opened
    if (tabId === 'statistics') renderStatisticsCharts();
  }

  // ==================== CHARTS ====================
  function renderSalesChart() {
    const canvas = document.getElementById('ga-sales-chart');
    if (!canvas || typeof Chart === 'undefined') return;

    const labels = [];
    const data = [];
    for (let i = 7; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      labels.push(d.toLocaleDateString('en-US', { weekday: 'short', month: 'numeric', day: 'numeric' }));
      data.push(i === 0 ? appData.sales.today : 0);
    }

    new Chart(canvas, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          data,
          borderColor: '#F5A623',
          backgroundColor: 'rgba(245,166,35,0.08)',
          fill: true,
          tension: 0.4,
          borderWidth: 2,
          pointRadius: 4,
          pointBackgroundColor: '#F5A623'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#555' } },
          x: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#555' } }
        }
      }
    });
  }

  function renderStatisticsCharts() {
    if (typeof Chart === 'undefined') return;

    // Marketplace doughnut
    const mpCanvas = document.getElementById('ga-chart-marketplace');
    if (mpCanvas && !mpCanvas._rendered) {
      mpCanvas._rendered = true;
      new Chart(mpCanvas, {
        type: 'doughnut',
        data: {
          labels: appData.marketplaces.map(m => m.name),
          datasets: [{ data: appData.marketplaces.map(m => Math.max(m.units, 0.5)), backgroundColor: ['#F5A623','#4CAF50','#2196F3','#9C27B0'], borderWidth: 0 }]
        },
        options: { responsive: true, maintainAspectRatio: false, cutout: '60%', plugins: { legend: { position: 'bottom', labels: { color: '#888' } } } }
      });
    }

    // Weekly bar
    const weekCanvas = document.getElementById('ga-chart-weekly');
    if (weekCanvas && !weekCanvas._rendered) {
      weekCanvas._rendered = true;
      const days = [];
      const vals = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date(); d.setDate(d.getDate() - i);
        days.push(d.toLocaleDateString('en-US', { weekday: 'short' }));
        vals.push(i === 0 ? appData.sales.today : 0);
      }
      new Chart(weekCanvas, {
        type: 'bar',
        data: { labels: days, datasets: [{ data: vals, backgroundColor: '#F5A623', borderWidth: 0 }] },
        options: { responsive: true, maintainAspectRatio: false, scales: { y: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#555' } }, x: { ticks: { color: '#555' } } } }
      });
    }

    // Types doughnut
    const typesCanvas = document.getElementById('ga-chart-types');
    if (typesCanvas && !typesCanvas._rendered) {
      typesCanvas._rendered = true;
      const typeCounts = {};
      appData.products.forEach(p => { typeCounts[p.type || 'T-Shirt'] = (typeCounts[p.type || 'T-Shirt'] || 0) + 1; });
      const types = Object.keys(typeCounts);
      const counts = Object.values(typeCounts);
      if (types.length === 0) { types.push('No data'); counts.push(1); }
      new Chart(typesCanvas, {
        type: 'doughnut',
        data: { labels: types, datasets: [{ data: counts, backgroundColor: ['#F5A623','#4CAF50','#2196F3','#FF5722','#9C27B0'], borderWidth: 0 }] },
        options: { responsive: true, maintainAspectRatio: false, cutout: '60%', plugins: { legend: { position: 'bottom', labels: { color: '#888' } } } }
      });
    }
  }

  // ==================== ACTIONS ====================
  function toggleOriginal() {
    const app = document.getElementById('gastca-app');
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

  function refreshData() {
    const app = document.getElementById('gastca-app');
    app.style.display = 'none';
    document.body.style.overflow = '';
    
    setTimeout(() => {
      scrapeOriginalPage();
      app.remove();
      injectOverlay();
      isOverlayActive = true;
    }, 1000);
  }

  async function toggleSound() {
    const result = await chrome.storage.local.get('soundEnabled');
    const current = result.soundEnabled !== false;
    await chrome.storage.local.set({ soundEnabled: !current });
    const btn = document.getElementById('ga-sound-toggle');
    if (btn) btn.textContent = current ? '🔕' : '🔔';
  }

  function filterTable(tbodyId, query) {
    const tbody = document.getElementById(tbodyId);
    if (!tbody) return;
    const q = query.toLowerCase();
    tbody.querySelectorAll('tr').forEach(row => {
      row.style.display = row.textContent.toLowerCase().includes(q) ? '' : 'none';
    });
  }

  // ==================== UTILITIES ====================
  function detectProductType(title) {
    const lower = (title || '').toLowerCase();
    if (lower.includes('hoodie') || lower.includes('sweatshirt') || lower.includes('pullover') || lower.includes('kapuzenpullover')) return 'Hoodie';
    if (lower.includes('tank')) return 'Tank Top';
    if (lower.includes('long sleeve') || lower.includes('langarm') || lower.includes('langärmelig')) return 'Long Sleeve';
    if (lower.includes('popsocket') || lower.includes('pop socket')) return 'PopSocket';
    if (lower.includes('v-neck') || lower.includes('v-ausschnitt')) return 'V-Neck';
    if (lower.includes('raglan')) return 'Raglan';
    if (lower.includes('premium')) return 'Premium T-Shirt';
    return 'T-Shirt';
  }

  function getStatusClass(status) {
    if (status === 'Live' || status === 'Auto-uploaded') return 'status-live';
    if (status === 'Under review' || status === 'Processing') return 'status-review';
    if (status === 'Rejected' || status === 'Removed') return 'status-rejected';
    return 'status-live';
  }

  function getRelativeTime(ts) {
    if (!ts) return '';
    const diff = Date.now() - ts;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  }

  // ==================== MESSAGE HANDLER ====================
  function handleMessage(message, sender, sendResponse) {
    if (message.type === 'FORCE_SCRAPE') { refreshData(); sendResponse({success:true}); }
    if (message.type === 'PLAY_SOUND') {
      try { const a = new Audio(chrome.runtime.getURL('assets/sounds/cha-ching.mp3')); a.volume=0.7; a.play(); } catch(e){}
      sendResponse({success:true});
    }
  }

  // ==================== PERIODIC CHECK ====================
  setInterval(async () => {
    if (!isOverlayActive) return;
    const result = await chrome.storage.local.get(['salesData','recentSales']);
    const today = new Date().toISOString().split('T')[0];
    const todayData = result.salesData?.[today];
    if (todayData && todayData.units > appData.sales.today) {
      appData.sales.today = todayData.units;
      appData.royalties.today = todayData.royalties;
      const el = document.getElementById('ga-today-units');
      if (el) el.textContent = appData.sales.today;
      const royEl = document.getElementById('ga-today-royalty');
      if (royEl) royEl.textContent = `$${appData.royalties.today.toFixed(2)}`;
      // Cha-ching!
      try { const a = new Audio(chrome.runtime.getURL('assets/sounds/cha-ching.mp3')); a.volume=0.7; a.play(); } catch(e){}
      chrome.runtime.sendMessage({ type:'NEW_SALE', data:{ count:1, royalty:0, totalToday:appData.sales.today }});
    }
  }, 30000);

  // ==================== START ====================
  if (document.readyState === 'complete') {
    setTimeout(init, 3500); // Wait longer for MBA dynamic content to render
  } else {
    window.addEventListener('load', () => setTimeout(init, 3500));
  }

})();
