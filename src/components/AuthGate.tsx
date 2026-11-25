import { useEffect, useState } from 'react';
import { Eye, EyeOff, Gauge, Lock, UserCheck } from 'lucide-react';
import type { AppUser, UserRole } from '../types/cobranca';
import { parseJsonResponse } from '../utils/http';

interface AvailableAccount {
  login: string;
  nome: string;
  role: UserRole;
}

interface AuthGateProps {
  configured: boolean;
  availableAccounts: AvailableAccount[];
  initialError?: string;
  storageMode?: 'supabase' | 'local' | null;
  databaseConnected?: boolean | null;
  onAuthenticated: (token: string, user: AppUser) => void;
}

const LOGIN_HERO_IMAGE = '/src/assets/images/horix_horimetro_panel_1795532382577.jpg';

const ROLE_SUBTITLES: Record<UserRole, string> = {
  Desenvolvedor: 'Acesso completo e usuários',
  Recebimento: 'Importação e faturamento',
  Recepção: 'Coleta de horímetros',
  Pesquisa: 'Consulta de leituras',
  'Manutenção Preventiva': 'Preventiva e alertas',
};

const DEFAULT_FIRST_RUN_ACCOUNTS: AvailableAccount[] = [
  { login: 'desenvolvedor', nome: 'Desenvolvedor', role: 'Desenvolvedor' },
  { login: 'recebimento', nome: 'Equipe Recebimento', role: 'Recebimento' },
  { login: 'recepcao', nome: 'Equipe Recepção', role: 'Recepção' },
  { login: 'pesquisa', nome: 'Consulta / Pesquisa', role: 'Pesquisa' },
  {
    login: 'manutencao',
    nome: 'Manutenção Preventiva',
    role: 'Manutenção Preventiva',
  },
];

