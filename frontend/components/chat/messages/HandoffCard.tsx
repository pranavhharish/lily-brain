import { IconUser } from '@/components/icons';

export default function HandoffCard() {
  return (
    <div>
      <p className="text-[13.5px]">
        Connecting you to a human technician. Average wait: <strong>2 min</strong>.
      </p>
      <div className="mt-2.5 p-2.5 bg-amber-50 rounded-[8px] text-[12px] text-amber-700 flex items-center gap-2">
        <IconUser size={14} />
        Taylor will join in a moment&hellip;
      </div>
    </div>
  );
}
