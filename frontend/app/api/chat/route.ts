import { NextRequest, NextResponse } from 'next/server';
import { respond } from '@/lib/chat/intents';
import type { Message, Part } from '@/lib/chat/types';

const BACKEND_URL = process.env.FASTAPI_URL ?? 'http://localhost:8000';

interface BackendPart {
  ps_number: string;
  name: string;
  brand?: string | null;
  appliance_type?: string | null;
  price?: number | null;
  availability?: string | null;
  install_difficulty?: string | null;
  install_time?: string | null;
}

function mapBackendPart(p: BackendPart): Part {
  const installParts = [p.install_difficulty, p.install_time].filter(Boolean);
  const applianceLabel = p.appliance_type
    ? p.appliance_type.charAt(0).toUpperCase() + p.appliance_type.slice(1).toLowerCase() + ' part'
    : 'Compatible part';
  return {
    id: p.ps_number,
    name: p.name,
    brand: p.brand ?? '',
    price: p.price ?? 0,
    stock: p.availability ?? 'Check availability',
    install: installParts.length > 0 ? installParts.join(' · ') : 'See instructions',
    fit: applianceLabel,
    img: null,
  };
}

function parseSseToReplies(raw: string): Message[] {
  let text = '';
  const parts: Part[] = [];

  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('data:')) continue;
    try {
      const payload = JSON.parse(trimmed.slice(5).trim()) as {
        type: string;
        content?: string;
        data?: BackendPart;
        message?: string;
      };
      if (payload.type === 'token' && payload.content) {
        text += payload.content;
      } else if (payload.type === 'part_card' && payload.data) {
        parts.push(mapBackendPart(payload.data));
      } else if (payload.type === 'error') {
        return [{ role: 'assistant', kind: 'text', text: payload.message ?? 'An error occurred.' }];
      }
    } catch {
      // malformed SSE line — skip
    }
  }

  const replies: Message[] = [];
  if (text.trim()) {
    replies.push({ role: 'assistant', kind: 'text', text: text.trim() });
  }
  for (const part of parts) {
    replies.push({ role: 'assistant', kind: 'product', part });
  }
  if (replies.length === 0) {
    replies.push({ role: 'assistant', kind: 'text', text: 'No response received from the assistant.' });
  }
  return replies;
}

export async function POST(req: NextRequest) {
  const { message, session_id } = (await req.json()) as {
    message: string;
    session_id?: string;
    history: Message[];
  };

  // Scope guard — short-circuits before hitting the backend
  const scopeCheck = respond(message);
  const first = scopeCheck[0];
  if (first?.role === 'assistant' && first.kind === 'outofscope') {
    return NextResponse.json({ replies: scopeCheck });
  }

  try {
    const backendRes = await fetch(`${BACKEND_URL}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, session_id: session_id ?? 'default' }),
    });

    if (!backendRes.ok) {
      throw new Error(`Backend returned ${backendRes.status}`);
    }

    const rawText = await backendRes.text();
    const replies = parseSseToReplies(rawText);
    return NextResponse.json({ replies });
  } catch (err) {
    console.error('[chat route] backend error:', err);
    return NextResponse.json(
      {
        replies: [
          {
            role: 'assistant',
            kind: 'text',
            text: 'Something went wrong reaching the backend. Please try again.',
          },
        ],
      },
      { status: 502 },
    );
  }
}
