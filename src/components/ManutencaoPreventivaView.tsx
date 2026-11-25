import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  BellRing,
  CheckCircle2,
  Clock,
  Search,
  Settings2,
  Trash2,
  Wrench,
  X,
} from 'lucide-react';
import type { CobrancaRecord, PreventivePlan } from '../types/cobranca';
import { buildClientPlatforms, formatHorimetroHours } from '../utils/horimetro';

interface ManutencaoPreventivaViewProps {
  records: CobrancaRecord[];
  preventivePlans: PreventivePlan[];
  onSavePlan: (payload: {
    cliente: string;
    patrimonio: string;
    horimetroBase: number;
    proximaTroca: number;
    avisoAntecedenciaHoras: number;
    observacoes: string;
  }) => Promise<void>;
  onCompletePlan: (planId: string, horimetroRealizado: number) => Promise<void>;
  onDeletePlan: (planId: string) => Promise<void>;
}

type PreventiveStatus = 'Vencida' | 'Próxima' | 'Em Dia' | 'Sem Plano';

interface PlatformRow {
  cliente: string;
  patrimonio: string;
  empresa: string;
  horimetroFaturadoNumero: number | null;
  horimetroFaturadoTexto: string;
  dataReferencia: string;
  plan: PreventivePlan | null;
  preventiveStatus: PreventiveStatus;
  horasRestantes: number | null;
  progressoPercent: number | null;
}

