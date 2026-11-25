import { useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Edit3,
  Paperclip,
  Phone,
  PhoneMissed,
  Plus,
  Search,
  Sparkles,
  Upload,
} from 'lucide-react';
import type {
  ClientCatalogEntry,
  CobrancaRecord,
  StatusHorimetro,
  UserRole,
} from '../types/cobranca';
import { getRecordEquipmentItems } from '../utils/horimetro';

interface RecepcaoColetaViewProps {
  records: CobrancaRecord[];
  userRole: UserRole;
  catalogMap: Map<string, ClientCatalogEntry>;
  onPatchRecord: (id: string, patch: Partial<CobrancaRecord>) => Promise<void>;
  onOpenDrawer: (record: CobrancaRecord) => void;
  onGoToImport: () => void;
}

const MESES_ABREV = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

const STATUS_SELECT_STYLES: Record<StatusHorimetro, string> = {
  Pendente: 'border-amber-300 bg-amber-50 text-amber-900',
  'Sem Retorno': 'border-rose-300 bg-rose-50 text-rose-900',
  Coletado: 'border-blue-300 bg-blue-50 text-blue-900',
  Faturado: 'border-emerald-300 bg-emerald-50 text-emerald-900',
};

export function RecepcaoColetaView({
  records,
  userRole,
  catalogMap,
  onPatchRecord,
  onOpenDrawer,
  onGoToImport,
}: RecepcaoColetaViewProps) {
  const [statusFilter, setStatusFilter] = useState<'Pendente' | 'Sem Retorno' | 'Coletado' | 'Todos'>('Pendente');
  const [empresaFilter, setEmpresaFilter] = useState<string>('Todas');
  const [search, setSearch] = useState('');
  const [inlineDrafts, setInlineDrafts] = useState<Record<string, Partial<CobrancaRecord>>>({});
  const [savingRowId, setSavingRowId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<{ id: string; message: string } | null>(null);

  const canImport = userRole === 'Desenvolvedor' || userRole === 'Recebimento';

  const empresas = useMemo(() => {
    const set = new Set(records.map((r) => r.empresa).filter(Boolean));
    return ['Todas', ...Array.from(set).sort()];
  }, [records]);

  const counts = useMemo(() => {
    let pendente = 0;
    let semRetorno = 0;
    let coletado = 0;
    for (const r of records) {
      if (r.status === 'Pendente') pendente++;
      if (r.status === 'Sem Retorno') semRetorno++;
      if (r.status === 'Coletado') coletado++;
    }
    return { pendente, semRetorno, coletado, todos: pendente + semRetorno + coletado };
  }, [records]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return records.filter((r) => {
      if (statusFilter === 'Todos') {
        if (r.status === 'Faturado') return false;
      } else if (r.status !== statusFilter) {
        return false;
      }

      if (empresaFilter !== 'Todas' && r.empresa !== empresaFilter) return false;

      if (!q) return true;
      const items = getRecordEquipmentItems(r);
      return (
        r.cliente.toLowerCase().includes(q) ||
        r.numeroFicha.toLowerCase().includes(q) ||
        r.patrimonio.toLowerCase().includes(q) ||
        items.some((i) => i.patrimonio.toLowerCase().includes(q)) ||
        r.nomeContato.toLowerCase().includes(q) ||
        r.empresa.toLowerCase().includes(q)
      );
    });
  }, [records, statusFilter, empresaFilter, search]);

  const getFieldValue = (rec: CobrancaRecord, field: keyof CobrancaRecord): string => {
    const draft = inlineDrafts[rec.id];
    if (draft && draft[field] !== undefined) {
      return String(draft[field]);
    }
    return String(rec[field] ?? '');
  };

  const setFieldDraft = (id: string, field: keyof CobrancaRecord, value: string) => {
    setInlineDrafts((prev) => ({
      ...prev,
      [id]: { ...(prev[id] || {}), [field]: value },
    }));
  };

  const clearRecordDraft = (id: string, field?: keyof CobrancaRecord) => {
    setInlineDrafts((prev) => {
      const next = { ...prev };
      if (!next[id]) return prev;
      if (field) {
        const updated = { ...next[id] };
        delete updated[field];
        if (Object.keys(updated).length === 0) delete next[id];
        else next[id] = updated;
      } else {
        delete next[id];
      }
      return next;
    });
  };

  const collectDraftPatch = (rec: CobrancaRecord): Partial<CobrancaRecord> => {
    const pat = getFieldValue(rec, 'patrimonio').trim().toUpperCase();
    const hor = getFieldValue(rec, 'horimetro').trim();
    const dataCol = getFieldValue(rec, 'dataColeta').trim();
    const nome = getFieldValue(rec, 'nomeContato').trim().toUpperCase();
    const tel = getFieldValue(rec, 'telefoneContato').trim();

    const patch: Partial<CobrancaRecord> = {};
    if (pat !== rec.patrimonio) patch.patrimonio = pat;
    if (hor !== rec.horimetro) patch.horimetro = hor;
    if (dataCol !== rec.dataColeta) patch.dataColeta = dataCol;
    if (nome !== rec.nomeContato) patch.nomeContato = nome;
    if (tel !== rec.telefoneContato) patch.telefoneContato = tel;
    return patch;
  };

  const commitField = async (rec: CobrancaRecord, field: keyof CobrancaRecord) => {
    const draft = inlineDrafts[rec.id];
    if (!draft || draft[field] === undefined) return;
    let val = String(draft[field]).trim();
    if (field === 'patrimonio' || field === 'nomeContato') {
      val = val.toUpperCase();
    }
    if (val === String(rec[field] ?? '')) {
      clearRecordDraft(rec.id, field);
      return;
    }

    try {
      setRowError(null);
      await onPatchRecord(rec.id, { [field]: val });
      clearRecordDraft(rec.id, field);
    } catch (err) {
      setRowError({
        id: rec.id,
        message: err instanceof Error ? err.message : 'Erro ao salvar campo.',
      });
    }
  };

  const handleApplySuggestion = async (rec: CobrancaRecord, suggestion: ClientCatalogEntry) => {
    const patch: Partial<CobrancaRecord> = {};
    if (!getFieldValue(rec, 'patrimonio').trim() && suggestion.ultimoPatrimonio) {
      patch.patrimonio = suggestion.ultimoPatrimonio;
    }
    if (!getFieldValue(rec, 'nomeContato').trim() && suggestion.ultimoNomeContato) {
      patch.nomeContato = suggestion.ultimoNomeContato;
    }
    if (!getFieldValue(rec, 'telefoneContato').trim() && suggestion.ultimoTelefoneContato) {
      patch.telefoneContato = suggestion.ultimoTelefoneContato;
    }
    if (!rec.emailContato && suggestion.ultimoEmailContato) {
      patch.emailContato = suggestion.ultimoEmailContato;
    }
    if (Object.keys(patch).length > 0) {
      setSavingRowId(rec.id);
      setRowError(null);
      try {
        await onPatchRecord(rec.id, patch);
        clearRecordDraft(rec.id);
      } catch (err) {
        setRowError({
          id: rec.id,
          message: err instanceof Error ? err.message : 'Erro ao aplicar sugestão.',
        });
      } finally {
        setSavingRowId(null);
      }
    }
  };

  const handleStatusChange = async (rec: CobrancaRecord, nextStatus: StatusHorimetro) => {
    if (nextStatus === rec.status) return;

    const items = getRecordEquipmentItems(rec);
    const hasMulti = items.length > 1;
    const pat = getFieldValue(rec, 'patrimonio').trim().toUpperCase();
    const hor = getFieldValue(rec, 'horimetro').trim();
    const dataCol = getFieldValue(rec, 'dataColeta').trim();

    if (nextStatus === 'Coletado') {
      if (hasMulti) {
        const incomplete = items.some((i) => !i.patrimonio.trim() || !i.horimetro.trim());
        if (incomplete) {
          setRowError({
            id: rec.id,
            message: `Ficha ${rec.numeroFicha}: preencha Patrimônio e Horímetro de todos os equipamentos antes de marcar como Coletado.`,
          });
          onOpenDrawer(rec);
          return;
        }
      } else if (!pat || !hor) {
        setRowError({
          id: rec.id,
          message: `Ficha ${rec.numeroFicha}: preencha Patrimônio e Horímetro antes de mudar para Coletado.`,
        });
        onOpenDrawer(rec);
        return;
      }
    }

    setRowError(null);
    setSavingRowId(rec.id);
    try {
      const draftPatch = collectDraftPatch(rec);
      const now = new Date();
      const todayShort = `${String(now.getDate()).padStart(2, '0')}/${MESES_ABREV[now.getMonth()]}`;

      await onPatchRecord(rec.id, {
        ...draftPatch,
        ...(nextStatus === 'Coletado' && !dataCol ? { dataColeta: todayShort } : {}),
        status: nextStatus,
      });
      clearRecordDraft(rec.id);
    } catch (err) {
      setRowError({
        id: rec.id,
        message: err instanceof Error ? err.message : 'Erro ao atualizar status.',
      });
    } finally {
      setSavingRowId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-[#10203A]">
            Recepção · Coleta de Patrimônio e Horímetro
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Preencha na grade conforme realiza as ligações. Altere o status diretamente na linha para Sem Retorno ou Coletado.
          </p>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex flex-wrap items-center gap-1 rounded-md bg-slate-100 p-1">
            <button
              type="button"
              onClick={() => setStatusFilter('Pendente')}
              className={`rounded px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap tabular-nums ${
                statusFilter === 'Pendente'
                  ? 'bg-[#10203A] text-white shadow-xs'
                  : 'text-slate-600 hover:text-[#10203A]'
              }`}
            >
              Pendentes ({counts.pendente})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('Sem Retorno')}
              className={`rounded px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap tabular-nums ${
                statusFilter === 'Sem Retorno'
                  ? 'bg-rose-700 text-white shadow-xs'
                  : 'text-slate-600 hover:text-rose-800'
              }`}
            >
              Sem Retorno ({counts.semRetorno})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('Coletado')}
              className={`rounded px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap tabular-nums ${
                statusFilter === 'Coletado'
                  ? 'bg-[#10203A] text-white shadow-xs'
                  : 'text-slate-600 hover:text-[#10203A]'
              }`}
            >
              Coletados ({counts.coletado})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('Todos')}
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
        </div>

        <div className="relative w-full sm:w-64">
          <Search
            className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400"
            aria-hidden="true"
          />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar cliente, ficha ou patrimônio..."
            className="w-full rounded-md border border-slate-300 bg-white py-1.5 pl-9 pr-3 text-xs text-slate-900 placeholder:text-slate-400 focus:border-[#10203A] focus:outline-none focus:ring-2 focus:ring-[#10203A]/15"
          />
        </div>
      </div>

      {rowError && (
        <div className="flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-4 py-2.5 text-xs font-medium text-amber-950">
          <AlertCircle className="h-4 w-4 text-amber-700 shrink-0" aria-hidden="true" />
          <span>{rowError.message}</span>
        </div>
      )}

      {/* High-Density Editable Grid fitted cleanly for browser viewports */}
      <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
        {records.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
            <p className="text-sm font-medium text-slate-900">
              Nenhum registro disponível para a Recepção
            </p>
            <p className="mt-1 max-w-md text-xs text-slate-500">
              Assim que o departamento de Recebimento subir a planilha semanal, os clientes aparecerão aqui para coleta.
            </p>
            {canImport && (
              <button
                type="button"
                onClick={onGoToImport}
                className="mt-4 inline-flex items-center gap-1.5 rounded-md bg-[#10203A] px-4 py-2 text-xs font-medium text-white hover:bg-[#193056]"
              >
                <Upload className="h-3.5 w-3.5" aria-hidden="true" />
                Ir para Importação do Recebimento
              </button>
            )}
          </div>
        ) : filtered.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-slate-500">
            Nenhum registro encontrado para os filtros atuais.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-xs">
              <thead className="bg-[#10203A] text-white border-b border-slate-200">
                <tr>
                  <th className="px-2.5 py-2.5 font-semibold whitespace-nowrap">Status</th>
                  <th className="px-2.5 py-2.5 font-semibold whitespace-nowrap">Período / Ficha</th>
                  <th className="px-2.5 py-2.5 font-semibold min-w-[175px]">Cliente / Empresa</th>
                  <th className="px-2 py-2.5 font-semibold w-24 whitespace-nowrap">Patrimônio</th>
                  <th className="px-2 py-2.5 font-semibold w-24 whitespace-nowrap">Horímetro</th>
                  <th className="px-2 py-2.5 font-semibold w-20 whitespace-nowrap">Data</th>
                  <th className="px-2 py-2.5 font-semibold w-40 whitespace-nowrap">Contato (Nome / Tel)</th>
                  <th className="px-2 py-2.5 font-semibold whitespace-nowrap text-center">Foto</th>
                  <th className="px-2.5 py-2.5 font-semibold text-right whitespace-nowrap">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filtered.map((rec) => {
                  const suggestion = catalogMap.get(rec.cliente.trim().toUpperCase());
                  const canSuggest =
                    Boolean(suggestion) &&
                    ((!rec.patrimonio && Boolean(suggestion?.ultimoPatrimonio)) ||
                      (!rec.telefoneContato && Boolean(suggestion?.ultimoTelefoneContato)));
                  const isSaving = savingRowId === rec.id;

                  return (
                    <tr
                      key={rec.id}
                      className={`hover:bg-slate-50/80 transition-colors ${
                        isSaving ? 'opacity-70' : ''
                      }`}
                    >
                      <td className="px-2.5 py-2 whitespace-nowrap">
                        <select
                          value={rec.status}
                          disabled={isSaving}
                          onChange={(e) =>
                            handleStatusChange(rec, e.target.value as StatusHorimetro)
                          }
                          aria-label={`Alterar status da ficha ${rec.numeroFicha}`}
                          className={`rounded border px-2 py-1 text-[11px] font-semibold focus:outline-none focus:ring-2 focus:ring-[#10203A]/20 ${
                            STATUS_SELECT_STYLES[rec.status]
                          }`}
                        >
                          <option value="Pendente">Pendente</option>
                          <option value="Sem Retorno">Sem Retorno</option>
                          <option value="Coletado">Coletado</option>
                        </select>
                      </td>

                      <td className="px-2.5 py-2 whitespace-nowrap">
                        <div className="font-mono font-semibold text-[#10203A]">
                          {rec.numeroFicha}
                        </div>
                        <div className="font-mono tabular-nums text-[10px] text-slate-500">
                          {rec.inicio || '—'} → {rec.fim || '—'}
                        </div>
                      </td>

                      <td className="px-2.5 py-2">
                        <div className="font-medium text-slate-900 leading-snug line-clamp-2">
                          {rec.cliente}
                        </div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500">
                          <span className="font-medium text-slate-600">{rec.empresa}</span>
                          <span aria-hidden="true">·</span>
                          <span className="capitalize">
                            {rec.mesRef} {rec.anoRef}
                          </span>
                          {canSuggest && suggestion && (
                            <button
                              type="button"
                              disabled={isSaving}
                              onClick={() => handleApplySuggestion(rec, suggestion)}
                              className="inline-flex items-center gap-0.5 rounded border border-amber-300 bg-[#FEF7DB] px-1.5 py-0.5 text-[10px] font-semibold text-[#10203A] hover:bg-[#FDE9A3]"
                              title={`Autocompletar com histórico (${suggestion.ultimoPatrimonio || 'contato'})`}
                            >
                              <Sparkles className="h-2.5 w-2.5" aria-hidden="true" />
                              Sugerir
                            </button>
                          )}
                        </div>
                      </td>

                      <td className="px-1.5 py-1.5">
                        {(() => {
                          const items = getRecordEquipmentItems(rec);
                          if (items.length > 1) {
                            return (
                              <button
                                type="button"
                                onClick={() => onOpenDrawer(rec)}
                                className="w-full rounded border border-[#10203A]/20 bg-slate-50 px-2 py-1 text-left font-mono text-[11px] font-semibold uppercase text-[#10203A] hover:bg-slate-100"
                                title="Clique para editar os patrimônios desta ficha"
                              >
                                {items.map((item, i) => (
                                  <div key={i} className="truncate">
                                    {item.patrimonio || '—'}
                                  </div>
                                ))}
                              </button>
                            );
                          }
                          return (
                            <div className="flex items-center gap-1">
                              <input
                                type="text"
                                value={getFieldValue(rec, 'patrimonio')}
                                onChange={(e) => setFieldDraft(rec.id, 'patrimonio', e.target.value)}
                                onBlur={() => commitField(rec, 'patrimonio')}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                                }}
                                placeholder="GG-216"
                                className="w-full rounded border border-slate-200 bg-white px-2 py-1.5 font-mono text-xs uppercase text-slate-900 placeholder:text-slate-300 focus:border-[#10203A] focus:outline-none"
                              />
                              <button
                                type="button"
                                onClick={() => onOpenDrawer(rec)}
                                className="rounded border border-slate-200 bg-slate-50 p-1 text-slate-600 hover:border-[#10203A] hover:bg-[#FEF7DB] hover:text-[#10203A] shrink-0"
                                title="Adicionar mais patrimônios nesta ficha"
                                aria-label={`Adicionar mais patrimônios na ficha ${rec.numeroFicha}`}
                              >
                                <Plus className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          );
                        })()}
                      </td>

                      <td className="px-1.5 py-1.5">
                        {(() => {
                          const items = getRecordEquipmentItems(rec);
                          if (items.length > 1) {
                            return (
                              <button
                                type="button"
                                onClick={() => onOpenDrawer(rec)}
                                className="w-full rounded border border-slate-200 bg-slate-50 px-2 py-1 text-left font-mono text-[11px] font-semibold text-slate-800 hover:bg-slate-100"
                                title="Clique para editar os horímetros desta ficha"
                              >
                                {items.map((item, i) => (
                                  <div key={i} className="truncate">
                                    {item.horimetro || '—'}
                                  </div>
                                ))}
                              </button>
                            );
                          }
                          return (
                            <input
                              type="text"
                              value={getFieldValue(rec, 'horimetro')}
                              onChange={(e) => setFieldDraft(rec.id, 'horimetro', e.target.value)}
                              onBlur={() => commitField(rec, 'horimetro')}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                              }}
                              placeholder="6330.6h"
                              className="w-full rounded border border-slate-200 bg-white px-2 py-1.5 font-mono text-xs text-slate-900 placeholder:text-slate-300 focus:border-[#10203A] focus:outline-none"
                            />
                          );
                        })()}
                      </td>

                      <td className="px-1.5 py-1.5">
                        <input
                          type="text"
                          value={getFieldValue(rec, 'dataColeta')}
                          onChange={(e) => setFieldDraft(rec.id, 'dataColeta', e.target.value)}
                          onBlur={() => commitField(rec, 'dataColeta')}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                          }}
                          placeholder="27/out"
                          className="w-full rounded border border-slate-200 bg-white px-2 py-1.5 font-mono text-xs text-slate-900 placeholder:text-slate-300 focus:border-[#10203A] focus:outline-none"
                        />
                      </td>

                      <td className="px-1.5 py-1.5">
                        <div className="space-y-1">
                          <input
                            type="text"
                            value={getFieldValue(rec, 'nomeContato')}
                            onChange={(e) => setFieldDraft(rec.id, 'nomeContato', e.target.value)}
                            onBlur={() => commitField(rec, 'nomeContato')}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                            }}
                            placeholder="Nome contato"
                            className="w-full rounded border border-slate-200 bg-white px-2 py-1 text-[11px] uppercase text-slate-900 placeholder:text-slate-300 focus:border-[#10203A] focus:outline-none"
                          />
                          <div className="flex items-center gap-1">
                            <input
                              type="text"
                              value={getFieldValue(rec, 'telefoneContato')}
                              onChange={(e) =>
                                setFieldDraft(rec.id, 'telefoneContato', e.target.value)
                              }
                              onBlur={() => commitField(rec, 'telefoneContato')}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                              }}
                              placeholder="(00)00000-0000"
                              className="w-full rounded border border-slate-200 bg-white px-2 py-1 font-mono text-[11px] text-slate-900 placeholder:text-slate-300 focus:border-[#10203A] focus:outline-none"
                            />
                            {rec.telefoneContato && (
                              <a
                                href={`tel:${rec.telefoneContato.replace(/\D/g, '')}`}
                                className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-[#10203A] shrink-0"
                                title="Ligar"
                              >
                                <Phone className="h-3 w-3" />
                              </a>
                            )}
                          </div>
                        </div>
                      </td>

                      <td className="px-2 py-2 text-center whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => onOpenDrawer(rec)}
                          className={`inline-flex items-center gap-1 rounded border px-2 py-1 text-[11px] font-medium transition-colors ${
                            (rec.anexos?.length || 0) > 0
                              ? 'border-[#10203A]/25 bg-slate-100 text-[#10203A] hover:bg-slate-200'
                              : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-800'
                          }`}
                          title="Anexar ou visualizar foto do horímetro"
                        >
                          <Paperclip className="h-3 w-3" aria-hidden="true" />
                          <span className="font-mono tabular-nums">
                            {rec.anexos?.length || 0}
                          </span>
                        </button>
                      </td>

                      <td className="px-2.5 py-2 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1">
                          {(rec.status === 'Pendente' || rec.status === 'Sem Retorno') && (
                            <>
                              {rec.status === 'Pendente' && (
                                <button
                                  type="button"
                                  disabled={isSaving}
                                  onClick={() => handleStatusChange(rec, 'Sem Retorno')}
                                  className="inline-flex items-center gap-1 rounded border border-rose-200 bg-rose-50 px-2 py-1.5 text-[11px] font-medium text-rose-800 hover:bg-rose-100 disabled:opacity-50 transition-colors whitespace-nowrap"
                                  title="Cliente não atendeu ou sem retorno"
                                >
                                  <PhoneMissed className="h-3 w-3" aria-hidden="true" />
                                  Sem Retorno
                                </button>
                              )}
                              <button
                                type="button"
                                disabled={isSaving}
                                onClick={() => handleStatusChange(rec, 'Coletado')}
                                className="inline-flex items-center gap-1 rounded bg-[#10203A] px-2.5 py-1.5 text-[11px] font-medium text-white hover:bg-[#193056] disabled:opacity-50 transition-colors whitespace-nowrap"
                                title="Concluir coleta e enviar para Faturamento"
                              >
                                <CheckCircle2 className="h-3 w-3 text-[#F4C430]" aria-hidden="true" />
                                Coletado
                              </button>
                            </>
                          )}
                          {rec.status === 'Coletado' && (
                            <button
                              type="button"
                              disabled={isSaving}
                              onClick={() => handleStatusChange(rec, 'Pendente')}
                              className="rounded border border-slate-300 bg-white px-2.5 py-1.5 text-[11px] font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap"
                            >
                              Reabrir
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => onOpenDrawer(rec)}
                            className="rounded border border-slate-300 bg-white p-1.5 text-slate-600 hover:bg-slate-100 hover:text-[#10203A]"
                            title="Editar todos os detalhes, anexar fotos e observações"
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
