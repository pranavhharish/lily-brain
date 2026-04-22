const STEPS = [
  { t: 'Ordered',          d: 'Apr 18', done: true,  active: false },
  { t: 'Packed',           d: 'Apr 19', done: true,  active: false },
  { t: 'Shipped',          d: 'Apr 20', done: true,  active: true  },
  { t: 'Out for delivery', d: 'Apr 22', done: false, active: false },
  { t: 'Delivered',        d: '—',      done: false, active: false },
];

export default function OrderTimeline() {
  return (
    <div>
      <p className="mb-2 text-[13.5px]">
        Order <strong className="font-mono">#83K-22910</strong> — on its way, arriving Wed Apr 22.
      </p>
      <div className="bg-[#fefcf6] border border-ink-200 rounded-[10px] p-3">
        {STEPS.map((s, i) => (
          <div key={i} className="flex gap-2.5 items-start" style={{ paddingBottom: i < STEPS.length - 1 ? 8 : 0 }}>
            <div className="flex flex-col items-center">
              <div
                className="w-3.5 h-3.5 rounded-full border-2 flex-shrink-0"
                style={{
                  background: s.done ? '#175f5d' : '#fff',
                  borderColor: s.done ? '#175f5d' : '#c4bda9',
                  boxShadow: s.active ? '0 0 0 3px #175f5d33' : 'none',
                }}
              />
              {i < STEPS.length - 1 && (
                <div
                  className="w-0.5 flex-1 mt-0.5"
                  style={{
                    minHeight: 16,
                    background: s.done ? '#175f5d' : '#e4dfd2',
                  }}
                />
              )}
            </div>
            <div className="flex-1 pb-1.5">
              <div
                className="text-[12.5px]"
                style={{
                  fontWeight: s.active ? 600 : 500,
                  color: s.done ? '#191714' : '#7a7263',
                }}
              >
                {s.t}
              </div>
              <div className="text-[10.5px] text-ink-500 font-mono">{s.d}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
