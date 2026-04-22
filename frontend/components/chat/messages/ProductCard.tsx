import type { Part } from '@/lib/chat/types';
import { IconCheck, IconCart } from '@/components/icons';

type Props = { part: Part };

function PartImagePlaceholder({ label }: { label: string }) {
  return (
    <div className="w-[60px] h-[60px] rounded-[6px] overflow-hidden bg-teal-50 relative flex-shrink-0 flex items-center justify-center">
      <svg width="100%" height="100%" className="absolute inset-0">
        <defs>
          <pattern id={`stripe-${label}`} width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="4" height="8" fill="#e4f1f0" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill={`url(#stripe-${label})`} />
      </svg>
      <span className="relative font-mono text-[8.5px] text-teal-700 text-center leading-tight px-1">{label}</span>
    </div>
  );
}

export default function ProductCard({ part }: Props) {
  const nameLower = (part.name ?? '').toLowerCase();
  const label = nameLower.includes('filter') ? 'filter' : nameLower.includes('pump') ? 'pump' : 'part';
  return (
    <div>
      <p className="mb-2 text-[13.5px]">Here&rsquo;s a compatible part:</p>
      <div className="border border-ink-200 rounded-[10px] overflow-hidden bg-[#fefcf6]">
        <div className="p-2.5 flex gap-2.5">
          <PartImagePlaceholder label={label} />
          <div className="flex-1 min-w-0">
            <div className="text-[10px] font-mono text-ink-500 tracking-[0.3px]">
              {part.brand} · {part.id}
            </div>
            <div className="text-[12.5px] font-semibold leading-tight mt-0.5 text-ink-900">
              {part.name}
            </div>
            <div className="mt-1 text-[10.5px] text-ok font-semibold inline-flex items-center gap-1">
              <IconCheck size={10} /> {part.fit}
            </div>
          </div>
        </div>
        <div className="px-2.5 py-2 border-t border-ink-100 bg-ink-50 flex items-center gap-2">
          <strong className="text-[14px]">${part.price.toFixed(2)}</strong>
          <span className="text-[10.5px] text-ok">{part.stock}</span>
          <span className="flex-1" />
          <button className="bg-teal-700 text-white border-none text-[11px] px-2.5 py-[5px] rounded-[5px] cursor-pointer font-semibold inline-flex items-center gap-1 hover:bg-teal-600 transition-colors">
            <IconCart size={11} /> Add
          </button>
        </div>
      </div>
    </div>
  );
}
