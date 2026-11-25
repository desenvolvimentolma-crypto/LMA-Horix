import { useMemo, useState } from 'react';
import { History, Paperclip, Search, X } from 'lucide-react';
import type { CobrancaRecord } from '../types/cobranca';
import {
  buildPatrimonioSummaries,
  compareRecordsNewestFirst,
  type PatrimonioSummary,
} from '../utils/horimetro';
import { StatusIndicator } from './StatusIndicator';

interface PesquisaViewProps {
  records: CobrancaRecord[];
  onOpenDrawer: (record: CobrancaRecord) => void;
}

export function PesquisaView({ records, onOpenDrawer }: PesquisaViewProps) {
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<'patrimonios' | 'fichas'>('patrimonios');
  const [onlyBilled, setOnlyBilled] = useState(true);
  const [historyTarget, setHistoryTarget] = useState<PatrimonioSummary | null>(null);

  const patrimonioSummaries = useMemo(() => buildPatrimonioSummaries(records), [records]);

  const billedRecords = useMemo(() => {
    const base = onlyBilled
      ? records.filter((r) => r.status === 'Faturado')
      : records;
    return [...base].sort(compareRecordsNewestFirst);
  }, [records, onlyBilled]);

  const filteredPatrimonios = useMemo(() => {
    const q = search.trim().toLowerCase();
    return patrimonioSummaries.filter((item) => {
      if (onlyBilled && !item.ultimoRegistroFaturado) return false;
      if (!q) return true;
      return (
        item.patrimonio.toLowerCase().includes(q) ||
        item.ultimoRegistroQualquer.cliente.toLowerCase().includes(q) ||
        item.ultimoRegistroQualquer.numeroFicha.toLowerCase().includes(q) ||
        item.historico.some(
          (h) =>
            h.cliente.toLowerCase().includes(q) ||
            h.numeroFicha.toLowerCase().includes(q)
        )
      );
    });
  }, [patrimonioSummaries, onlyBilled, search]);

  const filteredFichas = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return billedRecords;
    return billedRecords.filter(
      (r) =>
        r.cliente.toLowerCase().includes(q) ||
        r.numeroFicha.toLowerCase().includes(q) ||
        r.patrimonio.toLowerCase().includes(q) ||
        r.empresa.toLowerCase().includes(q)
    );
  }, [billedRecords, search]);

  const indicators = useMemo(() => {
    const withBilled = patrimonioSummaries.filter((p) => p.ultimoRegistroFaturado !== null);
    const activeClients = new Set(
      records.filter((r) => r.status === 'Faturado').map((r) => r.cliente.trim().toUpperCase())
    );
    const totalBilledReadings = records.filter(
      (r) => r.status === 'Faturado' && r.horimetro.trim() !== ''
    ).length;

    const mostRecentPat = [...withBilled].sort((a, b) =>
      compareRecordsNewestFirst(
        a.ultimoRegistroFaturado!,
        b.ultimoRegistroFaturado!
      )
    )[0];

    return {
      patrimoniosFaturados: withBilled.length,
      totalPatrimonios: patrimonioSummaries.length,
      clientesAtivos: activeClients.size,
      totalBilledReadings,
      mostRecentPat,
    };
  }, [patrimonioSummaries, records]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-[#10203A]">
          Pesquisa de Horímetros e Patrimônios
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Consulte rapidamente o último horímetro atualizado pelo faturamento por patrimônio, cliente ou nº da ficha.
        </p>
      </div>

      {/* Indicators Strip */}
      <div className="grid grid-cols-1 gap-px overflow-hidden rounded-lg border border-slate-200 bg-slate-200 sm:grid-cols-4">
        <div className="bg-white p-4">
          <div className="text-xs font-medium text-slate-500">Patrimônios Faturados</div>
          <div className="mt-1.5 text-2xl font-semibold font-mono tabular-nums text-[#10203A]">
            {indicators.patrimoniosFaturados}
          </div>
          <div className="mt-1 text-xs text-slate-500 tabular-nums">
            de {indicators.totalPatrimonios} cadastrados
          </div>
        </div>

        <div className="bg-white p-4">
          <div className="text-xs font-medium text-slate-500">Clientes com Faturamento</div>
          <div className="mt-1.5 text-2xl font-semibold font-mono tabular-nums text-[#10203A]">
            {indicators.clientesAtivos}
          </div>
          <div className="mt-1 text-xs text-slate-500">Com histórico semanal</div>
        </div>

        <div className="bg-white p-4">
          <div className="text-xs font-medium text-slate-500">Leituras Faturadas</div>
          <div className="mt-1.5 text-2xl font-semibold font-mono tabular-nums text-[#10203A]">
            {indicators.totalBilledReadings}
          </div>
          <div className="mt-1 text-xs text-slate-500">Registros concluídos</div>
        </div>

        <div className="bg-white p-4">
          <div className="text-xs font-medium text-slate-500">Atualização Mais Recente</div>
          <div className="mt-1.5 text-lg font-semibold font-mono tabular-nums text-[#10203A] truncate">
            {indicators.mostRecentPat
              ? `${indicators.mostRecentPat.patrimonio} · ${indicators.mostRecentPat.ultimoHorimetroTexto}`
              : '—'}
          </div>
          <div className="mt-1 text-xs text-slate-500 truncate">
            {indicators.mostRecentPat?.ultimoRegistroFaturado?.cliente || 'Sem faturamento ainda'}
          </div>
        </div>
      </div>

      {/* Search & Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex items-center gap-1 rounded-md bg-slate-100 p-1">
            <button
              type="button"
              onClick={() => setViewMode('patrimonios')}
              className={`rounded px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                viewMode === 'patrimonios'
                  ? 'bg-[#10203A] text-white'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Por Patrimônio (Último Horímetro)
            </button>
            <button
              type="button"
              onClick={() => setViewMode('fichas')}
              className={`rounded px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                viewMode === 'fichas'
                  ? 'bg-[#10203A] text-white'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Histórico por Cliente / Ficha
            </button>
          </div>

          <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={onlyBilled}
              onChange={(e) => setOnlyBilled(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-slate-300 text-[#10203A]"
            />
            Somente faturados
          </label>
        </div>

        <div className="relative w-full sm:w-80">
          <Search
            className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400"
            aria-hidden="true"
          />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Pesquisar cliente, nº ficha ou patrimônio..."
            className="w-full rounded-md border border-slate-300 bg-white py-1.5 pl-9 pr-3 text-xs text-slate-900 placeholder:text-slate-400 focus:border-[#10203A] focus:outline-none focus:ring-2 focus:ring-[#10203A]/15"
          />
        </div>
      </div>

      {/* Results Table */}
      <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
        {viewMode === 'patrimonios' ? (
          filteredPatrimonios.length === 0 ? (
            <div className="px-6 py-14 text-center text-sm text-slate-500">
              Nenhum patrimônio encontrado para os filtros selecionados.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-xs">
                <thead className="bg-slate-100 text-slate-700 border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-2.5 font-semibold whitespace-nowrap">Patrimônio</th>
                    <th className="px-4 py-2.5 font-semibold whitespace-nowrap">
                      Último Horímetro
                    </th>
                    <th className="px-4 py-2.5 font-semibold whitespace-nowrap">Status Base</th>
                    <th className="px-4 py-2.5 font-semibold whitespace-nowrap">Última Ficha</th>
                    <th className="px-4 py-2.5 font-semibold">Cliente Atual</th>
                    <th className="px-4 py-2.5 font-semibold whitespace-nowrap">Período / Coleta</th>
                    <th className="px-4 py-2.5 font-semibold text-right whitespace-nowrap">
                      Registros
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {filteredPatrimonios.map((item) => {
                    const refRec = item.ultimoRegistroFaturado || item.ultimoRegistroQualquer;
                    return (
                      <tr key={item.patrimonio} className="hover:bg-slate-50">
                        <td className="px-4 py-2.5 font-mono font-semibold text-[#10203A] whitespace-nowrap">
                          {item.patrimonio}
                        </td>
                        <td className="px-4 py-2.5 font-mono text-sm font-bold text-[#10203A] whitespace-nowrap">
                          {item.ultimoHorimetroTexto}
                        </td>
                        <td className="px-4 py-2.5 whitespace-nowrap">
                          <StatusIndicator status={refRec.status} />
                        </td>
                        <td className="px-4 py-2.5 font-mono text-slate-800 whitespace-nowrap">
                          {refRec.numeroFicha}
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="font-medium text-slate-900">{refRec.cliente}</div>
                          <div className="text-[11px] text-slate-500">{refRec.empresa}</div>
                        </td>
                        <td className="px-4 py-2.5 font-mono tabular-nums text-[11px] text-slate-600 whitespace-nowrap">
                          {refRec.inicio || '—'} → {refRec.fim || '—'}
                          {refRec.dataColeta ? ` (${refRec.dataColeta})` : ''}
                        </td>
                        <td className="px-4 py-2.5 text-right whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => setHistoryTarget(item)}
                            className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-800 hover:bg-slate-50"
                          >
                            <History className="h-3.5 w-3.5" aria-hidden="true" />
                            Histórico ({item.historico.length})
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )
        ) : filteredFichas.length === 0 ? (
          <div className="px-6 py-14 text-center text-sm text-slate-500">
            Nenhuma ficha encontrada para os filtros selecionados.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-xs">
              <thead className="bg-slate-100 text-slate-700 border-b border-slate-200">
                <tr>
                  <th className="px-3 py-2.5 font-semibold whitespace-nowrap">Status</th>
                  <th className="px-3 py-2.5 font-semibold whitespace-nowrap">Ref.</th>
                  <th className="px-3 py-2.5 font-semibold whitespace-nowrap">Período</th>
                  <th className="px-3 py-2.5 font-semibold whitespace-nowrap">Nº Ficha</th>
                  <th className="px-3 py-2.5 font-semibold">Cliente</th>
                  <th className="px-3 py-2.5 font-semibold whitespace-nowrap">Patrimônio</th>
                  <th className="px-3 py-2.5 font-semibold whitespace-nowrap">Horímetro</th>
                  <th className="px-3 py-2.5 font-semibold whitespace-nowrap">Coleta</th>
                  <th className="px-3 py-2.5 font-semibold text-right whitespace-nowrap">Foto</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filteredFichas.map((rec) => (
                  <tr key={rec.id} className="hover:bg-slate-50">
                    <td className="px-3 py-2 whitespace-nowrap">
                      <StatusIndicator status={rec.status} />
                    </td>
                    <td className="px-3 py-2 capitalize text-slate-600 whitespace-nowrap">
                      {rec.mesRef} {rec.anoRef}
                    </td>
                    <td className="px-3 py-2 font-mono tabular-nums text-[11px] text-slate-600 whitespace-nowrap">
                      {rec.inicio || '—'} → {rec.fim || '—'}
                    </td>
                    <td className="px-3 py-2 font-mono font-medium text-slate-900 whitespace-nowrap">
                      {rec.numeroFicha}
                    </td>
                    <td className="px-3 py-2">
                      <div className="font-medium text-slate-900">{rec.cliente}</div>
                      <div className="text-[11px] text-slate-500">{rec.empresa}</div>
                    </td>
                    <td className="px-3 py-2 font-mono font-semibold text-[#10203A] whitespace-nowrap">
                      {rec.patrimonio || '—'}
                    </td>
                    <td className="px-3 py-2 font-mono font-bold text-[#10203A] whitespace-nowrap">
                      {rec.horimetro || '—'}
                    </td>
                    <td className="px-3 py-2 font-mono text-slate-600 whitespace-nowrap">
                      {rec.dataColeta || '—'}
                    </td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => onOpenDrawer(rec)}
                        className="inline-flex items-center gap-1 rounded border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
                      >
                        <Paperclip className="h-3 w-3" aria-hidden="true" />
                        {rec.anexos?.length || 0}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Patrimonio History Modal */}
      {historyTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-3xl rounded-lg border border-slate-200 bg-white shadow-xl overflow-hidden flex flex-col max-h-[85vh]">
            <div className="flex items-center justify-between border-b border-slate-200 bg-[#10203A] px-5 py-3.5 text-white">
              <div>
                <h2 className="text-sm font-semibold">
                  Histórico Semanal · Patrimônio {historyTarget.patrimonio}
                </h2>
                <p className="text-xs text-slate-300">
                  Último horímetro atualizado: {historyTarget.ultimoHorimetroTexto}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setHistoryTarget(null)}
                className="rounded p-1 text-slate-300 hover:bg-white/10 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="overflow-auto flex-1">
              <table className="w-full border-collapse text-left text-xs">
                <thead className="sticky top-0 bg-slate-100 text-slate-700 border-b border-slate-200">
                  <tr>
                    <th className="px-3 py-2.5 font-semibold">Status</th>
                    <th className="px-3 py-2.5 font-semibold">Período</th>
                    <th className="px-3 py-2.5 font-semibold">Nº Ficha</th>
                    <th className="px-3 py-2.5 font-semibold">Cliente</th>
                    <th className="px-3 py-2.5 font-semibold">Horímetro</th>
                    <th className="px-3 py-2.5 font-semibold text-right">Detalhes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {historyTarget.historico.map((h) => (
                    <tr key={h.id} className="hover:bg-slate-50">
                      <td className="px-3 py-2 whitespace-nowrap">
                        <StatusIndicator status={h.status} />
                      </td>
                      <td className="px-3 py-2 font-mono tabular-nums text-slate-700 whitespace-nowrap">
                        {h.inicio || '—'} → {h.fim || '—'}
                      </td>
                      <td className="px-3 py-2 font-mono font-medium text-slate-900 whitespace-nowrap">
                        {h.numeroFicha}
                      </td>
                      <td className="px-3 py-2 text-slate-800">{h.cliente}</td>
                      <td className="px-3 py-2 font-mono font-bold text-[#10203A] whitespace-nowrap">
                        {h.horimetro || '—'}
                      </td>
                      <td className="px-3 py-2 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => {
                            setHistoryTarget(null);
                            onOpenDrawer(h);
                          }}
                          className="rounded border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
                        >
                          Ver Ficha
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
