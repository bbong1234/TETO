'use client';

interface WalletTotalAssetsBarProps {
  totalAssets: number;
}

export default function WalletTotalAssetsBar({ totalAssets }: WalletTotalAssetsBarProps) {
  return (
    <div className="rounded-2xl bg-gradient-to-r from-amber-500 to-orange-500 p-5 text-white shadow-sm">
      <p className="text-xs font-medium text-amber-100">总资产</p>
      <p className="mt-1 text-3xl font-bold tabular-nums">¥{totalAssets.toFixed(2)}</p>
      <p className="mt-2 text-[11px] text-amber-100/90">期初余额 + 收支流水自动计算</p>
    </div>
  );
}
