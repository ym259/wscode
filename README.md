# SuperDoc Editor

An AI-powered document editor built with Next.js and [SuperDoc](https://github.com/harbour-enterprises/superdoc). Edit Word documents (`.docx`) directly in the browser with AI assistance for drafting, editing, and reviewing content.

## Features

- 📄 **Native DOCX Editing** — Open and edit Word documents in the browser
- 🤖 **AI Assistant** — Draft, edit, and review documents with AI help
- 📁 **File Explorer** — Browse and manage files with native File System Access API
- 🔄 **Track Changes** — Built-in track changes support via SuperDoc
- 💾 **Auto-Persistence** — Open tabs persist across browser sessions
- ⌨️ **@ Mentions** — Reference files in AI conversations with `@filename`

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn

### Installation

```bash
git clone <repo-url>
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
- **Editor**: [SuperDoc](https://github.com/harbour-enterprises/superdoc) (TipTap-based)
- **AI**: OpenAI Responses API with tool calling
- **Styling**: CSS Modules
- **Icons**: [Lucide React](https://lucide.dev)

## Project Structure

```
src/
├── app/              # Next.js app router
├── components/       # React components
│   ├── agent/        # AI assistant panel
│   ├── editor/       # Document editor
│   ├── explorer/     # File explorer
│   └── layout/       # UI chrome (activity bar, status bar)
├── contexts/         # React contexts
├── hooks/            # Shared hooks
├── services/         # Business logic
├── lib/              # Utilities
├── tools/            # AI tool definitions
└── types/            # TypeScript types
```

## License

MIT — see [LICENSE](./LICENSE)
