'use client';

import { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import type { Message } from '@/lib/chat/types';
import { initialMessages } from '@/lib/chat/intents';
import AssistantBubble from '@/components/chat/messages/AssistantBubble';
import UserBubble from '@/components/chat/messages/UserBubble';
import Chips from '@/components/chat/messages/Chips';
import ProductCard from '@/components/chat/messages/ProductCard';
import OrderTimeline from '@/components/chat/messages/OrderTimeline';
import DiagnosticCard from '@/components/chat/messages/DiagnosticCard';
import HandoffCard from '@/components/chat/messages/HandoffCard';
import TypingDots from '@/components/chat/TypingDots';
import { MobileComposer, DesktopComposer } from '@/components/chat/Composer';
import { IconSparkle, IconPlus, IconArrow } from '@/components/icons';

// ─── Shared message renderer ────────────────────────────────────────────────

function MessageItem({ m, onChip, desktop }: { m: Message; onChip: (t: string) => void; desktop?: boolean }) {
  if (m.role === 'user') {
    return <UserBubble text={m.text} desktop={desktop} />;
  }
  if (m.kind === 'chips') {
    return <Chips chips={m.chips} onChip={onChip} desktop={desktop} />;
  }

  const bubbleContent = () => {
    switch (m.kind) {
      case 'welcome':
        return desktop ? (
          <div>
            <p className="font-semibold mb-1 text-ink-900 text-[14.5px]">Hi — I help with fridge &amp; dishwasher parts.</p>
            <p>Find parts by model or symptom, check compatibility, or look up an order. How can I help?</p>
          </div>
        ) : (
          <div>
            <p className="font-semibold mb-1 text-ink-900">Hi! I help with fridge &amp; dishwasher parts.</p>
            <p>Find parts, check compatibility, or look up an order. How can I help?</p>
          </div>
        );
      case 'text':
        return (
          <ReactMarkdown
            components={{
              h1: ({ children }) => <p className="font-bold text-[15px] mt-2 mb-1">{children}</p>,
              h2: ({ children }) => <p className="font-bold text-[14px] mt-2 mb-1">{children}</p>,
              h3: ({ children }) => <p className="font-semibold mt-2 mb-0.5">{children}</p>,
              p: ({ children }) => <p className="mb-1.5 last:mb-0">{children}</p>,
              ul: ({ children }) => <ul className="list-disc pl-4 mb-1.5 space-y-0.5">{children}</ul>,
              ol: ({ children }) => <ol className="list-decimal pl-4 mb-1.5 space-y-0.5">{children}</ol>,
              li: ({ children }) => <li>{children}</li>,
              strong: ({ children }) => <strong className="font-semibold text-ink-900">{children}</strong>,
              a: ({ href, children }) => (
                <a href={href} target="_blank" rel="noopener noreferrer" className="text-teal-700 underline underline-offset-2 hover:text-teal-600">
                  {children}
                </a>
              ),
              code: ({ children }) => <code className="font-mono text-[12px] bg-ink-100 px-1 py-0.5 rounded">{children}</code>,
            }}
          >
            {m.text}
          </ReactMarkdown>
        );
      case 'product':
        return <ProductCard part={m.part} />;
      case 'order':
        return <OrderTimeline />;
      case 'diagnostic':
        return <DiagnosticCard />;
      case 'handoff':
        return <HandoffCard />;
      case 'outofscope':
        return (
          <p>
            <strong>I can only help with refrigerator and dishwasher parts.</strong> For other appliances, please contact support at 1-866-636-5974.
          </p>
        );
    }
  };

  return <AssistantBubble desktop={desktop}>{bubbleContent()}</AssistantBubble>;
}

// ─── Typing indicator row ────────────────────────────────────────────────────

function TypingRow({ desktop }: { desktop?: boolean }) {
  const avatarSize = desktop ? 'w-7 h-7 rounded-[14px]' : 'w-6 h-6 rounded-full';
  const iconSize = desktop ? 13 : 12;
  return (
    <div className={`flex items-center gap-${desktop ? '2.5' : '2'} ${desktop ? 'ml-0' : 'ml-1'}`}>
      <div className={`${avatarSize} bg-teal-50 text-teal-700 flex items-center justify-center`}>
        <IconSparkle size={iconSize} />
      </div>
      <div className="bg-white border border-ink-100 p-[10px_14px] rounded-[14px]">
        <TypingDots />
      </div>
    </div>
  );
}

// ─── Right-rail context section ──────────────────────────────────────────────

function ContextSection({ title, children, muted }: { title: string; children: React.ReactNode; muted?: boolean }) {
  return (
    <div>
      <div className={`text-[10.5px] font-semibold uppercase tracking-[0.7px] mb-2 ${muted ? 'text-ink-400' : 'text-ink-500'}`}>
        {title}
      </div>
      <div>{children}</div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>(() => initialMessages());
  const [input, setInput] = useState('');
  const [typing, setTyping] = useState(false);
  // Empty string on the server; set once on the client after hydration to avoid
  // the SSR/client mismatch that causes a React hydration error.
  const [sessionId, setSessionId] = useState('');
  useEffect(() => {
    setSessionId(Math.random().toString(36).slice(2, 10));
  }, []);

  const mobileScrollerRef = useRef<HTMLDivElement>(null);
  const desktopScrollerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    [mobileScrollerRef, desktopScrollerRef].forEach((ref) => {
      const el = ref.current;
      if (el) el.scrollTop = el.scrollHeight;
    });
  }, [messages, typing]);

  const send = async (text: string) => {
    if (!text.trim()) return;
    setMessages((m) => [...m, { role: 'user', text }]);
    setInput('');
    setTyping(true);
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, session_id: sessionId, history: messages }),
      });
      const data = (await res.json()) as { replies: Message[] };
      setTyping(false);
      setMessages((m) => [...m, ...data.replies]);
    } catch {
      setTyping(false);
      setMessages((m) => [
        ...m,
        { role: 'assistant', kind: 'text', text: 'Something went wrong. Please try again.' },
      ]);
    }
  };

  // Reset clears the UI only — the backend session is preserved
  const reset = () => setMessages(initialMessages());

  return (
    <div className="h-screen overflow-hidden font-sans text-ink-900">

      {/* ── MOBILE layout (< lg) ──────────────────────────────────────────── */}
      <div className="flex flex-col h-full bg-[#fefcf6] lg:hidden">

        {/* Mobile header */}
        <header className="flex items-center gap-3 px-[18px] py-[14px] bg-teal-700 text-white flex-shrink-0">
          <div className="w-9 h-9 rounded-[18px] bg-white/[0.15] border border-white/20 flex items-center justify-center text-[16px] font-display leading-none">
            M
          </div>
          <div className="flex-1 leading-tight">
            <div className="text-[14px] font-semibold">Parts Assistant</div>
            <div className="text-[11px] opacity-85 flex items-center gap-[5px]">
              <span className="w-1.5 h-1.5 rounded-full bg-[#7ee2a0]" />
              Online · fridge &amp; dishwasher parts
            </div>
          </div>
          <button
            onClick={reset}
            className="bg-white/[0.12] border border-white/20 text-white text-[11px] px-[9px] py-1 rounded-[5px] cursor-pointer font-sans"
          >
            Reset
          </button>
        </header>

        {/* Mobile message list */}
        <div
          ref={mobileScrollerRef}
          className="flex-1 overflow-y-auto px-3.5 pt-3.5 pb-4 flex flex-col gap-2.5 bg-ink-50"
        >
          {messages.map((m, i) => (
            <MessageItem key={i} m={m} onChip={send} />
          ))}
          {typing && <TypingRow />}
        </div>

        {/* Mobile composer */}
        <div className="flex-shrink-0 p-3 bg-[#fefcf6] border-t border-ink-100">
          <MobileComposer value={input} onChange={setInput} onSend={send} />
          <p className="text-[10px] text-ink-400 mt-1.5 text-center">
            Scope: refrigerator &amp; dishwasher parts only
          </p>
        </div>
      </div>

      {/* ── DESKTOP layout (≥ lg = 1024px) ───────────────────────────────── */}
      <div className="hidden lg:grid lg:grid-cols-[240px_1fr_300px] h-full bg-ink-50">

        {/* Left rail */}
        <aside className="bg-white border-r border-ink-200 flex flex-col overflow-hidden">
          {/* Logo */}
          <div className="px-[18px] pt-5 pb-3.5 flex items-center gap-2.5 border-b border-ink-100">
            <div className="w-7 h-7 rounded-[7px] bg-teal-700 text-white flex items-center justify-center font-mono text-[11px] font-bold flex-shrink-0">
              PS
            </div>
            <span className="font-display text-[17px] tracking-[-0.2px]">Parts Assistant</span>
          </div>

          {/* New conversation */}
          <div className="mx-3.5 my-3.5">
            <button
              onClick={reset}
              className="w-full px-3 py-2.5 bg-teal-700 text-white border-none rounded-[7px] cursor-pointer font-sans text-[13px] font-semibold flex items-center justify-center gap-1.5 hover:bg-teal-600 transition-colors"
            >
              <IconPlus size={13} /> New conversation
            </button>
          </div>

          {/* Sessions */}
          <div className="px-[18px] pb-1.5 text-[10px] font-mono text-ink-500 uppercase tracking-[0.8px]">
            Recent
          </div>
          <div className="mx-2 mb-0.5 px-2.5 py-[9px] rounded-[6px] bg-teal-50 text-teal-700 flex flex-col gap-0.5">
            <span className="text-[12.5px] font-semibold">Current session</span>
            <span className="text-[10.5px] text-teal-700 opacity-75 font-mono">{sessionId}</span>
          </div>

          <div className="flex-1" />
        </aside>

        {/* Center conversation */}
        <main className="flex flex-col overflow-hidden">
          {/* Center header */}
          <header className="px-7 py-[14px] bg-teal-700 text-white flex items-center gap-3.5 flex-shrink-0">
            <div className="w-[34px] h-[34px] rounded-[17px] bg-white/[0.15] border border-white/20 flex items-center justify-center font-display text-[15px] flex-shrink-0">
              M
            </div>
            <div className="flex-1 leading-tight">
              <div className="text-[15px] font-semibold">Parts Assistant</div>
              <div className="text-[11.5px] opacity-85 flex items-center gap-[5px]">
                <span className="w-1.5 h-1.5 rounded-full bg-[#7ee2a0]" />
                Online · refrigerator &amp; dishwasher parts only
              </div>
            </div>
            <span className="text-[11px] font-mono opacity-70">{sessionId}</span>
          </header>

          {/* Desktop message list */}
          <div
            ref={desktopScrollerRef}
            className="flex-1 overflow-y-auto px-7 py-6 flex flex-col gap-4 bg-ink-50"
          >
            {messages.map((m, i) => (
              <MessageItem key={i} m={m} onChip={send} desktop />
            ))}
            {typing && <TypingRow desktop />}
          </div>

          {/* Desktop composer */}
          <div className="px-7 py-[14px] pb-[18px] bg-white border-t border-ink-200 flex-shrink-0">
            <DesktopComposer value={input} onChange={setInput} onSend={send} />
          </div>
        </main>

        {/* Right context rail */}
        <aside className="bg-white border-l border-ink-200 px-[18px] py-5 flex flex-col gap-[18px] overflow-y-auto">
          <ContextSection title="Quick actions">
            <div className="flex flex-col gap-1.5">
              {([
                ['Find a part',    'Find a water filter'        ],
                ['Troubleshoot',   'My fridge is leaking'       ],
                ['Track order',    'Track my order'             ],
                ['Human handoff',  'I want to talk to a human'  ],
              ] as const).map(([label, q]) => (
                <button
                  key={label}
                  onClick={() => send(q)}
                  className="bg-ink-50 border border-ink-200 text-ink-800 px-2.5 py-2 rounded-[6px] text-[11.5px] text-left cursor-pointer font-sans flex items-center gap-1.5 hover:bg-ink-100 transition-colors"
                >
                  <IconArrow size={10} />
                  {label}
                </button>
              ))}
            </div>
          </ContextSection>

          <ContextSection title="Conversation scope" muted>
            <p className="text-[11px] text-ink-600 leading-relaxed">
              Only refrigerator &amp; dishwasher parts. Other appliances return a scope-limit response.
            </p>
          </ContextSection>
        </aside>
      </div>
    </div>
  );
}
