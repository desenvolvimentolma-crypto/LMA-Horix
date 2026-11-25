import { useState } from 'react';
import { KeyRound, Plus, Shield, Trash2, UserCheck, UserX } from 'lucide-react';
import type { AppUser, UserRole } from '../types/cobranca';

interface UsersViewProps {
  currentUser: AppUser;
  users: AppUser[];
  onCreateUser: (payload: {
    nome: string;
    login: string;
    role: UserRole;
    password: string;
  }) => Promise<void>;
  onUpdateUser: (
    id: string,
    patch: { nome?: string; role?: UserRole; ativo?: boolean; password?: string }
  ) => Promise<void>;
  onDeleteUser: (id: string) => Promise<void>;
}

const ALL_ROLES: UserRole[] = [
  'Desenvolvedor',
  'Recebimento',
  'Recepção',
  'Pesquisa',
  'Manutenção Preventiva',
];

export function UsersView({
  currentUser,
  users,
  onCreateUser,
  onUpdateUser,
  onDeleteUser,
}: UsersViewProps) {
  const [showCreate, setShowCreate] = useState(false);
  const [nome, setNome] = useState('');
  const [login, setLogin] = useState('');
  const [role, setRole] = useState<UserRole>('Recepção');
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const [resetUser, setResetUser] = useState<AppUser | null>(null);
  const [newPassword, setNewPassword] = useState('');

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    if (!nome.trim() || !login.trim() || password.length < 4) {
      setErrorMsg('Preencha nome, login e uma senha com pelo menos 4 caracteres.');
      return;
    }
    setSaving(true);
    try {
      await onCreateUser({
        nome: nome.trim(),
        login: login.trim().toLowerCase(),
        role,
        password,
      });
      setNome('');
      setLogin('');
      setPassword('');
      setShowCreate(false);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Erro ao criar usuário.');
    } finally {
      setSaving(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetUser || newPassword.length < 4) {
      setErrorMsg('A nova senha deve ter pelo menos 4 caracteres.');
      return;
    }
    setSaving(true);
    setErrorMsg('');
    try {
      await onUpdateUser(resetUser.id, { password: newPassword });
      setResetUser(null);
      setNewPassword('');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Erro ao redefinir senha.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-[#10203A]">
            Administração · Usuários e Permissões
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Gerencie os acessos dos perfis Desenvolvedor, Recebimento, Recepção, Pesquisa e Manutenção Preventiva.
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            setErrorMsg('');
            setShowCreate((v) => !v);
          }}
          className="inline-flex items-center gap-1.5 rounded-md bg-[#F4C430] px-3.5 py-2 text-xs font-bold text-[#10203A] hover:bg-[#e5b520] whitespace-nowrap"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          Novo Usuário
        </button>
      </div>

      {errorMsg && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-xs font-medium text-red-800">
          {errorMsg}
        </div>
      )}

      {/* Role Matrix Summary */}
      <div className="grid grid-cols-1 gap-px overflow-hidden rounded-lg border border-slate-200 bg-slate-200 md:grid-cols-5">
        <div className="bg-white p-3.5">
          <div className="text-xs font-semibold text-[#10203A]">Desenvolvedor</div>
          <p className="mt-1 text-[11px] text-slate-600 leading-relaxed">
            Acesso total ao sistema e gestão de usuários.
          </p>
        </div>
        <div className="bg-white p-3.5">
          <div className="text-xs font-semibold text-[#10203A]">Recebimento</div>
          <p className="mt-1 text-[11px] text-slate-600 leading-relaxed">
            Importação, faturamento, pesquisa e clientes. Sem acesso a Manutenção e Usuários.
          </p>
        </div>
        <div className="bg-white p-3.5">
          <div className="text-xs font-semibold text-[#10203A]">Recepção</div>
          <p className="mt-1 text-[11px] text-slate-600 leading-relaxed">
            Visão Geral e Coleta. Altera apenas para Coletado, Sem Retorno ou Pendente.
          </p>
        </div>
        <div className="bg-white p-3.5">
          <div className="text-xs font-semibold text-[#10203A]">Pesquisa</div>
          <p className="mt-1 text-[11px] text-slate-600 leading-relaxed">
            Consulta rápida por cliente, ficha ou patrimônio com último horímetro faturado.
          </p>
        </div>
        <div className="bg-white p-3.5">
          <div className="text-xs font-semibold text-[#10203A]">Manutenção Preventiva</div>
          <p className="mt-1 text-[11px] text-slate-600 leading-relaxed">
            Define horímetro base, próxima troca por plataforma e recebe alertas.
          </p>
        </div>
      </div>

      {showCreate && (
        <form
          onSubmit={handleCreate}
          className="rounded-lg border border-slate-200 bg-white p-5 space-y-4"
        >
          <h2 className="text-sm font-semibold text-[#10203A]">Cadastrar Novo Usuário</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Nome *</label>
              <input
                type="text"
                required
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Ex: Ana Paula"
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-xs"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Login *</label>
              <input
                type="text"
                required
                value={login}
                onChange={(e) => setLogin(e.target.value)}
                placeholder="Ex: anapaula"
                className="w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-xs lowercase"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Perfil *</label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as UserRole)}
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-xs"
              >
                {ALL_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Senha Inicial *
              </label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Mínimo 4 caracteres"
                className="w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-xs"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowCreate(false)}
              className="rounded-md border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-md bg-[#10203A] px-4 py-2 text-xs font-medium text-white hover:bg-[#193056] disabled:opacity-50"
            >
              {saving ? 'Salvando...' : 'Salvar Usuário'}
            </button>
          </div>
        </form>
      )}

      {/* Users Table */}
      <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-xs">
            <thead className="bg-slate-100 text-slate-700 border-b border-slate-200">
              <tr>
                <th className="px-4 py-2.5 font-semibold">Nome</th>
                <th className="px-4 py-2.5 font-semibold">Login</th>
                <th className="px-4 py-2.5 font-semibold">Perfil</th>
                <th className="px-4 py-2.5 font-semibold">Situação</th>
                <th className="px-4 py-2.5 font-semibold text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {users.map((u) => {
                const isSelf = u.id === currentUser.id;
                return (
                  <tr key={u.id} className="hover:bg-slate-50">
                    <td className="px-4 py-2.5 font-medium text-slate-900">
                      {u.nome}
                      {isSelf && (
                        <span className="ml-2 text-[11px] font-normal text-slate-500">
                          (você)
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-slate-700">{u.login}</td>
                    <td className="px-4 py-2.5">
                      <select
                        value={u.role}
                        disabled={isSelf}
                        onChange={(e) =>
                          onUpdateUser(u.id, { role: e.target.value as UserRole })
                        }
                        className="rounded border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-800 disabled:bg-slate-100"
                      >
                        {ALL_ROLES.map((r) => (
                          <option key={r} value={r}>
                            {r}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-2.5">
                      {u.ativo ? (
                        <span className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-800">
                          <UserCheck className="h-3.5 w-3.5" aria-hidden="true" />
                          Ativo
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                          <UserX className="h-3.5 w-3.5" aria-hidden="true" />
                          Inativo
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            setResetUser(u);
                            setNewPassword('');
                            setErrorMsg('');
                          }}
                          className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                        >
                          <KeyRound className="h-3 w-3" aria-hidden="true" />
                          Senha
                        </button>
                        {!isSelf && (
                          <>
                            <button
                              type="button"
                              onClick={() => onUpdateUser(u.id, { ativo: !u.ativo })}
                              className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                            >
                              <Shield className="h-3 w-3" aria-hidden="true" />
                              {u.ativo ? 'Desativar' : 'Ativar'}
                            </button>
                            <button
                              type="button"
                              onClick={() => onDeleteUser(u.id)}
                              className="rounded border border-red-200 bg-white p-1.5 text-red-700 hover:bg-red-50"
                              title="Excluir usuário"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {resetUser && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
          role="dialog"
          aria-modal="true"
        >
          <form
            onSubmit={handleResetPassword}
            className="w-full max-w-sm rounded-lg border border-slate-200 bg-white p-5 shadow-xl space-y-4"
          >
            <h2 className="text-sm font-semibold text-[#10203A]">
              Redefinir Senha · {resetUser.nome}
            </h2>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Nova Senha (mín. 4 caracteres)
              </label>
              <input
                type="password"
                required
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Digite a nova senha"
                className="w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-xs"
              />
            </div>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setResetUser(null)}
                className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={saving}
                className="rounded-md bg-[#10203A] px-3.5 py-1.5 text-xs font-medium text-white hover:bg-[#193056] disabled:opacity-50"
              >
                {saving ? 'Salvando...' : 'Atualizar Senha'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
