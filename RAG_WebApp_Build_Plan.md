# RAG Web App — Production Build Plan v2

> Stack: Next.js 15 · Tailwind v4 · shadcn/ui · Zustand · TanStack Query · Turso · OpenTelemetry · Vercel
> API: `prod-api-rag.onrender.com`

---

## Architectural Principles

Five non-negotiable decisions before first line of code:

1. **BFF first, auth second** — streaming architecture proven before session complexity enters
2. **Shared type contract** — single source of truth for request/response schemas (Zod)
3. **Structured SSE protocol** — typed event stream, not raw text chunks
4. **Persistence is foundational** — Turso/libSQL from Week 1, not Phase 3
5. **OpenTelemetry from day one** — traces across frontend + BFF + backend calls

---

## Monorepo Structure

```
rag-webapp/
├── apps/
│   └── web/                    # Next.js 15
│       ├── app/
│       │   ├── (marketing)/    # landing, pricing (no auth needed)
│       │   ├── (app)/
│       │   │   ├── chat/       # main interface
│       │   │   ├── threads/    # conversation history
│       │   │   ├── dashboard/  # live metrics + health
│       │   │   ├── replay/     # request audit log
│       │   │   └── settings/
│       │   └── api/
│       │       ├── chat/       # BFF → /chat (streaming)
│       │       ├── metrics/    # BFF → /metrics (SSE)
│       │       ├── health/     # BFF → /health
│       │       └── threads/    # CRUD → Turso
│       ├── components/
│       │   ├── chat/
│       │   ├── graph/          # LangGraph visualizer
│       │   ├── dashboard/
│       │   └── ui/
│       ├── lib/
│       │   ├── api.ts          # typed API client
│       │   ├── streaming.ts    # SSE event parser
│       │   ├── otel.ts         # OpenTelemetry config
│       │   └── db.ts           # Turso client
│       └── stores/
│           ├── chat.ts
│           └── ui.ts
└── packages/
    └── shared-types/           # ← single contract, used by both sides
        ├── src/
        │   ├── chat.ts
        │   ├── metrics.ts
        │   ├── health.ts
        │   ├── streaming.ts
        │   └── index.ts
        └── package.json
```

---

## Package: `shared-types`

Install once, import everywhere. Eliminates contract drift.

```typescript
// packages/shared-types/src/chat.ts
import { z } from "zod"

export const SecurityNoteSchema = z.string()

export const ChatRequestSchema = z.object({
  message: z.string().min(1).max(10000),
  thread_id: z.string().default("default"),
})

export const ChatResponseSchema = z.object({
  response: z.string(),
  thread_id: z.string(),
  model_used: z.string(),
  cached: z.boolean(),
  processing_time_ms: z.number(),
  security_notes: z.array(SecurityNoteSchema).default([]),
  timestamp: z.string(),
})

export const HealthResponseSchema = z.object({
  status: z.enum(["healthy", "degraded"]),
  environment: z.string(),
  version: z.string(),
  checks: z.record(z.boolean()),
})

export const MetricsResponseSchema = z.object({
  total_requests: z.number(),
  total_errors: z.number(),
  error_rate: z.string(),
  avg_latency_ms: z.number(),
  cache_hit_rate: z.string(),
  total_input_tokens: z.number(),
  total_output_tokens: z.number(),
})

// Inferred types — no duplication
export type ChatRequest     = z.infer<typeof ChatRequestSchema>
export type ChatResponse    = z.infer<typeof ChatResponseSchema>
export type HealthResponse  = z.infer<typeof HealthResponseSchema>
export type MetricsResponse = z.infer<typeof MetricsResponseSchema>
```

**Frontend:** `import { ChatResponseSchema } from "@repo/shared-types"` then `parse()` on every API response.
**Future backend migration:** same schemas, same validation.

---

## Structured SSE Protocol

Never stream raw text. Stream typed events.

```typescript
// packages/shared-types/src/streaming.ts

export const StreamEventSchema = z.discriminatedUnion("event", [
  z.object({
    event: z.literal("token"),
    data: z.object({ content: z.string() }),
  }),
  z.object({
    event: z.literal("metadata"),
    data: z.object({
      cached: z.boolean(),
      model_used: z.string(),
      processing_time_ms: z.number(),
    }),
  }),
  z.object({
    event: z.literal("security"),
    data: z.object({
      notes: z.array(z.string()),
    }),
  }),
  z.object({
    event: z.literal("graph_node"),
    data: z.object({
      node: z.string(),                     // "security_check" | "cache_lookup" | "llm_call" etc.
      status: z.enum(["start","done","skip","error"]),
      duration_ms: z.number().optional(),
    }),
  }),
  z.object({
    event: z.literal("done"),
    data: ChatResponseSchema,
  }),
  z.object({
    event: z.literal("error"),
    data: z.object({ message: z.string(), code: z.number() }),
  }),
])

export type StreamEvent = z.infer<typeof StreamEventSchema>
```

