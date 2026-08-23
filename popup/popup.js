// GAsTCA Popup Script v2 - Updated for marketplace data

document.addEventListener('DOMContentLoaded', () => {
  initPopup();
});

async function initPopup() {
  await loadTheme();
  await loadAccountInfo();
  await loadStats();
  await loadRecentSales();
  setupEventListeners();
  updateLastSync();
  checkConnection();
}

// Theme Management
async function loadTheme() {
  const result = await chrome.storage.local.get('theme');
  const theme = result.theme || 'dark';
  document.documentElement.setAttribute('data-theme', theme);
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme');
  const newTheme = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', newTheme);
  chrome.storage.local.set({ theme: newTheme });
}

// Load Account Info
async function loadAccountInfo() {
  const result = await chrome.storage.local.get('accountInfo');
  const info = result.accountInfo || {};

  if (info.tier) {
    document.getElementById('accountTier').textContent = `Tier ${info.tier}`;
  }
  if (info.publishedDesigns) {
    document.getElementById('accountDesigns').textContent = `${info.publishedDesigns}/${info.maxDesigns} designs`;
  }
  if (info.productPotential) {
    document.getElementById('accountProducts').textContent = `${info.productPotential} products`;
  }
}

// Load Stats from Storage
async function loadStats() {
  const result = await chrome.storage.local.get('salesData');
  const data = result.salesData || {};
  
  const today = new Date().toISOString().split('T')[0];
  const todayData = data[today] || { sales: 0, units: 0, royalties: 0, marketplaces: [] };
  
  document.getElementById('todaySales').textContent = todayData.units || 0;
  document.getElementById('todayRoyalties').textContent = formatCurrency(todayData.royalties);

  // Marketplace breakdown
  const marketplaces = todayData.marketplaces || [];
  const mpMap = { US: 'mpUS', UK: 'mpUK', DE: 'mpDE', JP: 'mpJP' };
  
  marketplaces.forEach(mp => {
    const elId = mpMap[mp.marketplace];
    if (elId) {
      document.getElementById(elId).textContent = mp.units || 0;
    }
  });
}

// Load Recent Sales
async function loadRecentSales() {
  const result = await chrome.storage.local.get('recentSales');
  const sales = result.recentSales || [];
  const container = document.getElementById('recentSalesList');
  
  if (sales.length === 0) {
    return; // Keep empty state
  }
  
  container.innerHTML = '';
  const displaySales = sales.slice(0, 5);
  
  displaySales.forEach(sale => {
    const item = document.createElement('div');
    item.className = 'sale-item';
    
    const mpFlag = getMarketplaceFlag(sale.marketplace);
    item.innerHTML = `
      <span class="sale-flag">${mpFlag}</span>
      <span class="sale-product">${sale.product || 'Sale'}</span>
      <span class="sale-amount">+${formatCurrency(sale.royalty)}</span>
    `;
    container.appendChild(item);
  });
  
  const newCount = sales.filter(s => !s.seen).length;
  document.getElementById('newSalesBadge').textContent = `${newCount} new`;
}

// Check MBA Connection
async function checkConnection() {
  const result = await chrome.storage.local.get('lastScrapeTime');
  const lastScrape = result.lastScrapeTime;
  const statusBar = document.getElementById('statusBar');
  const dot = statusBar.querySelector('.status-dot');
  const text = statusBar.querySelector('.status-text');
  
  if (lastScrape && (Date.now() - lastScrape) < 300000) {
    dot.classList.add('online');
    text.textContent = 'Connected to MBA';
  } else {
    dot.classList.remove('online');
    text.textContent = 'Open MBA dashboard to sync';
  }
}

// Update Last Sync Time
async function updateLastSync() {
  const result = await chrome.storage.local.get('lastScrapeTime');
  const lastScrape = result.lastScrapeTime;
  const el = document.getElementById('lastSync');
  
  if (lastScrape) {
    el.textContent = getRelativeTime(lastScrape);
  } else {
    el.textContent = 'Never';
  }
}

// Event Listeners
function setupEventListeners() {
  document.getElementById('themeToggle').addEventListener('click', toggleTheme);
  
  document.getElementById('openDashboard').addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('dashboard/dashboard.html') });
  });
  
  document.getElementById('openNicheResearch').addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('dashboard/dashboard.html#niche') });
  });
  
  document.getElementById('openKeywords').addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('dashboard/dashboard.html#keywords') });
  });
  
  document.getElementById('openTrending').addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('dashboard/dashboard.html#trending') });
  });
  
  document.getElementById('settingsBtn').addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('dashboard/dashboard.html#settings') });
  });
}

// Utility Functions
function formatCurrency(amount) {
  return '$' + (parseFloat(amount) || 0).toFixed(2);
}

function getRelativeTime(timestamp) {
  const diff = Date.now() - timestamp;
  const mins = Math.floor(diff / 60000);
  
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function getMarketplaceFlag(mp) {
  const flags = {
    'US': '🇺🇸', 'UK': '🇬🇧', 'DE': '🇩🇪', 'FR': '🇫🇷',
    'IT': '🇮🇹', 'ES': '🇪🇸', 'JP': '🇯🇵', 'AU': '🇦🇺'
  };
  return flags[mp] || '🌍';
}

// Listen for real-time updates
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'local') {
    if (changes.salesData) loadStats();
    if (changes.recentSales) loadRecentSales();
    if (changes.accountInfo) loadAccountInfo();
    if (changes.lastScrapeTime) {
      checkConnection();
      updateLastSync();
    }
  }
});
