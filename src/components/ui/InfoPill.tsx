import React from 'react';

export function InfoPill({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-[2rem] border border-zinc-200 bg-zinc-50 p-3">
      <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-zinc-400">{label}</p>
      <p className="mt-2 text-lg font-black tracking-tight text-zinc-950">{value}</p>
    </div>
  );
}