Wire format over SSE:

```
event: token
data: {"content":"Paris"}

event: graph_node
data: {"node":"cache_lookup","status":"skip","duration_ms":2}

event: metadata
data: {"cached":false,"model_used":"primary","processing_time_ms":0}

event: done
data: {"response":"...","cached":false,...}
```

**Why this matters for your roadmap:**
- Week 1: render tokens
- Week 3: render metadata badge ("cached · 2ms")
- Week 4: feed `graph_node` events into LangGraph visualizer
- Future: add `citation`, `tool_call`, `reasoning_trace` event types without breaking existing consumers

---

## Phase Plan (Revised)

### Week 1A — BFF + Streaming + Chat UI

Prove the core AI experience. No auth. No database yet.

**Day 1-2: BFF Proxy**

```typescript
// app/api/chat/route.ts
import { ChatRequestSchema } from "@repo/shared-types"

export async function POST(req: Request) {
  const body = ChatRequestSchema.parse(await req.json())

  const upstream = await fetch(
    `${process.env.RENDER_API_URL}/chat`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // API key injected server-side, never in client bundle
        ...(process.env.RENDER_API_KEY && {
          Authorization: `Bearer ${process.env.RENDER_API_KEY}`,
        }),
      },
      body: JSON.stringify(body),
    }
  )

  // Pass stream through — do not buffer
  return new Response(upstream.body, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "X-Accel-Buffering": "no",
    },
  })
}
```

**Day 3-4: SSE Parser**

```typescript
// lib/streaming.ts
import { StreamEventSchema, type StreamEvent } from "@repo/shared-types"

export async function* parseSSE(
  stream: ReadableStream<Uint8Array>
): AsyncGenerator<StreamEvent> {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let buffer = ""

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split("\n\n")
    buffer = lines.pop() ?? ""

    for (const block of lines) {
      const eventLine = block.match(/^event: (.+)$/m)?.[1]
      const dataLine  = block.match(/^data: (.+)$/m)?.[1]
      if (!eventLine || !dataLine) continue

      const parsed = StreamEventSchema.safeParse({
        event: eventLine,
        data: JSON.parse(dataLine),
      })
      if (parsed.success) yield parsed.data
    }
  }
}
```

**Day 5: Chat UI**

Components needed:
- `ChatInput` — textarea, submit on Enter/Shift+Enter, char count
- `MessageBubble` — user / assistant variants, streaming cursor animation
- `StreamingMessage` — consumes `AsyncGenerator<StreamEvent>`, appends tokens, shows metadata on `done`
- `SecurityBadge` — inline amber chip when `security_notes` non-empty
- `ModelBadge` — "cached · 0ms" or "primary · 340ms"

Zustand store (no auth needed):

```typescript
// stores/chat.ts
interface ChatStore {
  threads: Thread[]
  activeThreadId: string
  messages: Record<string, Message[]>
  isStreaming: boolean

  sendMessage: (content: string) => Promise<void>
  createThread: () => void
  setActiveThread: (id: string) => void
}
```

Threads stored in `localStorage` Week 1A. Migrated to Turso in Week 1B.

---

### Week 1B — Auth + Persistence

Auth added AFTER streaming is proven. Server/client boundaries already known.

**Auth: Better Auth**

Why keep it (over Clerk):
- Self-hosted, no per-MAU pricing
- Edge-compatible
- Runs in the BFF you already built
- Full control over schema

```typescript
// lib/auth.ts
import { betterAuth } from "better-auth"
import { LibsqlDialect } from "@libsql/kysely-libsql"

export const auth = betterAuth({
  database: {
    dialect: new LibsqlDialect({ url: process.env.DATABASE_URL! }),
  },
  emailAndPassword: { enabled: true },
  // Add OAuth providers later without restructuring
  socialProviders: {},
})
```

Route protection via Next.js middleware — single file, wraps all `(app)/` routes.

**Persistence: Turso**

Schema:

```sql
CREATE TABLE threads (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL,
  title       TEXT,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);

CREATE TABLE messages (
  id                  TEXT PRIMARY KEY,
  thread_id           TEXT NOT NULL,
  role                TEXT CHECK(role IN ('user','assistant')),
  content             TEXT NOT NULL,
  model_used          TEXT,
  cached              INTEGER,        -- 0/1
  processing_time_ms  REAL,
  security_notes      TEXT,           -- JSON array
  created_at          INTEGER NOT NULL,
  FOREIGN KEY (thread_id) REFERENCES threads(id)
);

CREATE TABLE request_log (               -- replay infrastructure
  id              TEXT PRIMARY KEY,
  thread_id       TEXT,
  user_id         TEXT,
  prompt_raw      TEXT NOT NULL,
  prompt_sanitized TEXT,
  response        TEXT,
  model_used      TEXT,
  cached          INTEGER,
  latency_ms      REAL,
  cache_hit       INTEGER,
  security_notes  TEXT,
  error           TEXT,
  timestamp       INTEGER NOT NULL
);
```

