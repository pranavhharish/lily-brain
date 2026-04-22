type IconProps = { size?: number; className?: string };

export function IconSend({ size = 16, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M2 8l12-5-5 12-2-5-5-2z" />
    </svg>
  );
}

export function IconCart({ size = 16, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M2 2h2l1.3 8.3a1.5 1.5 0 001.5 1.2h5.5a1.5 1.5 0 001.5-1.1L15 5H5" />
      <circle cx="6.5" cy="14" r="1" />
      <circle cx="12.5" cy="14" r="1" />
    </svg>
  );
}

export function IconCheck({ size = 14, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M2 7.5L5.5 11L12 4" />
    </svg>
  );
}

export function IconBox({ size = 14, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M1.5 3.8L7 1l5.5 2.8v6.4L7 13 1.5 10.2V3.8z" />
      <path d="M1.5 3.8L7 6.5l5.5-2.7M7 6.5V13" />
    </svg>
  );
}

export function IconTools({ size = 14, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M10 1.5a2.5 2.5 0 013 3l-2 .5L10 4l.5-1-2.5 2.5M2 12l3.5-3.5M5.5 8.5l4 4-1.5 1.5-4-4zM1 13l1-1" />
    </svg>
  );
}

export function IconSearch({ size = 14, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="6" cy="6" r="4" />
      <path d="M12.5 12.5L9 9" />
    </svg>
  );
}

export function IconSparkle({ size = 14, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" strokeLinecap="round" className={className}>
      <path d="M7 1.5l1.3 3.2L11.5 6 8.3 7.3 7 10.5 5.7 7.3 2.5 6l3.2-1.3L7 1.5z" />
      <path d="M11.5 10.5l.5 1.2L13 12l-1 .5-.5 1-.5-1-1-.3 1-.2.5-1.5z" />
    </svg>
  );
}

export function IconClose({ size = 14, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className={className}>
      <path d="M3 3l8 8M11 3l-8 8" />
    </svg>
  );
}

export function IconPlus({ size = 14, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" className={className}>
      <path d="M7 2v10M2 7h10" />
    </svg>
  );
}

export function IconUser({ size = 14, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="7" cy="5" r="2.5" />
      <path d="M2 13c.5-2.5 2.7-4 5-4s4.5 1.5 5 4" />
    </svg>
  );
}

export function IconArrow({ size = 12, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M2 6h8M7 2l4 4-4 4" />
    </svg>
  );
}

export function IconImage({ size = 16, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect x="2" y="3" width="12" height="10" rx="1.5" />
      <circle cx="6" cy="7" r="1.2" />
      <path d="M2.5 12l4-3.5 3 2.5 2-1.5 2 2" />
    </svg>
  );
}

export function IconMic({ size = 16, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect x="6" y="2" width="4" height="8" rx="2" />
      <path d="M3.5 8a4.5 4.5 0 009 0M8 12.5V14" />
    </svg>
  );
}
