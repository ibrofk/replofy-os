import React from 'react';

export function MetricCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: string | number;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-[2rem] border border-zinc-200 bg-zinc-50 p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-zinc-400">{label}</p>
        <div className="text-zinc-500">{icon}</div>
      </div>
      <p className="mt-3 text-2xl font-black tracking-tight text-zinc-950">{value}</p>
    </div>
  );
}
