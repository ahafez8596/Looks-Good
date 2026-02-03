# Looks Good 👀

A VS Code extension for live HTML preview with visual editing capabilities.

![VS Code Version](https://img.shields.io/badge/VS%20Code-1.85+-blue.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)

⚠️ NOTICE: This extension is under active development! 

## ✨ Features

- **🖼️ Visual Editing**: Edit HTML elements visually within the WebView
- **⏱️ Real-Time Preview**: See changes reflected instantly as you edit
- **🧩 VS Code Integration**: Seamlessly integrated with VS Code themes
- **🖱️ Element Selection**: Click elements in preview, cursor jumps to code
- **↔️ Bidirectional Sync**: Code selections highlight elements in preview
- **✂️ Copy/Cut/Paste**: Full clipboard support for elements
- **🔍 Zoom Controls**: Zoom in/out with keyboard shortcuts or toolbar
- **↕️ Drag & Drop**: Rearrange elements by dragging
- **🎨 CSS Panel**: Edit styles directly with live preview

## 📦 Installation

### From VSIX

Install the extension from [HERE](https://marketplace.visualstudio.com/items?itemName=Abdelaziz-Hafez.looks-good).

### From Source

1. Clone or download this repository
2. Open the folder in VS Code
3. Run `npm install` to install dependencies
4. Press `F5` to launch the Extension Development Host
5. Open any HTML file and press `Ctrl+Shift+V` to open preview



## 🚀 Usage

### Open Preview

- **Keyboard**: `Ctrl+Shift+V` (Windows/Linux) or `Cmd+Shift+V` (Mac)
- **Command Palette**: "Looks Good: Open Preview to the Side"
- **Editor Title Button**: Click the preview icon in the top-right

### Interact with Elements

- **Select**: Click any element in the preview
- **Edit CSS**: Use the right-side CSS panel to modify styles
- **Copy**: `Ctrl+C` to copy selected element
- **Cut**: `Ctrl+X` to cut selected element
- **Paste**: `Ctrl+V` to paste after selected element
- **Drag**: Drag elements to reorder them

### Zoom Controls

- **Zoom In**: `Ctrl+=` or toolbar button
- **Zoom Out**: `Ctrl+-` or toolbar button
- **Reset**: `Ctrl+0` or toolbar button

## ⚙️ Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| `looksGood.autoRefresh` | `true` | Refresh preview as you type |
| `looksGood.refreshDelay` | `100` | Debounce delay in ms |
| `looksGood.defaultZoom` | `100` | Default zoom level (%) |
| `looksGood.syncScroll` | `true` | Sync scrolling between editor and preview |
| `looksGood.showCssPanel` | `true` | Show the CSS property panel |


## 📝 License

MIT License - see [LICENSE](LICENSE) for details.

## 🙏 Acknowledgments

Inspired by:
- [vscode-livepreview](https://github.com/microsoft/vscode-livepreview)
- [vscode-web-visual-editor](https://github.com/urin/vscode-web-visual-editor)
