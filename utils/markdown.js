/**
 * Markdown conversion utilities for ChatGPT conversations
 */

const MarkdownConverter = {
  /**
   * Convert HTML content to Markdown
   * @param {Element} element - DOM element containing the message content
   * @returns {string} - Markdown formatted string
   */
  htmlToMarkdown(element) {
    if (!element) return '';

    // Clone the element to avoid modifying the original
    const clone = element.cloneNode(true);

    return this.processNode(clone).trim();
  },

  /**
   * Recursively process DOM nodes and convert to Markdown
   * @param {Node} node - DOM node to process
   * @returns {string} - Markdown string
   */
  processNode(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      return node.textContent;
    }

    if (node.nodeType !== Node.ELEMENT_NODE) {
      return '';
    }

    const tagName = node.tagName.toLowerCase();
    const children = Array.from(node.childNodes)
      .map(child => this.processNode(child))
      .join('');

    switch (tagName) {
      // Headings
      case 'h1':
        return `# ${children}\n\n`;
      case 'h2':
        return `## ${children}\n\n`;
      case 'h3':
        return `### ${children}\n\n`;
      case 'h4':
        return `#### ${children}\n\n`;
      case 'h5':
        return `##### ${children}\n\n`;
      case 'h6':
        return `###### ${children}\n\n`;

      // Text formatting
      case 'strong':
      case 'b':
        return `**${children}**`;
      case 'em':
      case 'i':
        return `*${children}*`;
      case 'u':
        return `<u>${children}</u>`;
      case 's':
      case 'strike':
      case 'del':
        return `~~${children}~~`;

      // Code
      case 'code':
        // Check if it's inside a pre (code block) or inline
        if (node.parentElement && node.parentElement.tagName.toLowerCase() === 'pre') {
          return children;
        }
        return `\`${children}\``;

      case 'pre':
        const codeElement = node.querySelector('code');
        const language = this.detectLanguage(node);
        const codeContent = codeElement ? codeElement.textContent : node.textContent;
        return `\n\`\`\`${language}\n${codeContent}\n\`\`\`\n\n`;

      // Lists
      case 'ul':
        return this.processList(node, false) + '\n';
      case 'ol':
        return this.processList(node, true) + '\n';
      case 'li':
        return children;

      // Links and images
      case 'a':
        const href = node.getAttribute('href') || '';
        return `[${children}](${href})`;
      case 'img':
        const src = node.getAttribute('src') || '';
        const alt = node.getAttribute('alt') || 'image';
        return `![${alt}](${src})`;

      // Block elements
      case 'p':
        return `${children}\n\n`;
      case 'br':
        return '\n';
      case 'hr':
        return '\n---\n\n';
      case 'blockquote':
        return children.split('\n')
          .map(line => `> ${line}`)
          .join('\n') + '\n\n';

      // Tables
      case 'table':
        return this.processTable(node) + '\n\n';

      // Divs and spans - just return children
      case 'div':
      case 'span':
      case 'section':
      case 'article':
        return children;

      default:
        return children;
    }
  },

  /**
   * Process list elements
   * @param {Element} listElement - ul or ol element
   * @param {boolean} ordered - whether it's an ordered list
   * @returns {string} - Markdown list
   */
  processList(listElement, ordered) {
    const items = Array.from(listElement.children).filter(
      child => child.tagName.toLowerCase() === 'li'
    );

    return items.map((item, index) => {
      const prefix = ordered ? `${index + 1}. ` : '- ';
      const content = this.processNode(item).trim();
      return prefix + content;
    }).join('\n');
  },

  /**
   * Process table elements
   * @param {Element} tableElement - table element
   * @returns {string} - Markdown table
   */
  processTable(tableElement) {
    const rows = Array.from(tableElement.querySelectorAll('tr'));
    if (rows.length === 0) return '';

    const result = [];

    rows.forEach((row, rowIndex) => {
      const cells = Array.from(row.querySelectorAll('th, td'));
      const cellContents = cells.map(cell => this.processNode(cell).trim().replace(/\|/g, '\\|'));
      result.push('| ' + cellContents.join(' | ') + ' |');

      // Add separator after header row
      if (rowIndex === 0) {
        result.push('| ' + cells.map(() => '---').join(' | ') + ' |');
      }
    });

    return result.join('\n');
  },

  /**
   * Detect programming language from code block
   * @param {Element} preElement - pre element containing code
   * @returns {string} - language identifier
   */
  detectLanguage(preElement) {
    // Check for language class on code element
    const codeElement = preElement.querySelector('code');
    if (codeElement) {
      const classes = Array.from(codeElement.classList);
      for (const cls of classes) {
        if (cls.startsWith('language-')) {
          return cls.replace('language-', '');
        }
        if (cls.startsWith('lang-')) {
          return cls.replace('lang-', '');
        }
      }
    }

    // Check for language indicator in ChatGPT's UI
    const langIndicator = preElement.closest('.bg-black')?.querySelector('.text-xs');
    if (langIndicator) {
      return langIndicator.textContent.trim().toLowerCase();
    }

    // Check parent elements for language hints
    const parent = preElement.closest('[class*="language-"]');
    if (parent) {
      const match = parent.className.match(/language-(\w+)/);
      if (match) return match[1];
    }

    return '';
  },

  /**
   * Format a complete conversation as Markdown
   * @param {Object} conversation - Conversation object
   * @returns {string} - Complete Markdown document
   */
  formatConversation(conversation) {
    const lines = [];

    // Title
    lines.push(`# ${conversation.title || 'Untitled Conversation'}`);
    lines.push('');

    // Metadata
    if (conversation.date) {
      lines.push(`**Date**: ${conversation.date}`);
    }
    if (conversation.url) {
      lines.push(`**URL**: ${conversation.url}`);
    }
    lines.push('');
    lines.push('---');
    lines.push('');

    // Messages
    for (const message of conversation.messages) {
      const role = message.role === 'user' ? 'User' : 'Assistant';
      lines.push(`## ${role}`);
      lines.push('');
      lines.push(message.content);
      lines.push('');
      lines.push('---');
      lines.push('');
    }

    return lines.join('\n').trim() + '\n';
  },

  /**
   * Sanitize a string for use as a filename
   * @param {string} title - Original title
   * @returns {string} - Safe filename
   */
  sanitizeFilename(title) {
    if (!title) return 'untitled';

    return title
      .replace(/[<>:"/\\|?*]/g, '') // Remove invalid characters
      .replace(/\s+/g, '_')          // Replace spaces with underscores
      .replace(/_+/g, '_')           // Collapse multiple underscores
      .replace(/^_|_$/g, '')         // Trim underscores
      .substring(0, 100)             // Limit length
      || 'untitled';
  }
};

// Make available globally for content script
if (typeof window !== 'undefined') {
  window.MarkdownConverter = MarkdownConverter;
}
