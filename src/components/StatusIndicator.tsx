import { CheckCircle2, Clock, FileCheck2, PhoneMissed } from 'lucide-react';
import type { StatusHorimetro } from '../types/cobranca';

interface StatusIndicatorProps {
  status: StatusHorimetro;
}

export function StatusIndicator({ status }: StatusIndicatorProps) {
  if (status === 'Faturado') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-800 whitespace-nowrap shrink-0">
        <FileCheck2 className="h-3.5 w-3.5 text-emerald-700" aria-hidden="true" />
        Faturado
      </span>
    );
  }

  if (status === 'Coletado') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-md border border-blue-200 bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-800 whitespace-nowrap shrink-0">
        <CheckCircle2 className="h-3.5 w-3.5 text-blue-700" aria-hidden="true" />
        Coletado
      </span>
    );
  }

  if (status === 'Sem Retorno') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-md border border-rose-200 bg-rose-50 px-2 py-0.5 text-xs font-medium text-rose-800 whitespace-nowrap shrink-0">
        <PhoneMissed className="h-3.5 w-3.5 text-rose-700" aria-hidden="true" />
        Sem Retorno
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800 whitespace-nowrap shrink-0">
      <Clock className="h-3.5 w-3.5 text-amber-700" aria-hidden="true" />
      Pendente
    </span>
  );
}
