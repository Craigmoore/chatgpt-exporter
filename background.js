/**
 * Service Worker for ChatGPT Conversation Exporter
 * Handles downloads, storage, and coordination
 */

// Track exported conversations
let exportedConversations = new Set();

// Auto-sync state
let autoSyncEnabled = false;

/**
 * Initialize service worker
 */
async function initialize() {
  console.log('[ChatGPT Exporter] Service worker starting...');

  // Load exported conversations from storage
  const stored = await chrome.storage.local.get(['exportedConversations', 'autoSync']);

  if (stored.exportedConversations) {
    exportedConversations = new Set(stored.exportedConversations);
  }

  if (stored.autoSync !== undefined) {
    autoSyncEnabled = stored.autoSync;
  }

  console.log('[ChatGPT Exporter] Service worker initialized');
}

/**
 * Save exported conversations to storage
 */
async function saveExportedConversations() {
  await chrome.storage.local.set({
    exportedConversations: Array.from(exportedConversations)
  });
}

/**
 * Download content as a file
 * @param {string} filename - Name of the file
 * @param {string} content - File content
 * @param {string} conversationId - Conversation ID to track
 */
async function downloadFile(filename, content, conversationId) {
  try {
    // Use data URL instead of blob URL (blob URLs not available in service workers)
    const base64Content = btoa(unescape(encodeURIComponent(content)));
    const dataUrl = `data:text/markdown;base64,${base64Content}`;

    // Trigger download
    const downloadId = await chrome.downloads.download({
      url: dataUrl,
      filename: `chatgpt-exports/${filename}`,
      saveAs: false
    });

    // Track the conversation as exported
    if (conversationId) {
      exportedConversations.add(conversationId);
      await saveExportedConversations();
    }

    return { success: true, downloadId };
  } catch (error) {
    console.error('[ChatGPT Exporter] Download error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Clear exported conversations tracking
 */
async function clearExportedTracking() {
  exportedConversations.clear();
  await chrome.storage.local.remove('exportedConversations');
  return { success: true };
}

/**
 * Handle messages from content script and popup
 */
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  switch (request.action) {
    case 'download':
      downloadFile(request.filename, request.content, request.conversationId)
        .then(sendResponse);
      return true; // Async response

    case 'getExported':
      sendResponse({ exported: Array.from(exportedConversations) });
      break;

    case 'clearExported':
      clearExportedTracking().then(sendResponse);
      return true;

    case 'setAutoSync':
      autoSyncEnabled = request.enabled;
      chrome.storage.local.set({ autoSync: autoSyncEnabled });
      sendResponse({ success: true });
      break;

    case 'getAutoSync':
      sendResponse({ enabled: autoSyncEnabled });
      break;

    case 'exportProgress':
      // Forward progress to popup if it's open
      chrome.runtime.sendMessage(request).catch(() => {
        // Popup might not be open, that's okay
      });
      break;

    default:
      console.log('[ChatGPT Exporter] Unknown action:', request.action);
  }
});

/**
 * Handle extension installation
 */
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    console.log('[ChatGPT Exporter] Extension installed');

    // Initialize default settings
    chrome.storage.local.set({
      autoSync: false,
      exportedConversations: []
    });
  }
});

// Initialize on startup
initialize();
