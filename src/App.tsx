import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Building2,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  FileCheck2,
  LayoutDashboard,
  LogOut,
  Menu,
  Search,
  Upload,
  Users,
  Wrench,
  X,
} from 'lucide-react';
import type {
  AppUser,
  ClientCatalogEntry,
  CobrancaRecord,
  ImportBatch,
  ParsedImportRow,
  PreventivePlan,
  StatusHorimetro,
  UserRole,
  WorkspaceTab,
} from './types/cobranca';
import { buildClientPlatforms, getRecordEquipmentItems } from './utils/horimetro';
import { parseJsonResponse } from './utils/http';
import { AuthGate } from './components/AuthGate';
import { VisaoGeralView } from './components/VisaoGeralView';
import { RecebimentoImportView } from './components/RecebimentoImportView';
import { RecepcaoColetaView } from './components/RecepcaoColetaView';
import { FaturamentoView } from './components/FaturamentoView';
import { PesquisaView } from './components/PesquisaView';
import { ManutencaoPreventivaView } from './components/ManutencaoPreventivaView';
import { BaseClientesView } from './components/BaseClientesView';
import { UsersView } from './components/UsersView';
import { RecordDrawer } from './components/RecordDrawer';

interface ServerState {
  records: CobrancaRecord[];
  batches: ImportBatch[];
  preventivePlans?: PreventivePlan[];
}

interface AuthStatusResponse {
  configured: boolean;
  availableAccounts: Array<{ login: string; nome: string; role: UserRole }>;
  storageMode?: 'supabase' | 'local';
  databaseConnected?: boolean;
  databaseError?: string;
}

function getDefaultTabForRole(role: UserRole): WorkspaceTab {
  switch (role) {
    case 'Recepção':
      return 'recepcao-coleta';
    case 'Pesquisa':
      return 'pesquisa-horimetros';
    case 'Manutenção Preventiva':
      return 'manutencao-preventiva';
    default:
      return 'visao-geral';
  }
}

