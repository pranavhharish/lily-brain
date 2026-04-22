type Props = {
  text: string;
  desktop?: boolean;
};

export default function UserBubble({ text, desktop }: Props) {
  if (desktop) {
    return (
      <div className="flex justify-end items-start gap-2.5">
        <div className="bg-ink-900 text-white p-[10px_14px] rounded-[10px] max-w-[76%] text-[14px] leading-[1.5]">
          {text}
        </div>
        <div className="w-7 h-7 rounded-full bg-ink-200 text-ink-700 flex items-center justify-center text-[10.5px] font-semibold flex-shrink-0">
          AR
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-end">
      <div className="bg-teal-700 text-white p-[8px_13px] rounded-[14px_14px_3px_14px] text-[13.5px] max-w-[82%]">
        {text}
      </div>
    </div>
  );
}
