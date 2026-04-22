'use client';

type Props = {
  chips: string[];
  onChip: (chip: string) => void;
  desktop?: boolean;
};

export default function Chips({ chips, onChip, desktop }: Props) {
  const marginLeft = desktop ? 'ml-[38px]' : 'ml-8';
  const chipStyle = desktop
    ? 'bg-white border border-teal-700 text-teal-700 text-[12.5px] px-[13px] py-[7px] rounded-[16px] cursor-pointer font-medium font-sans hover:bg-teal-50 transition-colors'
    : 'bg-white border border-teal-700 text-teal-700 text-[12px] px-[11px] py-[6px] rounded-[14px] cursor-pointer font-medium font-sans hover:bg-teal-50 transition-colors';

  return (
    <div className={`flex flex-wrap gap-1.5 ${marginLeft}`}>
      {chips.map((c) => (
        <button key={c} onClick={() => onChip(c)} className={chipStyle}>
          {c}
        </button>
      ))}
    </div>
  );
}
