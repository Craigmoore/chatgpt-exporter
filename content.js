/**
 * Content script for ChatGPT Conversation Exporter
 * Injected into chatgpt.com pages
 */

(function() {
  'use strict';

  // State management
  let autoSyncEnabled = false;
  let observer = null;
  let lastMessageCount = 0;
  let exportedConversations = new Set();

  /**
   * DOM Selectors for ChatGPT's interface
   * These may need updates if ChatGPT changes their DOM structure
   */
  const SELECTORS = {
    // Conversation content
    conversationContainer: 'main [class*="react-scroll-to-bottom"]',
    messageGroup: '[data-message-author-role]',
    userMessage: '[data-message-author-role="user"]',
    assistantMessage: '[data-message-author-role="assistant"]',
    messageContent: '.markdown, .whitespace-pre-wrap',

    // Sidebar
    sidebar: 'nav',
    conversationLink: 'nav a[href^="/c/"]',
    conversationTitle: 'nav a[href^="/c/"] > div',

    // Header/title
    pageTitle: 'h1',
    headerTitle: 'header h1, [class*="text-lg"]',
  };

  /**
   * Extract the current conversation from the page
   * @returns {Object|null} - Conversation object or null if extraction failed
   */
  function extractCurrentConversation() {
    const messages = [];

    // Find all message groups
    const messageGroups = document.querySelectorAll(SELECTORS.messageGroup);

    if (messageGroups.length === 0) {
      console.log('[ChatGPT Exporter] No messages found');
      return null;
    }

    messageGroups.forEach((group) => {
      const role = group.getAttribute('data-message-author-role');
      if (!role || (role !== 'user' && role !== 'assistant')) return;

      // Find the message content within this group
      const contentElement = group.querySelector(SELECTORS.messageContent);
      if (!contentElement) return;

      // Convert to markdown
      const markdownContent = MarkdownConverter.htmlToMarkdown(contentElement);

      if (markdownContent.trim()) {
        messages.push({
          role: role,
          content: markdownContent
        });
      }
    });

    if (messages.length === 0) {
      console.log('[ChatGPT Exporter] No message content extracted');
      return null;
    }

    // Get conversation title
    const title = getConversationTitle();

    // Get conversation ID from URL
    const conversationId = getConversationIdFromUrl();

    return {
      id: conversationId,
      title: title,
      date: new Date().toISOString().split('T')[0],
      url: window.location.href,
      messages: messages
    };
  }

  /**
   * Get the conversation title from the page
   * @returns {string} - Conversation title
   */
  function getConversationTitle() {
    // Patterns to filter out (model versions, generic titles)
    const invalidTitlePatterns = [
      /^ChatGPT$/i,
      /^New chat$/i,
      /^GPT-?\d/i,        // GPT-4, GPT4, etc.
      /^\d+\.?\d*$/,      // Just numbers like "4.5", "5.2"
      /^o\d+/i,           // o1, o3, etc.
      /^claude/i,         // Claude models
      /^model$/i,
    ];

    function isValidTitle(title) {
      if (!title || title.length < 2) return false;
      return !invalidTitlePatterns.some(pattern => pattern.test(title));
    }

    // Priority 1: Find the active/selected conversation in sidebar
    // This is the most reliable source for the conversation title
    const sidebarSelectors = [
      'nav a[href^="/c/"].bg-token-sidebar-surface-secondary',
      'nav a[href^="/c/"][class*="bg-"]',
      'nav li[class*="bg-"] a[href^="/c/"]',
    ];

    for (const selector of sidebarSelectors) {
      const activeLink = document.querySelector(selector);
      if (activeLink) {
        // Get the current conversation ID from URL
        const currentId = getConversationIdFromUrl();
        const linkHref = activeLink.getAttribute('href');

        // Verify this link matches the current conversation
        if (currentId && linkHref && linkHref.includes(currentId)) {
          const title = activeLink.textContent.trim();
          if (isValidTitle(title)) {
            return title;
          }
        }
      }
    }

    // Priority 2: Find the conversation link that matches current URL
    const currentId = getConversationIdFromUrl();
    if (currentId) {
      const matchingLink = document.querySelector(`nav a[href="/c/${currentId}"]`);
      if (matchingLink) {
        const title = matchingLink.textContent.trim();
        if (isValidTitle(title)) {
          return title;
        }
      }
    }

    // Priority 3: Look for title in the main content area header
    const headerSelectors = [
      '[data-testid="conversation-title"]',
      'main h1',
      'header h1',
    ];

    for (const selector of headerSelectors) {
      const element = document.querySelector(selector);
      if (element) {
        const title = element.textContent.trim();
        if (isValidTitle(title)) {
          return title;
        }
      }
    }

    // Priority 4: Use the first user message as title (truncated)
    const firstUserMessage = document.querySelector('[data-message-author-role="user"]');
    if (firstUserMessage) {
      const content = firstUserMessage.textContent.trim();
      if (content) {
        // Use first 50 chars of first message as title
        const title = content.substring(0, 50).replace(/\n/g, ' ');
        return title + (content.length > 50 ? '...' : '');
      }
    }

    return 'Untitled Conversation';
  }

  /**
   * Extract conversation ID from the current URL
   * @returns {string|null} - Conversation ID
   */
  function getConversationIdFromUrl() {
    const match = window.location.pathname.match(/\/c\/([a-f0-9-]+)/);
    return match ? match[1] : null;
  }

  /**
   * Get all conversation links from the sidebar
   * @returns {Array} - Array of conversation info objects
   */
  function getAllConversationLinks() {
    const links = document.querySelectorAll(SELECTORS.conversationLink);
    const conversations = [];

    links.forEach((link) => {
      const href = link.getAttribute('href');
      const title = link.textContent.trim() || 'Untitled';
      const id = href.replace('/c/', '');

      conversations.push({
        id: id,
        title: title,
        href: href,
        url: `https://chatgpt.com${href}`
      });
    });

    return conversations;
  }

  /**
   * Scroll the sidebar to load all conversations
   * ChatGPT lazy-loads conversations as you scroll
   * @returns {Promise<number>} - Total number of conversations found
   */
  async function loadAllSidebarConversations() {
    // Find the scrollable sidebar container
    const sidebar = document.querySelector('nav');
    if (!sidebar) {
      console.log('[ChatGPT Exporter] Sidebar not found');
      return 0;
    }

    // Find the scrollable element within the sidebar
    const scrollContainer = sidebar.querySelector('[class*="overflow-y-auto"]') ||
                           sidebar.querySelector('[style*="overflow"]') ||
                           sidebar;

    if (!scrollContainer) {
      console.log('[ChatGPT Exporter] Scroll container not found');
      return getAllConversationLinks().length;
    }

    let lastCount = 0;
    let currentCount = getAllConversationLinks().length;
    let noChangeCount = 0;
    const maxScrollAttempts = 50; // Safety limit
    let attempts = 0;

    console.log(`[ChatGPT Exporter] Starting sidebar scroll. Initial conversations: ${currentCount}`);

    while (attempts < maxScrollAttempts) {
      // Scroll down
      scrollContainer.scrollTop = scrollContainer.scrollHeight;

      // Wait for new items to load
      await sleep(800);

      lastCount = currentCount;
      currentCount = getAllConversationLinks().length;

      console.log(`[ChatGPT Exporter] Scroll attempt ${attempts + 1}: ${currentCount} conversations`);

      // Check if we've loaded new conversations
      if (currentCount === lastCount) {
        noChangeCount++;
        // If no new items after 3 attempts, we've probably reached the end
        if (noChangeCount >= 3) {
          console.log('[ChatGPT Exporter] Reached end of sidebar');
          break;
        }
      } else {
        noChangeCount = 0;
      }

      attempts++;
    }

    // Scroll back to top
    scrollContainer.scrollTop = 0;

    console.log(`[ChatGPT Exporter] Finished loading. Total conversations: ${currentCount}`);
    return currentCount;
  }

  /**
   * Export the current conversation
   */
  async function exportCurrentConversation() {
    const conversation = extractCurrentConversation();

    if (!conversation) {
      return { success: false, error: 'Could not extract conversation' };
    }

    const markdown = MarkdownConverter.formatConversation(conversation);
    const filename = MarkdownConverter.sanitizeFilename(conversation.title) + '.md';

    try {
      // Send to background script for download
      const response = await new Promise((resolve) => {
        chrome.runtime.sendMessage({
          action: 'download',
          filename: filename,
          content: markdown,
          conversationId: conversation.id
        }, (response) => {
          resolve(response || { success: true });
        });
      });

      // Mark as exported in storage (redundant but ensures persistence)
      if (response.success && conversation.id) {
        await markAsExported(conversation.id);
      }

      return response;
    } catch (error) {
      console.error('[ChatGPT Exporter] Export error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Wait for conversation to load after navigation
   * @param {string} expectedId - The conversation ID we expect to see
   * @param {number} timeout - Max time to wait in ms
   * @returns {Promise<boolean>} - True if loaded successfully
   */
  async function waitForConversationLoad(expectedId, timeout = 10000) {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      const currentId = getConversationIdFromUrl();
      const messages = document.querySelectorAll(SELECTORS.messageGroup);

      // Check if we're on the right conversation and it has messages
      if (currentId === expectedId && messages.length > 0) {
        // Wait a bit more for content to render
        await sleep(500);
        return true;
      }

      await sleep(200);
    }

    return false;
  }

  /**
   * Batch export all conversations from the sidebar
   * @param {Function} progressCallback - Called with progress updates
   */
  async function exportAllConversations(progressCallback) {
    // First, scroll sidebar to load all conversations
    if (progressCallback) {
      progressCallback({
        current: 0,
        total: 0,
        title: 'Loading all conversations...',
        status: 'scrolling sidebar'
      });
    }

    await loadAllSidebarConversations();

    const links = getAllConversationLinks();

    if (links.length === 0) {
      return { success: false, error: 'No conversations found in sidebar' };
    }

    const results = {
      total: links.length,
      exported: 0,
      skipped: 0,
      failed: 0,
      errors: []
    };

    // Get already exported conversations (fresh from storage)
    let exportedSet = await getExportedConversations();
    console.log(`[ChatGPT Exporter] Already exported: ${exportedSet.size} conversations`);

    for (let i = 0; i < links.length; i++) {
      const link = links[i];

      if (progressCallback) {
        progressCallback({
          current: i + 1,
          total: links.length,
          title: link.title,
          status: 'checking'
        });
      }

      // Check if already exported
      if (exportedSet.has(link.id)) {
        console.log(`[ChatGPT Exporter] Skipping already exported: ${link.title}`);
        results.skipped++;
        continue;
      }

      try {
        if (progressCallback) {
          progressCallback({
            current: i + 1,
            total: links.length,
            title: link.title,
            status: 'loading'
          });
        }

        // Navigate to the conversation
        const linkElement = document.querySelector(`a[href="${link.href}"]`);
        if (!linkElement) {
          results.failed++;
          results.errors.push(`Link not found: ${link.title}`);
          continue;
        }

        linkElement.click();

        // Wait for conversation to load with timeout
        const loaded = await waitForConversationLoad(link.id, 10000);

        if (!loaded) {
          console.warn(`[ChatGPT Exporter] Timeout loading: ${link.title}`);
          results.failed++;
          results.errors.push(`Timeout loading: ${link.title}`);
          continue;
        }

        if (progressCallback) {
          progressCallback({
            current: i + 1,
            total: links.length,
            title: link.title,
            status: 'exporting'
          });
        }

        // Extract and export
        const conversation = extractCurrentConversation();
        if (!conversation) {
          results.failed++;
          results.errors.push(`Failed to extract: ${link.title}`);
          continue;
        }

        const markdown = MarkdownConverter.formatConversation(conversation);
        const filename = MarkdownConverter.sanitizeFilename(conversation.title) + '.md';

        await new Promise((resolve, reject) => {
          chrome.runtime.sendMessage({
            action: 'download',
            filename: filename,
            content: markdown,
            conversationId: link.id
          }, (response) => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
            } else {
              resolve(response);
            }
          });
        });

        // Mark as exported immediately after successful download
        await markAsExported(link.id);
        exportedSet.add(link.id); // Update local set too

        results.exported++;
        console.log(`[ChatGPT Exporter] Exported: ${link.title}`);

      } catch (error) {
        console.error(`[ChatGPT Exporter] Error exporting ${link.title}:`, error);
        results.failed++;
        results.errors.push(`Error: ${link.title} - ${error.message}`);
      }

      // Add delay between exports to avoid rate limiting
      await sleep(1500);
    }

    return { success: true, results };
  }

  /**
   * Get set of already exported conversation IDs
   * Uses chrome.storage.local directly for reliability
   * @returns {Promise<Set>} - Set of conversation IDs
   */
  async function getExportedConversations() {
    return new Promise((resolve) => {
      chrome.storage.local.get(['exportedConversations'], (result) => {
        resolve(new Set(result.exportedConversations || []));
      });
    });
  }

  /**
   * Mark a conversation as exported in storage
   * @param {string} conversationId - The conversation ID to mark
   */
  async function markAsExported(conversationId) {
    if (!conversationId) return;

    const exported = await getExportedConversations();
    exported.add(conversationId);

    return new Promise((resolve) => {
      chrome.storage.local.set({
        exportedConversations: Array.from(exported)
      }, resolve);
    });
  }

  /**
   * Set up MutationObserver for auto-sync
   */
  function setupAutoSync() {
    if (observer) {
      observer.disconnect();
    }

    const container = document.querySelector(SELECTORS.conversationContainer);
    if (!container) {
      console.log('[ChatGPT Exporter] Could not find conversation container for auto-sync');
      return;
    }

    lastMessageCount = document.querySelectorAll(SELECTORS.messageGroup).length;

    observer = new MutationObserver((mutations) => {
      if (!autoSyncEnabled) return;

      const currentCount = document.querySelectorAll(SELECTORS.messageGroup).length;

      // Check if new messages were added
      if (currentCount > lastMessageCount) {
        console.log('[ChatGPT Exporter] New message detected, auto-syncing...');
        lastMessageCount = currentCount;

        // Debounce the export to wait for message to finish rendering
        clearTimeout(window.autoSyncTimeout);
        window.autoSyncTimeout = setTimeout(() => {
          exportCurrentConversation().then((result) => {
            console.log('[ChatGPT Exporter] Auto-sync complete:', result);
          });
        }, 2000);
      }
    });

    observer.observe(container, {
      childList: true,
      subtree: true
    });

    console.log('[ChatGPT Exporter] Auto-sync observer started');
  }

  /**
   * Enable auto-sync
   */
  function enableAutoSync() {
    autoSyncEnabled = true;
    setupAutoSync();
    chrome.runtime.sendMessage({ action: 'setAutoSync', enabled: true });
  }

  /**
   * Disable auto-sync
   */
  function disableAutoSync() {
    autoSyncEnabled = false;
    if (observer) {
      observer.disconnect();
      observer = null;
    }
    chrome.runtime.sendMessage({ action: 'setAutoSync', enabled: false });
  }

  /**
   * Utility: Sleep for specified milliseconds
   * @param {number} ms - Milliseconds to sleep
   */
  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Listen for messages from popup/background
   */
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    switch (request.action) {
      case 'exportCurrent':
        exportCurrentConversation().then(sendResponse);
        return true; // Async response

      case 'exportAll':
        exportAllConversations((progress) => {
          chrome.runtime.sendMessage({
            action: 'exportProgress',
            progress: progress
          });
        }).then(sendResponse);
        return true; // Async response

      case 'getConversationList':
        sendResponse({ conversations: getAllConversationLinks() });
        break;

      case 'loadAllConversations':
        loadAllSidebarConversations().then((count) => {
          sendResponse({ success: true, count: count });
        });
        return true; // Async response

      case 'enableAutoSync':
        enableAutoSync();
        sendResponse({ success: true });
        break;

      case 'disableAutoSync':
        disableAutoSync();
        sendResponse({ success: true });
        break;

      case 'getStatus':
        sendResponse({
          autoSyncEnabled: autoSyncEnabled,
          conversationId: getConversationIdFromUrl(),
          messageCount: document.querySelectorAll(SELECTORS.messageGroup).length
        });
        break;
    }
  });

  /**
   * Initialize on page load
   */
  async function initialize() {
    console.log('[ChatGPT Exporter] Content script loaded');

    // Check if auto-sync should be enabled
    chrome.runtime.sendMessage({ action: 'getAutoSync' }, (response) => {
      if (response?.enabled) {
        autoSyncEnabled = true;
        // Wait for page to fully load before setting up observer
        setTimeout(setupAutoSync, 2000);
      }
    });
  }

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
  } else {
    initialize();
  }

  // Re-initialize when URL changes (for SPA navigation)
  let lastUrl = window.location.href;
  new MutationObserver(() => {
    if (window.location.href !== lastUrl) {
      lastUrl = window.location.href;
      console.log('[ChatGPT Exporter] URL changed, re-initializing...');
      setTimeout(() => {
        if (autoSyncEnabled) {
          setupAutoSync();
        }
      }, 1000);
    }
  }).observe(document.body, { childList: true, subtree: true });

})();
