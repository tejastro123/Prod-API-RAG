# RAG WebApp — Frontend

React + Vite frontend for the Production RAG Agent API.

## Stack
- **React 18** + **TypeScript**
- **Vite 5** (dev server with proxy to backend)
- **Zustand** (chat state, localStorage persistence)
- **TanStack Query** (health/metrics polling)
- **React Router v6**
- **Zod** (API response validation)
- **IBM Plex Sans/Mono** (typography)

## Project Structure
```
src/
├── types/        # Zod schemas + inferred types (shared contract)
├── lib/
│   ├── api.ts    # Fetch helpers + SSE parser
│   └── utils.ts  # nanoid, formatters, cn
├── stores/
│   └── chat.ts   # Zustand store (messages, threads, streaming)
├── components/
│   ├── ChatComponents.tsx   # MessageBubble, ChatInput, MessagesArea
│   └── Sidebar.tsx
├── pages/
│   ├── ChatPage.tsx
│   ├── DashboardPage.tsx
│   └── ThreadsPage.tsx
├── App.tsx        # Router + providers
├── index.css      # Design tokens + global styles
└── app.css        # Layout + component styles
```

## Setup

```bash
cd frontend/rag-webapp
npm install
npm run dev
```

App runs at http://localhost:5173  
API proxied via Vite → https://prod-api-rag.onrender.com

## Environment

Create `.env.local` for custom API URL:
```
VITE_API_URL=https://prod-api-rag.onrender.com
```

Without it, the Vite proxy (`/api` → backend) is used automatically in dev.

## Pages

| Route | Description |
|-------|-------------|
| `/chat` | Main chat interface with streaming |
| `/dashboard` | Live system metrics + health status |
| `/threads` | Thread management |
