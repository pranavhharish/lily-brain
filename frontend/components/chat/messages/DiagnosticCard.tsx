const CAUSES = [
  { n: 1, t: 'Clogged water filter', p: 72 },
  { n: 2, t: 'Frozen fill tube',     p: 18 },
  { n: 3, t: 'Faulty inlet valve',   p: 10 },
];

export default function DiagnosticCard() {
  return (
    <div>
      <p className="mb-2 text-[13.5px]">Let&rsquo;s narrow it down. Most likely causes:</p>
      <div className="flex flex-col gap-[5px]">
        {CAUSES.map((c) => (
          <div
            key={c.n}
            className="flex items-center gap-2 px-2.5 py-[7px] bg-[#fefcf6] rounded-[6px] border border-ink-200 text-[12.5px]"
          >
            <span className="w-[18px] h-[18px] rounded-full bg-teal-50 text-teal-700 flex items-center justify-center text-[10.5px] font-semibold font-mono flex-shrink-0">
              {c.n}
            </span>
            <span className="flex-1">{c.t}</span>
            <span className="text-[11px] text-ink-500 font-mono">{c.p}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}
