# Frontend Architecture

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Technology Stack](#2-technology-stack)
3. [Directory Structure](#3-directory-structure)
4. [Request Flow](#4-request-flow)
5. [Type System](#5-type-system)
6. [Scope Guard](#6-scope-guard)
7. [API Route — Next.js ↔ FastAPI Bridge](#7-api-route--nextjs--fastapi-bridge)
8. [Page Layout & Responsive Design](#8-page-layout--responsive-design)
9. [Component Breakdown](#9-component-breakdown)
10. [Design Tokens & Theming](#10-design-tokens--theming)
11. [State Management](#11-state-management)
12. [Session Handling](#12-session-handling)
13. [Design Decisions & Tradeoffs](#13-design-decisions--tradeoffs)

---

## 1. System Overview

The frontend is a Next.js 14 App Router application that provides a chat interface for the PartSelect parts assistant. It handles all user interaction, pre-filters out-of-scope messages, proxies requests to the FastAPI backend, and renders structured responses (text, product cards, order timelines, chips).

```
Browser
    │
    │  User types a message → Enter or Send button
    ▼
page.tsx  (client component)
    │
    │  POST /api/chat  { message, session_id }
    ▼
app/api/chat/route.ts  (Next.js Route Handler — server side)
    │
    ├── Frontend scope guard  (regex check, no network call)
    │       out-of-scope → return outofscope Message immediately
    │
    └── Proxy to FastAPI  POST http://localhost:8000/chat
            │
            │  Collect SSE stream  (token events + part_card events)
            │  parseSseToReplies() → Message[]
            ▼
        NextResponse.json({ replies: Message[] })
    │
    ▼
page.tsx updates messages state → React re-renders
    │
    ▼
MessageItem renders each Message as the appropriate component
```

---

## 2. Technology Stack

| Concern | Technology |
|---|---|
| Framework | Next.js 14 App Router |
| Language | TypeScript |
| Styling | Tailwind CSS with custom design tokens |
| Fonts | Inter (sans), Instrument Serif (display), JetBrains Mono (mono) |
| Markdown rendering | `react-markdown` with custom component overrides |
| Package manager | npm |

No state management library (Redux, Zustand, Jotai) is used. All state is local React `useState` — the chat is a single page with no routing or shared state.

---

## 3. Directory Structure

```
frontend/
├── app/
│   ├── layout.tsx              # Root layout — font variables, metadata
│   ├── globals.css             # Tailwind base + custom scrollbar styles
│   ├── page.tsx                # Chat page — all UI logic, mobile + desktop
│   └── api/
│       └── chat/
│           └── route.ts        # Route Handler — scope guard + FastAPI proxy
│
├── components/
│   └── chat/
│       ├── Composer.tsx        # MobileComposer, DesktopComposer
│       ├── TypingDots.tsx      # Animated typing indicator
│       ├── messages/
│       │   ├── AssistantBubble.tsx  # Wrapper for assistant message content
│       │   ├── UserBubble.tsx       # User message bubble
│       │   ├── Chips.tsx            # Quick-reply chip row
│       │   ├── ProductCard.tsx      # Part display card (image, price, Add button)
│       │   ├── OrderTimeline.tsx    # Order status display
│       │   ├── DiagnosticCard.tsx   # Troubleshooting result display
│       │   └── HandoffCard.tsx      # Human handoff prompt
│       └── (icons are in components/icons.tsx)
│
├── components/icons.tsx        # SVG icon components (Send, Cart, Check, etc.)
│
├── lib/
│   ├── chat/
│   │   ├── types.ts            # Message discriminated union, Part type
│   │   └── intents.ts          # initialMessages(), respond() scope guard
│   └── tokens.ts               # Design token constants + mock parts data
│
├── tailwind.config.ts          # Extended theme — colors, fonts, shadows, radius
├── next.config.mjs
└── .env.local                  # FASTAPI_URL=http://localhost:8000
```

---

## 4. Request Flow

### Happy path (in-scope query)

```
1. User types "my fridge is leaking" → presses Enter
2. page.tsx:send()
     - appends { role: 'user', text } to messages state
     - sets typing = true
3. POST /api/chat  { message: "my fridge is leaking", session_id: "abc123" }
4. route.ts:POST()
     - runs respond("my fridge is leaking") from intents.ts
     - "leaking" matches /(leak|...)/ → returns diagnostic Message[]
     - BUT this is the frontend mock path, not the scope-reject path
     - Since it's not kind: 'outofscope', continues to backend
     - POST http://localhost:8000/chat  { message, session_id }
     - backend streams SSE: token events + optional part_card events + done
     - parseSseToReplies() assembles Message[]
     - returns NextResponse.json({ replies })
5. page.tsx receives { replies }
     - sets typing = false
     - appends replies to messages state
6. React re-renders → MessageItem maps each Message to its component
```

### Out-of-scope short-circuit

```
1. User types "fix my oven"
2. route.ts: respond("fix my oven")
     - "oven" matches /(oven|microwave|...)/
     - returns [{ role: 'assistant', kind: 'outofscope' }]
3. first reply is kind: 'outofscope' → return immediately, never call FastAPI
4. page.tsx renders OutofScope message:
     "I can only help with refrigerator and dishwasher parts..."
```

---

## 5. Type System

### `Message` discriminated union — `lib/chat/types.ts`

```typescript
type Message =
  | { role: 'user'; text: string }
  | { role: 'assistant'; kind: 'welcome' }
  | { role: 'assistant'; kind: 'chips'; chips: string[] }
  | { role: 'assistant'; kind: 'text'; text: string }
  | { role: 'assistant'; kind: 'product'; part: Part }
  | { role: 'assistant'; kind: 'order' }
  | { role: 'assistant'; kind: 'diagnostic' }
  | { role: 'assistant'; kind: 'handoff' }
  | { role: 'assistant'; kind: 'outofscope' };
```

The `kind` field is a discriminant — TypeScript narrows to the correct variant in every `switch` or `if` block. `MessageItem` in `page.tsx` switches on `m.kind` to render the appropriate component with full type safety. Adding a new message kind requires adding a variant here and a case in `MessageItem`.

### `Part` type

```typescript
type Part = {
  id: string;        // PS number, e.g. "W10413645A"
  name: string;
  brand: string;
  price: number;
  stock: string;     // "In Stock", "In Stock · ships today"
  install: string;   // "5 min · no tools"
  fit: string;       // "Refrigerator part"
  img: string | null;
};
```

`Part` is the frontend shape. `BackendPart` in `route.ts` is the raw shape from the FastAPI response. `mapBackendPart()` transforms one into the other, mapping `ps_number` → `id`, `availability` → `stock`, combining `install_difficulty` + `install_time` into `install`, and deriving a human-readable `fit` label from `appliance_type`.

---

## 6. Scope Guard

### Two layers of scope enforcement

| Layer | Location | Mechanism |
|---|---|---|
| Frontend (pre-network) | `route.ts` → `respond()` | Regex keyword match |
| Backend | `agents/nodes.py:scope_guard_node` | Keyword list + regex hard-block |

### Frontend regex — `lib/chat/intents.ts`

```typescript
// Hard out-of-scope — rejects immediately, never hits FastAPI
if (/(oven|microwave|\bwasher\b|dryer|stove|range|cooktop|hvac|furnace|\btv\b|phone|weather|politics|recipe|joke)/.test(t)) {
  return [{ role: 'assistant', kind: 'outofscope' }];
}
```

`\b` word boundaries prevent `\bwasher\b` from false-positiving on "dishwasher". `\btv\b` avoids matching words like "activity".

The `respond()` function in `intents.ts` also handles non-LLM intent routing for the frontend mock layer (handoff, order, diagnostic, compatibility, parts search). When the backend is live, these downstream branches never execute — `route.ts` only short-circuits on `kind: 'outofscope'` and forwards everything else to FastAPI.

### Why scope guard at both layers

- **Frontend layer:** Eliminates a network round-trip and backend cost for obvious off-topic queries. Works even when the backend is unavailable.
- **Backend layer:** Handles adversarial prompts, edge cases the frontend regex misses, and provides a hard guarantee that the LLM never processes off-topic requests regardless of frontend state.

---

## 7. API Route — Next.js ↔ FastAPI Bridge

**File:** `app/api/chat/route.ts`

The Next.js API route acts as a server-side proxy. The browser never contacts `localhost:8000` directly — all backend calls happen server-side in the Route Handler. This means CORS is not a concern for the current architecture.

### SSE collection and parsing

The FastAPI backend streams SSE events. The Route Handler collects the full SSE body as text, then calls `parseSseToReplies()`:

```typescript
function parseSseToReplies(raw: string): Message[] {
  let text = '';
  const parts: Part[] = [];

  for (const line of raw.split('\n')) {
    if (!line.trim().startsWith('data:')) continue;
    const payload = JSON.parse(line.trim().slice(5).trim());

    if (payload.type === 'token')     text += payload.content;
    if (payload.type === 'part_card') parts.push(mapBackendPart(payload.data));
    if (payload.type === 'error')     return [text error message];
  }

  // Assemble: text message first, then one product Message per part
  const replies: Message[] = [];
  if (text.trim()) replies.push({ role: 'assistant', kind: 'text', text });
  for (const part of parts) replies.push({ role: 'assistant', kind: 'product', part });
  return replies;
}
```

Tokens are concatenated into one complete text string. Each `part_card` event becomes a separate `product` Message. The result is always a `Message[]` — the page's state model never deals with raw SSE.

### Backend part mapping

```typescript
function mapBackendPart(p: BackendPart): Part {
  return {
    id: p.ps_number,
    name: p.name,
    brand: p.brand ?? '',
    price: p.price ?? 0,
    stock: p.availability ?? 'Check availability',
    install: [p.install_difficulty, p.install_time].filter(Boolean).join(' · ') || 'See instructions',
    fit: p.appliance_type
      ? capitalize(p.appliance_type) + ' part'
      : 'Compatible part',
    img: null,
  };
}
```

This mapping lives in `route.ts` (server side) so the browser only ever sees the frontend `Part` shape. Backend field changes are absorbed here without touching any component.

---

## 8. Page Layout & Responsive Design

**File:** `app/page.tsx`

The page renders two entirely separate layout trees inside the same component, shown/hidden with Tailwind responsive prefixes:

```tsx
{/* Mobile: < lg (1024px) */}
<div className="flex flex-col h-full lg:hidden">
  ...
</div>

{/* Desktop: ≥ lg */}
<div className="hidden lg:grid lg:grid-cols-[240px_1fr_300px] h-full">
  ...
</div>
```

### Mobile layout

```
┌─────────────────────────┐
│  Header (teal)           │  teal-700 bg, avatar, status dot, Reset button
├─────────────────────────┤
│                         │
│  Message list            │  flex-1 overflow-y-auto, ink-50 bg
│                         │
├─────────────────────────┤
│  Composer               │  MobileComposer, scope note
└─────────────────────────┘
```

### Desktop layout (three-column grid)

```
┌──────────────┬────────────────────────────┬────────────────┐
│  Left rail   │  Center conversation       │  Right rail    │
│  240px       │  flex-1                    │  300px         │
│              │                            │                │
│  PS logo     │  Header (teal)             │  Quick actions │
│  New conv    │  Message list              │  Scope note    │
│  Sessions    │  DesktopComposer           │                │
└──────────────┴────────────────────────────┴────────────────┘
```

Both layouts share the same `messages` state and the same `send()` function. The `MessageItem` component is called with `desktop={true}` in the desktop tree to render slightly larger avatars and adjusted spacing.

---

## 9. Component Breakdown

### `MessageItem` (inline in `page.tsx`)

Routes a `Message` to the appropriate component by discriminating on `m.role` and `m.kind`. Returns `null` for unrecognised kinds rather than throwing.

| Message kind | Rendered as |
|---|---|
| `user` | `UserBubble` |
| `welcome` | `AssistantBubble` with inline welcome text (desktop/mobile variants) |
| `chips` | `Chips` |
| `text` | `AssistantBubble` wrapping `ReactMarkdown` |
| `product` | `AssistantBubble` wrapping `ProductCard` |
| `order` | `AssistantBubble` wrapping `OrderTimeline` |
| `diagnostic` | `AssistantBubble` wrapping `DiagnosticCard` |
| `handoff` | `AssistantBubble` wrapping `HandoffCard` |
| `outofscope` | `AssistantBubble` with scope-limit text |

### `AssistantBubble` — `components/chat/messages/AssistantBubble.tsx`

Wraps any assistant content with the avatar (teal sparkle icon, `w-6/w-7` depending on `desktop` prop) and bubble container. Spacing and avatar size are the only differences between mobile and desktop variants.

### `UserBubble` — `components/chat/messages/UserBubble.tsx`

Right-aligned bubble in teal-50 with a user avatar placeholder. No markdown — user text is rendered as plain text.

### `ProductCard` — `components/chat/messages/ProductCard.tsx`

Displays a single `Part`:
- Part image placeholder (SVG diagonal-stripe pattern, label derived from part name)
- Brand + PS number in monospace
- Part name in semibold
- `fit` label with a green checkmark icon
- Price + stock status + Add button (teal)

The image placeholder avoids broken `<img>` tags since `img` is currently `null` for all parts. The SVG pattern uses the PS number as a unique `id` to avoid conflicts when multiple `ProductCard`s appear in the same page.

### `Chips` — `components/chat/messages/Chips.tsx`

Renders a row of tappable quick-reply chips. Each chip calls `onChip(text)` which feeds directly into `send()` as if the user typed it. Used for initial welcome chips and diagnostic follow-up chips.

### `Composer` — `components/chat/Composer.tsx`

Two exports: `MobileComposer` and `DesktopComposer`.

- **Mobile:** Single-line input + send button. `Enter` key triggers send.
- **Desktop:** Multi-line appearance with a toolbar row (Photo, Model #, Part # attachment buttons — UI only, not wired to backend) and a full send button. `Enter` key triggers send.

### `TypingDots` — `components/chat/TypingDots.tsx`

Three animated dots shown while `typing === true`. Displayed via `TypingRow` in `page.tsx`, which also renders the assistant avatar.

---

## 10. Design Tokens & Theming

### Token palette — `lib/tokens.ts` + `tailwind.config.ts`

The design uses three custom color scales registered as Tailwind classes:

| Scale | Usage | Key values |
|---|---|---|
| `teal` | Primary brand, headers, active states, buttons | `teal-700` (#175f5d) primary, `teal-50` (#f2f8f7) bg |
| `amber` | Secondary accents (currently minimal use) | `amber-500` (#efa53b) |
| `ink` | Text, borders, backgrounds | `ink-900` (#191714) text, `ink-50` (#f7f4eb) card bg, `ink-0` (#fefcf6) page bg |

Semantic colors outside the scales:
- `ok` (#2e8560) — in-stock indicators, compatibility checkmarks
- `warn` (#c86a1f) — warnings
- `err` (#b33a2a) — errors

### Custom shadows and radius

```typescript
boxShadow: {
  widget: '0 30px 80px rgba(...), 0 8px 24px rgba(...)',  // floating panels
  card:   '0 1px 3px rgba(...), 0 4px 16px rgba(...)',    // product cards
},
borderRadius: {
  pill: '14px',  // chat bubbles
},
```

### Font stack

| Variable | Font | Usage |
|---|---|---|
| `--font-inter` | Inter | Body text, UI labels |
| `--font-instrument-serif` | Instrument Serif | Display/logo text (`font-display`) |
| `--font-jetbrains` | JetBrains Mono | PS numbers, session IDs, monospace labels |

All three are loaded via `next/font/google` in `layout.tsx` as CSS variables, then referenced in `tailwind.config.ts` under `fontFamily`. This ensures zero layout shift (fonts are preloaded at build time) and no external font requests at runtime.

---

## 11. State Management

All state lives in `page.tsx` as `useState` hooks:

```typescript
const [messages, setMessages] = useState<Message[]>(() => initialMessages());
const [input, setInput]       = useState('');
const [typing, setTyping]     = useState(false);
const [sessionId, setSessionId] = useState('');
```

### `messages`

The full conversation history rendered in the message list. Initialized with `initialMessages()` (welcome + chips). Updated via `setMessages(m => [...m, ...newMessages])`.

### `typing`

`true` between POST submission and receiving `{ replies }`. Controls whether `TypingRow` is rendered at the bottom of the message list.

### `sessionId`

A random 8-character alphanumeric string (`Math.random().toString(36).slice(2, 10)`), initialized once in a `useEffect` after hydration. Using `useEffect` avoids a React hydration mismatch: the server renders an empty string, the client sets a random value, but since it's in `useEffect` the mismatch is resolved before paint.

The session ID is passed to the FastAPI backend with every request so the backend can load and save conversation history. It is displayed in the desktop header (monospace, muted) for debugging.

### Scroll management

Two `useRef` values — `mobileScrollerRef` and `desktopScrollerRef` — point to the message list containers. A `useEffect` watches `messages` and `typing` and sets `scrollTop = scrollHeight` on both refs whenever either changes, keeping the latest message visible.

### Reset

```typescript
const reset = () => setMessages(initialMessages());
```

Clears the UI-side message history only. The backend session is **not** cleared (no `POST /reset` call) — the backend session continues to accumulate. If a full reset is needed (including backend history), a `POST /reset` to the FastAPI backend should be added here.

---

## 12. Session Handling

The session ID is a client-generated random string per page load. It is:
- Generated once on mount via `useEffect`
- Sent with every `POST /api/chat` request as `session_id`
- Forwarded by `route.ts` to FastAPI as-is
- Displayed in the desktop sidebar (monospace, muted)

There is no authentication, no user identity, and no persistent session across page reloads. Each new page load generates a new session ID and starts a fresh conversation on both the frontend and the backend.

---

## 13. Design Decisions & Tradeoffs

### Next.js Route Handler as proxy (no direct browser → FastAPI calls)

**Decision:** All FastAPI calls happen server-side in `route.ts`. The browser only calls `/api/chat`.

**Benefits:**
- CORS is not a concern — no cross-origin requests from the browser
- `FASTAPI_URL` stays server-side (no `NEXT_PUBLIC_` prefix), never exposed to the browser
- The route can be changed (e.g., add auth headers, retry logic) without touching any client component

**Tradeoff:** True token-by-token streaming to the browser is not implemented — the route collects the full SSE body first, then returns JSON. Users see a typing indicator until the full response arrives, rather than tokens appearing incrementally. Implementing true streaming would require the route to forward the SSE stream as a `ReadableStream` response, and `page.tsx` to consume it with `fetch` + `getReader()`.

### `Message` discriminated union over a generic `{ type, payload }` shape

**Decision:** Each message kind is a fully typed variant with its own fields.

**Benefits:** TypeScript narrows types in `switch` blocks. Adding a new kind (e.g., `kind: 'comparison'`) requires a compile error in `MessageItem` — you cannot forget to handle it.

**Tradeoff:** More verbose type definition. Changing an existing kind's fields requires updating every place that constructs or destructures it.

### Local `useState` over a global store

**Decision:** All state is in `page.tsx`.

**Benefits:** Zero dependencies, easy to reason about, no provider wrapping. Perfectly adequate for a single-page chat app with no routing.

**Tradeoff:** If the app grows (multiple chat pages, shared part catalog, user auth), this approach would need to be replaced with a context or state library. For the current scope, the added complexity is not warranted.

### No image loading

`Part.img` is always `null`. `ProductCard` renders an SVG placeholder rather than an `<img>` tag. This avoids broken images while the system has no CDN or image storage. Adding real images requires only updating `mapBackendPart` in `route.ts` to populate `img` from a CDN URL — no component changes needed.
