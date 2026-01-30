/**
 * Popup script for ChatGPT Conversation Exporter
 */

document.addEventListener('DOMContentLoaded', initialize);

// DOM Elements
let exportCurrentBtn;
let exportAllBtn;
let autoSyncToggle;
let clearTrackingBtn;
let statusDot;
let statusText;
let progressSection;
let progressFill;
let progressText;
let exportedCount;
let sidebarCount;
let messageEl;

/**
 * Initialize the popup
 */
async function initialize() {
  // Get DOM elements
  exportCurrentBtn = document.getElementById('export-current');
  exportAllBtn = document.getElementById('export-all');
  autoSyncToggle = document.getElementById('auto-sync-toggle');
  clearTrackingBtn = document.getElementById('clear-tracking');
  statusDot = document.querySelector('.status-dot');
  statusText = document.getElementById('status-text');
  progressSection = document.getElementById('progress-section');
  progressFill = document.getElementById('progress-fill');
  progressText = document.getElementById('progress-text');
  exportedCount = document.getElementById('exported-count');
  sidebarCount = document.getElementById('sidebar-count');
  messageEl = document.getElementById('message');

  // Set up event listeners
  exportCurrentBtn.addEventListener('click', handleExportCurrent);
  exportAllBtn.addEventListener('click', handleExportAll);
  autoSyncToggle.addEventListener('change', handleAutoSyncToggle);
  clearTrackingBtn.addEventListener('click', handleClearTracking);

  // Listen for progress updates
  chrome.runtime.onMessage.addListener((request) => {
    if (request.action === 'exportProgress') {
      updateProgress(request.progress);
    }
  });

  // Load initial state
  await loadState();
}

/**
 * Load current state from content script and storage
 */
async function loadState() {
  try {
    // Check if we're on ChatGPT
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab || !tab.url || !tab.url.includes('chatgpt.com')) {
      setStatus('inactive', 'Not on ChatGPT');
      exportCurrentBtn.disabled = true;
      exportAllBtn.disabled = true;
      return;
    }

    // Get status from content script
    const response = await sendToContentScript({ action: 'getStatus' });

    if (response) {
      setStatus('active', `${response.messageCount} messages`);
      autoSyncToggle.checked = response.autoSyncEnabled;
    } else {
      setStatus('inactive', 'Ready');
    }

    // Get sidebar conversation count
    try {
      const listResponse = await sendToContentScript({ action: 'getConversationList' });
      if (listResponse && listResponse.conversations) {
        sidebarCount.textContent = listResponse.conversations.length;
      }
    } catch (e) {
      sidebarCount.textContent = '-';
    }

    // Get auto-sync state from background
    chrome.runtime.sendMessage({ action: 'getAutoSync' }, (response) => {
      if (response) {
        autoSyncToggle.checked = response.enabled;
      }
    });

    // Get exported count directly from storage
    chrome.storage.local.get(['exportedConversations'], (result) => {
      const count = (result.exportedConversations || []).length;
      exportedCount.textContent = count;
    });

  } catch (error) {
    console.error('Failed to load state:', error);
    setStatus('error', 'Error loading state');
  }
}

/**
 * Send message to content script in active tab
 */
async function sendToContentScript(message) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!tab || !tab.id) {
    throw new Error('No active tab');
  }

  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tab.id, message, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(response);
      }
    });
  });
}

/**
 * Handle export current conversation
 */
async function handleExportCurrent() {
  exportCurrentBtn.disabled = true;
  showMessage('info', 'Exporting conversation...');

  try {
    const response = await sendToContentScript({ action: 'exportCurrent' });

    if (response && response.success) {
      showMessage('success', 'Conversation exported!');
      // Update exported count from storage
      chrome.storage.local.get(['exportedConversations'], (result) => {
        exportedCount.textContent = (result.exportedConversations || []).length;
      });
    } else {
      showMessage('error', response?.error || 'Failed to export');
    }
  } catch (error) {
    showMessage('error', error.message);
  } finally {
    exportCurrentBtn.disabled = false;
  }
}

/**
 * Handle export all conversations
 */
async function handleExportAll() {
  exportCurrentBtn.disabled = true;
  exportAllBtn.disabled = true;
  showProgress(true);

  try {
    const response = await sendToContentScript({ action: 'exportAll' });

    showProgress(false);

    if (response && response.success) {
      const { results } = response;
      showMessage(
        'success',
        `Exported: ${results.exported}, Skipped: ${results.skipped}, Failed: ${results.failed}`
      );
      // Update exported count from storage
      chrome.storage.local.get(['exportedConversations'], (result) => {
        exportedCount.textContent = (result.exportedConversations || []).length;
      });
    } else {
      showMessage('error', response?.error || 'Failed to export');
    }
  } catch (error) {
    showProgress(false);
    showMessage('error', error.message);
  } finally {
    exportCurrentBtn.disabled = false;
    exportAllBtn.disabled = false;
  }
}

/**
 * Handle auto-sync toggle
 */
async function handleAutoSyncToggle() {
  const enabled = autoSyncToggle.checked;

  try {
    if (enabled) {
      await sendToContentScript({ action: 'enableAutoSync' });
      showMessage('success', 'Auto-sync enabled');
    } else {
      await sendToContentScript({ action: 'disableAutoSync' });
      showMessage('info', 'Auto-sync disabled');
    }
  } catch (error) {
    autoSyncToggle.checked = !enabled; // Revert
    showMessage('error', 'Failed to toggle auto-sync');
  }
}

/**
 * Handle clear tracking
 */
async function handleClearTracking() {
  if (!confirm('Clear export tracking? This will allow re-exporting conversations.')) {
    return;
  }

  // Clear directly from storage for reliability
  chrome.storage.local.set({ exportedConversations: [] }, () => {
    exportedCount.textContent = '0';
    showMessage('info', 'Tracking cleared');
  });
}

/**
 * Set status display
 */
function setStatus(type, text) {
  statusDot.className = 'status-dot ' + type;
  statusText.textContent = text;
}

/**
 * Show/hide progress section
 */
function showProgress(show) {
  if (show) {
    progressSection.classList.remove('hidden');
    progressFill.style.width = '0%';
    progressText.textContent = 'Starting...';
  } else {
    progressSection.classList.add('hidden');
  }
}

/**
 * Update progress display
 */
function updateProgress(progress) {
  const percent = Math.round((progress.current / progress.total) * 100);
  progressFill.style.width = percent + '%';

  const statusText = progress.status ? ` (${progress.status})` : '';
  progressText.textContent = `${progress.current}/${progress.total}: ${progress.title}${statusText}`;
}

/**
 * Show message
 */
function showMessage(type, text) {
  messageEl.className = 'message ' + type;
  messageEl.textContent = text;

  // Auto-hide after 5 seconds
  setTimeout(() => {
    if (messageEl.textContent === text) {
      messageEl.textContent = '';
      messageEl.className = 'message';
    }
  }, 5000);
}