`request_log` built from day one. Every request is replayable immediately.

---

### Week 2 — Live Observability Dashboard

**Push, not polling.** Build a streaming metrics endpoint.

```typescript
// app/api/metrics/stream/route.ts
export async function GET() {
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
        )
      }

      // Initial snapshot
      const metrics = await fetchFromRender("/metrics")
      send("metrics", metrics)

      // Push updates every 5s
      const interval = setInterval(async () => {
        try {
          const [m, h, c] = await Promise.all([
            fetchFromRender("/metrics"),
            fetchFromRender("/health"),
            fetchFromRender("/cache/stats"),
          ])
          send("metrics", m)
          send("health", h)
          send("cache", c)
        } catch {
          send("error", { message: "upstream unavailable" })
        }
      }, 5000)

      // Cleanup when client disconnects
      return () => clearInterval(interval)
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
    },
  })
}
```

Dashboard layout (no cards, use sections):

```
┌─────────────────────────────────────────────────────┐
│  SYSTEM STATUS    agent ● security ● cache ●        │
├──────────────┬──────────────┬──────────────┬────────┤
│  1,204 req   │  0.8% error  │  340ms avg   │  68%   │
│  total       │  rate        │  latency     │  cache │
├──────────────┴──────────────┴──────────────┴────────┤
│  [Request volume — live line chart]                  │
├─────────────────────────┬───────────────────────────┤
│  Token usage            │  Security audit log        │
│  input / output bars    │  PII masked: 12            │
│                         │  Blocked: 3               │
│                         │  [expandable log]          │
└─────────────────────────┴───────────────────────────┘
```

---

### Week 3 — LangGraph Visualizer (Signature Feature)

Consume `graph_node` stream events. Render execution timeline.

**Why this is a moat:**
Almost no production RAG app exposes its graph execution to users. This makes debugging transparent and builds enterprise trust.

```typescript
// components/graph/ExecutionTimeline.tsx
interface GraphNode {
  name:        string   // "security_check" | "cache_lookup" | "llm_call"
  status:      "start" | "done" | "skip" | "error"
  duration_ms: number
  startedAt:   number
}

// Render as horizontal pipeline
// security_check → cache_lookup (skip) → llm_call → output_filter
// Color: done=green, skip=muted, error=red, running=amber+pulse
```

Timeline view (shown below chat message, collapsible):

```
  User Input
      │
  Security Scan     2ms  ✓
      │
  Cache Lookup      1ms  ↷ miss
      │
  Primary LLM     318ms  ✓
      │
  Output Filter     1ms  ✓
      │
  Response
```

**Backend integration needed:** Add `graph_node` events to the SSE stream in your FastAPI app. The LangGraph state machine already has the data — just emit it.

---

### Week 4 — Replay + Playground + Request Audit

**Request Replay:**

Every row in `request_log` gets a detail view:

```
Request #abc123
  Prompt (raw):       "My email is john@test.com, what is AI?"
  Prompt (sanitized): "My email is [EMAIL REDACTED], what is AI?"
  Response:           "Artificial intelligence is..."
  Model:              primary
  Latency:            340ms
  Cache:              miss
  Security notes:     ["Input PII masked: ['email']"]

  [Replay] [Export JSON] [Copy Prompt]
```

**API Playground:**

Split-pane view:
- Left: request editor (JSON, with ChatRequest schema validation inline)
- Right: response (streaming tokens + raw JSON toggle)
- Bottom: execution timeline (graph_node events)

Feels like Insomnia/Hoppscotch but purpose-built for this API.

---

## OpenTelemetry — From Day One

```typescript
// lib/otel.ts
import { NodeSDK } from "@opentelemetry/sdk-node"
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http"
import { HttpInstrumentation } from "@opentelemetry/instrumentation-http"

export const sdk = new NodeSDK({
  traceExporter: new OTLPTraceExporter({
    url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT,
  }),
  instrumentations: [new HttpInstrumentation()],
})
```

Instrument:
- BFF route handlers (trace ID on every `/api/chat` call)
- SSE lifecycle (span from first token to `done`)
- Turso queries
- Render API calls (latency, status code)

Export targets (all work without code changes):
- **Dev:** local Jaeger (`docker run jaegertracing/all-in-one`)
- **Staging:** Grafana Cloud (free tier)
- **Prod:** Datadog or LangSmith (already wired in your backend)

---

## Design System

