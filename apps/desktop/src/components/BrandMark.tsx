import { useId } from "react";

/** Flux 品牌标识：蓝紫渐变漩涡，标题栏与登录页共用，保证视觉一致。 */
export function BrandMark({ size = 16 }: { size?: number }) {
  const gid = useId();
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--brand-mark-start)" />
          <stop offset="1" stopColor="var(--brand-mark-end)" />
        </linearGradient>
      </defs>
      <path
        d="M5 7c4-3 9-3 13 0M6 12c4-3 8-3 12 0M5 17c4-3 9-3 13 0"
        fill="none"
        stroke={`url(#${gid})`}
        strokeWidth="2"
        strokeLinecap="round"
      />
      <circle cx="12" cy="12" r="2" fill="var(--brand-mark-core)" />
    </svg>
  );
}