export function ManutencaoPreventivaView({
  records,
  preventivePlans,
  onSavePlan,
  onCompletePlan,
  onDeletePlan,
}: ManutencaoPreventivaViewProps) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<
    'Todos' | 'Alertas' | 'Em Dia' | 'Sem Plano'
  >('Todos');
  const [editingTarget, setEditingTarget] = useState<PlatformRow | null>(null);

  const [formBase, setFormBase] = useState('');
  const [formProxima, setFormProxima] = useState('');
  const [formAviso, setFormAviso] = useState('10');
  const [formObs, setFormObs] = useState('');
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const rows = useMemo(() => {
    const platforms = buildClientPlatforms(records);
    const planMap = new Map<string, PreventivePlan>();
    for (const p of preventivePlans) {
      planMap.set(`${p.cliente.toUpperCase()}__${p.patrimonio.toUpperCase()}`, p);
    }

    const result: PlatformRow[] = platforms.map((item) => {
      const key = `${item.cliente.trim().toUpperCase()}__${item.patrimonio.trim().toUpperCase()}`;
      const plan = planMap.get(key) || null;
      const atual = item.horimetroFaturadoNumero;

      let preventiveStatus: PreventiveStatus = 'Sem Plano';
      let horasRestantes: number | null = null;
      let progressoPercent: number | null = null;

      if (plan) {
        if (atual !== null) {
          horasRestantes = Number((plan.proximaTroca - atual).toFixed(2));
          const span = Math.max(0.01, plan.proximaTroca - plan.horimetroBase);
          progressoPercent = Math.min(
            100,
            Math.max(0, Math.round(((atual - plan.horimetroBase) / span) * 100))
          );

          if (atual >= plan.proximaTroca) {
            preventiveStatus = 'Vencida';
          } else if (horasRestantes <= plan.avisoAntecedenciaHoras) {
            preventiveStatus = 'Próxima';
          } else {
            preventiveStatus = 'Em Dia';
          }
        } else {
          preventiveStatus = 'Em Dia';
        }
      }

      const refRec = item.ultimoFaturado || item.ultimoRegistro;
      return {
        cliente: item.cliente,
        patrimonio: item.patrimonio,
        empresa: item.empresa,
        horimetroFaturadoNumero: atual,
        horimetroFaturadoTexto: item.horimetroFaturadoTexto,
        dataReferencia: refRec.fim || refRec.inicio || refRec.dataColeta || '—',
        plan,
        preventiveStatus,
        horasRestantes,
        progressoPercent,
      };
    });

    // Include any standalone plans whose client/patrimonio isn't in records anymore
    for (const plan of preventivePlans) {
      const exists = result.some(
        (r) =>
          r.cliente.toUpperCase() === plan.cliente.toUpperCase() &&
          r.patrimonio.toUpperCase() === plan.patrimonio.toUpperCase()
      );
      if (!exists) {
        result.push({
          cliente: plan.cliente,
          patrimonio: plan.patrimonio,
          empresa: '—',
          horimetroFaturadoNumero: null,
          horimetroFaturadoTexto: '',
          dataReferencia: '—',
          plan,
          preventiveStatus: 'Em Dia',
          horasRestantes: null,
          progressoPercent: null,
        });
      }
    }

    return result;
  }, [records, preventivePlans]);

  const counts = useMemo(() => {
    let vencidas = 0;
    let proximas = 0;
    let emDia = 0;
    let semPlano = 0;
    for (const r of rows) {
      if (r.preventiveStatus === 'Vencida') vencidas++;
      else if (r.preventiveStatus === 'Próxima') proximas++;
      else if (r.preventiveStatus === 'Em Dia') emDia++;
      else semPlano++;
    }
    return {
      total: rows.length,
      alertas: vencidas + proximas,
      vencidas,
      proximas,
      emDia,
      semPlano,
    };
  }, [rows]);

  const alertRows = useMemo(
    () =>
      rows.filter(
        (r) => r.preventiveStatus === 'Vencida' || r.preventiveStatus === 'Próxima'
      ),
    [rows]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (statusFilter === 'Alertas') {
        if (r.preventiveStatus !== 'Vencida' && r.preventiveStatus !== 'Próxima') {
          return false;
        }
      } else if (statusFilter === 'Em Dia') {
        if (r.preventiveStatus !== 'Em Dia') return false;
      } else if (statusFilter === 'Sem Plano') {
        if (r.preventiveStatus !== 'Sem Plano') return false;
      }

      if (!q) return true;
      return (
        r.cliente.toLowerCase().includes(q) ||
        r.patrimonio.toLowerCase().includes(q) ||
        r.empresa.toLowerCase().includes(q)
      );
    });
  }, [rows, statusFilter, search]);

  const openConfigModal = (row: PlatformRow) => {
    setErrorMsg('');
    setEditingTarget(row);
    if (row.plan) {
      setFormBase(String(row.plan.horimetroBase));
      setFormProxima(String(row.plan.proximaTroca));
      setFormAviso(String(row.plan.avisoAntecedenciaHoras));
      setFormObs(row.plan.observacoes || '');
    } else {
      const baseVal = row.horimetroFaturadoNumero ?? 0;
      setFormBase(String(baseVal));
      setFormProxima(String(Number((baseVal + 250).toFixed(2))));
      setFormAviso('20');
      setFormObs('');
    }
  };

  const handleSaveModal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTarget) return;
    setErrorMsg('');
    const base = Number(formBase.replace(',', '.'));
    const prox = Number(formProxima.replace(',', '.'));
    const aviso = Number(formAviso.replace(',', '.'));

    if (!Number.isFinite(base) || !Number.isFinite(prox) || prox <= base) {
      setErrorMsg('A Próxima Troca deve ser maior que o Horímetro Base.');
      return;
    }

    setSaving(true);
    try {
      await onSavePlan({
        cliente: editingTarget.cliente,
        patrimonio: editingTarget.patrimonio,
        horimetroBase: base,
        proximaTroca: prox,
        avisoAntecedenciaHoras: Number.isFinite(aviso) && aviso >= 0 ? aviso : 10,
        observacoes: formObs.trim(),
      });
      setEditingTarget(null);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Erro ao salvar plano.');
    } finally {
      setSaving(false);
    }
  };

  const handleComplete = async (row: PlatformRow) => {
    if (!row.plan) return;
    const realizado = row.horimetroFaturadoNumero ?? row.plan.proximaTroca;
    await onCompletePlan(row.plan.id, realizado);
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-[#10203A]">
          Manutenção Preventiva · Controle por Horímetro Faturado
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Defina o horímetro base e a próxima troca de cada plataforma por cliente. O sistema compara automaticamente com o último horímetro faturado e notifica quando estiver próximo.
        </p>
      </div>

      {/* Active Proximity / Overdue Notifications */}
      {alertRows.length > 0 && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 space-y-2.5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-[#10203A]">
              <BellRing className="h-4 w-4 text-amber-700" aria-hidden="true" />
              Notificações de Manutenção Preventiva ({alertRows.length})
            </div>
            <button
              type="button"
              onClick={() => setStatusFilter('Alertas')}
              className="text-xs font-semibold text-[#10203A] underline hover:text-amber-900"
            >
              Filtrar somente alertas
            </button>
          </div>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            {alertRows.slice(0, 6).map((a) => (
              <div
                key={`${a.cliente}-${a.patrimonio}`}
                className={`flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-xs ${
                  a.preventiveStatus === 'Vencida'
                    ? 'border-red-200 bg-red-50 text-red-900'
                    : 'border-amber-200 bg-white text-slate-900'
                }`}
              >
                <div className="min-w-0">
                  <div className="font-semibold truncate">
                    {a.patrimonio} · {a.cliente}
                  </div>
                  <div className="mt-0.5 font-mono tabular-nums text-[11px]">
                    Atual: {a.horimetroFaturadoTexto || '—'} · Troca:{' '}
                    {formatHorimetroHours(a.plan!.proximaTroca)}
                  </div>
                </div>
                <span className="font-mono font-semibold whitespace-nowrap shrink-0">
                  {a.preventiveStatus === 'Vencida'
                    ? `Vencida (${Math.abs(a.horasRestantes ?? 0).toFixed(2)}h)`
                    : `Faltam ${(a.horasRestantes ?? 0).toFixed(2)}h`}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Summary Strip */}
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-slate-200 bg-slate-200 sm:grid-cols-4">
        <button
          type="button"
          onClick={() => setStatusFilter('Todos')}
          className="bg-white p-4 text-left hover:bg-slate-50"
        >
          <div className="text-xs font-medium text-slate-500">Plataformas / Clientes</div>
          <div className="mt-1.5 text-2xl font-semibold font-mono tabular-nums text-[#10203A]">
            {counts.total}
          </div>
        </button>

        <button
          type="button"
          onClick={() => setStatusFilter('Alertas')}
          className="bg-white p-4 text-left hover:bg-slate-50"
        >
          <div className="text-xs font-medium text-amber-800">Próximas / Vencidas</div>
          <div className="mt-1.5 text-2xl font-semibold font-mono tabular-nums text-red-700">
            {counts.alertas}
          </div>
        </button>

        <button
          type="button"
          onClick={() => setStatusFilter('Em Dia')}
          className="bg-white p-4 text-left hover:bg-slate-50"
        >
          <div className="text-xs font-medium text-emerald-800">Preventiva em Dia</div>
          <div className="mt-1.5 text-2xl font-semibold font-mono tabular-nums text-[#10203A]">
            {counts.emDia}
          </div>
        </button>

        <button
          type="button"
          onClick={() => setStatusFilter('Sem Plano')}
          className="bg-white p-4 text-left hover:bg-slate-50"
        >
          <div className="text-xs font-medium text-slate-500">Sem Base Configurada</div>
          <div className="mt-1.5 text-2xl font-semibold font-mono tabular-nums text-slate-700">
            {counts.semPlano}
          </div>
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3">
        <div className="inline-flex flex-wrap items-center gap-1 rounded-md bg-slate-100 p-1">
          {(['Todos', 'Alertas', 'Em Dia', 'Sem Plano'] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setStatusFilter(tab)}
              className={`rounded px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                statusFilter === tab
                  ? 'bg-[#10203A] text-white'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {tab}
            </button>
          ))}
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
            placeholder="Filtrar por cliente ou patrimônio..."
            className="w-full rounded-md border border-slate-300 bg-white py-1.5 pl-9 pr-3 text-xs text-slate-900 placeholder:text-slate-400 focus:border-[#10203A] focus:outline-none"
          />
        </div>
      </div>

      {/* Platforms Table */}
      <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
        {filtered.length === 0 ? (
          <div className="px-6 py-14 text-center text-sm text-slate-500">
            Nenhuma plataforma encontrada. As plataformas aparecem automaticamente conforme o Recebimento e a Recepção cadastram e faturam os patrimônios dos clientes.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-xs">
              <thead className="bg-slate-100 text-slate-700 border-b border-slate-200">
                <tr>
                  <th className="px-3 py-2.5 font-semibold whitespace-nowrap">Situação</th>
                  <th className="px-3 py-2.5 font-semibold">Cliente</th>
                  <th className="px-3 py-2.5 font-semibold whitespace-nowrap">Patrimônio</th>
                  <th className="px-3 py-2.5 font-semibold whitespace-nowrap">
                    Horímetro Faturado
                  </th>
                  <th className="px-3 py-2.5 font-semibold whitespace-nowrap">Horímetro Base</th>
                  <th className="px-3 py-2.5 font-semibold whitespace-nowrap">Próxima Troca</th>
                  <th className="px-3 py-2.5 font-semibold whitespace-nowrap">Restante</th>
                  <th className="px-3 py-2.5 font-semibold text-right whitespace-nowrap">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filtered.map((row) => (
                  <tr key={`${row.cliente}__${row.patrimonio}`} className="hover:bg-slate-50">
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      {row.preventiveStatus === 'Vencida' && (
                        <span className="inline-flex items-center gap-1 rounded-md border border-red-200 bg-red-50 px-2 py-0.5 text-xs font-medium text-red-800">
                          <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                          Vencida
                        </span>
                      )}
                      {row.preventiveStatus === 'Próxima' && (
                        <span className="inline-flex items-center gap-1 rounded-md border border-amber-300 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-900">
                          <BellRing className="h-3.5 w-3.5" aria-hidden="true" />
                          Próxima
                        </span>
                      )}
                      {row.preventiveStatus === 'Em Dia' && (
                        <span className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-800">
                          <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                          Em Dia
                        </span>
                      )}
                      {row.preventiveStatus === 'Sem Plano' && (
                        <span className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                          <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                          Sem Plano
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="font-medium text-slate-900">{row.cliente}</div>
                      <div className="text-[11px] text-slate-500">{row.empresa}</div>
                    </td>
                    <td className="px-3 py-2.5 font-mono font-semibold text-[#10203A] whitespace-nowrap">
                      {row.patrimonio}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      {row.horimetroFaturadoTexto ? (
                        <div>
                          <span className="font-mono font-bold text-[#10203A]">
                            {row.horimetroFaturadoTexto}
                          </span>
                          <div className="text-[10px] font-mono text-slate-500">
                            Ref: {row.dataReferencia}
                          </div>
                        </div>
                      ) : (
                        <span className="text-slate-400">Sem faturamento</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 font-mono tabular-nums text-slate-700 whitespace-nowrap">
                      {row.plan ? formatHorimetroHours(row.plan.horimetroBase) : '—'}
                    </td>
                    <td className="px-3 py-2.5 font-mono font-semibold tabular-nums text-[#10203A] whitespace-nowrap">
                      {row.plan ? formatHorimetroHours(row.plan.proximaTroca) : '—'}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      {row.horasRestantes !== null ? (
                        <div className="w-28 space-y-1">
                          <div
                            className={`font-mono text-[11px] font-semibold tabular-nums ${
                              row.horasRestantes <= 0
                                ? 'text-red-700'
                                : row.preventiveStatus === 'Próxima'
                                ? 'text-amber-800'
                                : 'text-emerald-800'
                            }`}
                          >
                            {row.horasRestantes <= 0
                              ? `${row.horasRestantes.toFixed(2)}h (passou)`
                              : `${row.horasRestantes.toFixed(2)}h`}
                          </div>
                          {row.progressoPercent !== null && (
                            <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
                              <div
                                className={`h-full ${
                                  row.preventiveStatus === 'Vencida'
                                    ? 'bg-red-600'
                                    : row.preventiveStatus === 'Próxima'
                                    ? 'bg-amber-500'
                                    : 'bg-emerald-600'
                                }`}
                                style={{ width: `${row.progressoPercent}%` }}
                              />
                            </div>
                          )}
                        </div>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1.5">
                        {row.plan && (
                          <button
                            type="button"
                            onClick={() => handleComplete(row)}
                            className="inline-flex items-center gap-1 rounded-md bg-emerald-700 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-emerald-800"
                            title="Registrar preventiva concluída e agendar próximo ciclo"
                          >
                            <Wrench className="h-3.5 w-3.5" aria-hidden="true" />
                            Preventiva Feita
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => openConfigModal(row)}
                          className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-800 hover:bg-slate-50"
                        >
                          <Settings2 className="h-3.5 w-3.5" aria-hidden="true" />
                          {row.plan ? 'Ajustar' : 'Definir Base'}
                        </button>
                        {row.plan && (
                          <button
                            type="button"
                            onClick={() => onDeletePlan(row.plan!.id)}
                            className="rounded-md border border-red-200 bg-white p-1.5 text-red-700 hover:bg-red-50"
                            title="Remover plano"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Config Modal */}
      {editingTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4"
          role="dialog"
          aria-modal="true"
        >
          <form
            onSubmit={handleSaveModal}
            className="w-full max-w-md rounded-lg border border-slate-200 bg-white shadow-xl overflow-hidden"
          >
            <div className="flex items-center justify-between border-b border-slate-200 bg-[#10203A] px-5 py-3.5 text-white">
              <div>
                <h2 className="text-sm font-semibold">
                  Plano de Manutenção · {editingTarget.patrimonio}
                </h2>
                <p className="text-xs text-slate-300 truncate">{editingTarget.cliente}</p>
              </div>
              <button
                type="button"
                onClick={() => setEditingTarget(null)}
                className="rounded p-1 text-slate-300 hover:bg-white/10 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {errorMsg && (
                <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
                  {errorMsg}
                </div>
              )}

              <div className="rounded-md bg-slate-50 border border-slate-200 px-3.5 py-2.5 text-xs text-slate-700">
                Último horímetro faturado:{' '}
                <span className="font-mono font-bold text-[#10203A]">
                  {editingTarget.horimetroFaturadoTexto || 'Ainda não faturado'}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Horímetro Base (h) *
                  </label>
                  <input
                    type="text"
                    required
                    value={formBase}
                    onChange={(e) => setFormBase(e.target.value)}
                    placeholder="Ex: 10.00"
                    className="w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Próxima Troca (h) *
                  </label>
                  <input
                    type="text"
                    required
                    value={formProxima}
                    onChange={(e) => setFormProxima(e.target.value)}
                    placeholder="Ex: 20.00"
                    className="w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-xs"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Notificar quando faltar até (horas)
                  </label>
                  <input
                    type="text"
                    required
                    value={formAviso}
                    onChange={(e) => setFormAviso(e.target.value)}
                    placeholder="Ex: 10"
                    className="w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-xs"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Observações da Preventiva
                  </label>
                  <textarea
                    rows={2}
                    value={formObs}
                    onChange={(e) => setFormObs(e.target.value)}
                    placeholder="Ex: Troca de óleo, filtro de ar e revisão de 250h"
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-xs"
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3">
              <button
                type="button"
                onClick={() => setEditingTarget(null)}
                className="rounded-md border border-slate-300 bg-white px-3.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={saving}
                className="rounded-md bg-[#F4C430] px-4 py-1.5 text-xs font-semibold text-[#10203A] hover:bg-[#e5b520] disabled:opacity-50"
              >
                {saving ? 'Salvando...' : 'Salvar Preventiva'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
