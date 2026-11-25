import { useMemo, useState } from 'react';
import {
  ArrowRight,
  Edit3,
  Paperclip,
  Plus,
  Search,
  Upload,
} from 'lucide-react';
import type { CobrancaRecord, StatusHorimetro, UserRole, WorkspaceTab } from '../types/cobranca';
import { deriveMesAnoRef } from '../utils/spreadsheet';
import { StatusIndicator } from './StatusIndicator';

interface VisaoGeralViewProps {
  records: CobrancaRecord[];
  userRole: UserRole;
  onNavigate: (tab: WorkspaceTab) => void;
  onOpenDrawer: (record: CobrancaRecord) => void;
  onCreateManual: (payload: Partial<CobrancaRecord>) => Promise<void>;
}

export function VisaoGeralView({
  records,
  userRole,
  onNavigate,
  onOpenDrawer,
  onCreateManual,
}: VisaoGeralViewProps) {
  const [statusFilter, setStatusFilter] = useState<'Todos' | StatusHorimetro>('Todos');
  const [mesFilter, setMesFilter] = useState<string>('Todos');
  const [empresaFilter, setEmpresaFilter] = useState<string>('Todas');
  const [search, setSearch] = useState('');
  const [showNewModal, setShowNewModal] = useState(false);

  const [newInicio, setNewInicio] = useState('');
  const [newFim, setNewFim] = useState('');
  const [newFicha, setNewFicha] = useState('');
  const [newCliente, setNewCliente] = useState('');
  const [newEmpresa, setNewEmpresa] = useState('BALOC');
  const [creating, setCreating] = useState(false);

  const isRecebimentoOrDev = userRole === 'Desenvolvedor' || userRole === 'Recebimento';

  const mesesDisponiveis = useMemo(() => {
    const set = new Set(records.map((r) => r.mesRef).filter(Boolean));
    return ['Todos', ...Array.from(set)];
  }, [records]);

  const empresasDisponiveis = useMemo(() => {
    const set = new Set(records.map((r) => r.empresa).filter(Boolean));
    return ['Todas', ...Array.from(set).sort()];
  }, [records]);

  const filteredByMonthAndCompany = useMemo(() => {
    return records.filter((r) => {
      if (mesFilter !== 'Todos' && r.mesRef !== mesFilter) return false;
      if (empresaFilter !== 'Todas' && r.empresa !== empresaFilter) return false;
      return true;
    });
  }, [records, mesFilter, empresaFilter]);

  const stats = useMemo(() => {
    let pendente = 0;
    let semRetorno = 0;
    let coletado = 0;
    let faturado = 0;
    for (const r of filteredByMonthAndCompany) {
      if (r.status === 'Pendente') pendente++;
      else if (r.status === 'Sem Retorno') semRetorno++;
      else if (r.status === 'Coletado') coletado++;
      else if (r.status === 'Faturado') faturado++;
    }
    return {
      total: filteredByMonthAndCompany.length,
      pendente,
      semRetorno,
      coletado,
      faturado,
    };
  }, [filteredByMonthAndCompany]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return filteredByMonthAndCompany.filter((r) => {
      if (statusFilter !== 'Todos' && r.status !== statusFilter) return false;
      if (!q) return true;
      return (
        r.cliente.toLowerCase().includes(q) ||
        r.numeroFicha.toLowerCase().includes(q) ||
        r.patrimonio.toLowerCase().includes(q) ||
        r.empresa.toLowerCase().includes(q)
      );
    });
  }, [filteredByMonthAndCompany, statusFilter, search]);

  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFicha.trim() || !newCliente.trim()) return;
    setCreating(true);
    try {
      const { mesRef, anoRef } = deriveMesAnoRef(newInicio.trim());
      await onCreateManual({
        inicio: newInicio.trim(),
        fim: newFim.trim(),
        numeroFicha: newFicha.trim().toUpperCase(),
        cliente: newCliente.trim().toUpperCase(),
        empresa: newEmpresa.trim().toUpperCase() || 'BALOC',
        mesRef,
        anoRef,
        status: 'Pendente',
      });
      setNewInicio('');
      setNewFim('');
      setNewFicha('');
      setNewCliente('');
      setShowNewModal(false);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-[#10203A]">
            Visão Geral do Fluxo Semanal
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Acompanhe o andamento das fichas entre Recebimento e Recepção com filtro por mês e empresa.
          </p>
        </div>

        {isRecebimentoOrDev && (
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => setShowNewModal(true)}
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium text-slate-800 hover:bg-slate-50 whitespace-nowrap"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              Novo Cadastro Manual
            </button>
            <button
              type="button"
              onClick={() => onNavigate('recebimento-importar')}
              className="inline-flex items-center gap-1.5 rounded-md bg-[#F4C430] px-3.5 py-2 text-xs font-bold text-[#10203A] hover:bg-[#e5b520] whitespace-nowrap"
            >
              <Upload className="h-3.5 w-3.5" aria-hidden="true" />
              Subir Planilha
            </button>
          </div>
        )}
      </div>

      {/* Pipeline Summary Strip */}
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-slate-200 bg-slate-200 sm:grid-cols-5">
        <button
          type="button"
          onClick={() => setStatusFilter('Todos')}
          className="bg-white p-3.5 text-left hover:bg-slate-50 transition-colors"
        >
          <div className="text-xs font-medium text-slate-500">Total de Fichas</div>
          <div className="mt-1 text-2xl font-semibold font-mono tabular-nums text-[#10203A]">
            {stats.total}
          </div>
          <div className="mt-0.5 text-[11px] text-slate-500">
            {mesFilter === 'Todos' ? 'Todos os meses' : `Mês: ${mesFilter}`}
          </div>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('recepcao-coleta')}
          className="bg-white p-3.5 text-left hover:bg-slate-50 transition-colors group"
        >
          <div className="flex items-center justify-between text-xs font-medium text-amber-800">
            <span>Pendentes</span>
            <ArrowRight className="h-3.5 w-3.5 opacity-60 group-hover:translate-x-0.5 transition-transform" />
          </div>
          <div className="mt-1 text-2xl font-semibold font-mono tabular-nums text-[#10203A]">
            {stats.pendente}
          </div>
          <div className="mt-0.5 text-[11px] text-slate-500">Aguardando ligação</div>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('recepcao-coleta')}
          className="bg-white p-3.5 text-left hover:bg-slate-50 transition-colors group"
        >
          <div className="flex items-center justify-between text-xs font-medium text-rose-800">
            <span>Sem Retorno</span>
            <ArrowRight className="h-3.5 w-3.5 opacity-60 group-hover:translate-x-0.5 transition-transform" />
          </div>
          <div className="mt-1 text-2xl font-semibold font-mono tabular-nums text-[#10203A]">
            {stats.semRetorno}
          </div>
          <div className="mt-0.5 text-[11px] text-slate-500">Retomar contato</div>
        </button>

        <button
          type="button"
          onClick={() =>
            isRecebimentoOrDev
              ? onNavigate('recebimento-faturamento')
              : setStatusFilter('Coletado')
          }
          className="bg-white p-3.5 text-left hover:bg-slate-50 transition-colors group"
        >
          <div className="flex items-center justify-between text-xs font-medium text-blue-800">
            <span>Coletados</span>
            {isRecebimentoOrDev && (
              <ArrowRight className="h-3.5 w-3.5 opacity-60 group-hover:translate-x-0.5 transition-transform" />
            )}
          </div>
          <div className="mt-1 text-2xl font-semibold font-mono tabular-nums text-[#10203A]">
            {stats.coletado}
          </div>
          <div className="mt-0.5 text-[11px] text-slate-500">Prontos p/ faturar</div>
        </button>

        <button
          type="button"
          onClick={() => setStatusFilter('Faturado')}
          className="col-span-2 sm:col-span-1 bg-white p-3.5 text-left hover:bg-slate-50 transition-colors"
        >
          <div className="text-xs font-medium text-emerald-800">Faturados</div>
          <div className="mt-1 text-2xl font-semibold font-mono tabular-nums text-[#10203A]">
            {stats.faturado}
          </div>
          <div className="mt-0.5 text-[11px] text-slate-500">Concluídos</div>
        </button>
      </div>

      {/* Master Ledger */}
      <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="inline-flex flex-wrap items-center gap-1 rounded-md bg-slate-100 p-1">
              {(['Todos', 'Pendente', 'Sem Retorno', 'Coletado', 'Faturado'] as const).map(
                (st) => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setStatusFilter(st)}
                    className={`rounded px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap ${
                      statusFilter === st
                        ? 'bg-[#10203A] text-white'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {st}
                  </button>
                )
              )}
            </div>

            <select
              value={mesFilter}
              onChange={(e) => setMesFilter(e.target.value)}
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium capitalize text-slate-700"
              aria-label="Filtrar por mês"
            >
              {mesesDisponiveis.map((m) => (
                <option key={m} value={m}>
                  {m === 'Todos' ? 'Todos os meses' : m}
                </option>
              ))}
            </select>

            <select
              value={empresaFilter}
              onChange={(e) => setEmpresaFilter(e.target.value)}
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700"
              aria-label="Filtrar por empresa"
            >
              {empresasDisponiveis.map((emp) => (
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
              placeholder="Cliente, ficha ou patrimônio..."
              className="w-full rounded-md border border-slate-300 bg-white py-1.5 pl-9 pr-3 text-xs text-slate-900 placeholder:text-slate-400 focus:border-[#10203A] focus:outline-none"
            />
          </div>
        </div>

        {records.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
            <p className="text-sm font-medium text-[#10203A]">
              O sistema ainda está sem registros cadastrados
            </p>
            <p className="mt-1 max-w-md text-xs text-slate-500">
              {isRecebimentoOrDev
                ? 'Para iniciar o ciclo semanal, suba a planilha do Recebimento (.xlsx / .csv) ou cadastre manualmente.'
                : 'Aguarde o departamento de Recebimento subir a planilha da semana.'}
            </p>
            {isRecebimentoOrDev && (
              <button
                type="button"
                onClick={() => onNavigate('recebimento-importar')}
                className="mt-4 inline-flex items-center gap-1.5 rounded-md bg-[#F4C430] px-4 py-2 text-xs font-bold text-[#10203A] hover:bg-[#e5b520]"
              >
                <Upload className="h-3.5 w-3.5" aria-hidden="true" />
                Importar Planilha
              </button>
            )}
          </div>
        ) : filtered.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-slate-500">
            Nenhum registro encontrado para os filtros selecionados.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                <tr>
                  <th className="px-2.5 py-2.5 font-semibold whitespace-nowrap">Status</th>
                  <th className="px-2.5 py-2.5 font-semibold whitespace-nowrap">Ref.</th>
                  <th className="px-2.5 py-2.5 font-semibold whitespace-nowrap">Período</th>
                  <th className="px-2.5 py-2.5 font-semibold whitespace-nowrap">Nº Ficha</th>
                  <th className="px-2.5 py-2.5 font-semibold">Cliente / Empresa</th>
                  <th className="px-2.5 py-2.5 font-semibold whitespace-nowrap">Patrimônio</th>
                  <th className="px-2.5 py-2.5 font-semibold whitespace-nowrap">Horímetro</th>
                  <th className="px-2.5 py-2.5 font-semibold whitespace-nowrap">Contato</th>
                  <th className="px-2.5 py-2.5 font-semibold whitespace-nowrap">Foto</th>
                  <th className="px-2.5 py-2.5 font-semibold text-right whitespace-nowrap">Ficha</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filtered.map((rec) => (
                  <tr key={rec.id} className="hover:bg-slate-50">
                    <td className="px-2.5 py-2 whitespace-nowrap">
                      <StatusIndicator status={rec.status} />
                    </td>
                    <td className="px-2.5 py-2 capitalize text-slate-600 whitespace-nowrap">
                      {rec.mesRef} {rec.anoRef}
                    </td>
                    <td className="px-2.5 py-2 font-mono tabular-nums text-[11px] text-slate-700 whitespace-nowrap">
                      <div>{rec.inicio || '—'}</div>
                      <div className="text-slate-400">{rec.fim || '—'}</div>
                    </td>
                    <td className="px-2.5 py-2 font-mono font-medium text-slate-900 whitespace-nowrap">
                      {rec.numeroFicha}
                    </td>
                    <td className="px-2.5 py-2">
                      <div className="font-medium text-slate-900 leading-snug">{rec.cliente}</div>
                      <div className="text-[11px] text-slate-500">{rec.empresa}</div>
                    </td>
                    <td className="px-2.5 py-2 font-mono text-slate-800 whitespace-nowrap">
                      {rec.patrimonio || '—'}
                    </td>
                    <td className="px-2.5 py-2 font-mono font-semibold text-[#10203A] whitespace-nowrap">
                      {rec.horimetro || '—'}
                    </td>
                    <td className="px-2.5 py-2 text-slate-600 whitespace-nowrap">
                      {rec.nomeContato ? (
                        <div>
                          <div className="font-medium text-slate-800">{rec.nomeContato}</div>
                          <div className="font-mono text-[11px] text-slate-500">
                            {rec.telefoneContato}
                          </div>
                        </div>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-2.5 py-2 whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => onOpenDrawer(rec)}
                        className={`inline-flex items-center gap-1 rounded border px-2 py-1 text-[11px] font-medium transition-colors ${
                          (rec.anexos?.length || 0) > 0
                            ? 'border-blue-200 bg-blue-50 text-blue-800 hover:bg-blue-100'
                            : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50'
                        }`}
                        title="Abrir anexos da ficha"
                      >
                        <Paperclip className="h-3 w-3" aria-hidden="true" />
                        <span className="font-mono tabular-nums">
                          {rec.anexos?.length || 0}
                        </span>
                      </button>
                    </td>
                    <td className="px-2.5 py-2 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => onOpenDrawer(rec)}
                        className="rounded border border-slate-300 bg-white p-1.5 text-slate-600 hover:bg-slate-100"
                        title="Abrir ficha"
                      >
                        <Edit3 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showNewModal && isRecebimentoOrDev && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
          role="dialog"
          aria-modal="true"
        >
          <form
            onSubmit={handleManualSubmit}
            className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-xl space-y-4"
          >
            <h2 className="text-base font-semibold text-[#10203A]">
              Novo Cadastro Manual (Recebimento)
            </h2>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Início</label>
                <input
                  type="text"
                  value={newInicio}
                  onChange={(e) => setNewInicio(e.target.value)}
                  placeholder="01/11/2026"
                  className="w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Fim</label>
                <input
                  type="text"
                  value={newFim}
                  onChange={(e) => setNewFim(e.target.value)}
                  placeholder="07/11/2026"
                  className="w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Nº Ficha *</label>
                <input
                  type="text"
                  required
                  value={newFicha}
                  onChange={(e) => setNewFicha(e.target.value)}
                  placeholder="GG.007999"
                  className="w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-xs uppercase"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Empresa *</label>
                <input
                  type="text"
                  required
                  value={newEmpresa}
                  onChange={(e) => setNewEmpresa(e.target.value)}
                  placeholder="BALOC"
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-xs uppercase"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-medium text-slate-700 mb-1">Cliente *</label>
                <input
                  type="text"
                  required
                  value={newCliente}
                  onChange={(e) => setNewCliente(e.target.value)}
                  placeholder="RAZÃO SOCIAL DO CLIENTE"
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-xs uppercase"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowNewModal(false)}
                className="rounded-md border border-slate-300 bg-white px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={creating}
                className="rounded-md bg-[#F4C430] px-4 py-2 text-xs font-bold text-[#10203A] hover:bg-[#e5b520] disabled:opacity-50"
              >
                {creating ? 'Salvando...' : 'Criar Cadastro'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
