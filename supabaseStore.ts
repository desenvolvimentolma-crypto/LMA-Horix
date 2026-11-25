import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export type StatusHorimetro = 'Pendente' | 'Sem Retorno' | 'Coletado' | 'Faturado';
export type UserRole =
  | 'Desenvolvedor'
  | 'Recebimento'
  | 'Recepção'
  | 'Pesquisa'
  | 'Manutenção Preventiva';

export interface PublicUser {
  id: string;
  nome: string;
  login: string;
  role: UserRole;
  ativo: boolean;
  criadoEm: string;
  atualizadoEm: string;
}

export interface StoredAttachment {
  id: string;
  nomeOriginal: string;
  mimeType: string;
  tamanhoBytes: number;
  storedFileName: string;
  enviadoPor: string;
  enviadoEm: string;
}

export interface PatrimonioItem {
  patrimonio: string;
  horimetro: string;
}

export interface CobrancaRecord {
  id: string;
  status: StatusHorimetro;
  mesRef: string;
  anoRef: number;
  inicio: string;
  fim: string;
  numeroFicha: string;
  cliente: string;
  empresa: string;
  patrimonio: string;
  horimetro: string;
  patrimoniosItens?: PatrimonioItem[];
  dataColeta: string;
  nomeContato: string;
  telefoneContato: string;
  emailContato: string;
  observacoes: string;
  anexos?: StoredAttachment[];
  loteId: string;
  criadoEm: string;
  atualizadoEm: string;
  coletadoEm?: string;
  faturadoEm?: string;
}

export interface ImportBatch {
  id: string;
  nomeArquivo: string;
  origem: 'planilha' | 'colagem' | 'manual';
  quantidadeTotal: number;
  criadoEm: string;
  responsavel: string;
}

export interface PreventivePlan {
  id: string;
  cliente: string;
  patrimonio: string;
  horimetroBase: number;
  proximaTroca: number;
  intervaloHoras: number;
  avisoAntecedenciaHoras: number;
  observacoes: string;
  ultimaPreventivaEm?: string;
  atualizadoPor: string;
  atualizadoEm: string;
}

export interface PublicState {
  records: CobrancaRecord[];
  batches: ImportBatch[];
  preventivePlans: PreventivePlan[];
}

const STORAGE_BUCKET = 'horix-anexos';

function normalizeSupabaseUrl(raw: string): string | null {
  const cleaned = raw.trim().replace(/^["']|["']$/g, '').trim();
  if (!cleaned || /^MY_/i.test(cleaned) || /^YOUR_/i.test(cleaned)) {
    return null;
  }

  let candidate = cleaned;
  if (!/^https?:\/\//i.test(candidate)) {
    if (/^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}(\/.*)?$/.test(candidate)) {
      candidate = `https://${candidate}`;
    } else {
      return null;
    }
  }

  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null;
    }
    return parsed.origin;
  } catch {
    return null;
  }
}

