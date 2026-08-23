// GAsTCA - Background Service Worker
// Handles notifications, alarms, data management, and cha-ching sounds

// ==================== INITIALIZATION ====================
chrome.runtime.onInstalled.addListener((details) => {
  console.log('[GAsTCA] Extension installed/updated:', details.reason);
  
  // Set default settings
  chrome.storage.local.get(['settings'], (result) => {
    if (!result.settings) {
      chrome.storage.local.set({
        theme: 'dark',
        notificationsEnabled: true,
        soundEnabled: true,
        refreshInterval: 60,
        currency: 'USD',
        salesData: {},
        products: [],
        recentSales: [],
        trackedAsins: [],
        lastSalesCount: 0,
        lastScrapeTime: null
      });
    }
  });

  // Set up periodic alarm for background tasks
  setupAlarms();
});

chrome.runtime.onStartup.addListener(() => {
  console.log('[GAsTCA] Extension started');
  setupAlarms();
});

// ==================== ALARMS ====================
function setupAlarms() {
  // Check for MBA tab updates every minute
  chrome.alarms.create('checkSales', { periodInMinutes: 1 });
  
  // BSR tracking update every 6 hours
  chrome.alarms.create('updateBSR', { periodInMinutes: 360 });
  
  // Daily stats aggregation
  chrome.alarms.create('dailyAggregate', { periodInMinutes: 1440 });
}

chrome.alarms.onAlarm.addListener((alarm) => {
  switch (alarm.name) {
    case 'checkSales':
      triggerMBAScrape();
      break;
    case 'updateBSR':
      updateTrackedBSRs();
      break;
    case 'dailyAggregate':
      aggregateDailyStats();
      break;
  }
});

// ==================== MESSAGE HANDLING ====================
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {
    case 'NEW_SALE':
      handleNewSale(message.data);
      sendResponse({ success: true });
      break;

    case 'OPEN_DASHBOARD':
      chrome.tabs.create({ url: chrome.runtime.getURL('dashboard/dashboard.html') });
      sendResponse({ success: true });
      break;

    case 'UPDATE_ALARM':
      chrome.alarms.clear('checkSales', () => {
        const minutes = Math.max(0.5, (message.interval || 60) / 60);
        chrome.alarms.create('checkSales', { periodInMinutes: minutes });
      });
      sendResponse({ success: true });
      break;

    case 'PLAY_SOUND':
      playChaChing();
      sendResponse({ success: true });
      break;

    case 'GET_STATS':
      getStats().then(stats => sendResponse(stats));
      return true; // async response

    case 'FORCE_SCRAPE':
      triggerMBAScrape();
      sendResponse({ success: true });
      break;
  }
});

// ==================== NEW SALE HANDLER ====================
async function handleNewSale(data) {
  const settings = await chrome.storage.local.get(['notificationsEnabled', 'soundEnabled']);
  
  // Desktop notification
  if (settings.notificationsEnabled !== false) {
    chrome.notifications.create(`sale-${Date.now()}`, {
      type: 'basic',
      iconUrl: chrome.runtime.getURL('assets/icons/icon128.png'),
      title: '💰 Cha-Ching! New Sale!',
      message: `You just sold ${data.count} unit${data.count > 1 ? 's' : ''}! +$${(data.royalty * data.count).toFixed(2)} royalty`,
      priority: 2
    });
  }

  // Play cha-ching sound
  if (settings.soundEnabled !== false) {
    playChaChing();
  }

  // Update badge
  updateBadge(data.totalToday);
}

// ==================== CHA-CHING SOUND ====================
function playChaChing() {
  // Create an offscreen document to play audio (Manifest V3 requirement)
  // For now, we'll trigger it through the content script or popup
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]) {
      chrome.tabs.sendMessage(tabs[0].id, { type: 'PLAY_SOUND' }).catch(() => {
        // Tab might not have content script, that's OK
      });
    }
  });

  // Also try offscreen audio (Chrome 109+)
  try {
    createOffscreenForAudio();
  } catch (e) {
    console.log('[GAsTCA] Offscreen audio not available');
  }
}

async function createOffscreenForAudio() {
  // Check if offscreen document already exists
  const existingContexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT']
  }).catch(() => []);

  if (existingContexts.length > 0) return;

  await chrome.offscreen.createDocument({
    url: chrome.runtime.getURL('background/offscreen.html'),
    reasons: ['AUDIO_PLAYBACK'],
    justification: 'Playing cha-ching notification sound on new sale'
  }).catch(() => {});
}

// ==================== BADGE ====================
function updateBadge(salesCount) {
  if (salesCount > 0) {
    chrome.action.setBadgeText({ text: String(salesCount) });
    chrome.action.setBadgeBackgroundColor({ color: '#4CAF50' });
  }
}

// Clear badge when popup opens
chrome.action.onClicked?.addListener(() => {
  chrome.action.setBadgeText({ text: '' });
});

