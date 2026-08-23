/**
 * GAsTCA Theme Manager
 * Handles dark/light mode toggle across popup, dashboard, and persists preference
 * Can be imported by any page in the extension
 */

class ThemeManager {
  constructor() {
    this.currentTheme = 'dark';
    this.listeners = [];
    this.init();
  }

  async init() {
    // Load saved theme
    try {
      const result = await chrome.storage.local.get('theme');
      this.currentTheme = result.theme || 'dark';
    } catch (e) {
      this.currentTheme = 'dark';
    }
    this.applyTheme(this.currentTheme);

    // Listen for changes from other pages/tabs
    chrome.storage.onChanged.addListener((changes, namespace) => {
      if (namespace === 'local' && changes.theme) {
        this.currentTheme = changes.theme.newValue;
        this.applyTheme(this.currentTheme);
        this.notifyListeners();
      }
    });
  }

  applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    
    // Update meta theme-color for browser UI
    let meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'theme-color';
      document.head.appendChild(meta);
    }
    meta.content = theme === 'dark' ? '#0D0D0D' : '#F5F5F5';

    // Update any toggle buttons on the page
    this.updateToggleButtons(theme);
  }

  async toggle() {
    this.currentTheme = this.currentTheme === 'dark' ? 'light' : 'dark';
    this.applyTheme(this.currentTheme);
    
    // Persist
    try {
      await chrome.storage.local.set({ theme: this.currentTheme });
    } catch (e) {
      console.warn('[GAsTCA] Could not save theme:', e);
    }

    this.notifyListeners();
    return this.currentTheme;
  }

  async setTheme(theme) {
    if (theme !== 'dark' && theme !== 'light') return;
    this.currentTheme = theme;
    this.applyTheme(theme);

    try {
      await chrome.storage.local.set({ theme: theme });
    } catch (e) {
      console.warn('[GAsTCA] Could not save theme:', e);
    }

    this.notifyListeners();
    return this.currentTheme;
  }

  getTheme() {
    return this.currentTheme;
  }

  isDark() {
    return this.currentTheme === 'dark';
  }

  // Subscribe to theme changes
  onChange(callback) {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter(l => l !== callback);
    };
  }

  notifyListeners() {
    this.listeners.forEach(cb => {
      try { cb(this.currentTheme); } catch (e) {}
    });
  }

  updateToggleButtons(theme) {
    // Update moon/sun icon on toggle buttons
    const toggleBtns = document.querySelectorAll('#themeToggle, [data-theme-toggle]');
    toggleBtns.forEach(btn => {
      const svg = btn.querySelector('svg');
      if (svg) {
        if (theme === 'dark') {
          // Moon icon (switch to light)
          svg.innerHTML = '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>';
        } else {
          // Sun icon (switch to dark)
          svg.innerHTML = '<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>';
        }
      }
    });

    // Update settings dropdown if exists
    const settingsSelect = document.getElementById('settingsTheme');
    if (settingsSelect) {
      settingsSelect.value = theme;
    }
  }
}

// Auto-initialize when script loads
const gastcaTheme = new ThemeManager();

// Export for module use
if (typeof window !== 'undefined') {
  window.gastcaTheme = gastcaTheme;
}
