'use client';

import { IconSend, IconImage, IconBox, IconTools } from '@/components/icons';

type MobileProps = {
  value: string;
  onChange: (v: string) => void;
  onSend: (text: string) => void;
};

export function MobileComposer({ value, onChange, onSend }: MobileProps) {
  return (
    <div className="bg-ink-50 rounded-[14px] p-[8px_10px_8px_14px] border border-ink-200 flex items-center gap-2">
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && onSend(value)}
        placeholder="Ask about parts, symptoms, or orders…"
        className="flex-1 border-none outline-none bg-transparent text-[13.5px] font-sans text-ink-900 placeholder:text-ink-400 py-1"
      />
      <button
        onClick={() => onSend(value)}
        className="bg-teal-700 text-white border-none w-[30px] h-[30px] rounded-[8px] flex items-center justify-center cursor-pointer hover:bg-teal-600 transition-colors flex-shrink-0"
      >
        <IconSend size={13} />
      </button>
    </div>
  );
}

export function DesktopComposer({ value, onChange, onSend }: MobileProps) {
  return (
    <div className="border border-ink-200 rounded-[12px] p-[10px_12px] bg-[#fefcf6] flex flex-col gap-2">
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && onSend(value)}
        placeholder="Reply to Parts Assistant…  try: 'find a water filter' or 'my ice maker is broken'"
        className="border-none outline-none bg-transparent text-[14px] font-sans text-ink-900 placeholder:text-ink-400 px-0.5"
      />
      <div className="flex items-center gap-2">
        <button className="bg-ink-50 border border-ink-200 text-ink-600 text-[11.5px] px-2.5 py-[5px] rounded-[6px] cursor-pointer font-sans inline-flex items-center gap-1.5 hover:bg-ink-100 transition-colors">
          <IconImage size={13} /> Photo
        </button>
        <button className="bg-ink-50 border border-ink-200 text-ink-600 text-[11.5px] px-2.5 py-[5px] rounded-[6px] cursor-pointer font-sans inline-flex items-center gap-1.5 hover:bg-ink-100 transition-colors">
          <IconBox size={13} /> Model #
        </button>
        <button className="bg-ink-50 border border-ink-200 text-ink-600 text-[11.5px] px-2.5 py-[5px] rounded-[6px] cursor-pointer font-sans inline-flex items-center gap-1.5 hover:bg-ink-100 transition-colors">
          <IconTools size={13} /> Part #
        </button>
        <span className="flex-1" />
        <span className="text-[11px] text-ink-400 font-mono">⏎ to send</span>
        <button
          onClick={() => onSend(value)}
          className="bg-teal-700 text-white border-none px-4 py-2 rounded-[8px] cursor-pointer text-[13px] font-semibold inline-flex items-center gap-1.5 hover:bg-teal-600 transition-colors"
        >
          Send <IconSend size={13} />
        </button>
      </div>
    </div>
  );
}
