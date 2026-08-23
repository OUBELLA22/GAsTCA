# GAsTCA - Merch by Amazon Intelligence

> All-in-one Chrome extension for Merch by Amazon sellers: real-time sales tracking, niche research, BSR analysis, keyword tools, and trending products.

![Version](https://img.shields.io/badge/version-1.0.0-gold)
![Chrome](https://img.shields.io/badge/Chrome-Manifest%20V3-green)
![License](https://img.shields.io/badge/license-Private-red)

---

## ✨ Features

### 📊 Dashboard (like PrettyMerch)
- Real-time sales tracking with beautiful dark UI
- Royalties, units sold, and product KPIs
- Interactive charts (daily/weekly/monthly)
- Top selling products ranking
- Activity feed with live updates

### 🔔 Notifications
- **Cha-ching sound** on every new sale
- Desktop notifications with sale details
- Badge counter on extension icon

### 🔍 Niche Research (like Merch Dominator)
- Demand vs. Competition scoring
- Opportunity score calculator
- BSR distribution analysis
- Average price tracking
- Listing count per niche

### 🔑 Keyword Research (like Productor)
- Search volume estimates
- Competition level indicators
- Keyword scoring
- Related keyword suggestions

### 📈 Trending Products
- Products gaining momentum (BSR movers)
- Filter by category and time period
- Percentage change tracking

### 📊 BSR Tracker
- Track any ASIN over time
- Historical BSR data
- Multiple product tracking

### 🛡️ Trademark Checker
- USPTO database lookup
- Risk assessment (Safe / Risky)
- Active trademark details

### 🌐 Amazon Page Overlay
- BSR data directly on search results
- Competition score on product pages
- Estimated monthly sales
- One-click ASIN tracking
- Right-click context menu integration

---

## 🚀 Installation

1. **Download/Clone this repository**
   ```bash
   git clone https://github.com/OUBELLA22/GAsTCA.git
   ```

2. **Open Chrome Extensions**
   - Navigate to `chrome://extensions/`

3. **Enable Developer Mode**
   - Toggle "Developer mode" ON (top-right corner)

4. **Load the Extension**
   - Click "Load unpacked"
   - Select the `GAsTCA` folder (the one with `manifest.json`)

5. **Pin it**
   - Click the puzzle icon 🧩 in toolbar
   - Pin GAsTCA for quick access

---

## 📁 Project Structure

```
GAsTCA/
├── manifest.json              # Chrome extension configuration
├── popup/                     # Popup UI (click extension icon)
│   ├── popup.html
│   ├── popup.css
│   └── popup.js
├── dashboard/                 # Full-page analytics dashboard
│   ├── dashboard.html
│   ├── dashboard.css
│   └── dashboard.js
├── content-scripts/           # Injected into Amazon/MBA pages
│   ├── mba-scraper.js        # Scrapes MBA dashboard data
│   ├── mba-overlay.css       # MBA page styling
│   ├── amazon-overlay.js     # Amazon search/product enhancements
│   └── amazon-overlay.css    # Amazon overlay styling
├── background/                # Background service worker
│   ├── service-worker.js     # Notifications, alarms, data management
│   ├── offscreen.html        # Audio playback document
│   └── offscreen.js          # Cha-ching sound handler
├── libs/                      # Libraries
│   ├── chart.min.js          # Lightweight chart library
│   └── theme-manager.js      # Dark/light mode manager
├── styles/                    # Global styles
│   └── global.css            # CSS variables, theme, utilities
└── assets/                    # Static assets
    ├── icons/                 # Extension icons (16, 48, 128px)
    └── sounds/                # Notification sounds
```

---

## 🎨 Design

- **Dark theme** (default) with gold accents
- **Light theme** available
- Color palette: `#0D0D0D` (bg) + `#F5A623` (gold) + `#FFFFFF` (text)
- Clean, modern UI inspired by PrettyMerch

---

## 🔧 How It Works

1. **MBA Dashboard Scraping**: When you visit `merch.amazon.com`, the content script automatically extracts your sales, products, and royalty data
2. **Data Storage**: All data is stored locally in Chrome's storage (your data never leaves your browser)
3. **Real-time Updates**: Mutation observers detect new sales as they appear
4. **Amazon Overlay**: When browsing Amazon, the extension overlays BSR and competition data on search results and product pages
5. **Background Worker**: Manages periodic checks, notifications, and BSR tracking updates

---

## 🛣️ Roadmap

- [ ] Phase 2: Enhanced Amazon data scraping, real BSR API integration
- [ ] Phase 3: AI-powered niche suggestions, listing optimizer
- [ ] Phase 4: Google Trends integration, social media ad tracking
- [ ] Phase 5: Cloud backend for historical data & advanced analytics

---

## ⚠️ Disclaimer

This extension is for personal use. It scrapes publicly available data from your own Amazon/MBA accounts. Use responsibly and in accordance with Amazon's Terms of Service.

---

## 📄 License

Private - Personal Use Only

---

Made with 💛 for Merch by Amazon sellers
