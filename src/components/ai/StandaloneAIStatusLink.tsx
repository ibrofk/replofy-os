import { useEffect, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { standaloneClient } from '../../services/standaloneClient';

type AIStatus = Awaited<ReturnType<typeof standaloneClient.getAIStatus>>;

function statusCopy(status: AIStatus | null) {
  if (!status) return { label: 'AI setup', detail: 'Check workspace activation' };
  if (status.active) return { label: 'AI active', detail: `${status.provider} · ${status.model}` };
  if (status.status === 'inactive_missing_provider_key') {
    return { label: 'AI setup', detail: 'Add a provider key' };
  }
  if (status.status === 'inactive_missing_model') {
    return { label: 'AI setup', detail: 'Select a model' };
  }
  return { label: 'AI unavailable', detail: 'Open AI settings' };
}

export function StandaloneAIStatusLink() {
  const [status, setStatus] = useState<AIStatus | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let mounted = true;
    void standaloneClient.getAIStatus()
      .then((nextStatus) => {
        if (mounted) setStatus(nextStatus);
      })
      .catch(() => {
        if (mounted) setStatus(null);
      })
      .finally(() => {
        if (mounted) setLoaded(true);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const copy = statusCopy(status);
  const destination = loaded && status?.active ? '/ai' : '/settings';

  return (
    <NavLink
      to={destination}
      title={`${copy.label}: ${copy.detail}`}
      className={({ isActive }) =>
        `inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-left transition ${
          isActive
            ? 'border-zinc-950 bg-zinc-950 text-white'
            : status?.active
              ? 'border-emerald-200 bg-emerald-50 text-emerald-900 hover:border-emerald-300'
              : 'border-amber-200 bg-amber-50 text-amber-900 hover:border-amber-300'
        }`
      }
      aria-label={`${copy.label}. ${copy.detail}`}
    >
      <Sparkles className={`h-4 w-4 shrink-0 ${status?.active ? 'text-emerald-600' : 'text-amber-700'}`} />
      <span className="hidden sm:block">
        <span className="block text-xs font-bold leading-4">{copy.label}</span>
        <span className={`block max-w-36 truncate text-[10px] leading-4 ${status?.active ? 'text-emerald-700' : 'text-amber-800'}`}>
          {copy.detail}
        </span>
      </span>
    </NavLink>
  );
}