// ==================== MBA TAB SCRAPING ====================
async function triggerMBAScrape() {
  // Find MBA tabs and trigger a scrape
  const tabs = await chrome.tabs.query({ url: 'https://merch.amazon.com/*' });
  
  for (const tab of tabs) {
    try {
      await chrome.tabs.sendMessage(tab.id, { type: 'FORCE_SCRAPE' });
      console.log('[GAsTCA] Triggered scrape on MBA tab:', tab.id);
    } catch (e) {
      // Tab might not have content script loaded
    }
  }
}

// ==================== BSR TRACKING ====================
async function updateTrackedBSRs() {
  const result = await chrome.storage.local.get('trackedAsins');
  const tracked = result.trackedAsins || [];

  if (tracked.length === 0) return;

  // For each tracked ASIN, we'd normally fetch the product page
  // For now, we simulate BSR updates (in production, would use background fetch)
  const updated = tracked.map(item => {
    const lastBSR = item.history[item.history.length - 1]?.bsr || 100000;
    const change = Math.floor(Math.random() * 20000) - 10000;
    const newBSR = Math.max(1, lastBSR + change);

    item.history.push({
      timestamp: Date.now(),
      bsr: newBSR
    });

    // Keep last 90 data points (approx 90 days if checking every day, or 22 days at every 6h)
    if (item.history.length > 90) {
      item.history = item.history.slice(-90);
    }

    return item;
  });

  await chrome.storage.local.set({ trackedAsins: updated });
  console.log('[GAsTCA] Updated BSR for', updated.length, 'tracked ASINs');
}

// ==================== DAILY AGGREGATION ====================
async function aggregateDailyStats() {
  const result = await chrome.storage.local.get('salesData');
  const salesData = result.salesData || {};

  // Clean up old data (keep last 365 days)
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 365);
  const cutoffStr = cutoff.toISOString().split('T')[0];

  const cleaned = {};
  Object.keys(salesData).forEach(date => {
    if (date >= cutoffStr) {
      cleaned[date] = salesData[date];
    }
  });

  if (Object.keys(cleaned).length !== Object.keys(salesData).length) {
    await chrome.storage.local.set({ salesData: cleaned });
    console.log('[GAsTCA] Cleaned old sales data');
  }
}

// ==================== STATS HELPER ====================
async function getStats() {
  const result = await chrome.storage.local.get(['salesData', 'products', 'recentSales', 'trackedAsins']);
  
  const today = new Date().toISOString().split('T')[0];
  const todayData = result.salesData?.[today] || { sales: 0, royalties: 0, units: 0 };

  return {
    today: todayData,
    totalProducts: (result.products || []).length,
    recentSalesCount: (result.recentSales || []).length,
    trackedCount: (result.trackedAsins || []).length
  };
}

// ==================== NOTIFICATION CLICK ====================
chrome.notifications.onClicked.addListener((notificationId) => {
  // Open dashboard when notification is clicked
  chrome.tabs.create({ url: chrome.runtime.getURL('dashboard/dashboard.html') });
  chrome.notifications.clear(notificationId);
});

// ==================== CONTEXT MENU ====================
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'gastca-analyze',
    title: 'GAsTCA: Analyze this product',
    contexts: ['link'],
    documentUrlPatterns: ['https://www.amazon.com/*']
  });

  chrome.contextMenus.create({
    id: 'gastca-track',
    title: 'GAsTCA: Track this ASIN',
    contexts: ['link'],
    documentUrlPatterns: ['https://www.amazon.com/*']
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const url = info.linkUrl || info.pageUrl;
  const asinMatch = url?.match(/\/dp\/(B[A-Z0-9]+)/);

  if (!asinMatch) return;

  const asin = asinMatch[1];

  switch (info.menuItemId) {
    case 'gastca-analyze':
      chrome.tabs.create({ 
        url: chrome.runtime.getURL(`dashboard/dashboard.html#bsr-tracker`) 
      });
      break;

    case 'gastca-track':
      const result = await chrome.storage.local.get('trackedAsins');
      const tracked = result.trackedAsins || [];
      
      if (!tracked.find(t => t.asin === asin)) {
        tracked.push({
          asin: asin,
          title: 'Tracked from context menu',
          addedAt: Date.now(),
          history: [{ timestamp: Date.now(), bsr: 0 }]
        });
        await chrome.storage.local.set({ trackedAsins: tracked });
        
        chrome.notifications.create(`track-${Date.now()}`, {
          type: 'basic',
          iconUrl: chrome.runtime.getURL('assets/icons/icon128.png'),
          title: '📊 ASIN Tracked!',
          message: `Now tracking ${asin}. Check your dashboard for updates.`,
          priority: 1
        });
      }
      break;
  }
});

console.log('[GAsTCA] 🚀 Background service worker ready');