export function AuthGate({
  configured,
  availableAccounts,
  initialError = '',
  storageMode = null,
  databaseConnected = null,
  onAuthenticated,
}: AuthGateProps) {
  const accountsToShow =
    configured && availableAccounts.length > 0
      ? availableAccounts
      : DEFAULT_FIRST_RUN_ACCOUNTS;

  const [selectedLogin, setSelectedLogin] = useState(
    accountsToShow[0]?.login || 'desenvolvedor'
  );
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [imgFailed, setImgFailed] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState(initialError);

  useEffect(() => {
    if (initialError) {
      setErrorMsg(initialError);
    }
  }, [initialError]);

  useEffect(() => {
    if (accountsToShow.length === 0) return;
    const stillExists = accountsToShow.some(
      (acc) => acc.login.toLowerCase() === selectedLogin.toLowerCase()
    );
    if (!stillExists) {
      setSelectedLogin(accountsToShow[0].login);
    }
  }, [accountsToShow, selectedLogin]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (!selectedLogin || !password) {
      setErrorMsg('Selecione o modo de usuário e informe a senha.');
      return;
    }

    setSubmitting(true);
    try {
      if (!configured) {
        if (password.trim().length < 4) {
          setErrorMsg('Informe uma senha inicial com pelo menos 4 caracteres.');
          setSubmitting(false);
          return;
        }
        const res = await fetch('/api/auth/bootstrap', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            developerName: 'Desenvolvedor',
            initialPassword: password.trim(),
            selectedLogin,
          }),
        });
        const data = await parseJsonResponse<{
          token: string;
          user: AppUser;
          error?: string;
        }>(res);
        if (!res.ok) throw new Error(data.error || 'Erro ao inicializar acesso.');
        onAuthenticated(data.token, data.user);
        return;
      }

      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          login: selectedLogin,
          password,
        }),
      });
      const data = await parseJsonResponse<{
        token: string;
        user: AppUser;
        error?: string;
      }>(res);
      if (!res.ok) throw new Error(data.error || 'Senha inválida.');
      onAuthenticated(data.token, data.user);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Falha ao entrar.');
    } finally {
      setSubmitting(false);
    }
  };

  const selectedAccount = accountsToShow.find(
    (acc) => acc.login.toLowerCase() === selectedLogin.toLowerCase()
  );

  return (
    <div className="min-h-screen grid grid-cols-1 lg:grid-cols-2 bg-slate-50">
      {/* Left Split Panel: Industrial Horímetro Visual Showcase */}
      <section className="relative flex flex-col justify-between overflow-hidden bg-gradient-to-br from-[#091224] via-[#10203A] to-[#1A3154] p-7 sm:p-10 lg:p-12 text-white min-h-[240px] lg:min-h-screen">
        {!imgFailed && (
          <img
            src={LOGIN_HERO_IMAGE}
            alt="Painel industrial com horímetro digital de equipamento"
            referrerPolicy="no-referrer"
            onError={() => setImgFailed(true)}
            className="absolute inset-0 h-full w-full object-cover object-center"
          />
        )}

        <div
          className="absolute inset-0 bg-gradient-to-t from-[#08101F]/95 via-[#0D1A30]/60 to-[#08101F]/70"
          aria-hidden="true"
        />

        <div className="relative z-10 flex items-center justify-between">
          <div>
            <div className="h-1 w-10 bg-[#F4C430] mb-3" />
            <div className="font-display text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
              HOR<span className="text-[#F4C430]">IX</span>
            </div>
          </div>
          <div className="flex h-10 w-10 items-center justify-center rounded-md border border-white/20 bg-[#10203A]/80 backdrop-blur-xs">
            <Gauge className="h-5 w-5 text-[#F4C430]" aria-hidden="true" />
          </div>
        </div>

        <div className="relative z-10 mt-10 max-w-md space-y-3">
          <h1 className="font-display text-2xl sm:text-3xl font-bold leading-tight tracking-tight text-white text-balance">
            Controle semanal de horímetros, faturamento e prevenção de frota.
          </h1>
          <p className="text-sm text-slate-200 leading-relaxed">
            Centralize a leitura dos equipamentos por cliente e patrimônio, anexe comprovantes fotográficos e acompanhe as trocas preventivas com precisão.
          </p>
          <div className="pt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-medium text-slate-300">
            <span>Coleta em campo</span>
            <span aria-hidden="true" className="text-[#F4C430]">·</span>
            <span>Faturamento semanal</span>
            <span aria-hidden="true" className="text-[#F4C430]">·</span>
            <span>Alerta preventivo</span>
          </div>
        </div>
      </section>

      {/* Right Split Panel: Unified Role Selector + Password Modal Card */}
      <section className="flex items-center justify-center p-6 sm:p-10 lg:p-14 bg-slate-50">
        <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 sm:p-8 shadow-sm">
          <div className="mb-6 border-b border-slate-200 pb-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="font-display text-xl font-bold tracking-tight text-[#10203A]">
                  Acesso ao Sistema
                </h2>
                <p className="mt-1 text-xs text-slate-500">
                  {configured
                    ? 'Selecione o modo de usuário e informe sua senha para continuar.'
                    : 'Primeiro acesso: escolha o modo de usuário e defina a senha inicial do sistema.'}
                </p>
              </div>
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-[#10203A] text-[#F4C430]">
                <Lock className="h-4 w-4" aria-hidden="true" />
              </div>
            </div>
          </div>

          {errorMsg && (
            <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs font-medium text-red-800">
              {errorMsg}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-2">
                Modo de Usuário
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {accountsToShow.map((acc) => {
                  const selected =
                    selectedLogin.toLowerCase() === acc.login.toLowerCase();
                  const showCustomName =
                    acc.nome.trim().toLowerCase() !== acc.role.trim().toLowerCase() &&
                    !acc.nome.toLowerCase().includes(acc.role.toLowerCase());
                  return (
                    <button
                      key={acc.login}
                      type="button"
                      onClick={() => {
                        setSelectedLogin(acc.login);
                        setErrorMsg('');
                      }}
                      className={`rounded-lg border px-3 py-2.5 text-left transition-all ${
                        selected
                          ? 'border-[#10203A] bg-[#10203A] text-white shadow-xs'
                          : 'border-slate-200 bg-white text-slate-800 hover:border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-bold truncate">
                          {acc.role}
                        </span>
                        {selected && (
                          <span
                            className="h-2 w-2 rounded-xs bg-[#F4C430] shrink-0"
                            aria-hidden="true"
                          />
                        )}
                      </div>
                      <div
                        className={`mt-0.5 text-[11px] truncate ${
                          selected ? 'text-slate-300' : 'text-slate-500'
                        }`}
                      >
                        {showCustomName ? acc.nome : ROLE_SUBTITLES[acc.role]}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Senha {selectedAccount ? `· ${selectedAccount.role}` : ''}
              </label>
              <div className="relative">
                <input
                  type={showPass ? 'text' : 'password'}
                  required
                  autoFocus
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Digite sua senha"
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-2.5 pr-10 text-sm font-mono text-slate-900 focus:border-[#10203A] focus:outline-none focus:ring-2 focus:ring-[#10203A]/15"
                />
                <button
                  type="button"
                  onClick={() => setShowPass((v) => !v)}
                  className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-700"
                  aria-label="Mostrar ou ocultar senha"
                >
                  {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting || !selectedLogin}
              className="w-full inline-flex items-center justify-center gap-2 rounded-md bg-[#F4C430] px-4 py-2.5 text-xs font-bold text-[#10203A] hover:bg-[#e5b520] transition-colors disabled:opacity-50"
            >
              <UserCheck className="h-4 w-4" aria-hidden="true" />
              {submitting ? 'Autenticando...' : 'Entrar no Horix'}
            </button>

            <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2 text-[11px] text-slate-500">
              <span className="inline-flex items-center gap-1.5">
                <span
                  className={`h-2 w-2 rounded-full shrink-0 ${
                    storageMode === null || databaseConnected === false
                      ? 'bg-red-500'
                      : storageMode === 'supabase'
                        ? 'bg-emerald-500'
                        : 'bg-amber-500'
                  }`}
                  aria-hidden="true"
                />
                {storageMode === null
                  ? 'API (/api) indisponível neste endereço'
                  : databaseConnected === false
                    ? 'Erro ao conectar no banco Supabase — verifique tabelas e variáveis de ambiente'
                    : storageMode === 'supabase'
                      ? 'Banco: Supabase conectado'
                      : 'Modo local — configure SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no painel'}
              </span>
            </div>
          </form>
        </div>
      </section>
    </div>
  );
}