function getSupabaseCredentials(): { url: string; key: string } | null {
  const rawUrl = String(
    process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
  );
  const rawKey = String(
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.SUPABASE_SECRET_KEY ||
      process.env.SUPABASE_KEY ||
      ''
  )
    .trim()
    .replace(/^["']|["']$/g, '')
    .trim();

  if (!rawUrl.trim() || !rawKey || /^MY_/i.test(rawKey) || /^YOUR_/i.test(rawKey)) {
    return null;
  }

  const url = normalizeSupabaseUrl(rawUrl);
  if (!url) {
    return null;
  }

  return { url, key: rawKey };
}

function isLikelyPublicKey(key: string): boolean {
  if (key.startsWith('sb_publishable_')) return true;
  const parts = key.split('.');
  if (parts.length === 3) {
    try {
      const payload = JSON.parse(
        Buffer.from(parts[1], 'base64url').toString('utf8')
      ) as { role?: string };
      if (payload.role === 'anon') return true;
    } catch {
      // Ignore non-JWT or malformed payloads
    }
  }
  return false;
}

export function isSupabaseConfigured(): boolean {
  return getSupabaseCredentials() !== null;
}

let cachedClient: SupabaseClient | null = null;
let cachedKeySignature = '';

function getClient(): SupabaseClient {
  const creds = getSupabaseCredentials();
  if (!creds) {
    throw new Error('SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY não configurados no servidor.');
  }
  if (isLikelyPublicKey(creds.key)) {
    throw new Error(
      'A chave configurada em SUPABASE_SERVICE_ROLE_KEY é pública (anon/publishable). Use a chave secreta (sb_secret_... ou service_role) em Settings → Secrets.'
    );
  }
  const sig = `${creds.url}::${creds.key.length}`;
  if (!cachedClient || cachedKeySignature !== sig) {
    cachedClient = createClient(creds.url, creds.key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    cachedKeySignature = sig;
  }
  return cachedClient;
}

function rowToUser(row: Record<string, unknown>): PublicUser {
  return {
    id: String(row.id),
    nome: String(row.nome || ''),
    login: String(row.login || ''),
    role: row.role as UserRole,
    ativo: Boolean(row.ativo),
    criadoEm: String(row.criado_em || new Date().toISOString()),
    atualizadoEm: String(row.atualizado_em || new Date().toISOString()),
  };
}

function rowToBatch(row: Record<string, unknown>): ImportBatch {
  return {
    id: String(row.id),
    nomeArquivo: String(row.nome_arquivo || ''),
    origem: (row.origem as ImportBatch['origem']) || 'planilha',
    quantidadeTotal: Number(row.quantidade_total || 0),
    criadoEm: String(row.criado_em || new Date().toISOString()),
    responsavel: String(row.responsavel || ''),
  };
}

function rowToAttachment(row: Record<string, unknown>): StoredAttachment {
  return {
    id: String(row.id),
    nomeOriginal: String(row.nome_original || ''),
    mimeType: String(row.mime_type || 'application/octet-stream'),
    tamanhoBytes: Number(row.tamanho_bytes || 0),
    storedFileName: String(row.storage_path || ''),
    enviadoPor: String(row.enviado_por || ''),
    enviadoEm: String(row.enviado_em || new Date().toISOString()),
  };
}

function normalizePatrimoniosItens(raw: unknown): PatrimonioItem[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      const obj = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>;
      return {
        patrimonio: String(obj.patrimonio || '').trim().toUpperCase(),
        horimetro: String(obj.horimetro || '').trim(),
      };
    })
    .filter((item) => item.patrimonio !== '' || item.horimetro !== '');
}

function summarizePatrimonios(
  items: PatrimonioItem[],
  fallbackPatrimonio = '',
  fallbackHorimetro = ''
): { patrimonio: string; horimetro: string; patrimoniosItens: PatrimonioItem[] } {
  const cleaned = normalizePatrimoniosItens(items);
  if (cleaned.length > 0) {
    return {
      patrimonio: cleaned.map((i) => i.patrimonio).filter(Boolean).join(' / '),
      horimetro: cleaned.map((i) => i.horimetro).filter(Boolean).join(' / '),
      patrimoniosItens: cleaned,
    };
  }
  const pat = fallbackPatrimonio.trim().toUpperCase();
  const hor = fallbackHorimetro.trim();
  return {
    patrimonio: pat,
    horimetro: hor,
    patrimoniosItens: pat || hor ? [{ patrimonio: pat, horimetro: hor }] : [],
  };
}

function isMissingPatrimoniosColumnError(message: string): boolean {
  return /patrimonios_itens/i.test(message) && /(column|schema cache)/i.test(message);
}

function rowToRecord(
  row: Record<string, unknown>,
  attachmentsByRecord: Map<string, StoredAttachment[]>
): CobrancaRecord {
  const id = String(row.id);
  const rawPat = String(row.patrimonio || '');
  const rawHor = String(row.horimetro || '');
  const parsedItens = normalizePatrimoniosItens(row.patrimonios_itens);
  return {
    id,
    status: (row.status as StatusHorimetro) || 'Pendente',
    mesRef: String(row.mes_ref || ''),
    anoRef: Number(row.ano_ref || new Date().getFullYear()),
    inicio: String(row.inicio || ''),
    fim: String(row.fim || ''),
    numeroFicha: String(row.numero_ficha || ''),
    cliente: String(row.cliente || ''),
    empresa: String(row.empresa || 'BALOC'),
    patrimonio: rawPat,
    horimetro: rawHor,
    patrimoniosItens: parsedItens.length > 0 ? parsedItens : undefined,
    dataColeta: String(row.data_coleta || ''),
    nomeContato: String(row.nome_contato || ''),
    telefoneContato: String(row.telefone_contato || ''),
    emailContato: String(row.email_contato || ''),
    observacoes: String(row.observacoes || ''),
    anexos: attachmentsByRecord.get(id) || [],
    loteId: row.lote_id ? String(row.lote_id) : 'manual',
    criadoEm: String(row.criado_em || new Date().toISOString()),
    atualizadoEm: String(row.atualizado_em || new Date().toISOString()),
    coletadoEm: row.coletado_em ? String(row.coletado_em) : undefined,
    faturadoEm: row.faturado_em ? String(row.faturado_em) : undefined,
  };
}

function rowToPlan(row: Record<string, unknown>): PreventivePlan {
  return {
    id: String(row.id),
    cliente: String(row.cliente || ''),
    patrimonio: String(row.patrimonio || ''),
    horimetroBase: Number(row.horimetro_base || 0),
    proximaTroca: Number(row.proxima_troca || 0),
    intervaloHoras: Number(row.intervalo_horas || 0),
    avisoAntecedenciaHoras: Number(row.aviso_antecedencia_horas ?? 10),
    observacoes: String(row.observacoes || ''),
    ultimaPreventivaEm: row.ultima_preventiva_em
      ? String(row.ultima_preventiva_em)
      : undefined,
    atualizadoPor: String(row.atualizado_por || ''),
    atualizadoEm: String(row.atualizado_em || new Date().toISOString()),
  };
}

function formatSupabaseError(prefix: string, message: string): string {
  if (/permission denied for table/i.test(message)) {
    return `${prefix}: ${message}. Execute no SQL Editor do Supabase: GRANT USAGE ON SCHEMA public TO service_role; GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role; GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role; GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role;`;
  }
  return `${prefix}: ${message}`;
}

export async function sbCheckHealth(): Promise<{
  connected: boolean;
  error?: string;
}> {
  try {
    const sb = getClient();
    const { error } = await sb.from('app_users').select('id').limit(1);
    if (error) {
      return {
        connected: false,
        error: formatSupabaseError(
          'Falha ao consultar tabela app_users no Supabase',
          error.message
        ),
      };
    }
    return { connected: true };
  } catch (err) {
    return {
      connected: false,
      error: err instanceof Error ? err.message : 'Erro ao conectar no Supabase.',
    };
  }
}

export async function sbGetAuthStatus(): Promise<{
  configured: boolean;
  availableAccounts: Array<{ login: string; nome: string; role: UserRole }>;
}> {
  const sb = getClient();
  const { data, error } = await sb
    .from('app_users')
    .select('login, nome, role, ativo')
    .order('criado_em', { ascending: true });

  if (error) {
    throw new Error(
      formatSupabaseError('Erro ao consultar usuários no Supabase', error.message)
    );
  }

  const rows = data || [];
  return {
    configured: rows.length > 0,
    availableAccounts: rows
      .filter((u) => Boolean(u.ativo))
      .map((u) => ({
        login: String(u.login),
        nome: String(u.nome),
        role: u.role as UserRole,
      })),
  };
}

export async function sbBootstrapUsers(params: {
  developerName: string;
  initialPassword: string;
  selectedLogin?: string;
}): Promise<{
  alreadyConfigured: boolean;
  activeUser?: PublicUser;
  users?: PublicUser[];
}> {
  const sb = getClient();
  const { count, error: countErr } = await sb
    .from('app_users')
    .select('id', { count: 'exact', head: true });

  if (countErr) {
    throw new Error(`Erro ao verificar usuários no Supabase: ${countErr.message}`);
  }
  if ((count || 0) > 0) {
    return { alreadyConfigured: true };
  }

  const seedAccounts: Array<{ nome: string; login: string; role: UserRole }> = [
    {
      nome: params.developerName.trim() || 'Desenvolvedor',
      login: 'desenvolvedor',
      role: 'Desenvolvedor',
    },
    { nome: 'Equipe Recebimento', login: 'recebimento', role: 'Recebimento' },
    { nome: 'Equipe Recepção', login: 'recepcao', role: 'Recepção' },
    { nome: 'Consulta / Pesquisa', login: 'pesquisa', role: 'Pesquisa' },
    {
      nome: 'Manutenção Preventiva',
      login: 'manutencao',
      role: 'Manutenção Preventiva',
    },
  ];

  for (const acc of seedAccounts) {
    const { error: rpcErr } = await sb.rpc('horix_upsert_user', {
      p_nome: acc.nome,
      p_login: acc.login,
      p_role: acc.role,
      p_password: params.initialPassword,
      p_ativo: true,
    });
    if (rpcErr) {
      throw new Error(`Erro ao criar perfil ${acc.login}: ${rpcErr.message}`);
    }
  }

  const users = await sbListUsers();
  const targetLogin = (params.selectedLogin || 'desenvolvedor').trim().toLowerCase();
  const activeUser =
    users.find((u) => u.login === targetLogin) ||
    users.find((u) => u.login === 'desenvolvedor') ||
    users[0];
  return { alreadyConfigured: false, activeUser, users };
}

export async function sbVerifyLogin(
  login: string,
  password: string
): Promise<PublicUser | null> {
  const sb = getClient();
  const cleanLogin = login.trim().toLowerCase();

  const { data, error } = await sb.rpc('horix_verify_login', {
    p_login: cleanLogin,
    p_password: password,
  });

  if (error) {
    throw new Error(`Erro ao autenticar no Supabase: ${error.message}`);
  }

  const matched = Array.isArray(data) ? data[0] : null;
  if (matched && matched.id) {
    return sbGetUserById(String(matched.id));
  }

  const envOverride = process.env.INITIAL_ADMIN_PASSCODE?.trim();
  if (envOverride && password === envOverride) {
    const { data: devRow } = await sb
      .from('app_users')
      .select('id, nome, login, role, ativo, criado_em, atualizado_em')
      .eq('login', cleanLogin)
      .eq('role', 'Desenvolvedor')
      .eq('ativo', true)
      .maybeSingle();
    if (devRow) {
      return rowToUser(devRow);
    }
  }

  return null;
}

export async function sbGetUserById(id: string): Promise<PublicUser | null> {
  const sb = getClient();
  const { data, error } = await sb
    .from('app_users')
    .select('id, nome, login, role, ativo, criado_em, atualizado_em')
    .eq('id', id)
    .maybeSingle();

  if (error || !data) return null;
  return rowToUser(data);
}

export async function sbListUsers(): Promise<PublicUser[]> {
  const sb = getClient();
  const { data, error } = await sb
    .from('app_users')
    .select('id, nome, login, role, ativo, criado_em, atualizado_em')
    .order('criado_em', { ascending: true });

  if (error) {
    throw new Error(`Erro ao listar usuários: ${error.message}`);
  }
  return (data || []).map(rowToUser);
}

export async function sbCreateUser(payload: {
  nome: string;
  login: string;
  role: UserRole;
  password: string;
}): Promise<{ conflict?: boolean; user?: PublicUser; users?: PublicUser[] }> {
  const sb = getClient();
  const cleanLogin = payload.login.trim().toLowerCase().replace(/\s+/g, '');

  const { data: existing } = await sb
    .from('app_users')
    .select('id')
    .eq('login', cleanLogin)
    .maybeSingle();

  if (existing) {
    return { conflict: true };
  }

  const { data: newId, error } = await sb.rpc('horix_upsert_user', {
    p_nome: payload.nome.trim(),
    p_login: cleanLogin,
    p_role: payload.role,
    p_password: payload.password,
    p_ativo: true,
  });

  if (error) {
    throw new Error(`Erro ao criar usuário: ${error.message}`);
  }

  const users = await sbListUsers();
  const user = users.find((u) => u.id === String(newId)) || users.find((u) => u.login === cleanLogin);
  return { user, users };
}

export async function sbUpdateUser(
  id: string,
  patch: { nome?: string; role?: UserRole; ativo?: boolean; password?: string }
): Promise<{ notFound?: boolean; user?: PublicUser; users?: PublicUser[] }> {
  const sb = getClient();
  const current = await sbGetUserById(id);
  if (!current) return { notFound: true };

  if (patch.password && patch.password.length >= 4) {
    const { error } = await sb.rpc('horix_upsert_user', {
      p_nome: patch.nome !== undefined ? patch.nome.trim() || current.nome : current.nome,
      p_login: current.login,
      p_role: patch.role ?? current.role,
      p_password: patch.password,
      p_ativo: patch.ativo !== undefined ? Boolean(patch.ativo) : current.ativo,
    });
    if (error) {
      throw new Error(`Erro ao atualizar usuário: ${error.message}`);
    }
  } else {
    const { error } = await sb
      .from('app_users')
      .update({
        nome: patch.nome !== undefined ? patch.nome.trim() || current.nome : current.nome,
        role: patch.role ?? current.role,
        ativo: patch.ativo !== undefined ? Boolean(patch.ativo) : current.ativo,
      })
      .eq('id', id);
    if (error) {
      throw new Error(`Erro ao atualizar usuário: ${error.message}`);
    }
  }

  const users = await sbListUsers();
  const user = users.find((u) => u.id === id);
  return { user, users };
}

export async function sbDeleteUser(id: string): Promise<PublicUser[]> {
  const sb = getClient();
  const { error } = await sb.from('app_users').delete().eq('id', id);
  if (error) {
    throw new Error(`Erro ao excluir usuário: ${error.message}`);
  }
  return sbListUsers();
}

export async function sbGetPublicState(): Promise<PublicState> {
  const sb = getClient();

  const [recordsRes, batchesRes, attachmentsRes, plansRes] = await Promise.all([
    sb
      .from('cobranca_records')
      .select('*')
      .order('criado_em', { ascending: false })
      .limit(10000),
    sb
      .from('import_batches')
      .select('*')
      .order('criado_em', { ascending: false })
      .limit(2000),
    sb
      .from('ficha_attachments')
      .select('*')
      .order('enviado_em', { ascending: true })
      .limit(10000),
    sb
      .from('preventive_plans')
      .select('*')
      .order('atualizado_em', { ascending: false })
      .limit(5000),
  ]);

  if (recordsRes.error) throw new Error(recordsRes.error.message);
  if (batchesRes.error) throw new Error(batchesRes.error.message);
  if (attachmentsRes.error) throw new Error(attachmentsRes.error.message);
  if (plansRes.error) throw new Error(plansRes.error.message);

  const attachmentsByRecord = new Map<string, StoredAttachment[]>();
  for (const row of attachmentsRes.data || []) {
    const recId = String(row.record_id);
    const list = attachmentsByRecord.get(recId) || [];
    list.push(rowToAttachment(row));
    attachmentsByRecord.set(recId, list);
  }

  return {
    records: (recordsRes.data || []).map((r) => rowToRecord(r, attachmentsByRecord)),
    batches: (batchesRes.data || []).map(rowToBatch),
    preventivePlans: (plansRes.data || []).map(rowToPlan),
  };
}

export async function sbImportRecords(params: {
  rows: Array<Partial<CobrancaRecord>>;
  nomeArquivo: string;
  origem: ImportBatch['origem'];
  duplicateMode?: 'skip' | 'overwrite';
  responsavel: string;
  responsavelId?: string;
  loteId: string;
}): Promise<{
  insertedCount: number;
  updatedCount: number;
  skippedCount: number;
  state: PublicState;
}> {
  const sb = getClient();

  const { data: existingRows, error: fetchErr } = await sb
    .from('cobranca_records')
    .select(
      'id, numero_ficha, inicio, fim, cliente, empresa, mes_ref, ano_ref, patrimonio, horimetro, data_coleta, nome_contato, telefone_contato, email_contato, observacoes'
    )
    .limit(10000);

  if (fetchErr) throw new Error(fetchErr.message);

  const existingByKey = new Map<string, Record<string, unknown>>();
  for (const r of existingRows || []) {
    const key = `${String(r.numero_ficha || '').trim().toUpperCase()}__${String(r.inicio || '').trim()}`;
    existingByKey.set(key, r);
  }

  const toInsert: Array<Record<string, unknown>> = [];
  const toUpdate: Array<{ id: string; fields: Record<string, unknown> }> = [];
  let skippedCount = 0;

  for (const row of params.rows) {
    const numeroFicha = String(row.numeroFicha || '').trim();
    const inicio = String(row.inicio || '').trim();
    const key = `${numeroFicha.toUpperCase()}__${inicio}`;
    const existing = existingByKey.get(key);

    if (existing) {
      if (params.duplicateMode === 'overwrite') {
        toUpdate.push({
          id: String(existing.id),
          fields: {
            fim: String(row.fim || existing.fim || ''),
            cliente: String(row.cliente || existing.cliente || ''),
            empresa: String(row.empresa || existing.empresa || 'BALOC'),
            mes_ref: String(row.mesRef || existing.mes_ref || 'novembro').toLowerCase(),
            ano_ref: Number(row.anoRef || existing.ano_ref || new Date().getFullYear()),
            patrimonio: String(row.patrimonio || existing.patrimonio || ''),
            horimetro: String(row.horimetro || existing.horimetro || ''),
            data_coleta: String(row.dataColeta || existing.data_coleta || ''),
            nome_contato: String(row.nomeContato || existing.nome_contato || ''),
            telefone_contato: String(row.telefoneContato || existing.telefone_contato || ''),
            email_contato: String(row.emailContato || existing.email_contato || ''),
            observacoes: String(row.observacoes || existing.observacoes || ''),
          },
        });
      } else {
        skippedCount++;
      }
      continue;
    }

    const status: StatusHorimetro =
      row.status === 'Coletado' ||
      row.status === 'Faturado' ||
      row.status === 'Sem Retorno'
        ? row.status
        : 'Pendente';

    toInsert.push({
      status,
      mes_ref: String(row.mesRef || 'novembro').toLowerCase(),
      ano_ref: Number(row.anoRef || new Date().getFullYear()),
      inicio,
      fim: String(row.fim || ''),
      numero_ficha: numeroFicha,
      cliente: String(row.cliente || 'CLIENTE NÃO INFORMADO'),
      empresa: String(row.empresa || 'BALOC'),
      patrimonio: String(row.patrimonio || ''),
      horimetro: String(row.horimetro || ''),
      data_coleta: String(row.dataColeta || ''),
      nome_contato: String(row.nomeContato || ''),
      telefone_contato: String(row.telefoneContato || ''),
      email_contato: String(row.emailContato || ''),
      observacoes: String(row.observacoes || ''),
      lote_id: params.loteId,
    });
    existingByKey.set(key, { numero_ficha: numeroFicha, inicio });
  }

  const insertedCount = toInsert.length;
  const updatedCount = toUpdate.length;

  if (insertedCount > 0 || updatedCount > 0) {
    const { error: batchErr } = await sb.from('import_batches').insert({
      id: params.loteId,
      nome_arquivo: params.nomeArquivo,
      origem: params.origem,
      quantidade_total: insertedCount + updatedCount,
      responsavel: params.responsavel,
      responsavel_id: params.responsavelId || null,
    });
    if (batchErr) throw new Error(batchErr.message);
  }

  if (insertedCount > 0) {
    const { error: insErr } = await sb.from('cobranca_records').insert(toInsert);
    if (insErr) throw new Error(insErr.message);
  }

  for (const item of toUpdate) {
    const { error: updErr } = await sb
      .from('cobranca_records')
      .update(item.fields)
      .eq('id', item.id);
    if (updErr) throw new Error(updErr.message);
  }

  const state = await sbGetPublicState();
  return { insertedCount, updatedCount, skippedCount, state };
}

export async function sbCreateRecord(
  payload: Partial<CobrancaRecord>
): Promise<{ record: CobrancaRecord; state: PublicState }> {
  const sb = getClient();
  const loteId =
    payload.loteId && payload.loteId !== 'manual' ? payload.loteId : null;
  const summary = summarizePatrimonios(
    payload.patrimoniosItens || [],
    String(payload.patrimonio || ''),
    String(payload.horimetro || '')
  );

  const baseInsert = {
    status: payload.status || 'Pendente',
    mes_ref: String(payload.mesRef || 'novembro').toLowerCase(),
    ano_ref: Number(payload.anoRef || new Date().getFullYear()),
    inicio: String(payload.inicio || ''),
    fim: String(payload.fim || ''),
    numero_ficha: String(payload.numeroFicha || ''),
    cliente: String(payload.cliente || ''),
    empresa: String(payload.empresa || 'BALOC'),
    patrimonio: summary.patrimonio,
    horimetro: summary.horimetro,
    data_coleta: String(payload.dataColeta || ''),
    nome_contato: String(payload.nomeContato || ''),
    telefone_contato: String(payload.telefoneContato || ''),
    email_contato: String(payload.emailContato || ''),
    observacoes: String(payload.observacoes || ''),
    lote_id: loteId,
  };

  let { data, error } = await sb
    .from('cobranca_records')
    .insert({ ...baseInsert, patrimonios_itens: summary.patrimoniosItens })
    .select('*')
    .single();

  if (error && isMissingPatrimoniosColumnError(error.message)) {
    ({ data, error } = await sb
      .from('cobranca_records')
      .insert(baseInsert)
      .select('*')
      .single());
  }

  if (error || !data) throw new Error(error?.message || 'Erro ao criar registro.');

  const state = await sbGetPublicState();
  const record = rowToRecord(data, new Map());
  return { record, state };
}

export async function sbPatchRecord(
  id: string,
  patch: Partial<CobrancaRecord>,
  role?: UserRole
): Promise<{
  errorStatus: number | null;
  error?: string;
  record?: CobrancaRecord;
  state?: PublicState;
}> {
  const sb = getClient();
  const { data: prev, error: findErr } = await sb
    .from('cobranca_records')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (findErr) throw new Error(findErr.message);
  if (!prev) return { errorStatus: 404, error: 'Registro não encontrado.' };

  const prevStatus = prev.status as StatusHorimetro;
  const nextStatus = patch.status ?? prevStatus;

  if (role === 'Recepção') {
    if (prevStatus === 'Faturado') {
      return {
        errorStatus: 403,
        error: 'Registros já faturados não podem ser alterados pela Recepção.',
      };
    }
    if (nextStatus === 'Faturado') {
      return {
        errorStatus: 403,
        error: 'A Recepção só pode alterar o status para Coletado, Sem Retorno ou Pendente.',
      };
    }
  }

  const allowedPatch: Partial<CobrancaRecord> =
    role === 'Recepção'
      ? {
          patrimonio: patch.patrimonio,
          horimetro: patch.horimetro,
          patrimoniosItens: patch.patrimoniosItens,
          dataColeta: patch.dataColeta,
          nomeContato: patch.nomeContato,
          telefoneContato: patch.telefoneContato,
          emailContato: patch.emailContato,
          observacoes: patch.observacoes,
          status: patch.status,
        }
      : patch;

  const dbUpdate: Record<string, unknown> = {};
  if (allowedPatch.status !== undefined) dbUpdate.status = allowedPatch.status;
  if (allowedPatch.mesRef !== undefined) dbUpdate.mes_ref = allowedPatch.mesRef;
  if (allowedPatch.anoRef !== undefined) dbUpdate.ano_ref = allowedPatch.anoRef;
  if (allowedPatch.inicio !== undefined) dbUpdate.inicio = allowedPatch.inicio;
  if (allowedPatch.fim !== undefined) dbUpdate.fim = allowedPatch.fim;
  if (allowedPatch.numeroFicha !== undefined) dbUpdate.numero_ficha = allowedPatch.numeroFicha;
  if (allowedPatch.cliente !== undefined) dbUpdate.cliente = allowedPatch.cliente;
  if (allowedPatch.empresa !== undefined) dbUpdate.empresa = allowedPatch.empresa;

  if (allowedPatch.patrimoniosItens !== undefined) {
    const summary = summarizePatrimonios(
      allowedPatch.patrimoniosItens,
      allowedPatch.patrimonio ?? '',
      allowedPatch.horimetro ?? ''
    );
    dbUpdate.patrimonio = summary.patrimonio;
    dbUpdate.horimetro = summary.horimetro;
    dbUpdate.patrimonios_itens = summary.patrimoniosItens;
  } else if (
    allowedPatch.patrimonio !== undefined ||
    allowedPatch.horimetro !== undefined
  ) {
    const nextPat = String(allowedPatch.patrimonio ?? prev.patrimonio ?? '')
      .trim()
      .toUpperCase();
    const nextHor = String(allowedPatch.horimetro ?? prev.horimetro ?? '').trim();
    dbUpdate.patrimonio = nextPat;
    dbUpdate.horimetro = nextHor;
    const prevItens = normalizePatrimoniosItens(prev.patrimonios_itens);
    if (prevItens.length <= 1) {
      dbUpdate.patrimonios_itens =
        nextPat || nextHor ? [{ patrimonio: nextPat, horimetro: nextHor }] : [];
    }
  }

  if (allowedPatch.dataColeta !== undefined) dbUpdate.data_coleta = allowedPatch.dataColeta;
  if (allowedPatch.nomeContato !== undefined) dbUpdate.nome_contato = allowedPatch.nomeContato;
  if (allowedPatch.telefoneContato !== undefined) {
    dbUpdate.telefone_contato = allowedPatch.telefoneContato;
  }
  if (allowedPatch.emailContato !== undefined) dbUpdate.email_contato = allowedPatch.emailContato;
  if (allowedPatch.observacoes !== undefined) dbUpdate.observacoes = allowedPatch.observacoes;

  let { error: updErr } = await sb
    .from('cobranca_records')
    .update(dbUpdate)
    .eq('id', id);

  if (updErr && isMissingPatrimoniosColumnError(updErr.message)) {
    const fallbackUpdate = { ...dbUpdate };
    delete fallbackUpdate.patrimonios_itens;
    ({ error: updErr } = await sb
      .from('cobranca_records')
      .update(fallbackUpdate)
      .eq('id', id));
  }

  if (updErr) throw new Error(updErr.message);

  const state = await sbGetPublicState();
  const updated = state.records.find((r) => r.id === id);
  return { errorStatus: null, record: updated, state };
}

export async function sbBulkUpdateStatus(
  ids: string[],
  status: StatusHorimetro
): Promise<PublicState> {
  const sb = getClient();
  const { error } = await sb
    .from('cobranca_records')
    .update({ status })
    .in('id', ids);

  if (error) throw new Error(error.message);
  return sbGetPublicState();
}

export async function sbUploadAttachment(params: {
  recordId: string;
  attachmentId: string;
  storagePath: string;
  nomeOriginal: string;
  mimeType: string;
  fileBuffer: Buffer;
  enviadoPor: string;
  enviadoPorId?: string;
  role?: UserRole;
}): Promise<{
  errorStatus: number | null;
  error?: string;
  attachment?: StoredAttachment;
  record?: CobrancaRecord;
  state?: PublicState;
}> {
  const sb = getClient();

  const { data: recRow, error: recErr } = await sb
    .from('cobranca_records')
    .select('id, status')
    .eq('id', params.recordId)
    .maybeSingle();

  if (recErr) throw new Error(recErr.message);
  if (!recRow) return { errorStatus: 404, error: 'Registro não encontrado.' };

  if (params.role === 'Recepção' && recRow.status === 'Faturado') {
    return {
      errorStatus: 403,
      error: 'Registros já faturados não podem ser alterados pela Recepção.',
    };
  }

  const { count } = await sb
    .from('ficha_attachments')
    .select('id', { count: 'exact', head: true })
    .eq('record_id', params.recordId);

  if ((count || 0) >= 10) {
    return {
      errorStatus: 400,
      error: 'Limite máximo de 10 anexos por ficha atingido.',
    };
  }

  const { error: uploadErr } = await sb.storage
    .from(STORAGE_BUCKET)
    .upload(params.storagePath, params.fileBuffer, {
      contentType: params.mimeType,
      upsert: false,
    });

  if (uploadErr) {
    throw new Error(`Erro ao enviar arquivo para o Storage: ${uploadErr.message}`);
  }

  const { data: insertedRow, error: dbErr } = await sb
    .from('ficha_attachments')
    .insert({
      id: params.attachmentId,
      record_id: params.recordId,
      nome_original: params.nomeOriginal,
      mime_type: params.mimeType,
      tamanho_bytes: params.fileBuffer.length,
      storage_path: params.storagePath,
      enviado_por: params.enviadoPor,
      enviado_por_id: params.enviadoPorId || null,
    })
    .select('*')
    .single();

  if (dbErr) {
    await sb.storage.from(STORAGE_BUCKET).remove([params.storagePath]);
    throw new Error(dbErr.message);
  }

  const state = await sbGetPublicState();
  const record = state.records.find((r) => r.id === params.recordId);
  return {
    errorStatus: null,
    attachment: rowToAttachment(insertedRow),
    record,
    state,
  };
}

export async function sbDownloadAttachment(
  recordId: string,
  attachmentId: string
): Promise<{
  errorStatus: number | null;
  error?: string;
  buffer?: Buffer;
  mimeType?: string;
  nomeOriginal?: string;
}> {
  const sb = getClient();
  const { data: row, error } = await sb
    .from('ficha_attachments')
    .select('*')
    .eq('id', attachmentId)
    .eq('record_id', recordId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!row) return { errorStatus: 404, error: 'Anexo não encontrado.' };

  const { data: blob, error: dlErr } = await sb.storage
    .from(STORAGE_BUCKET)
    .download(String(row.storage_path));

  if (dlErr || !blob) {
    return { errorStatus: 404, error: 'Arquivo não encontrado no Storage.' };
  }

  const arrayBuf = await blob.arrayBuffer();
  return {
    errorStatus: null,
    buffer: Buffer.from(arrayBuf),
    mimeType: String(row.mime_type),
    nomeOriginal: String(row.nome_original),
  };
}

export async function sbDeleteAttachment(
  recordId: string,
  attachmentId: string,
  role?: UserRole
): Promise<{
  errorStatus: number | null;
  error?: string;
  record?: CobrancaRecord;
  state?: PublicState;
}> {
  const sb = getClient();
  const { data: recRow } = await sb
    .from('cobranca_records')
    .select('id, status')
    .eq('id', recordId)
    .maybeSingle();

  if (!recRow) return { errorStatus: 404, error: 'Registro não encontrado.' };
  if (role === 'Recepção' && recRow.status === 'Faturado') {
    return {
      errorStatus: 403,
      error: 'Registros já faturados não podem ser alterados pela Recepção.',
    };
  }

  const { data: attRow } = await sb
    .from('ficha_attachments')
    .select('*')
    .eq('id', attachmentId)
    .eq('record_id', recordId)
    .maybeSingle();

  if (!attRow) return { errorStatus: 404, error: 'Anexo não encontrado.' };

  await sb.storage.from(STORAGE_BUCKET).remove([String(attRow.storage_path)]);

  const { error: delErr } = await sb
    .from('ficha_attachments')
    .delete()
    .eq('id', attachmentId);

  if (delErr) throw new Error(delErr.message);

  const state = await sbGetPublicState();
  const record = state.records.find((r) => r.id === recordId);
  return { errorStatus: null, record, state };
}

export async function sbDeleteRecord(id: string): Promise<PublicState> {
  const sb = getClient();
  const { data: attRows } = await sb
    .from('ficha_attachments')
    .select('storage_path')
    .eq('record_id', id);

  const paths = (attRows || []).map((r) => String(r.storage_path)).filter(Boolean);
  if (paths.length > 0) {
    await sb.storage.from(STORAGE_BUCKET).remove(paths);
  }

  const { error } = await sb.from('cobranca_records').delete().eq('id', id);
  if (error) throw new Error(error.message);

  return sbGetPublicState();
}

export async function sbDeleteBatch(batchId: string): Promise<PublicState> {
  const sb = getClient();
  const { data: recRows } = await sb
    .from('cobranca_records')
    .select('id')
    .eq('lote_id', batchId);

  const recIds = (recRows || []).map((r) => String(r.id));
  if (recIds.length > 0) {
    const { data: attRows } = await sb
      .from('ficha_attachments')
      .select('storage_path')
      .in('record_id', recIds);
    const paths = (attRows || []).map((r) => String(r.storage_path)).filter(Boolean);
    if (paths.length > 0) {
      await sb.storage.from(STORAGE_BUCKET).remove(paths);
    }
    await sb.from('cobranca_records').delete().in('id', recIds);
  }

  const { error } = await sb.from('import_batches').delete().eq('id', batchId);
  if (error) throw new Error(error.message);

  return sbGetPublicState();
}

export async function sbUpsertPreventivePlan(params: {
  cliente: string;
  patrimonio: string;
  horimetroBase: number;
  proximaTroca: number;
  avisoAntecedenciaHoras: number;
  observacoes: string;
  atualizadoPor: string;
  atualizadoPorId?: string;
}): Promise<{ plan: PreventivePlan; state: PublicState }> {
  const sb = getClient();
  const intervalo = Number((params.proximaTroca - params.horimetroBase).toFixed(2));

  const { data, error } = await sb
    .from('preventive_plans')
    .upsert(
      {
        cliente: params.cliente,
        patrimonio: params.patrimonio,
        horimetro_base: params.horimetroBase,
        proxima_troca: params.proximaTroca,
        intervalo_horas: intervalo,
        aviso_antecedencia_horas: params.avisoAntecedenciaHoras,
        observacoes: params.observacoes,
        atualizado_por: params.atualizadoPor,
        atualizado_por_id: params.atualizadoPorId || null,
      },
      { onConflict: 'cliente,patrimonio' }
    )
    .select('*')
    .single();

  if (error) throw new Error(error.message);
  const state = await sbGetPublicState();
  return { plan: rowToPlan(data), state };
}

export async function sbCompletePreventivePlan(params: {
  id: string;
  horimetroRealizado: number;
  atualizadoPor: string;
  atualizadoPorId?: string;
}): Promise<{ notFound?: boolean; plan?: PreventivePlan; state?: PublicState }> {
  const sb = getClient();
  const { data: current, error: findErr } = await sb
    .from('preventive_plans')
    .select('*')
    .eq('id', params.id)
    .maybeSingle();

  if (findErr) throw new Error(findErr.message);
  if (!current) return { notFound: true };

  const intervalo =
    Number(current.intervalo_horas) > 0
      ? Number(current.intervalo_horas)
      : Math.max(10, Number(current.proxima_troca) - Number(current.horimetro_base));
  const nextTroca = Number((params.horimetroRealizado + intervalo).toFixed(2));
  const now = new Date().toISOString();

  const { data: updated, error: updErr } = await sb
    .from('preventive_plans')
    .update({
      horimetro_base: params.horimetroRealizado,
      proxima_troca: nextTroca,
      intervalo_horas: intervalo,
      ultima_preventiva_em: now,
      atualizado_por: params.atualizadoPor,
      atualizado_por_id: params.atualizadoPorId || null,
    })
    .eq('id', params.id)
    .select('*')
    .single();

  if (updErr) throw new Error(updErr.message);

  await sb.from('preventive_history').insert({
    plan_id: params.id,
    cliente: String(current.cliente),
    patrimonio: String(current.patrimonio),
    horimetro_realizado: params.horimetroRealizado,
    proxima_troca_definida: nextTroca,
    realizado_por: params.atualizadoPor,
    observacoes: String(current.observacoes || ''),
    realizado_em: now,
  });

  const state = await sbGetPublicState();
  return { plan: rowToPlan(updated), state };
}

export async function sbDeletePreventivePlan(id: string): Promise<PublicState> {
  const sb = getClient();
  const { error } = await sb.from('preventive_plans').delete().eq('id', id);
  if (error) throw new Error(error.message);
  return sbGetPublicState();
}
