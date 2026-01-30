# ChatGPT Exporter

A Chrome extension to export your ChatGPT conversations to Markdown files for backup, archiving, or local reference.

## Features

- **Export Current Conversation** - Save the conversation you're viewing as a Markdown file
- **Batch Export All** - Export all conversations visible in your sidebar at once
- **Duplicate Prevention** - Tracks exported conversations to avoid downloading the same conversation multiple times
- **Auto-Scroll Sidebar** - Automatically scrolls the ChatGPT sidebar to load all your conversations before batch export (ChatGPT lazy-loads conversations as you scroll)
- **Clean Markdown Output** - Exports include conversation title, export date, and properly formatted messages

## Installation

1. Clone or download this repository
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" (toggle in the top right)
4. Click "Load unpacked" and select the `chatgpt-exporter` folder
5. The extension icon will appear in your toolbar

## Usage

1. Navigate to [chatgpt.com](https://chatgpt.com)
2. Click the ChatGPT Exporter extension icon
3. Choose an action:
   - **Export Current** - Exports the conversation you're currently viewing
   - **Export All** - Exports all conversations from your sidebar

### Tips

- **Loading all conversations**: The extension will automatically scroll your sidebar to load older conversations before batch export. This may take a moment if you have many conversations.
- **Tracking**: The extension tracks which conversations you've exported to prevent duplicates. Use "Clear tracking" if you want to re-export everything.
- **File location**: Exports are saved to your default downloads folder in a `chatgpt-exports` subdirectory.

## File Format

Exported files are saved as Markdown (`.md`) with the following structure:

```markdown
# Conversation Title

*Exported on January 30, 2026*

---

## User

Your message here...

---

## Assistant

ChatGPT's response here...
```

## Permissions

The extension requires:
- `activeTab` - To interact with the ChatGPT page
- `storage` - To track exported conversations and settings
- `downloads` - To save exported files
- Host permission for `chatgpt.com` - To access conversation data

## License

MIT License

Copyright (c) 2026

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## Disclaimer

This project is provided "as is" without warranty of any kind. Use at your own risk.

- This extension is not affiliated with, endorsed by, or sponsored by OpenAI
- ChatGPT's interface may change at any time, which could break this extension
- Always keep your own backups of important conversations
- The developers are not responsible for any data loss or other issues arising from use of this extension