// GAsTCA - Merch by Amazon Dashboard Scraper
// This content script runs on merch.amazon.com and extracts sales, products, and royalty data

(function() {
  'use strict';

  // ==================== CONFIGURATION ====================
  const SCRAPE_INTERVAL = 60000; // Default: check every 60 seconds
  const MAX_RETRY_ATTEMPTS = 3;

  let isRunning = false;
  let previousSalesCount = null;
  let scrapeTimer = null;

  // ==================== INITIALIZATION ====================
  function init() {
    console.log('[GAsTCA] 🚀 Content script loaded on MBA dashboard');
    
    // Wait for page to fully load
    if (document.readyState === 'complete') {
      startScraping();
    } else {
      window.addEventListener('load', startScraping);
    }

    // Listen for messages from background/popup
    chrome.runtime.onMessage.addListener(handleMessage);
  }

  function startScraping() {
    console.log('[GAsTCA] Starting data scraper...');
    isRunning = true;
    
    // Initial scrape
    scrapeAllData();
    
    // Set up periodic scraping
    setupPeriodicScrape();
    
    // Watch for DOM changes (MBA uses dynamic content)
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
      const salesData = scrapeSalesData();
      const products = scrapeProducts();
      const royalties = scrapeRoyalties();

      const today = new Date().toISOString().split('T')[0];

      // Get existing data
      const stored = await chrome.storage.local.get(['salesData', 'products', 'recentSales', 'lastSalesCount']);
      const existingSalesData = stored.salesData || {};
      const existingRecentSales = stored.recentSales || [];

      // Update today's data
      existingSalesData[today] = {
        sales: salesData.totalSales,
        royalties: royalties.totalRoyalties,
        units: salesData.totalUnits,
        timestamp: Date.now()
      };

      // Check for new sales
      const lastSalesCount = stored.lastSalesCount || 0;
      if (salesData.totalUnits > lastSalesCount && lastSalesCount > 0) {
        const newSalesCount = salesData.totalUnits - lastSalesCount;
        
        // Add to recent sales
        for (let i = 0; i < newSalesCount; i++) {
          existingRecentSales.unshift({
            product: 'New Sale Detected',
            royalty: royalties.avgRoyaltyPerUnit || 0,
            timestamp: Date.now(),
            seen: false
          });
        }

        // Keep only last 50 recent sales
        if (existingRecentSales.length > 50) {
          existingRecentSales.length = 50;
        }

        // Notify background script about new sale
        chrome.runtime.sendMessage({
          type: 'NEW_SALE',
          data: {
            count: newSalesCount,
            royalty: royalties.avgRoyaltyPerUnit || 0,
            totalToday: salesData.totalUnits
          }
        });
      }

      // Save all data
      await chrome.storage.local.set({
        salesData: existingSalesData,
        products: products,
        recentSales: existingRecentSales,
        lastSalesCount: salesData.totalUnits,
        lastScrapeTime: Date.now()
      });

      console.log('[GAsTCA] ✅ Data scraped successfully', {
        sales: salesData.totalSales,
        units: salesData.totalUnits,
        royalties: royalties.totalRoyalties,
        products: products.length
      });

    } catch (error) {
      console.error('[GAsTCA] ❌ Scraping error:', error);
    }
  }

  // ==================== SALES DATA SCRAPER ====================
  function scrapeSalesData() {
    const data = {
      totalSales: 0,
      totalUnits: 0,
      salesByProduct: []
    };

    try {
      // Try to find sales summary on MBA dashboard
      // MBA dashboard selectors (these may need updating as Amazon changes their UI)
      
      // Method 1: Look for sales summary table/cards
      const salesElements = document.querySelectorAll('[data-testid*="sales"], .sales-summary, .kpi-value, [class*="salesAmount"]');
      if (salesElements.length > 0) {
        salesElements.forEach(el => {
          const text = el.textContent.trim();
          const amount = parseFloat(text.replace(/[$,]/g, ''));
          if (!isNaN(amount)) {
            data.totalSales += amount;
          }
        });
      }

      // Method 2: Parse from the MBA analyze page
      const analyzeTable = document.querySelector('#analyse-table, [class*="AnalyseTable"], table.a-bordered');
      if (analyzeTable) {
        const rows = analyzeTable.querySelectorAll('tbody tr');
        rows.forEach(row => {
          const cells = row.querySelectorAll('td');
          if (cells.length >= 4) {
            const units = parseInt(cells[1]?.textContent?.trim()) || 0;
            const royalty = parseFloat(cells[3]?.textContent?.replace(/[$,]/g, '').trim()) || 0;
            data.totalUnits += units;
            data.totalSales += royalty;
          }
        });
      }

      // Method 3: Look for the earnings/royalties summary
      const earningsElements = document.querySelectorAll('[class*="earning"], [class*="royalt"], [class*="revenue"]');
      earningsElements.forEach(el => {
        const text = el.textContent.trim();
        const match = text.match(/\$[\d,.]+/);
        if (match) {
          const amount = parseFloat(match[0].replace(/[$,]/g, ''));
          if (!isNaN(amount) && amount > data.totalSales) {
            data.totalSales = amount;
          }
        }
      });

      // Method 4: Generic number extraction from known MBA page structure
      const allText = document.body.innerText;
      
      // Look for "Units Sold" or similar patterns
      const unitsMatch = allText.match(/(\d+)\s*(?:units?\s*sold|sold)/i);
      if (unitsMatch && parseInt(unitsMatch[1]) > data.totalUnits) {
        data.totalUnits = parseInt(unitsMatch[1]);
      }

      // Look for total royalties pattern
      const royaltyMatch = allText.match(/(?:total|royalt[iy]|earned?)[\s:]*\$?([\d,.]+)/i);
      if (royaltyMatch) {
        const amount = parseFloat(royaltyMatch[1].replace(/,/g, ''));
        if (!isNaN(amount) && amount > 0) {
          data.totalSales = Math.max(data.totalSales, amount);
        }
      }

    } catch (e) {
      console.error('[GAsTCA] Error scraping sales:', e);
    }

    return data;
  }

  // ==================== PRODUCTS SCRAPER ====================
  function scrapeProducts() {
    const products = [];

    try {
      // Method 1: MBA Manage page - product cards/table
      const productRows = document.querySelectorAll(
        '[class*="product-row"], [class*="ProductCard"], .manage-table tbody tr, [data-testid*="product"]'
      );

      productRows.forEach((row, index) => {
        const product = extractProductFromRow(row, index);
        if (product) products.push(product);
      });

      // Method 2: If on analyze page, get product data from table
      if (products.length === 0) {
        const tableRows = document.querySelectorAll('table tbody tr');
        tableRows.forEach((row, index) => {
          const cells = row.querySelectorAll('td');
          if (cells.length >= 3) {
            const titleCell = cells[0];
            const title = titleCell?.textContent?.trim() || `Product ${index + 1}`;
            
            // Try to get ASIN from link
            const link = titleCell?.querySelector('a');
            const asinMatch = link?.href?.match(/\/dp\/(B[A-Z0-9]+)/);
            
            products.push({
              title: title.substring(0, 100),
              asin: asinMatch ? asinMatch[1] : '',
              type: detectProductType(title),
              status: 'Live',
              totalSales: 0,
              index: index
            });
          }
        });
      }

      // Method 3: Look for product cards with images
      if (products.length === 0) {
        const cards = document.querySelectorAll('[class*="card"], [class*="listing"], [class*="item"]');
        cards.forEach((card, index) => {
          const title = card.querySelector('[class*="title"], h3, h4, [class*="name"]');
          const asinEl = card.querySelector('[class*="asin"], [data-asin]');
          const img = card.querySelector('img');

          if (title) {
            products.push({
              title: title.textContent.trim().substring(0, 100),
              asin: asinEl?.textContent?.trim() || asinEl?.getAttribute('data-asin') || '',
              type: detectProductType(title.textContent),
              image: img?.src || '',
              status: 'Live',
              totalSales: 0,
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

  function extractProductFromRow(row, index) {
    try {
      const title = row.querySelector('[class*="title"], [class*="name"], td:first-child')?.textContent?.trim();
      if (!title || title.length < 3) return null;

      const asinEl = row.querySelector('[class*="asin"], [data-asin]');
      const statusEl = row.querySelector('[class*="status"]');
      const img = row.querySelector('img');
      
      // Try to find ASIN from any link
      const links = row.querySelectorAll('a');
      let asin = asinEl?.textContent?.trim() || '';
      if (!asin) {
        links.forEach(link => {
          const match = link.href?.match(/\/dp\/(B[A-Z0-9]+)/) || link.href?.match(/(B[A-Z0-9]{9})/);
          if (match) asin = match[1];
        });
      }

      return {
        title: title.substring(0, 100),
        asin: asin,
        type: detectProductType(title),
        image: img?.src || '',
        status: statusEl?.textContent?.trim() || 'Live',
        totalSales: 0,
        index: index
      };
    } catch (e) {
      return null;
    }
  }

  function detectProductType(text) {
    const lower = (text || '').toLowerCase();
    if (lower.includes('hoodie') || lower.includes('sweatshirt')) return 'Hoodie';
    if (lower.includes('tank')) return 'Tank Top';
    if (lower.includes('long sleeve')) return 'Long Sleeve';
    if (lower.includes('popsocket') || lower.includes('pop socket')) return 'PopSocket';
    if (lower.includes('phone case')) return 'Phone Case';
    if (lower.includes('tote')) return 'Tote Bag';
    if (lower.includes('throw pillow') || lower.includes('pillow')) return 'Throw Pillow';
    return 'T-Shirt';
  }

  // ==================== ROYALTIES SCRAPER ====================
  function scrapeRoyalties() {
    const data = {
      totalRoyalties: 0,
      avgRoyaltyPerUnit: 0,
      royaltiesByProduct: []
    };

    try {
      // Look for royalty/earnings displays
      const royaltyElements = document.querySelectorAll(
        '[class*="royalt"], [class*="earning"], [class*="revenue"], [class*="amount"]'
      );

      let amounts = [];
      royaltyElements.forEach(el => {
        const text = el.textContent.trim();
        const matches = text.match(/\$[\d,.]+/g);
        if (matches) {
          matches.forEach(m => {
            const amount = parseFloat(m.replace(/[$,]/g, ''));
            if (!isNaN(amount) && amount > 0) {
              amounts.push(amount);
            }
          });
        }
      });

      // Look in table cells for royalty column
      const tables = document.querySelectorAll('table');
      tables.forEach(table => {
        const headers = table.querySelectorAll('th');
        let royaltyColIndex = -1;
        
        headers.forEach((th, index) => {
          if (th.textContent.toLowerCase().includes('royalt')) {
            royaltyColIndex = index;
          }
        });

        if (royaltyColIndex >= 0) {
          const rows = table.querySelectorAll('tbody tr');
          rows.forEach(row => {
            const cells = row.querySelectorAll('td');
            if (cells[royaltyColIndex]) {
              const amount = parseFloat(cells[royaltyColIndex].textContent.replace(/[$,]/g, ''));
              if (!isNaN(amount)) {
                data.totalRoyalties += amount;
                amounts.push(amount);
              }
            }
          });
        }
      });

      // If we found amounts, use the largest as total
      if (amounts.length > 0) {
        data.totalRoyalties = Math.max(data.totalRoyalties, Math.max(...amounts));
        data.avgRoyaltyPerUnit = amounts.reduce((a, b) => a + b, 0) / amounts.length;
      }

    } catch (e) {
      console.error('[GAsTCA] Error scraping royalties:', e);
    }

    return data;
  }

  // ==================== MUTATION OBSERVER ====================
  function setupMutationObserver() {
    const observer = new MutationObserver((mutations) => {
      let shouldRescrape = false;
      
      mutations.forEach(mutation => {
        // Check if significant content changed
        if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
          mutation.addedNodes.forEach(node => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              const text = node.textContent || '';
              // If new content contains sales/royalty data indicators
              if (text.match(/\$[\d,.]+/) || text.match(/\d+\s*unit/i)) {
                shouldRescrape = true;
              }
            }
          });
        }
      });

      if (shouldRescrape) {
        // Debounce re-scraping
        clearTimeout(window._gastcaRescrapeTimeout);
        window._gastcaRescrapeTimeout = setTimeout(scrapeAllData, 2000);
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true
    });
  }

  // ==================== MESSAGE HANDLER ====================
  function handleMessage(message, sender, sendResponse) {
    switch (message.type) {
      case 'FORCE_SCRAPE':
        scrapeAllData().then(() => sendResponse({ success: true }));
        return true;

      case 'GET_STATUS':
        sendResponse({
          isRunning: isRunning,
          lastScrape: Date.now()
        });
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

      case 'START_SCRAPING':
        isRunning = true;
        startScraping();
        sendResponse({ success: true });
        break;
    }
  }

  // ==================== START ====================
  init();

})();