export default function App() {
  const [authChecking, setAuthChecking] = useState(true);
  const [authConfigured, setAuthConfigured] = useState(false);
  const [storageMode, setStorageMode] = useState<'supabase' | 'local' | null>(null);
  const [databaseConnected, setDatabaseConnected] = useState<boolean | null>(null);
  const [availableAccounts, setAvailableAccounts] = useState<
    AuthStatusResponse['availableAccounts']
  >([]);
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<AppUser | null>(null);

  const [activeTab, setActiveTab] = useState<WorkspaceTab>('visao-geral');
  const [usersMenuOpen, setUsersMenuOpen] = useState(true);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const [records, setRecords] = useState<CobrancaRecord[]>([]);
  const [batches, setBatches] = useState<ImportBatch[]>([]);
  const [preventivePlans, setPreventivePlans] = useState<PreventivePlan[]>([]);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const [drawerRecordId, setDrawerRecordId] = useState<string | null>(null);

  const loadAuthStatus = useCallback(async () => {
    setAuthChecking(true);
    try {
      setErrorMsg('');
      const res = await fetch('/api/auth/status');
      const data = await parseJsonResponse<AuthStatusResponse & { error?: string }>(res);
      if (!res.ok) {
        throw new Error(data.error || 'Erro ao verificar status de autenticação.');
      }
      setAuthConfigured(Boolean(data.configured));
      setAvailableAccounts(Array.isArray(data.availableAccounts) ? data.availableAccounts : []);
      setStorageMode(data.storageMode ?? null);
      setDatabaseConnected(
        typeof data.databaseConnected === 'boolean' ? data.databaseConnected : null
      );
      if (data.databaseConnected === false && data.databaseError) {
        setErrorMsg(data.databaseError);
      }
    } catch (err) {
      setStorageMode(null);
      setDatabaseConnected(false);
      setErrorMsg(
        err instanceof Error
          ? err.message
          : 'Erro ao verificar status de autenticação.'
      );
    } finally {
      setAuthChecking(false);
    }
  }, []);

  useEffect(() => {
    loadAuthStatus();
  }, [loadAuthStatus]);

  const authFetch = useCallback(
    async (url: string, init?: RequestInit) => {
      const headers = new Headers(init?.headers || {});
      if (authToken) {
        headers.set('Authorization', `Bearer ${authToken}`);
      }
      const res = await fetch(url, { ...init, headers });
      if (res.status === 401) {
        setAuthToken(null);
        setCurrentUser(null);
        loadAuthStatus();
        throw new Error('Sessão expirada. Entre novamente.');
      }
      return res;
    },
    [authToken, loadAuthStatus]
  );

  const applyState = useCallback((state: ServerState) => {
    setRecords(Array.isArray(state.records) ? state.records : []);
    setBatches(Array.isArray(state.batches) ? state.batches : []);
    if (Array.isArray(state.preventivePlans)) {
      setPreventivePlans(state.preventivePlans);
    }
  }, []);

  const fetchState = useCallback(async () => {
    if (!authToken || !currentUser) return;
    setLoading(true);
    try {
      setErrorMsg('');
      const res = await authFetch('/api/state');
      const data = await parseJsonResponse<ServerState & { error?: string }>(res);
      if (!res.ok) throw new Error(data.error || 'Falha ao carregar dados do servidor.');
      applyState(data);

      if (currentUser.role === 'Desenvolvedor') {
        const usersRes = await authFetch('/api/users');
        if (usersRes.ok) {
          const usersData = await parseJsonResponse<{ users?: AppUser[] }>(usersRes);
          setUsers(Array.isArray(usersData.users) ? usersData.users : []);
        }
      } else {
        setUsers([]);
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Erro de conexão com o servidor.');
    } finally {
      setLoading(false);
    }
  }, [authToken, currentUser, authFetch, applyState]);

  // Fast automatic real-time sync (SSE when stateful, 2.5s visibility-aware polling on serverless/Netlify)
  useEffect(() => {
    if (!authToken || !currentUser) return;

    fetchState();

    const controller = new AbortController();
    let pollTimer: number | undefined;
    let pollInFlight = false;

    const silentSync = async () => {
      if (controller.signal.aborted || pollInFlight) return;
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        return;
      }
      pollInFlight = true;
      try {
        const res = await authFetch('/api/state');
        if (!res.ok) return;
        const data = await parseJsonResponse<ServerState>(res);
        applyState(data);
      } catch {
        // Ignore background poll failures
      } finally {
        pollInFlight = false;
      }
    };

    const startPolling = () => {
      if (pollTimer !== undefined || controller.signal.aborted) return;
      pollTimer = window.setInterval(() => {
        void silentSync();
      }, 2500);
    };

    const handleResumeSync = () => {
      if (document.visibilityState === 'visible') {
        void silentSync();
      }
    };

    window.addEventListener('focus', handleResumeSync);
    document.addEventListener('visibilitychange', handleResumeSync);

    const connectSse = async () => {
      try {
        const response = await fetch('/api/events', {
          headers: { Authorization: `Bearer ${authToken}` },
          signal: controller.signal,
        });
        const contentType = (response.headers.get('content-type') || '').toLowerCase();
        if (
          response.status === 204 ||
          !response.ok ||
          !contentType.includes('text/event-stream') ||
          !response.body
        ) {
          startPolling();
          return;
        }
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const chunks = buffer.split('\n\n');
          buffer = chunks.pop() || '';
          for (const chunk of chunks) {
            const line = chunk.split('\n').find((l) => l.startsWith('data: '));
            if (line) {
              try {
                const parsed = JSON.parse(line.slice(6)) as ServerState;
                applyState(parsed);
              } catch {
                // Ignore malformed event chunks
              }
            }
          }
        }
        if (!controller.signal.aborted) {
          startPolling();
        }
      } catch {
        if (!controller.signal.aborted) {
          startPolling();
        }
      }
    };

    connectSse();
    return () => {
      controller.abort();
      window.removeEventListener('focus', handleResumeSync);
      document.removeEventListener('visibilitychange', handleResumeSync);
      if (pollTimer !== undefined) {
        window.clearInterval(pollTimer);
      }
    };
  }, [authToken, currentUser, fetchState, authFetch, applyState]);

  const handleAuthenticated = (token: string, user: AppUser) => {
    setAuthToken(token);
    setCurrentUser(user);
    setAuthConfigured(true);
    setActiveTab(getDefaultTabForRole(user.role));
  };

  const handleLogout = () => {
    setAuthToken(null);
    setCurrentUser(null);
    setRecords([]);
    setBatches([]);
    setPreventivePlans([]);
    setUsers([]);
    setDrawerRecordId(null);
    setMobileNavOpen(false);
    loadAuthStatus();
  };

  const counts = useMemo(() => {
    let pendente = 0;
    let semRetorno = 0;
    let coletado = 0;
    let faturado = 0;
    for (const r of records) {
      if (r.status === 'Pendente') pendente++;
      else if (r.status === 'Sem Retorno') semRetorno++;
      else if (r.status === 'Coletado') coletado++;
      else if (r.status === 'Faturado') faturado++;
    }
    return { pendente, semRetorno, coletado, faturado };
  }, [records]);

  const preventiveAlertCount = useMemo(() => {
    const platforms = buildClientPlatforms(records);
    const planMap = new Map<string, PreventivePlan>();
    for (const p of preventivePlans) {
      planMap.set(`${p.cliente.toUpperCase()}__${p.patrimonio.toUpperCase()}`, p);
    }

    let alertCount = 0;
    for (const item of platforms) {
      const key = `${item.cliente.trim().toUpperCase()}__${item.patrimonio.trim().toUpperCase()}`;
      const plan = planMap.get(key);
      if (!plan || item.horimetroFaturadoNumero === null) continue;
      const restante = plan.proximaTroca - item.horimetroFaturadoNumero;
      if (
        item.horimetroFaturadoNumero >= plan.proximaTroca ||
        restante <= plan.avisoAntecedenciaHoras
      ) {
        alertCount++;
      }
    }
    return alertCount;
  }, [records, preventivePlans]);

  const { catalogList, catalogMap } = useMemo(() => {
    const map = new Map<string, ClientCatalogEntry>();

    for (const r of records) {
      const key = r.cliente.trim().toUpperCase();
      if (!key) continue;

      const recordPats = getRecordEquipmentItems(r)
        .map((item) => item.patrimonio.trim().toUpperCase())
        .filter(Boolean);

      const existing = map.get(key);
      if (!existing) {
        const uniquePats = Array.from(new Set(recordPats));
        map.set(key, {
          cliente: r.cliente,
          patrimonios: uniquePats,
          ultimoPatrimonio: uniquePats[0] || '',
          ultimoNomeContato: r.nomeContato || '',
          ultimoTelefoneContato: r.telefoneContato || '',
          ultimoEmailContato: r.emailContato || '',
          ultimaEmpresa: r.empresa || '',
          ultimaAtualizacao: r.atualizadoEm,
          totalRegistros: 1,
        });
      } else {
        existing.totalRegistros++;
        for (const pat of recordPats) {
          if (!existing.patrimonios.includes(pat)) {
            existing.patrimonios.push(pat);
          }
          if (!existing.ultimoPatrimonio) {
            existing.ultimoPatrimonio = pat;
          }
        }
        if (!existing.ultimoNomeContato && r.nomeContato) {
          existing.ultimoNomeContato = r.nomeContato;
        }
        if (!existing.ultimoTelefoneContato && r.telefoneContato) {
          existing.ultimoTelefoneContato = r.telefoneContato;
        }
        if (!existing.ultimoEmailContato && r.emailContato) {
          existing.ultimoEmailContato = r.emailContato;
        }
      }
    }

    const list = Array.from(map.values()).sort((a, b) =>
      a.cliente.localeCompare(b.cliente, 'pt-BR')
    );
    return { catalogList: list, catalogMap: map };
  }, [records]);

  const drawerRecord = useMemo(
    () => records.find((r) => r.id === drawerRecordId) || null,
    [records, drawerRecordId]
  );

  const handleImportConfirm = async (params: {
    rows: ParsedImportRow[];
    nomeArquivo: string;
    origem: ImportBatch['origem'];
    duplicateMode: 'skip' | 'overwrite';
  }) => {
    const res = await authFetch('/api/records/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        rows: params.rows,
        nomeArquivo: params.nomeArquivo,
        origem: params.origem,
        duplicateMode: params.duplicateMode,
      }),
    });
    const data = await parseJsonResponse<{
      state: ServerState;
      insertedCount: number;
      updatedCount: number;
      skippedCount: number;
      error?: string;
    }>(res);
    if (!res.ok) throw new Error(data.error || 'Erro ao importar registros.');
    applyState(data.state);
    return {
      insertedCount: data.insertedCount,
      updatedCount: data.updatedCount,
      skippedCount: data.skippedCount,
    };
  };

  const handleCreateManual = async (payload: Partial<CobrancaRecord>) => {
    const res = await authFetch('/api/records', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await parseJsonResponse<{ state: ServerState; error?: string }>(res);
    if (!res.ok) throw new Error(data.error || 'Erro ao criar registro.');
    applyState(data.state);
  };

  const handlePatchRecord = async (id: string, patch: Partial<CobrancaRecord>) => {
    const res = await authFetch(`/api/records/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    const data = await parseJsonResponse<{ state: ServerState; error?: string }>(res);
    if (!res.ok) throw new Error(data.error || 'Erro ao atualizar registro.');
    applyState(data.state);
  };

  const handleUploadAttachment = async (recordId: string, file: File) => {
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('Falha ao ler arquivo selecionado.'));
      reader.readAsDataURL(file);
    });

    const res = await authFetch(`/api/records/${recordId}/attachments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fileName: file.name,
        mimeType: file.type,
        dataBase64: dataUrl,
      }),
    });
    const data = await parseJsonResponse<{ state: ServerState; error?: string }>(res);
    if (!res.ok) throw new Error(data.error || 'Erro ao anexar arquivo.');
    applyState(data.state);
  };

  const handleDeleteAttachment = async (recordId: string, attachmentId: string) => {
    const res = await authFetch(
      `/api/records/${recordId}/attachments/${attachmentId}`,
      { method: 'DELETE' }
    );
    const data = await parseJsonResponse<{ state: ServerState; error?: string }>(res);
    if (!res.ok) throw new Error(data.error || 'Erro ao remover anexo.');
    applyState(data.state);
  };

  const handleFetchAttachmentBlob = useCallback(
    async (recordId: string, attachmentId: string): Promise<Blob> => {
      const res = await authFetch(
        `/api/records/${recordId}/attachments/${attachmentId}`
      );
      if (!res.ok) throw new Error('Falha ao carregar anexo.');
      return res.blob();
    },
    [authFetch]
  );

  const handleBulkStatus = async (ids: string[], status: StatusHorimetro) => {
    const res = await authFetch('/api/records/bulk-status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids, status }),
    });
    const data = await parseJsonResponse<{ state: ServerState; error?: string }>(res);
    if (!res.ok) throw new Error(data.error || 'Erro ao atualizar lote.');
    applyState(data.state);
  };

  const handleDeleteRecord = async (id: string) => {
    const res = await authFetch(`/api/records/${id}`, { method: 'DELETE' });
    const data = await parseJsonResponse<{ state: ServerState; error?: string }>(res);
    if (!res.ok) throw new Error(data.error || 'Erro ao excluir registro.');
    applyState(data.state);
  };

  const handleDeleteBatch = async (batchId: string) => {
    const res = await authFetch(`/api/batches/${batchId}`, { method: 'DELETE' });
    const data = await parseJsonResponse<{ state: ServerState; error?: string }>(res);
    if (!res.ok) throw new Error(data.error || 'Erro ao remover lote.');
    applyState(data.state);
  };

  const handleSavePreventivePlan = async (payload: {
    cliente: string;
    patrimonio: string;
    horimetroBase: number;
    proximaTroca: number;
    avisoAntecedenciaHoras: number;
    observacoes: string;
  }) => {
    const res = await authFetch('/api/preventive-plans', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await parseJsonResponse<{ state: ServerState; error?: string }>(res);
    if (!res.ok) throw new Error(data.error || 'Erro ao salvar plano preventivo.');
    applyState(data.state);
  };

  const handleCompletePreventivePlan = async (
    planId: string,
    horimetroRealizado: number
  ) => {
    const res = await authFetch(`/api/preventive-plans/${planId}/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ horimetroRealizado }),
    });
    const data = await parseJsonResponse<{ state: ServerState; error?: string }>(res);
    if (!res.ok) throw new Error(data.error || 'Erro ao concluir preventiva.');
    applyState(data.state);
  };

  const handleDeletePreventivePlan = async (planId: string) => {
    const res = await authFetch(`/api/preventive-plans/${planId}`, {
      method: 'DELETE',
    });
    const data = await parseJsonResponse<{ state: ServerState; error?: string }>(res);
    if (!res.ok) throw new Error(data.error || 'Erro ao remover plano preventivo.');
    applyState(data.state);
  };

  const handleCreateUser = async (payload: {
    nome: string;
    login: string;
    role: UserRole;
    password: string;
  }) => {
    const res = await authFetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await parseJsonResponse<{ users: AppUser[]; error?: string }>(res);
    if (!res.ok) throw new Error(data.error || 'Erro ao criar usuário.');
    setUsers(data.users);
  };

  const handleUpdateUser = async (
    id: string,
    patch: { nome?: string; role?: UserRole; ativo?: boolean; password?: string }
  ) => {
    const res = await authFetch(`/api/users/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    const data = await parseJsonResponse<{ users: AppUser[]; error?: string }>(res);
    if (!res.ok) throw new Error(data.error || 'Erro ao atualizar usuário.');
    setUsers(data.users);
  };

  const handleDeleteUser = async (id: string) => {
    const res = await authFetch(`/api/users/${id}`, { method: 'DELETE' });
    const data = await parseJsonResponse<{ users: AppUser[]; error?: string }>(res);
    if (!res.ok) throw new Error(data.error || 'Erro ao remover usuário.');
    setUsers(data.users);
  };

  if (authChecking) {
    return (
      <div className="min-h-screen bg-[#10203A] flex items-center justify-center p-6">
        <div className="text-sm font-medium text-white">Carregando Horix...</div>
      </div>
    );
  }

  if (!authToken || !currentUser) {
    return (
      <AuthGate
        configured={authConfigured}
        availableAccounts={availableAccounts}
        initialError={errorMsg}
        storageMode={storageMode}
        databaseConnected={databaseConnected}
        onAuthenticated={handleAuthenticated}
      />
    );
  }

  const role = currentUser.role;
  const canSeeRecebimentoTabs = role === 'Desenvolvedor' || role === 'Recebimento';
  const canSeeOperacaoTabs = canSeeRecebimentoTabs || role === 'Recepção';
  const canSeePesquisaTab = canSeeRecebimentoTabs || role === 'Pesquisa';
  const canSeeManutencaoTab = role === 'Desenvolvedor' || role === 'Manutenção Preventiva';
  const canSeeUsersMenu = role === 'Desenvolvedor';

  const navItems: Array<{
    id: WorkspaceTab;
    label: string;
    icon: typeof LayoutDashboard;
    count?: number;
    alertCount?: number;
    visible: boolean;
  }> = [
    {
      id: 'visao-geral',
      label: 'Visão Geral',
      icon: LayoutDashboard,
      visible: canSeeOperacaoTabs,
    },
    {
      id: 'recebimento-importar',
      label: 'Importar Planilha',
      icon: Upload,
      visible: canSeeRecebimentoTabs,
    },
    {
      id: 'recepcao-coleta',
      label: 'Coleta de Horímetros',
      icon: ClipboardList,
      count: counts.pendente + counts.semRetorno,
      visible: canSeeOperacaoTabs,
    },
    {
      id: 'recebimento-faturamento',
      label: 'Faturamento',
      icon: FileCheck2,
      count: counts.coletado,
      visible: canSeeRecebimentoTabs,
    },
    {
      id: 'pesquisa-horimetros',
      label: 'Pesquisa de Horímetros',
      icon: Search,
      visible: canSeePesquisaTab,
    },
    {
      id: 'manutencao-preventiva',
      label: 'Manutenção Preventiva',
      icon: Wrench,
      alertCount: preventiveAlertCount,
      visible: canSeeManutencaoTab,
    },
    {
      id: 'base-clientes',
      label: 'Clientes e Patrimônios',
      icon: Building2,
      visible: canSeeRecebimentoTabs,
    },
  ];

  const visibleTabIds = new Set<WorkspaceTab>(
    navItems.filter((item) => item.visible).map((item) => item.id)
  );
  if (canSeeUsersMenu) visibleTabIds.add('usuarios-gerenciar');

  const safeActiveTab = visibleTabIds.has(activeTab)
    ? activeTab
    : getDefaultTabForRole(role);

  const breadcrumbLabel = (() => {
    switch (safeActiveTab) {
      case 'visao-geral':
        return 'Operação / Visão Geral';
      case 'recebimento-importar':
        return 'Recebimento / Importar Planilha Semanal';
      case 'recepcao-coleta':
        return 'Recepção / Coleta de Horímetros';
      case 'recebimento-faturamento':
        return 'Recebimento / Faturamento';
      case 'pesquisa-horimetros':
        return 'Pesquisa / Horímetros Atualizados';
      case 'manutencao-preventiva':
        return 'Manutenção / Controle Preventivo';
      case 'base-clientes':
        return 'Catálogo / Clientes e Patrimônios';
      case 'usuarios-gerenciar':
        return 'Administração / Usuários e Permissões';
    }
  })();

  const navigateTo = (tab: WorkspaceTab) => {
    setActiveTab(tab);
    setMobileNavOpen(false);
  };

  return (
    <div className="h-screen overflow-hidden bg-slate-50 text-slate-900 flex">
      {mobileNavOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-950/50 lg:hidden"
          onClick={() => setMobileNavOpen(false)}
        />
      )}

      {/* Industrial Navy Sidebar (pinned to viewport height so footer Sair is always visible) */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-60 bg-[#10203A] text-white flex flex-col h-full transition-transform duration-150 lg:static lg:translate-x-0 shrink-0 ${
          mobileNavOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="h-1 bg-[#F4C430] w-full shrink-0" />
        <div className="flex h-14 items-center justify-between border-b border-white/10 px-5">
          <div>
            <span className="font-display text-lg font-extrabold tracking-tight text-white whitespace-nowrap">
              HOR<span className="text-[#F4C430]">IX</span>
            </span>
            <p className="text-[10px] uppercase tracking-wider text-slate-300 leading-none">
              Horímetros &amp; Frota
            </p>
          </div>
          <button
            type="button"
            onClick={() => setMobileNavOpen(false)}
            className="rounded p-1 text-slate-300 hover:bg-white/10 lg:hidden"
            aria-label="Fechar menu"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
          {navItems
            .filter((item) => item.visible)
            .map((item) => {
              const Icon = item.icon;
              const active = safeActiveTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => navigateTo(item.id)}
                  className={`w-full flex items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-xs font-medium transition-colors whitespace-nowrap ${
                    active
                      ? 'bg-[#F4C430] text-[#10203A] font-semibold shadow-xs'
                      : 'text-slate-200 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  <span className="flex items-center gap-2.5 min-w-0 truncate">
                    <Icon
                      className={`h-4 w-4 shrink-0 ${
                        active ? 'text-[#10203A]' : 'text-[#F4C430]'
                      }`}
                      aria-hidden="true"
                    />
                    <span className="truncate">{item.label}</span>
                  </span>
                  {item.count !== undefined && item.count > 0 && (
                    <span
                      className={`font-mono tabular-nums text-[11px] shrink-0 px-1.5 py-0.5 rounded ${
                        active
                          ? 'bg-[#10203A]/15 text-[#10203A]'
                          : 'bg-white/10 text-slate-200'
                      }`}
                    >
                      {item.count}
                    </span>
                  )}
                  {item.alertCount !== undefined && item.alertCount > 0 && (
                    <span
                      className={`font-mono tabular-nums text-[11px] shrink-0 px-1.5 py-0.5 rounded font-semibold ${
                        active
                          ? 'bg-red-700 text-white'
                          : 'bg-[#F4C430] text-[#10203A]'
                      }`}
                      title="Alertas de manutenção preventiva"
                    >
                      {item.alertCount}
                    </span>
                  )}
                </button>
              );
            })}

          {/* Submenu de Usuários (somente Desenvolvedor) */}
          {canSeeUsersMenu && (
            <div className="pt-3 mt-3 border-t border-white/10">
              <button
                type="button"
                onClick={() => setUsersMenuOpen((v) => !v)}
                className="w-full flex items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-xs font-medium text-slate-200 hover:bg-white/10 hover:text-white transition-colors"
              >
                <span className="flex items-center gap-2.5">
                  <Users className="h-4 w-4 text-[#F4C430]" aria-hidden="true" />
                  <span>Usuários</span>
                </span>
                {usersMenuOpen ? (
                  <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
                ) : (
                  <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
                )}
              </button>

              {usersMenuOpen && (
                <div className="mt-1 ml-4 pl-3 border-l border-white/15 space-y-1">
                  <button
                    type="button"
                    onClick={() => navigateTo('usuarios-gerenciar')}
                    className={`w-full flex items-center justify-between rounded-md px-2.5 py-1.5 text-left text-xs font-medium transition-colors whitespace-nowrap ${
                      safeActiveTab === 'usuarios-gerenciar'
                        ? 'bg-[#F4C430] text-[#10203A] font-semibold'
                        : 'text-slate-300 hover:bg-white/10 hover:text-white'
                    }`}
                  >
                    <span>Gerenciar Perfis</span>
                    <span className="font-mono tabular-nums text-[11px] opacity-80">
                      {users.length}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="w-full flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-left text-xs font-medium text-slate-300 hover:bg-white/10 hover:text-white transition-colors whitespace-nowrap"
                  >
                    <span>Trocar Usuário</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </nav>

        {/* Signed-in User Footer */}
        <div className="shrink-0 border-t border-white/10 bg-[#0B172A] px-4 py-3 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="text-xs font-semibold text-white truncate">
              {currentUser.nome}
            </div>
            <div className="text-[11px] text-slate-300 truncate">
              {currentUser.role}
            </div>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            className="inline-flex items-center gap-1 rounded-md border border-white/20 bg-white/10 px-2.5 py-1.5 text-[11px] font-medium text-white hover:bg-[#F4C430] hover:text-[#10203A] hover:border-[#F4C430] transition-colors shrink-0"
            title="Sair e voltar para o login"
          >
            <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
            Sair
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
        <header className="shrink-0 z-30 flex h-14 items-center justify-between gap-4 border-b border-slate-200 bg-white px-4 sm:px-6">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileNavOpen(true)}
              className="rounded-md p-1.5 text-[#10203A] hover:bg-slate-100 lg:hidden"
              aria-label="Abrir menu"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="flex items-center gap-2 min-w-0">
              <span className="hidden sm:inline-block h-2 w-2 rounded-xs bg-[#F4C430] shrink-0" />
              <span className="text-xs font-semibold text-[#10203A] truncate">
                {breadcrumbLabel}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            {canSeeRecebimentoTabs && safeActiveTab !== 'recebimento-importar' && (
              <button
                type="button"
                onClick={() => navigateTo('recebimento-importar')}
                className="inline-flex items-center gap-1.5 rounded-md bg-[#F4C430] px-3 py-1.5 text-xs font-semibold text-[#10203A] hover:bg-[#e5b522] transition-colors whitespace-nowrap shrink-0"
              >
                <Upload className="h-3.5 w-3.5" aria-hidden="true" />
                Importar Planilha
              </button>
            )}

            <div className="hidden md:flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] text-slate-700">
              <span className="font-semibold text-[#10203A]">{currentUser.nome}</span>
              <span aria-hidden="true">·</span>
              <span>{currentUser.role}</span>
            </div>

            <button
              type="button"
              onClick={handleLogout}
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-[#10203A] hover:bg-slate-100 transition-colors whitespace-nowrap shrink-0"
              title="Sair do sistema e voltar para a tela de login"
            >
              <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
              Sair
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-4 sm:p-5">
          <div className="max-w-[1600px] w-full mx-auto">
          {errorMsg && (
            <div className="mb-4 flex items-center justify-between rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              <span>{errorMsg}</span>
              <button
                type="button"
                onClick={fetchState}
                className="rounded border border-red-300 bg-white px-3 py-1 text-xs font-medium text-red-800 hover:bg-red-100"
              >
                Tentar Novamente
              </button>
            </div>
          )}

          {loading ? (
            <div className="space-y-4">
              <div className="h-8 w-72 rounded bg-slate-200 animate-pulse" />
              <div className="h-24 w-full rounded-lg bg-slate-200 animate-pulse" />
              <div className="h-96 w-full rounded-lg bg-slate-200 animate-pulse" />
            </div>
          ) : (
            <>
              {safeActiveTab === 'visao-geral' && canSeeOperacaoTabs && (
                <VisaoGeralView
                  records={records}
                  userRole={role}
                  onNavigate={navigateTo}
                  onOpenDrawer={(rec) => setDrawerRecordId(rec.id)}
                  onCreateManual={handleCreateManual}
                />
              )}

              {safeActiveTab === 'recebimento-importar' && canSeeRecebimentoTabs && (
                <RecebimentoImportView
                  records={records}
                  batches={batches}
                  onImportConfirm={handleImportConfirm}
                  onDeleteBatch={handleDeleteBatch}
                  onGoToRecepcao={() => navigateTo('recepcao-coleta')}
                />
              )}

              {safeActiveTab === 'recepcao-coleta' && canSeeOperacaoTabs && (
                <RecepcaoColetaView
                  records={records}
                  userRole={role}
                  catalogMap={catalogMap}
                  onPatchRecord={handlePatchRecord}
                  onOpenDrawer={(rec) => setDrawerRecordId(rec.id)}
                  onGoToImport={() => navigateTo('recebimento-importar')}
                />
              )}

              {safeActiveTab === 'recebimento-faturamento' && canSeeRecebimentoTabs && (
                <FaturamentoView
                  records={records}
                  onBulkStatus={handleBulkStatus}
                  onPatchRecord={handlePatchRecord}
                  onOpenDrawer={(rec) => setDrawerRecordId(rec.id)}
                />
              )}

              {safeActiveTab === 'pesquisa-horimetros' && canSeePesquisaTab && (
                <PesquisaView
                  records={records}
                  onOpenDrawer={(rec) => setDrawerRecordId(rec.id)}
                />
              )}

              {safeActiveTab === 'manutencao-preventiva' && canSeeManutencaoTab && (
                <ManutencaoPreventivaView
                  records={records}
                  preventivePlans={preventivePlans}
                  onSavePlan={handleSavePreventivePlan}
                  onCompletePlan={handleCompletePreventivePlan}
                  onDeletePlan={handleDeletePreventivePlan}
                />
              )}

              {safeActiveTab === 'base-clientes' && canSeeRecebimentoTabs && (
                <BaseClientesView catalog={catalogList} />
              )}

              {safeActiveTab === 'usuarios-gerenciar' && canSeeUsersMenu && (
                <UsersView
                  currentUser={currentUser}
                  users={users}
                  onCreateUser={handleCreateUser}
                  onUpdateUser={handleUpdateUser}
                  onDeleteUser={handleDeleteUser}
                />
              )}
            </>
          )}
          </div>
        </main>
      </div>

      <RecordDrawer
        record={drawerRecord}
        userRole={role}
        clientSuggestion={
          drawerRecord ? catalogMap.get(drawerRecord.cliente.trim().toUpperCase()) : undefined
        }
        onClose={() => setDrawerRecordId(null)}
        onSave={handlePatchRecord}
        onDelete={handleDeleteRecord}
        onUploadAttachment={handleUploadAttachment}
        onDeleteAttachment={handleDeleteAttachment}
        onFetchAttachmentBlob={handleFetchAttachmentBlob}
      />
    </div>
  );
}
