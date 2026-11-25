import { useMemo, useState } from 'react';
import {
  AlertCircle,
  Check,
  Copy,
  Download,
  Edit3,
  FileCheck2,
  FileSpreadsheet,
  Paperclip,
  RotateCcw,
  Search,
} from 'lucide-react';
import type { CobrancaRecord, StatusHorimetro } from '../types/cobranca';
import {
  exportRecordsToCsv,
  exportRecordsToXlsx,
  formatRecordsAsTsv,
} from '../utils/spreadsheet';
import { StatusIndicator } from './StatusIndicator';

interface FaturamentoViewProps {
  records: CobrancaRecord[];
  onBulkStatus: (ids: string[], status: StatusHorimetro) => Promise<void>;
  onPatchRecord: (id: string, patch: Partial<CobrancaRecord>) => Promise<void>;
  onOpenDrawer: (record: CobrancaRecord) => void;
}

export function FaturamentoView({
  records,
  onBulkStatus,
  onPatchRecord,
  onOpenDrawer,
}: FaturamentoViewProps) {
  const [statusFilter, setStatusFilter] = useState<'Coletado' | 'Faturado' | 'Todos'>('Coletado');
  const [empresaFilter, setEmpresaFilter] = useState<string>('Todas');
  const [mesFilter, setMesFilter] = useState<string>('Todos');
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [copiedNotice, setCopiedNotice] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [actionError, setActionError] = useState('');

  const empresas = useMemo(() => {
    const set = new Set(records.map((r) => r.empresa).filter(Boolean));
    return ['Todas', ...Array.from(set).sort()];
  }, [records]);

  const meses = useMemo(() => {
    const set = new Set(records.map((r) => r.mesRef).filter(Boolean));
    return ['Todos', ...Array.from(set)];
  }, [records]);

  const counts = useMemo(() => {
    let coletado = 0;
    let faturado = 0;
    for (const r of records) {
      if (r.status === 'Coletado') coletado++;
      if (r.status === 'Faturado') faturado++;
    }
    return { coletado, faturado, todos: coletado + faturado };
  }, [records]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return records.filter((r) => {
      if (statusFilter === 'Todos') {
        if (r.status === 'Pendente' || r.status === 'Sem Retorno') return false;
      } else if (r.status !== statusFilter) {
        return false;
      }

      if (empresaFilter !== 'Todas' && r.empresa !== empresaFilter) return false;
      if (mesFilter !== 'Todos' && r.mesRef !== mesFilter) return false;

      if (!q) return true;
      return (
        r.cliente.toLowerCase().includes(q) ||
        r.numeroFicha.toLowerCase().includes(q) ||
        r.patrimonio.toLowerCase().includes(q) ||
        r.horimetro.toLowerCase().includes(q) ||
        r.empresa.toLowerCase().includes(q)
      );
    });
  }, [records, statusFilter, empresaFilter, mesFilter, search]);

  const visibleIds = useMemo(() => filtered.map((r) => r.id), [filtered]);
  const allVisibleSelected =
    visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id));

  const toggleSelectAll = () => {
    if (allVisibleSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(visibleIds));
    }
  };

  const toggleOne = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const targetRecordsForExport = useMemo(() => {
    if (selectedIds.size > 0) {
      return filtered.filter((r) => selectedIds.has(r.id));
    }
    return filtered;
  }, [filtered, selectedIds]);

  const handleBulkFaturar = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    setProcessing(true);
    setActionError('');
    try {
      await onBulkStatus(ids, 'Faturado');
      setSelectedIds(new Set());
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Erro ao faturar selecionados.');
    } finally {
      setProcessing(false);
    }
  };

  const handleSingleStatus = async (recId: string, nextStatus: StatusHorimetro) => {
    setActionError('');
    try {
      await onPatchRecord(recId, { status: nextStatus });
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Erro ao atualizar status.');
    }
  };

  const handleCopyTsv = async () => {
    if (targetRecordsForExport.length === 0) return;
    const tsv = formatRecordsAsTsv(targetRecordsForExport);
    await navigator.clipboard.writeText(tsv);
    setCopiedNotice(true);
    setTimeout(() => setCopiedNotice(false), 2500);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-[#10203A]">
            Recebimento · Conferência e Faturamento
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Confira os registros coletados pela Recepção, marque como Faturado e exporte a planilha pronta para cobrança.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={targetRecordsForExport.length === 0}
            onClick={handleCopyTsv}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40 whitespace-nowrap"
          >
            {copiedNotice ? (
              <>
                <Check className="h-3.5 w-3.5 text-emerald-700" aria-hidden="true" />
                Copiado p/ Excel
              </>
            ) : (
              <>
                <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                Copiar Tabela
              </>
            )}
          </button>

          <button
            type="button"
            disabled={targetRecordsForExport.length === 0}
            onClick={() =>
              exportRecordsToCsv(
                targetRecordsForExport,
                `horix_faturamento_${statusFilter.toLowerCase()}.csv`
              )
            }
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40 whitespace-nowrap"
          >
            <Download className="h-3.5 w-3.5" aria-hidden="true" />
            Exportar CSV
          </button>

          <button
            type="button"
            disabled={targetRecordsForExport.length === 0}
            onClick={() =>
              exportRecordsToXlsx(
                targetRecordsForExport,
                `horix_faturamento_${statusFilter.toLowerCase()}.xlsx`
              )
            }
            className="inline-flex items-center gap-1.5 rounded-md bg-[#10203A] px-3.5 py-2 text-xs font-medium text-white hover:bg-[#193056] disabled:opacity-40 whitespace-nowrap"
          >
            <FileSpreadsheet className="h-3.5 w-3.5 text-[#F4C430]" aria-hidden="true" />
            Exportar Planilha (.xlsx)
          </button>
        </div>
      </div>

      {/* Filters & Bulk Actions */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex items-center gap-1 rounded-md bg-slate-100 p-1">
            <button
              type="button"
              onClick={() => {
                setStatusFilter('Coletado');
                setSelectedIds(new Set());
              }}
              className={`rounded px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap tabular-nums ${
                statusFilter === 'Coletado'
                  ? 'bg-[#10203A] text-white shadow-xs'
                  : 'text-slate-600 hover:text-[#10203A]'
              }`}
            >
              Prontos p/ Faturar ({counts.coletado})
            </button>
            <button
              type="button"
              onClick={() => {
                setStatusFilter('Faturado');
                setSelectedIds(new Set());
              }}
              className={`rounded px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap tabular-nums ${
                statusFilter === 'Faturado'
                  ? 'bg-[#10203A] text-white shadow-xs'
                  : 'text-slate-600 hover:text-[#10203A]'
              }`}
            >
              Já Faturados ({counts.faturado})
            </button>
            <button
              type="button"
              onClick={() => {
                setStatusFilter('Todos');
                setSelectedIds(new Set());
              }}
              className={`rounded px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap tabular-nums ${
                statusFilter === 'Todos'
                  ? 'bg-[#10203A] text-white shadow-xs'
                  : 'text-slate-600 hover:text-[#10203A]'
              }`}
            >
              Todos ({counts.todos})
            </button>
          </div>

          <select
            value={empresaFilter}
            onChange={(e) => setEmpresaFilter(e.target.value)}
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700"
            aria-label="Filtrar por empresa"
          >
            {empresas.map((emp) => (
              <option key={emp} value={emp}>
                {emp === 'Todas' ? 'Todas as empresas' : emp}
              </option>
            ))}
          </select>

          <select
            value={mesFilter}
            onChange={(e) => setMesFilter(e.target.value)}
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium capitalize text-slate-700"
            aria-label="Filtrar por mês"
          >
            {meses.map((m) => (
              <option key={m} value={m}>
                {m === 'Todos' ? 'Todos os meses' : m}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {selectedIds.size > 0 && statusFilter !== 'Faturado' && (
            <button
              type="button"
              disabled={processing}
              onClick={handleBulkFaturar}
              className="inline-flex items-center gap-1.5 rounded-md bg-[#F4C430] px-3.5 py-1.5 text-xs font-semibold text-[#10203A] hover:bg-[#e5b522] disabled:opacity-50 whitespace-nowrap"
            >
              <FileCheck2 className="h-3.5 w-3.5" aria-hidden="true" />
              Faturar Selecionados ({selectedIds.size})
            </button>
          )}

          <div className="relative w-64">
            <Search
              className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400"
              aria-hidden="true"
            />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar ficha, cliente, patrimônio..."
              className="w-full rounded-md border border-slate-300 bg-white py-1.5 pl-9 pr-3 text-xs text-slate-900 placeholder:text-slate-400 focus:border-[#10203A] focus:outline-none focus:ring-2 focus:ring-[#10203A]/15"
            />
          </div>
        </div>
      </div>

      {actionError && (
        <div className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-4 py-2.5 text-xs font-medium text-red-800">
          <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{actionError}</span>
        </div>
      )}

      {/* Billing Grid */}
      <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
        {filtered.length === 0 ? (
          <div className="px-6 py-14 text-center">
            <p className="text-sm font-medium text-slate-900">
              {statusFilter === 'Coletado'
                ? 'Nenhum registro coletado aguardando faturamento'
                : 'Nenhum registro encontrado nesta visão'}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {statusFilter === 'Coletado'
                ? 'Assim que a Recepção concluir as ligações e mudar o status para Coletado, os itens aparecerão aqui automaticamente.'
                : 'Ajuste os filtros acima para visualizar outros períodos ou empresas.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-xs">
              <thead className="bg-[#10203A] text-white border-b border-slate-200">
                <tr>
                  <th className="w-9 px-3 py-2.5">
                    <input
                      type="checkbox"
                      checked={allVisibleSelected}
                      onChange={toggleSelectAll}
                      aria-label="Selecionar todos visíveis"
                      className="h-3.5 w-3.5 rounded border-slate-300 accent-[#F4C430]"
                    />
                  </th>
                  <th className="px-2.5 py-2.5 font-semibold whitespace-nowrap">Status</th>
                  <th className="px-2.5 py-2.5 font-semibold whitespace-nowrap">Ref. / Período</th>
                  <th className="px-2.5 py-2.5 font-semibold whitespace-nowrap">Nº Ficha</th>
                  <th className="px-2.5 py-2.5 font-semibold min-w-[180px]">Cliente / Empresa</th>
                  <th className="px-2.5 py-2.5 font-semibold whitespace-nowrap">Patrimônio</th>
                  <th className="px-2.5 py-2.5 font-semibold whitespace-nowrap">Horímetro</th>
                  <th className="px-2.5 py-2.5 font-semibold whitespace-nowrap">Data Coleta</th>
                  <th className="px-2.5 py-2.5 font-semibold whitespace-nowrap">Contato</th>
                  <th className="px-2.5 py-2.5 font-semibold whitespace-nowrap text-center">Anexos</th>
                  <th className="px-2.5 py-2.5 font-semibold text-right whitespace-nowrap">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filtered.map((rec) => {
                  const checked = selectedIds.has(rec.id);
                  return (
                    <tr
                      key={rec.id}
                      className={`transition-colors ${
                        checked ? 'bg-amber-50/50' : 'hover:bg-slate-50/80'
                      }`}
                    >
                      <td className="px-3 py-2.5">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleOne(rec.id)}
                          aria-label={`Selecionar ficha ${rec.numeroFicha}`}
                          className="h-3.5 w-3.5 rounded border-slate-300 accent-[#10203A]"
                        />
                      </td>
                      <td className="px-2.5 py-2.5 whitespace-nowrap">
                        <StatusIndicator status={rec.status} />
                      </td>
                      <td className="px-2.5 py-2.5 whitespace-nowrap">
                        <div className="capitalize font-medium text-slate-700">
                          {rec.mesRef}/{rec.anoRef}
                        </div>
                        <div className="font-mono tabular-nums text-[11px] text-slate-500">
                          {rec.inicio || '—'} → {rec.fim || '—'}
                        </div>
                      </td>
                      <td className="px-2.5 py-2.5 font-mono font-semibold text-[#10203A] whitespace-nowrap">
                        {rec.numeroFicha}
                      </td>
                      <td className="px-2.5 py-2.5">
                        <div className="font-medium text-slate-900">{rec.cliente}</div>
                        <div className="text-[11px] text-slate-500">{rec.empresa}</div>
                      </td>
                      <td className="px-2.5 py-2.5 font-mono font-medium text-slate-900 whitespace-nowrap">
                        {rec.patrimonio || '—'}
                      </td>
                      <td className="px-2.5 py-2.5 font-mono font-semibold text-[#10203A] whitespace-nowrap">
                        {rec.horimetro || '—'}
                      </td>
                      <td className="px-2.5 py-2.5 font-mono text-slate-600 whitespace-nowrap">
                        {rec.dataColeta || '—'}
                      </td>
                      <td className="px-2.5 py-2.5 text-slate-600 whitespace-nowrap">
                        <div className="font-medium text-slate-800">{rec.nomeContato || '—'}</div>
                        <div className="font-mono text-[11px] text-slate-500">
                          {rec.telefoneContato}
                        </div>
                      </td>
                      <td className="px-2.5 py-2.5 text-center whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => onOpenDrawer(rec)}
                          className={`inline-flex items-center gap-1 rounded border px-2 py-1 text-[11px] font-medium transition-colors ${
                            (rec.anexos?.length || 0) > 0
                              ? 'border-[#10203A]/25 bg-slate-100 text-[#10203A] hover:bg-slate-200'
                              : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50'
                          }`}
                          title="Visualizar ou anexar foto do horímetro"
                        >
                          <Paperclip className="h-3 w-3" aria-hidden="true" />
                          <span className="font-mono tabular-nums">
                            {rec.anexos?.length || 0}
                          </span>
                        </button>
                      </td>
                      <td className="px-2.5 py-2.5 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          {rec.status === 'Coletado' ? (
                            <button
                              type="button"
                              onClick={() => handleSingleStatus(rec.id, 'Faturado')}
                              className="inline-flex items-center gap-1 rounded bg-emerald-700 px-2.5 py-1.5 text-[11px] font-medium text-white hover:bg-emerald-800 whitespace-nowrap"
                            >
                              <FileCheck2 className="h-3.5 w-3.5" aria-hidden="true" />
                              Faturar
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleSingleStatus(rec.id, 'Coletado')}
                              className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2.5 py-1.5 text-[11px] font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap"
                              title="Retornar para Coletado"
                            >
                              <RotateCcw className="h-3 w-3" aria-hidden="true" />
                              Estornar
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => onOpenDrawer(rec)}
                            className="rounded border border-slate-300 bg-white p-1.5 text-slate-600 hover:bg-slate-100"
                            title="Ver detalhes"
                          >
                            <Edit3 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
