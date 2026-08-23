// GAsTCA - Merch by Amazon Dashboard Scraper v2
// Updated to match real MBA dashboard structure (merch.amazon.com)
// Reads: Account status, sales data, products, royalties, marketplace data

(function() {
  'use strict';

  // ==================== CONFIGURATION ====================
  const SCRAPE_INTERVAL = 60000; // Check every 60 seconds
  let isRunning = false;
  let scrapeTimer = null;
  let previousTotalUnits = null;

  // ==================== INITIALIZATION ====================
  function init() {
    console.log('[GAsTCA] 🚀 MBA Dashboard scraper v2 loaded');
    
    if (document.readyState === 'complete') {
      startScraping();
    } else {
      window.addEventListener('load', startScraping);
    }

    chrome.runtime.onMessage.addListener(handleMessage);
  }

  function startScraping() {
    console.log('[GAsTCA] Starting data scraper...');
    isRunning = true;

    // Wait a bit for MBA dashboard to fully render
    setTimeout(() => {
      scrapeAllData();
      addStatusBadge();
    }, 2000);

    setupPeriodicScrape();
    setupMutationObserver();
  }

  async function setupPeriodicScrape() {
    const result = await chrome.storage.local.get('refreshInterval');
    const interval = (result.refreshInterval || 60) * 1000;
    if (scrapeTimer) clearInterval(scrapeTimer);
    scrapeTimer = setInterval(scrapeAllData, interval);
  }

  // ==================== MAIN SCRAPER ====================
  async function scrapeAllData() {
    if (!isRunning) return;

    try {
      const accountData = scrapeAccountStatus();
      const salesData = scrapeSalesData();
      const productsData = scrapeRecentProducts();
      
      const today = new Date().toISOString().split('T')[0];

      // Get existing stored data
      const stored = await chrome.storage.local.get([
        'salesData', 'products', 'recentSales', 'lastTotalUnits', 'accountInfo'
      ]);
      
      const existingSalesData = stored.salesData || {};
      const existingRecentSales = stored.recentSales || [];

      // Update today's data
      existingSalesData[today] = {
        sales: salesData.totalRevenue,
        royalties: salesData.totalRoyalties,
        units: salesData.totalUnits,
        marketplaces: salesData.marketplaces,
        timestamp: Date.now()
      };

      // Detect new sales
      const lastTotalUnits = stored.lastTotalUnits || 0;
      if (salesData.totalUnits > lastTotalUnits && lastTotalUnits > 0) {
        const newSalesCount = salesData.totalUnits - lastTotalUnits;

        // Add to recent sales
        for (let i = 0; i < newSalesCount; i++) {
          existingRecentSales.unshift({
            product: 'New Sale!',
            royalty: salesData.avgRoyaltyPerUnit || 0,
            marketplace: salesData.lastMarketplace || '',
            timestamp: Date.now(),
            seen: false
          });
        }

        // Keep only last 100
        if (existingRecentSales.length > 100) {
          existingRecentSales.length = 100;
        }

        // Notify background about new sale
        chrome.runtime.sendMessage({
          type: 'NEW_SALE',
          data: {
            count: newSalesCount,
            royalty: salesData.avgRoyaltyPerUnit || 0,
            totalToday: salesData.totalUnits
          }
        });

        // Show on-page toast notification
        showSaleToast(newSalesCount, salesData.avgRoyaltyPerUnit);
      }

      // Save all data
      await chrome.storage.local.set({
        salesData: existingSalesData,
        products: productsData,
        recentSales: existingRecentSales,
        lastTotalUnits: salesData.totalUnits,
        accountInfo: accountData,
        lastScrapeTime: Date.now()
      });

      console.log('[GAsTCA] ✅ Scraped:', {
        account: accountData,
        sales: salesData,
        products: productsData.length
      });

      updateStatusBadge(true);

    } catch (error) {
      console.error('[GAsTCA] ❌ Scraping error:', error);
      updateStatusBadge(false);
    }
  }

  // ==================== ACCOUNT STATUS SCRAPER ====================
  function scrapeAccountStatus() {
    const data = {
      tier: 0,
      royaltyGroup: '',
      submittedToday: 0,
      maxSubmitToday: 10,
      publishedDesigns: 0,
      maxDesigns: 100,
      productPotential: 0,
      maxProducts: 10500
    };

    try {
      // "Account status · Tier 100 · Royalty Group: Creator"
      const accountText = document.body.innerText;
      
      const tierMatch = accountText.match(/Tier\s+(\d+)/i);
      if (tierMatch) data.tier = parseInt(tierMatch[1]);

      const royaltyMatch = accountText.match(/Royalty Group:\s*(\w+)/i);
      if (royaltyMatch) data.royaltyGroup = royaltyMatch[1];

      // "Products submitted today" section - "0 of 10"
      const submitMatch = accountText.match(/(\d+)\s*of\s*(\d+)\s*\d*%?\s*Published designs/i);
      if (submitMatch) {
        // This might catch the wrong one, try more specific
      }

      // Look for the progress bars / stats
      // "0 of 10" for submitted today
      // "92 of 100" for published designs  
      // "668 of 10,500" for product potential
      const ofPatterns = accountText.match(/(\d+)\s+of\s+(\d[\d,]*)/g);
      if (ofPatterns) {
        ofPatterns.forEach(match => {
          const nums = match.match(/(\d+)\s+of\s+([\d,]+)/);
          if (nums) {
            const current = parseInt(nums[1]);
            const max = parseInt(nums[2].replace(/,/g, ''));
            
            if (max === 10) {
              data.submittedToday = current;
              data.maxSubmitToday = max;
            } else if (max === 100 || max === 500 || max === 2000 || max === 4000 || max === 8000) {
              data.publishedDesigns = current;
              data.maxDesigns = max;
            } else if (max >= 10000) {
              data.productPotential = current;
              data.maxProducts = max;
            }
          }
        });
      }

    } catch (e) {
      console.error('[GAsTCA] Error scraping account:', e);
    }

    return data;
  }

  // ==================== SALES DATA SCRAPER ====================
  function scrapeSalesData() {
    const data = {
      totalUnits: 0,
      totalRoyalties: 0,
      totalRevenue: 0,
      avgRoyaltyPerUnit: 0,
      marketplaces: [],
      lastMarketplace: '',
      dateRange: ''
    };

    try {
      // DATE RANGE: Look for "DATE RANGE: LAST 7 DAYS" etc.
      const dateRangeMatch = document.body.innerText.match(/DATE RANGE:\s*(.+)/i);
      if (dateRangeMatch) data.dateRange = dateRangeMatch[1].trim();

      // RECENT SALES section
      // Structure: Currency boxes showing "Purchased" count and "Estimated Royalties" amount
      // Example: "USD 0 USD 0.00" / "GBP 0 GBP 0.00" / "EUR 1 EUR 2.70" / "JPY 0 JPY 0"
      
      // Method 1: Find all marketplace sales boxes
      const salesSection = document.body.innerText;
      
      // Match patterns like: "USD\n0\nUSD 0.00" or "EUR\n1\nEUR 2.70"
      const marketplacePatterns = [
        { currency: 'USD', symbol: '$', marketplace: 'US' },
        { currency: 'GBP', symbol: '£', marketplace: 'UK' },
        { currency: 'EUR', symbol: '€', marketplace: 'DE' },
        { currency: 'JPY', symbol: '¥', marketplace: 'JP' }
      ];

      marketplacePatterns.forEach(mp => {
        // Pattern: "USD\n0\nUSD 0.00" or "EUR\n1\nEUR 2.70"
        // Also matches "0 USD 0.00 Purchased Estimated Royalties"
        const regex = new RegExp(mp.currency + '\\s*(\\d+)\\s*' + mp.currency + '\\s*([\\d,.]+)', 'i');
        const match = salesSection.match(regex);
        
        if (match) {
          const units = parseInt(match[1]) || 0;
          const royalties = parseFloat(match[2].replace(/,/g, '')) || 0;

          data.marketplaces.push({
            currency: mp.currency,
            marketplace: mp.marketplace,
            units: units,
            royalties: royalties
          });

          data.totalUnits += units;
          data.totalRoyalties += royalties; // Note: mixed currencies, but tracking total
          
          if (units > 0) {
            data.lastMarketplace = mp.marketplace;
          }
        }
      });

      // Calculate average royalty per unit
      if (data.totalUnits > 0) {
        data.avgRoyaltyPerUnit = data.totalRoyalties / data.totalUnits;
      }

      // Method 2: Try to parse from table/grid elements directly
      const allElements = document.querySelectorAll('td, .a-text-center, [class*="col"]');
      allElements.forEach(el => {
        const text = el.textContent.trim();
        // Look for currency amounts
        const currencyMatch = text.match(/^(USD|GBP|EUR|JPY)\s+([\d,.]+)$/);
        if (currencyMatch) {
          // Already handled above
        }
      });

    } catch (e) {
      console.error('[GAsTCA] Error scraping sales:', e);
    }

    return data;
  }

  // ==================== PRODUCTS SCRAPER ====================
  function scrapeRecentProducts() {
    const products = [];

    try {
      // "Recent product status" table
      // Columns: Mkt, (image), Title, Status
      const tables = document.querySelectorAll('table');
      
      tables.forEach(table => {
        const headers = table.querySelectorAll('th');
        let hasMkt = false;
        let hasTitle = false;
        let hasStatus = false;

        headers.forEach(th => {
          const text = th.textContent.trim().toLowerCase();
          if (text.includes('mkt')) hasMkt = true;
          if (text.includes('title')) hasTitle = true;
          if (text.includes('status')) hasStatus = true;
        });

        if (hasTitle || hasMkt) {
          const rows = table.querySelectorAll('tbody tr, tr:not(:first-child)');
          rows.forEach((row, index) => {
            const cells = row.querySelectorAll('td');
            if (cells.length >= 2) {
              const marketplace = cells[0]?.textContent?.trim() || '';
              
              // Find title - might be in different cells depending on image presence
              let title = '';
              let status = '';
              let image = '';

              cells.forEach(cell => {
                const img = cell.querySelector('img');
                if (img) image = img.src;
                
                const link = cell.querySelector('a');
                if (link && link.textContent.trim().length > 5) {
                  title = link.textContent.trim();
                }
                
                const text = cell.textContent.trim();
                if (text === 'Live' || text === 'Auto-uploaded' || text === 'Under review' || 
                    text === 'Rejected' || text === 'Removed' || text === 'Processing') {
                  status = text;
                }
              });

              if (!title) {
                // Fallback: get longest text content from cells
                let maxLen = 0;
                cells.forEach(cell => {
                  const text = cell.textContent.trim();
                  if (text.length > maxLen && !['Live', 'Auto-uploaded', 'Under review'].includes(text) && text.length > 5) {
                    maxLen = text.length;
                    title = text;
                  }
                });
              }

              if (title) {
                products.push({
                  title: title.substring(0, 120),
                  marketplace: marketplace.replace('.', ''),
                  status: status,
                  image: image,
                  type: detectProductType(title),
                  index: index
                });
              }
            }
          });
        }
      });

      // If no table found, try generic approach
      if (products.length === 0) {
        // Look for product links
        const links = document.querySelectorAll('a[href*="/dp/"], a[href*="product"]');
        links.forEach((link, index) => {
          const title = link.textContent.trim();
          if (title && title.length > 5) {
            const asinMatch = link.href?.match(/\/dp\/(B[A-Z0-9]+)/);
            products.push({
              title: title.substring(0, 120),
              asin: asinMatch ? asinMatch[1] : '',
              type: detectProductType(title),
              status: 'Live',
              index: index
            });
          }
        });
      }

    } catch (e) {
      console.error('[GAsTCA] Error scraping products:', e);
    }

    return products;
  }

  // ==================== ANALYZE PAGE SCRAPER ====================
  // Called when user is on the "Analyze" tab
  function scrapeAnalyzePage() {
    const data = { entries: [] };

    try {
      // The Analyze page has a table with: Date, ASIN, Title, Type, Marketplace, 
      // Purchased, Cancelled, Returned, Currency, Royalty
      const tables = document.querySelectorAll('table');
      
      tables.forEach(table => {
        const rows = table.querySelectorAll('tbody tr');
        rows.forEach(row => {
          const cells = row.querySelectorAll('td');
          if (cells.length >= 5) {
            const entry = {
              date: cells[0]?.textContent?.trim(),
              asin: cells[1]?.textContent?.trim(),
              title: cells[2]?.textContent?.trim(),
              type: cells[3]?.textContent?.trim(),
              marketplace: cells[4]?.textContent?.trim(),
              purchased: parseInt(cells[5]?.textContent?.trim()) || 0,
              cancelled: parseInt(cells[6]?.textContent?.trim()) || 0,
              returned: parseInt(cells[7]?.textContent?.trim()) || 0,
              currency: cells[8]?.textContent?.trim(),
              royalty: parseFloat(cells[9]?.textContent?.replace(/[^0-9.-]/g, '')) || 0
            };
            data.entries.push(entry);
          }
        });
      });

      // Store analyze data
      if (data.entries.length > 0) {
        chrome.storage.local.set({ analyzeData: data.entries });
      }

    } catch (e) {
      console.error('[GAsTCA] Error scraping analyze page:', e);
    }

    return data;
  }

  // ==================== MANAGE PAGE SCRAPER ====================
  // Called when user is on the "Manage" tab
  function scrapeManagePage() {
    const products = [];

    try {
      const rows = document.querySelectorAll('table tbody tr, [class*="product-row"]');
      
      rows.forEach((row, index) => {
        const cells = row.querySelectorAll('td');
        if (cells.length >= 3) {
          let title = '';
          let asin = '';
          let marketplace = '';
          let status = '';
          let image = '';
          let dateAdded = '';

          cells.forEach(cell => {
            const img = cell.querySelector('img');
            if (img && img.src.includes('amazon')) image = img.src;

            const link = cell.querySelector('a');
            if (link) {
              const href = link.href || '';
              const asinMatch = href.match(/\/dp\/(B[A-Z0-9]+)/) || href.match(/(B[A-Z0-9]{9})/);
              if (asinMatch) asin = asinMatch[1];
              if (link.textContent.trim().length > 5 && !title) {
                title = link.textContent.trim();
              }
            }

            const text = cell.textContent.trim();
            if (['Live', 'Auto-uploaded', 'Under review', 'Rejected', 'Removed', 'Processing', 'Draft'].includes(text)) {
              status = text;
            }
            if (text.match(/^\.(com|co\.uk|de|fr|it|es|co\.jp)$/)) {
              marketplace = text;
            }
          });

          if (title) {
            products.push({
              title: title.substring(0, 120),
              asin: asin,
              marketplace: marketplace,
              status: status,
              image: image,
              type: detectProductType(title),
              index: index
            });
          }
        }
      });

      if (products.length > 0) {
        chrome.storage.local.set({ allProducts: products });
      }

    } catch (e) {
      console.error('[GAsTCA] Error scraping manage page:', e);
    }

    return products;
  }

  // ==================== PAGE DETECTION ====================
  function detectCurrentPage() {
    const url = window.location.href;
    const path = window.location.pathname;
    
    // Check navigation tabs
    if (path.includes('dashboard') || path === '/' || path === '') return 'dashboard';
    if (path.includes('analyze') || path.includes('analytics')) return 'analyze';
    if (path.includes('manage')) return 'manage';
    if (path.includes('create')) return 'create';
    
    // Check by tab active state
    const activeTab = document.querySelector('[class*="active"] a, .selected-tab, [aria-selected="true"]');
    if (activeTab) {
      const tabText = activeTab.textContent.toLowerCase();
      if (tabText.includes('analyze')) return 'analyze';
      if (tabText.includes('manage')) return 'manage';
      if (tabText.includes('dashboard')) return 'dashboard';
    }

    return 'dashboard'; // Default
  }

  // ==================== UTILITY FUNCTIONS ====================
  function detectProductType(text) {
    const lower = (text || '').toLowerCase();
    if (lower.includes('hoodie') || lower.includes('sweatshirt') || lower.includes('pullover')) return 'Hoodie';
    if (lower.includes('tank')) return 'Tank Top';
    if (lower.includes('long sleeve') || lower.includes('langarm')) return 'Long Sleeve';
    if (lower.includes('popsocket') || lower.includes('pop socket')) return 'PopSocket';
    if (lower.includes('phone case') || lower.includes('hülle')) return 'Phone Case';
    if (lower.includes('tote') || lower.includes('tasche')) return 'Tote Bag';
    if (lower.includes('v-neck') || lower.includes('v-ausschnitt')) return 'V-Neck';
    if (lower.includes('raglan')) return 'Raglan';
    if (lower.includes('premium')) return 'Premium T-Shirt';
    if (lower.includes('trinkhumor') || lower.includes('trinken')) return 'T-Shirt';
    return 'T-Shirt';
  }

  // ==================== UI: STATUS BADGE ====================
  function addStatusBadge() {
    // Don't add if already exists
    if (document.querySelector('.gastca-status-badge')) return;

    const badge = document.createElement('div');
    badge.className = 'gastca-status-badge';
    badge.innerHTML = `
      <div class="gastca-logo">G</div>
      <span class="gastca-sync-dot"></span>
      <span class="gastca-text">GAsTCA syncing...</span>
    `;
    badge.addEventListener('click', () => {
      chrome.runtime.sendMessage({ type: 'OPEN_DASHBOARD' });
    });
    document.body.appendChild(badge);
  }

  function updateStatusBadge(success) {
    const badge = document.querySelector('.gastca-status-badge');
    if (!badge) return;

    const dot = badge.querySelector('.gastca-sync-dot');
    const text = badge.querySelector('.gastca-text');

    if (success) {
      dot.style.background = '#4CAF50';
      dot.style.boxShadow = '0 0 4px #4CAF50';
      text.textContent = 'GAsTCA synced ✓';
    } else {
      dot.style.background = '#FF9800';
      dot.style.boxShadow = '0 0 4px #FF9800';
      text.textContent = 'GAsTCA sync error';
    }

    // Reset text after 3 seconds
    setTimeout(() => {
      if (text) text.textContent = 'GAsTCA active';
    }, 3000);
  }

  // ==================== UI: SALE TOAST ====================
  function showSaleToast(count, royalty) {
    // Remove existing toasts
    document.querySelectorAll('.gastca-sale-toast').forEach(t => t.remove());

    const toast = document.createElement('div');
    toast.className = 'gastca-sale-toast';
    toast.innerHTML = `
      <span class="toast-icon">💰</span>
      <div class="toast-content">
        <div class="toast-title">Cha-Ching! New Sale!</div>
        <div class="toast-message">${count} unit${count > 1 ? 's' : ''} sold</div>
      </div>
      <span class="toast-amount">+$${(royalty * count).toFixed(2)}</span>
    `;
    document.body.appendChild(toast);

    // Remove after 5 seconds
    setTimeout(() => toast.remove(), 5000);
  }

  // ==================== MUTATION OBSERVER ====================
  function setupMutationObserver() {
    const observer = new MutationObserver((mutations) => {
      let shouldRescrape = false;

      mutations.forEach(mutation => {
        if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
          mutation.addedNodes.forEach(node => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              const text = node.textContent || '';
              // Detect if new sales data appeared
              if (text.match(/Purchased|Royalt|USD|EUR|GBP/i)) {
                shouldRescrape = true;
              }
            }
          });
        }
      });

      if (shouldRescrape) {
        clearTimeout(window._gastcaRescrapeTimeout);
        window._gastcaRescrapeTimeout = setTimeout(scrapeAllData, 2000);
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  // ==================== MESSAGE HANDLER ====================
  function handleMessage(message, sender, sendResponse) {
    switch (message.type) {
      case 'FORCE_SCRAPE':
        scrapeAllData().then(() => sendResponse({ success: true }));
        return true;

      case 'GET_STATUS':
        sendResponse({ isRunning, page: detectCurrentPage() });
        break;

      case 'SCRAPE_ANALYZE':
        const analyzeData = scrapeAnalyzePage();
        sendResponse(analyzeData);
        break;

      case 'SCRAPE_MANAGE':
        const manageData = scrapeManagePage();
        sendResponse(manageData);
        break;

      case 'PLAY_SOUND':
        // Play cha-ching sound in page context
        try {
          const audio = new Audio(chrome.runtime.getURL('assets/sounds/cha-ching.mp3'));
          audio.volume = 0.7;
          audio.play();
        } catch (e) {
          console.log('[GAsTCA] Audio play failed:', e);
        }
        sendResponse({ success: true });
        break;

      case 'UPDATE_INTERVAL':
        setupPeriodicScrape();
        sendResponse({ success: true });
        break;

      case 'STOP_SCRAPING':
        isRunning = false;
        if (scrapeTimer) clearInterval(scrapeTimer);
        sendResponse({ success: true });
        break;
    }
  }

  // ==================== AUTO-DETECT PAGE CHANGES ====================
  // MBA is a SPA-like app, detect tab navigation
  let lastUrl = location.href;
  setInterval(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      console.log('[GAsTCA] Page changed, re-scraping...');
      setTimeout(scrapeAllData, 1500);
    }
  }, 1000);

  // ==================== START ====================
  init();

})();
