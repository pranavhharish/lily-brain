import { IconSparkle } from '@/components/icons';

type Props = {
  children: React.ReactNode;
  desktop?: boolean;
};

export default function AssistantBubble({ children, desktop }: Props) {
  const avatarSize = desktop ? 'w-7 h-7 rounded-[14px]' : 'w-6 h-6 rounded-full';
  const iconSize = desktop ? 13 : 12;
  const bubbleRadius = desktop ? 'rounded-[10px]' : 'rounded-[14px_14px_14px_3px]';
  const bubblePadding = desktop ? 'p-[12px_16px]' : 'p-[10px_13px]';
  const textSize = desktop ? 'text-[14px] leading-[1.55]' : 'text-[13.5px] leading-[1.5]';

  return (
    <div className="flex gap-2 items-start">
      <div className={`${avatarSize} bg-teal-50 text-teal-700 flex items-center justify-center flex-shrink-0 ${desktop ? '' : 'mt-0.5'}`}>
        <IconSparkle size={iconSize} />
      </div>
      <div className={`bg-white ${bubblePadding} ${bubbleRadius} border border-ink-100 ${textSize} text-ink-800 ${desktop ? 'flex-1 min-w-0 max-w-[82%]' : 'max-w-[85%]'}`}>
        {children}
      </div>
    </div>
  );
}
