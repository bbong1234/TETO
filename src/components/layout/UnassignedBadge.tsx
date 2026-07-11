'use client';

interface UnassignedBadgeProps {
  count: number;
  className?: string;
}

export default function UnassignedBadge({ count, className = '' }: UnassignedBadgeProps) {
  if (count <= 0) return null;
  return (
    <span
      className={[
        'absolute flex min-w-[14px] h-[14px] items-center justify-center rounded-full bg-amber-500 px-0.5 text-[9px] font-bold text-white leading-none',
        className,
      ].join(' ')}
    >
      {count > 99 ? '99+' : count}
    </span>
  );
}