**Scene:** SRE on second monitor at 11pm, left monitor showing incident, right monitor showing this dashboard. Needs signal instantly. Has no patience for decoration.

**Color strategy: Restrained**
- Base: `oklch(0.13 0.008 248)` — near-black, cool-tinted toward blue-grey
- Surface: `oklch(0.17 0.007 248)`
- Border: `oklch(0.22 0.006 248)`
- Accent: `oklch(0.71 0.17 144)` — terminal green, used only for healthy/success states
- Warning: `oklch(0.78 0.16 68)` — amber for security events
- Error: `oklch(0.65 0.20 25)` — red for errors/blocks

**Typography:**
- UI: `IBM Plex Sans` — technical, unambiguous, not Inter
- Mono (messages, JSON, code): `IBM Plex Mono`
- Both from the same family: visual coherence without a "developer aesthetic" cliché

**Motion rules:**
- Message appear: `opacity 0→1 + translateY 8px→0`, `200ms ease-out-quart`
- Stream cursor: `opacity` pulse at 600ms, stops on `done`
- Graph node complete: brief `scale 1→1.03→1` flash, green fill
- Dashboard numbers: count-up animation on mount, `600ms ease-out-expo`
- No bounce. No elastic. No decorative animation.

**Anti-patterns blocked:**
- No gradient text
- No glassmorphism
- No AI sparkle icons
- No hero-metric template (big number + gradient accent)
- No side-stripe card borders
- No floating particles

**Tone reference:** Linear · Vercel · Raycast. Not: Dify, Flowise, or any "AI platform" landing page.

---

## Environment Config

```env
# .env.local
RENDER_API_URL=https://prod-api-rag.onrender.com
RENDER_API_KEY=                         # add when you secure the API
DATABASE_URL=libsql://...turso.io       # Turso connection string
DATABASE_AUTH_TOKEN=...

BETTER_AUTH_SECRET=...
NEXT_PUBLIC_APP_URL=https://your-app.vercel.app

OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318/v1/traces  # Jaeger local
OTEL_SERVICE_NAME=rag-webapp
```

---

## Testing Plan

```
Unit (Vitest):
  - StreamEvent schema parsing (all 6 event types)
  - SSE parser: partial chunks, multi-event blocks, malformed data
  - ChatRequest/ChatResponse Zod validation
  - Security note extraction
  - Metrics formatters

Integration:
  - BFF /api/chat: mock Render → verify stream passthrough
  - BFF /api/metrics/stream: verify SSE event format
  - Turso CRUD: thread create/read/delete
  - request_log write on every chat call

E2E (Playwright):
  - Send message → streaming tokens appear → metadata badge shown
  - PII in message → security_notes badge rendered
  - Blocked message → error state, reason shown
  - 429 rate limit → countdown timer shown
  - Thread persists after page reload
  - Dashboard: health badges reflect /health response
  - Replay: click request → detail view correct
```

---

## CI/CD

```yaml
# .github/workflows/ci.yml
on: [push]
jobs:
  ci:
    steps:
      - typecheck        # tsc --noEmit
      - lint             # eslint
      - test             # vitest run
      - build            # next build (catches RSC errors)
      - e2e              # playwright (against preview URL)
      - deploy-preview   # vercel deploy --prebuilt
  
  deploy:
    if: github.ref == 'refs/heads/main'
    needs: ci
    steps:
      - vercel deploy --prod
```

---

## Vercel Config

```json
{
  "regions": ["sin1"],
  "functions": {
    "app/api/chat/route.ts":            { "maxDuration": 30 },
    "app/api/metrics/stream/route.ts":  { "maxDuration": 60 }
  }
}
```

---

## Execution Order (Final)

```
Week 1A  BFF proxy → SSE parser → streaming chat UI → localStorage threads
Week 1B  Better Auth → Turso schema → persist threads + messages + request_log
Week 2   Live dashboard (push SSE, not polling) → security audit log
Week 3   LangGraph execution visualizer (graph_node events → timeline)
Week 4   Request replay UI → API playground → export/share threads
```

---

## Quick Start

```bash
# Scaffold monorepo
npx create-turbo@latest rag-webapp --example with-tailwind
cd rag-webapp

# Web app
cd apps/web
npx shadcn@latest init
npx shadcn@latest add button input textarea badge separator

# Shared types package
mkdir -p packages/shared-types/src
npm install zod --workspace packages/shared-types

# Dependencies
npm install better-auth @libsql/client zustand @tanstack/react-query
npm install @opentelemetry/sdk-node @opentelemetry/exporter-trace-otlp-http
npm install -D vitest @vitejs/plugin-react playwright
```

Start here: `apps/web/app/api/chat/route.ts` — BFF proxy, 30 lines, streaming passthrough. Everything else builds on top.
