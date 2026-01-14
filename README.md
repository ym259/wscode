# WSCode

A VS Code-inspired IDE for document writing, built with Next.js. Edit Word documents (`.docx`) and Excel spreadsheets (`.xlsx`) directly in the browser with AI assistance for drafting, editing, and reviewing content.

## Features

### IDE Experience
- � **File Explorer** — Browse and manage files with native File System Access API
- 📑 **Tabbed Editing** — Work with multiple documents simultaneously
- 💾 **Session Persistence** — Open tabs and workspace state persist across sessions
- 🎨 **Activity Bar** — Quick access to explorer, AI assistant, and more

### Document Editing
- � **DOCX Editor** — Full-featured Word document editing with custom TipTap-based editor
- 📊 **XLSX Editor** — Excel spreadsheet editing powered by FortuneSheet
- 🔄 **Track Changes** — Built-in track changes with accept/reject capabilities
- 💬 **Comments** — Add, view, and manage document comments
- 📏 **Pagination** — Page-break aware editing with visual pagination
- 🎨 **Rich Formatting** — Full toolbar with fonts, colors, alignment, and styles

### AI Assistant
- 🤖 **AI-Powered Editing** — Draft, edit, and review documents with OpenAI
- ⌨️ **@ Mentions** — Reference files in AI conversations with `@filename`
- 🔧 **Tool Calling** — AI can directly edit documents, search content, and more

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn

### Installation

```bash
git clone https://github.com/ym259/wscode.git
cd editor
npm install
```

### Configuration

Create a `.env` file based on `.env.example`:

```bash
cp .env.example .env
```

Add your OpenAI API key:

```env
OPENAI_API_KEY=your-api-key-here
```

### Development

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Build

```bash
npm run build
npm start
```

## Technology Stack

- **Framework**: [Next.js](https://nextjs.org) 16 (App Router)
- **Document Editor**: Custom TipTap-based editor with pagination
- **Spreadsheet**: [FortuneSheet](https://github.com/ruilisi/fortune-sheet)
- **DOCX Processing**: Mammoth, JSZip, docx.js
- **AI**: OpenAI Responses API with tool calling
- **Styling**: CSS Modules
- **Icons**: [Lucide React](https://lucide.dev)

## Docs

- **DOCX → Editor Mapping Spec**: `docs/docx_custom_editor_mapping.md`

## Project Structure

```
src/
├── app/              # Next.js app router
├── components/
│   ├── agent/        # AI assistant panel
│   ├── editor/       # Document editors
│   │   ├── custom-doc-editor/  # TipTap-based DOCX editor
│   │   ├── hooks/    # Editor hooks (track changes, comments, etc.)
│   │   └── toolbar/  # Formatting toolbar
│   ├── explorer/     # File explorer sidebar
│   └── layout/       # IDE chrome (activity bar, status bar)
├── contexts/         # React contexts
├── hooks/            # Shared hooks
├── services/         # Business logic
├── lib/              # Utilities
├── tools/            # AI tool definitions
└── types/            # TypeScript types
```

## License

MIT — see [LICENSE](./LICENSE)
