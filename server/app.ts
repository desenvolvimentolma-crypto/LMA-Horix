import 'dotenv/config';
import express from 'express';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {
  isSupabaseConfigured,
  sbBootstrapUsers,
  sbBulkUpdateStatus,
  sbCheckHealth,
  sbCompletePreventivePlan,
  sbCreateRecord,
  sbCreateUser,
  sbDeleteAttachment,
  sbDeleteBatch,
  sbDeletePreventivePlan,
  sbDeleteRecord,
  sbDeleteUser,
  sbDownloadAttachment,
  sbGetAuthStatus,
  sbGetPublicState,
  sbGetUserById,
  sbImportRecords,
  sbListUsers,
  sbPatchRecord,
  sbUpdateUser,
  sbUploadAttachment,
  sbUpsertPreventivePlan,
  sbVerifyLogin,
  type CobrancaRecord,
  type ImportBatch,
  type PreventivePlan,
  type PublicState,
  type PublicUser,
  type StatusHorimetro,
  type StoredAttachment,
  type UserRole,
} from './supabaseStore.ts';

const VALID_ROLES: UserRole[] = [
  'Desenvolvedor',
  'Recebimento',
  'Recepção',
  'Pesquisa',
  'Manutenção Preventiva',
];

interface StoredUser extends PublicUser {
  passwordHash: string;
}

interface DatabaseState {
  records: CobrancaRecord[];
  batches: ImportBatch[];
  users: StoredUser[];
  preventivePlans: PreventivePlan[];
}

export interface AuthenticatedRequest extends express.Request {
  authUser?: PublicUser;
}

const ALLOWED_MIME_EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'application/pdf': 'pdf',
};

const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024;
const EPHEMERAL_FALLBACK_SECRET = crypto.randomBytes(32).toString('hex');

function getSessionSecret(): string {
  const explicit = process.env.SESSION_SECRET?.trim();
  if (explicit) return explicit;

  const sbSecret = String(
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.SUPABASE_SECRET_KEY ||
      process.env.SUPABASE_KEY ||
      ''
  ).trim();
  if (sbSecret) {
    return crypto
      .createHmac('sha256', 'horix-session-key-v1')
      .update(sbSecret)
      .digest('hex');
  }

  return EPHEMERAL_FALLBACK_SECRET;
}

function getDataPaths(serverless: boolean) {
  const isServerless =
    serverless ||
    process.env.NETLIFY === 'true' ||
    Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME);
  const dataDir = isServerless
    ? path.join('/tmp', 'horix-data')
    : path.resolve(process.cwd(), 'data');
  const uploadsDir = path.resolve(dataDir, 'uploads');
  const dbFile = path.join(dataDir, 'cobranca-db.json');
  return { dataDir, uploadsDir, dbFile };
}

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

function verifyPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split(':');
  if (parts.length !== 2) return false;
  const [salt, originalHex] = parts;
  if (!salt || !originalHex) return false;
  const derived = crypto.scryptSync(password, salt, 64);
  const original = Buffer.from(originalHex, 'hex');
  if (derived.length !== original.length) return false;
  return crypto.timingSafeEqual(derived, original);
}

function toPublicUser(u: StoredUser): PublicUser {
  return {
    id: u.id,
    nome: u.nome,
    login: u.login,
    role: u.role,
    ativo: u.ativo,
    criadoEm: u.criadoEm,
    atualizadoEm: u.atualizadoEm,
  };
}

function signSessionToken(user: PublicUser): string {
  const payload = Buffer.from(
    JSON.stringify({
      sub: user.id,
      role: user.role,
      exp: Date.now() + 1000 * 60 * 60 * 12,
    })
  ).toString('base64url');
  const sig = crypto
    .createHmac('sha256', getSessionSecret())
    .update(payload)
    .digest('base64url');
  return `${payload}.${sig}`;
}

function verifySessionToken(
  token: string
): { sub: string; role: UserRole; exp: number } | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [payload, sig] = parts;
  const expectedSig = crypto
    .createHmac('sha256', getSessionSecret())
    .update(payload)
    .digest('base64url');

  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expectedBuf.length) return null;
  if (!crypto.timingSafeEqual(sigBuf, expectedBuf)) return null;

  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      sub: string;
      role: UserRole;
      exp: number;
    };
    if (!parsed.sub || Date.now() > parsed.exp) return null;
    return parsed;
  } catch {
    return null;
  }
}

function getPublicState(state: PublicState | DatabaseState): PublicState {
  return {
    records: state.records,
    batches: state.batches,
    preventivePlans: state.preventivePlans,
  };
}

export async function createApiApp(options?: {
  serverless?: boolean;
}): Promise<express.Express> {
  const isServerless = Boolean(options?.serverless);
  const { dataDir: DATA_DIR, uploadsDir: UPLOADS_DIR, dbFile: DB_FILE } =
    getDataPaths(isServerless);

  function resolveUploadPath(storedFileName: string): string | null {
    if (!/^[a-zA-Z0-9._-]+$/.test(storedFileName)) return null;
    const resolved = path.resolve(UPLOADS_DIR, storedFileName);
    if (!resolved.startsWith(UPLOADS_DIR + path.sep)) return null;
    return resolved;
  }

  function removeAttachmentFiles(anexos?: StoredAttachment[]): void {
    if (!Array.isArray(anexos)) return;
    for (const anexo of anexos) {
      const filePath = resolveUploadPath(anexo.storedFileName);
      if (filePath && fs.existsSync(filePath)) {
        try {
          fs.unlinkSync(filePath);
        } catch {
          // Ignore cleanup errors
        }
      }
    }
  }

  function ensureDbFile(): void {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (!fs.existsSync(UPLOADS_DIR)) {
      fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    }
    if (!fs.existsSync(DB_FILE)) {
      const initial: DatabaseState = {
        records: [],
        batches: [],
        users: [],
        preventivePlans: [],
      };
      fs.writeFileSync(DB_FILE, JSON.stringify(initial, null, 2), 'utf8');
    }
  }

  function readDb(): DatabaseState {
    ensureDbFile();
    try {
      const raw = fs.readFileSync(DB_FILE, 'utf8');
      const parsed = JSON.parse(raw) as Partial<DatabaseState>;
      return {
        records: Array.isArray(parsed.records) ? parsed.records : [],
        batches: Array.isArray(parsed.batches) ? parsed.batches : [],
        users: Array.isArray(parsed.users) ? parsed.users : [],
        preventivePlans: Array.isArray(parsed.preventivePlans)
          ? parsed.preventivePlans
          : [],
      };
    } catch {
      return { records: [], batches: [], users: [], preventivePlans: [] };
    }
  }

  let dbMutex: Promise<unknown> = Promise.resolve();

  function mutateDb<T>(mutator: (state: DatabaseState) => Promise<T> | T): Promise<T> {
    const next = dbMutex.then(async () => {
      const state = readDb();
      const result = await mutator(state);
      ensureDbFile();
      const tmpFile = `${DB_FILE}.${crypto.randomUUID()}.tmp`;
      await fs.promises.writeFile(tmpFile, JSON.stringify(state, null, 2), 'utf8');
      await fs.promises.rename(tmpFile, DB_FILE);
      return result;
    });
    dbMutex = next.then(
      () => undefined,
      () => undefined
    );
    return next;
  }

  async function ensureNewSystemRolesIfBootstrapped(): Promise<void> {
    await mutateDb((state) => {
      if (state.users.length === 0) return;
      const referenceUser =
        state.users.find((u) => u.login === 'recepcao') || state.users[0];
      if (!referenceUser) return;
      const now = new Date().toISOString();

      if (!state.users.some((u) => u.role === 'Pesquisa')) {
        state.users.push({
          id: crypto.randomUUID(),
          nome: 'Consulta / Pesquisa',
          login: 'pesquisa',
          role: 'Pesquisa',
          ativo: true,
          passwordHash: referenceUser.passwordHash,
          criadoEm: now,
          atualizadoEm: now,
        });
      }

      if (!state.users.some((u) => u.role === 'Manutenção Preventiva')) {
        state.users.push({
          id: crypto.randomUUID(),
          nome: 'Manutenção Preventiva',
          login: 'manutencao',
          role: 'Manutenção Preventiva',
          ativo: true,
          passwordHash: referenceUser.passwordHash,
          criadoEm: now,
          atualizadoEm: now,
        });
      }
    });
  }

  const sseClients = new Set<express.Response>();

  function broadcastState(state: PublicState | DatabaseState): void {
    if (isServerless) return;
    const payload = `data: ${JSON.stringify(getPublicState(state))}\n\n`;
    for (const res of sseClients) {
      try {
        res.write(payload);
      } catch {
        sseClients.delete(res);
      }
    }
  }

  async function requireAuth(
    req: AuthenticatedRequest,
    res: express.Response,
    next: express.NextFunction
  ): Promise<void> {
    const authHeader = req.headers.authorization || '';
    if (!authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Autenticação necessária.' });
      return;
    }

    const token = authHeader.slice(7).trim();
    const decoded = verifySessionToken(token);
    if (!decoded) {
      res.status(401).json({ error: 'Sessão expirada ou inválida.' });
      return;
    }

    try {
      if (isSupabaseConfigured()) {
        const user = await sbGetUserById(decoded.sub);
        if (!user || !user.ativo) {
          res.status(401).json({ error: 'Usuário inativo ou não encontrado.' });
          return;
        }
        req.authUser = user;
        next();
        return;
      }

      const state = readDb();
      const user = state.users.find((u) => u.id === decoded.sub && u.ativo);
      if (!user) {
        res.status(401).json({ error: 'Usuário inativo ou não encontrado.' });
        return;
      }

      req.authUser = toPublicUser(user);
      next();
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Erro ao validar sessão.',
      });
    }
  }

  function requireRoles(...roles: UserRole[]) {
    return (req: AuthenticatedRequest, res: express.Response, next: express.NextFunction) => {
      if (!req.authUser) {
        res.status(401).json({ error: 'Autenticação necessária.' });
        return;
      }
      if (!roles.includes(req.authUser.role)) {
        res.status(403).json({
          error: 'Seu perfil de usuário não possui permissão para esta ação.',
        });
        return;
      }
      next();
    };
  }

  if (!isSupabaseConfigured()) {
    await ensureNewSystemRolesIfBootstrapped();
  }

  const app = express();

  // Normalize Netlify Functions base path so routes match both /api/* and /.netlify/functions/api/*
  app.use((req, _res, next) => {
    if (req.url.startsWith('/.netlify/functions/api')) {
      const rest = req.url.slice('/.netlify/functions/api'.length);
      req.url =
        '/api' + (rest.startsWith('/') || rest.startsWith('?') || rest === '' ? rest : `/${rest}`);
    }
    next();
  });

  app.use(express.json({ limit: '15mb' }));

  app.get('/api/health', async (_req, res) => {
    if (!isSupabaseConfigured()) {
      return res.json({
        ok: true,
        storageMode: 'local',
        databaseConnected: true,
      });
    }
    const health = await sbCheckHealth();
    return res.status(health.connected ? 200 : 503).json({
      ok: health.connected,
      storageMode: 'supabase',
      databaseConnected: health.connected,
      databaseError: health.error,
    });
  });

  app.get('/api/auth/status', async (_req, res) => {
    try {
      if (isSupabaseConfigured()) {
        try {
          const status = await sbGetAuthStatus();
          return res.json({
            ...status,
            storageMode: 'supabase',
            databaseConnected: true,
          });
        } catch (sbErr) {
          return res.json({
            configured: false,
            availableAccounts: [],
            storageMode: 'supabase',
            databaseConnected: false,
            databaseError:
              sbErr instanceof Error
                ? sbErr.message
                : 'Erro ao conectar ao Supabase.',
          });
        }
      }

      const state = readDb();
      const configured = state.users.length > 0;
      const logins = state.users
        .filter((u) => u.ativo)
        .map((u) => ({ login: u.login, nome: u.nome, role: u.role }));
      return res.json({
        configured,
        availableAccounts: logins,
        storageMode: 'local',
        databaseConnected: true,
      });
    } catch (error) {
      return res.status(500).json({
        error:
          error instanceof Error
            ? error.message
            : 'Erro ao consultar status de autenticação.',
      });
    }
  });

  app.post('/api/auth/bootstrap', async (req, res) => {
    try {
      const { initialPassword, developerName, selectedLogin } = req.body as {
        initialPassword?: string;
        developerName?: string;
        selectedLogin?: string;
      };

      const envPass = process.env.INITIAL_ADMIN_PASSCODE?.trim();
      const chosenPass = String(initialPassword || envPass || '').trim();

      if (chosenPass.length < 4) {
        return res.status(400).json({
          error: 'Informe uma senha com pelo menos 4 caracteres.',
        });
      }

      if (isSupabaseConfigured()) {
        const sbRes = await sbBootstrapUsers({
          developerName: String(developerName || 'Desenvolvedor'),
          initialPassword: chosenPass,
          selectedLogin,
        });
        if (sbRes.alreadyConfigured || !sbRes.activeUser) {
          return res.status(403).json({
            error: 'Os usuários iniciais já foram configurados. Faça login para continuar.',
          });
        }
        const token = signSessionToken(sbRes.activeUser);
        return res.json({ token, user: sbRes.activeUser, users: sbRes.users });
      }

      const result = await mutateDb((state) => {
        if (state.users.length > 0) {
          return { alreadyConfigured: true as const };
        }

        const now = new Date().toISOString();
        const devUser: StoredUser = {
          id: crypto.randomUUID(),
          nome: String(developerName || 'Desenvolvedor').trim() || 'Desenvolvedor',
          login: 'desenvolvedor',
          role: 'Desenvolvedor',
          ativo: true,
          passwordHash: hashPassword(chosenPass),
          criadoEm: now,
          atualizadoEm: now,
        };

        const recebimentoUser: StoredUser = {
          id: crypto.randomUUID(),
          nome: 'Equipe Recebimento',
          login: 'recebimento',
          role: 'Recebimento',
          ativo: true,
          passwordHash: hashPassword(chosenPass),
          criadoEm: now,
          atualizadoEm: now,
        };

        const recepcaoUser: StoredUser = {
          id: crypto.randomUUID(),
          nome: 'Equipe Recepção',
          login: 'recepcao',
          role: 'Recepção',
          ativo: true,
          passwordHash: hashPassword(chosenPass),
          criadoEm: now,
          atualizadoEm: now,
        };

        const pesquisaUser: StoredUser = {
          id: crypto.randomUUID(),
          nome: 'Consulta / Pesquisa',
          login: 'pesquisa',
          role: 'Pesquisa',
          ativo: true,
          passwordHash: hashPassword(chosenPass),
          criadoEm: now,
          atualizadoEm: now,
        };

        const manutencaoUser: StoredUser = {
          id: crypto.randomUUID(),
          nome: 'Manutenção Preventiva',
          login: 'manutencao',
          role: 'Manutenção Preventiva',
          ativo: true,
          passwordHash: hashPassword(chosenPass),
          criadoEm: now,
          atualizadoEm: now,
        };

        state.users = [
          devUser,
          recebimentoUser,
          recepcaoUser,
          pesquisaUser,
          manutencaoUser,
        ];

        const targetLogin = String(selectedLogin || 'desenvolvedor').trim().toLowerCase();
        const activeUser =
          state.users.find((u) => u.login === targetLogin) || devUser;

        return {
          alreadyConfigured: false as const,
          activeUser,
          users: state.users.map(toPublicUser),
        };
      });

      if (result.alreadyConfigured) {
        return res.status(403).json({
          error: 'Os usuários iniciais já foram configurados. Faça login para continuar.',
        });
      }

      const publicUser = toPublicUser(result.activeUser);
      const token = signSessionToken(publicUser);
      return res.json({
        token,
        user: publicUser,
        users: result.users,
      });
    } catch (error) {
      return res.status(500).json({
        error: error instanceof Error ? error.message : 'Erro ao configurar usuários.',
      });
    }
  });

  app.post('/api/auth/login', async (req, res) => {
    try {
      const { login, password } = req.body as { login?: string; password?: string };
      const cleanLogin = String(login || '').trim().toLowerCase();
      const cleanPassword = String(password || '');

      if (!cleanLogin || !cleanPassword) {
        return res.status(400).json({ error: 'Selecione o usuário e informe a senha.' });
      }

      if (isSupabaseConfigured()) {
        const publicUser = await sbVerifyLogin(cleanLogin, cleanPassword);
        if (!publicUser) {
          return res.status(401).json({ error: 'Usuário ou senha inválidos.' });
        }
        const token = signSessionToken(publicUser);
        return res.json({ token, user: publicUser });
      }

      const state = readDb();
      const user = state.users.find((u) => u.login.toLowerCase() === cleanLogin);
      if (!user || !user.ativo) {
        return res.status(401).json({ error: 'Usuário ou senha inválidos.' });
      }

      const envOverride = process.env.INITIAL_ADMIN_PASSCODE?.trim();
      const valid =
        verifyPassword(cleanPassword, user.passwordHash) ||
        (user.role === 'Desenvolvedor' && Boolean(envOverride) && cleanPassword === envOverride);

      if (!valid) {
        return res.status(401).json({ error: 'Usuário ou senha inválidos.' });
      }

      const publicUser = toPublicUser(user);
      const token = signSessionToken(publicUser);
      return res.json({ token, user: publicUser });
    } catch (error) {
      return res.status(500).json({
        error: error instanceof Error ? error.message : 'Erro ao autenticar.',
      });
    }
  });

  app.get('/api/auth/me', requireAuth, (req: AuthenticatedRequest, res) => {
    res.json({ user: req.authUser });
  });

  // User Management (Desenvolvedor only)
  app.get('/api/users', requireAuth, requireRoles('Desenvolvedor'), async (_req, res) => {
    try {
      if (isSupabaseConfigured()) {
        const users = await sbListUsers();
        return res.json({ users });
      }
      const state = readDb();
      return res.json({ users: state.users.map(toPublicUser) });
    } catch (error) {
      return res.status(500).json({
        error: error instanceof Error ? error.message : 'Erro ao listar usuários.',
      });
    }
  });

  app.post('/api/users', requireAuth, requireRoles('Desenvolvedor'), async (req, res) => {
    try {
      const { nome, login, role, password } = req.body as {
        nome?: string;
        login?: string;
        role?: UserRole;
        password?: string;
      };

      const cleanNome = String(nome || '').trim();
      const cleanLogin = String(login || '').trim().toLowerCase().replace(/\s+/g, '');
      const cleanPassword = String(password || '');

      if (!cleanNome || !cleanLogin) {
        return res.status(400).json({ error: 'Nome e login são obrigatórios.' });
      }
      if (!role || !VALID_ROLES.includes(role)) {
        return res.status(400).json({ error: 'Perfil de usuário inválido.' });
      }
      if (cleanPassword.length < 4) {
        return res.status(400).json({ error: 'A senha deve ter pelo menos 4 caracteres.' });
      }

      if (isSupabaseConfigured()) {
        const sbRes = await sbCreateUser({
          nome: cleanNome,
          login: cleanLogin,
          role,
          password: cleanPassword,
        });
        if (sbRes.conflict) {
          return res.status(409).json({ error: 'Já existe um usuário com esse login.' });
        }
        return res.json({ user: sbRes.user, users: sbRes.users });
      }

      const result = await mutateDb((state) => {
        if (state.users.some((u) => u.login.toLowerCase() === cleanLogin)) {
          return { conflict: true as const };
        }
        const now = new Date().toISOString();
        const newUser: StoredUser = {
          id: crypto.randomUUID(),
          nome: cleanNome,
          login: cleanLogin,
          role,
          ativo: true,
          passwordHash: hashPassword(cleanPassword),
          criadoEm: now,
          atualizadoEm: now,
        };
        state.users.push(newUser);
        return {
          conflict: false as const,
          user: toPublicUser(newUser),
          users: state.users.map(toPublicUser),
        };
      });

      if (result.conflict) {
        return res.status(409).json({ error: 'Já existe um usuário com esse login.' });
      }
      return res.json({ user: result.user, users: result.users });
    } catch (error) {
      return res.status(500).json({
        error: error instanceof Error ? error.message : 'Erro ao criar usuário.',
      });
    }
  });

  app.patch('/api/users/:id', requireAuth, requireRoles('Desenvolvedor'), async (req: AuthenticatedRequest, res) => {
    try {
      const { id } = req.params;
      const { nome, role, ativo, password } = req.body as {
        nome?: string;
        role?: UserRole;
        ativo?: boolean;
        password?: string;
      };

      if (password !== undefined && password !== '' && String(password).length < 4) {
        return res.status(400).json({ error: 'A senha deve ter pelo menos 4 caracteres.' });
      }
      if (req.authUser?.id === id && ativo === false) {
        return res.status(400).json({ error: 'Você não pode desativar o próprio usuário.' });
      }

      if (isSupabaseConfigured()) {
        const sbRes = await sbUpdateUser(id, {
          nome,
          role: role && VALID_ROLES.includes(role) ? role : undefined,
          ativo,
          password: password && String(password).length >= 4 ? String(password) : undefined,
        });
        if (sbRes.notFound) {
          return res.status(404).json({ error: 'Usuário não encontrado.' });
        }
        return res.json({ user: sbRes.user, users: sbRes.users });
      }

      const result = await mutateDb((state) => {
        const idx = state.users.findIndex((u) => u.id === id);
        if (idx === -1) return { notFound: true as const };

        const current = state.users[idx];
        const updated: StoredUser = {
          ...current,
          nome: nome !== undefined ? String(nome).trim() || current.nome : current.nome,
          role: role && VALID_ROLES.includes(role) ? role : current.role,
          ativo: ativo !== undefined ? Boolean(ativo) : current.ativo,
          passwordHash:
            password && String(password).length >= 4
              ? hashPassword(String(password))
              : current.passwordHash,
          atualizadoEm: new Date().toISOString(),
        };
        state.users[idx] = updated;
        return {
          notFound: false as const,
          user: toPublicUser(updated),
          users: state.users.map(toPublicUser),
        };
      });

      if (result.notFound) {
        return res.status(404).json({ error: 'Usuário não encontrado.' });
      }
      return res.json({ user: result.user, users: result.users });
    } catch (error) {
      return res.status(500).json({
        error: error instanceof Error ? error.message : 'Erro ao atualizar usuário.',
      });
    }
  });

  app.delete('/api/users/:id', requireAuth, requireRoles('Desenvolvedor'), async (req: AuthenticatedRequest, res) => {
    try {
      const { id } = req.params;
      if (req.authUser?.id === id) {
        return res.status(400).json({ error: 'Você não pode excluir o próprio usuário logado.' });
      }
      if (isSupabaseConfigured()) {
        const users = await sbDeleteUser(id);
        return res.json({ users });
      }
      const users = await mutateDb((state) => {
        state.users = state.users.filter((u) => u.id !== id);
        return state.users.map(toPublicUser);
      });
      return res.json({ users });
    } catch (error) {
      return res.status(500).json({
        error: error instanceof Error ? error.message : 'Erro ao remover usuário.',
      });
    }
  });

  // Authenticated SSE stream (in serverless mode, returns 204 so client uses background refresh)
  app.get('/api/events', requireAuth, (req, res) => {
    if (isServerless) {
      res.status(204).end();
      return;
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    sseClients.add(res);
    req.on('close', () => {
      sseClients.delete(res);
    });
  });

  app.get('/api/state', requireAuth, async (_req, res) => {
    try {
      if (isSupabaseConfigured()) {
        const state = await sbGetPublicState();
        return res.json(state);
      }
      const state = readDb();
      return res.json(getPublicState(state));
    } catch (error) {
      return res.status(500).json({
        error: error instanceof Error ? error.message : 'Erro ao carregar dados.',
      });
    }
  });

  app.post(
    '/api/records/import',
    requireAuth,
    requireRoles('Desenvolvedor', 'Recebimento'),
    async (req: AuthenticatedRequest, res) => {
      try {
        const { rows, nomeArquivo, origem, duplicateMode } = req.body as {
          rows: Array<Partial<CobrancaRecord>>;
          nomeArquivo: string;
          origem: ImportBatch['origem'];
          duplicateMode?: 'skip' | 'overwrite';
        };

        if (!Array.isArray(rows) || rows.length === 0) {
          return res.status(400).json({ error: 'Nenhum registro válido enviado para importação.' });
        }

        const loteId = `lote_${crypto.randomUUID().slice(0, 8)}`;
        const cleanNomeArquivo = String(nomeArquivo || 'Importação Manual');
        const cleanOrigem: ImportBatch['origem'] =
          origem === 'colagem' || origem === 'manual' ? origem : 'planilha';

        if (isSupabaseConfigured()) {
          const result = await sbImportRecords({
            rows,
            nomeArquivo: cleanNomeArquivo,
            origem: cleanOrigem,
            duplicateMode,
            responsavel: req.authUser?.nome || 'Recebimento',
            responsavelId: req.authUser?.id,
            loteId,
          });
          if (result.insertedCount > 0 || result.updatedCount > 0) {
            broadcastState(result.state);
          }
          return res.json(result);
        }

        const result = await mutateDb((state) => {
          const now = new Date().toISOString();

          const existingByKey = new Map<string, number>();
          state.records.forEach((r, idx) => {
            const key = `${r.numeroFicha.trim().toUpperCase()}__${r.inicio.trim()}`;
            existingByKey.set(key, idx);
          });

          let insertedCount = 0;
          let updatedCount = 0;
          let skippedCount = 0;

          for (const row of rows) {
            const numeroFicha = String(row.numeroFicha || '').trim();
            const inicio = String(row.inicio || '').trim();
            const key = `${numeroFicha.toUpperCase()}__${inicio}`;
            const existingIdx = existingByKey.get(key);

            if (existingIdx !== undefined) {
              if (duplicateMode === 'overwrite') {
                const current = state.records[existingIdx];
                state.records[existingIdx] = {
                  ...current,
                  fim: String(row.fim || current.fim),
                  cliente: String(row.cliente || current.cliente),
                  empresa: String(row.empresa || current.empresa),
                  mesRef: String(row.mesRef || current.mesRef),
                  anoRef: Number(row.anoRef || current.anoRef),
                  patrimonio: String(row.patrimonio || current.patrimonio),
                  horimetro: String(row.horimetro || current.horimetro),
                  dataColeta: String(row.dataColeta || current.dataColeta),
                  nomeContato: String(row.nomeContato || current.nomeContato),
                  telefoneContato: String(row.telefoneContato || current.telefoneContato),
                  emailContato: String(row.emailContato || current.emailContato),
                  observacoes: String(row.observacoes || current.observacoes),
                  atualizadoEm: now,
                };
                updatedCount++;
              } else {
                skippedCount++;
              }
              continue;
            }

            const newRecord: CobrancaRecord = {
              id: crypto.randomUUID(),
              status:
                row.status === 'Coletado' ||
                row.status === 'Faturado' ||
                row.status === 'Sem Retorno'
                  ? row.status
                  : 'Pendente',
              mesRef: String(row.mesRef || 'novembro').toLowerCase(),
              anoRef: Number(row.anoRef || new Date().getFullYear()),
              inicio,
              fim: String(row.fim || ''),
              numeroFicha,
              cliente: String(row.cliente || 'CLIENTE NÃO INFORMADO'),
              empresa: String(row.empresa || 'BALOC'),
              patrimonio: String(row.patrimonio || ''),
              horimetro: String(row.horimetro || ''),
              dataColeta: String(row.dataColeta || ''),
              nomeContato: String(row.nomeContato || ''),
              telefoneContato: String(row.telefoneContato || ''),
              emailContato: String(row.emailContato || ''),
              observacoes: String(row.observacoes || ''),
              anexos: [],
              loteId,
              criadoEm: now,
              atualizadoEm: now,
            };

            state.records.unshift(newRecord);
            existingByKey.set(key, 0);
            insertedCount++;
          }

          if (insertedCount > 0 || updatedCount > 0) {
            const batch: ImportBatch = {
              id: loteId,
              nomeArquivo: cleanNomeArquivo,
              origem: cleanOrigem,
              quantidadeTotal: insertedCount + updatedCount,
              criadoEm: now,
              responsavel: req.authUser?.nome || 'Recebimento',
            };
            state.batches.unshift(batch);
          }

          return {
            insertedCount,
            updatedCount,
            skippedCount,
            state,
          };
        });

        if (result.insertedCount > 0 || result.updatedCount > 0) {
          broadcastState(result.state);
        }

        return res.json({
          insertedCount: result.insertedCount,
          updatedCount: result.updatedCount,
          skippedCount: result.skippedCount,
          state: getPublicState(result.state),
        });
      } catch (error) {
        return res.status(500).json({
          error: error instanceof Error ? error.message : 'Erro interno ao importar registros.',
        });
      }
    }
  );

  app.post(
    '/api/records',
    requireAuth,
    requireRoles('Desenvolvedor', 'Recebimento'),
    async (req, res) => {
      try {
        const payload = req.body as Partial<CobrancaRecord>;

        if (isSupabaseConfigured()) {
          const result = await sbCreateRecord(payload);
          broadcastState(result.state);
          return res.json(result);
        }

        const result = await mutateDb((state) => {
          const now = new Date().toISOString();
          const newRecord: CobrancaRecord = {
            id: crypto.randomUUID(),
            status: payload.status || 'Pendente',
            mesRef: String(payload.mesRef || 'novembro').toLowerCase(),
            anoRef: Number(payload.anoRef || new Date().getFullYear()),
            inicio: String(payload.inicio || ''),
            fim: String(payload.fim || ''),
            numeroFicha: String(payload.numeroFicha || ''),
            cliente: String(payload.cliente || ''),
            empresa: String(payload.empresa || 'BALOC'),
            patrimonio: String(payload.patrimonio || ''),
            horimetro: String(payload.horimetro || ''),
            dataColeta: String(payload.dataColeta || ''),
            nomeContato: String(payload.nomeContato || ''),
            telefoneContato: String(payload.telefoneContato || ''),
            emailContato: String(payload.emailContato || ''),
            observacoes: String(payload.observacoes || ''),
            anexos: [],
            loteId: payload.loteId || 'manual',
            criadoEm: now,
            atualizadoEm: now,
          };
          state.records.unshift(newRecord);
          return { newRecord, state };
        });

        broadcastState(result.state);
        return res.json({
          record: result.newRecord,
          state: getPublicState(result.state),
        });
      } catch (error) {
        return res.status(500).json({
          error: error instanceof Error ? error.message : 'Erro ao criar registro.',
        });
      }
    }
  );

  app.patch(
    '/api/records/:id',
    requireAuth,
    requireRoles('Desenvolvedor', 'Recebimento', 'Recepção'),
    async (req: AuthenticatedRequest, res) => {
      try {
        const { id } = req.params;
        const patch = req.body as Partial<CobrancaRecord>;
        const role = req.authUser?.role;

        if (isSupabaseConfigured()) {
          const outcome = await sbPatchRecord(id, patch, role);
          if (outcome.errorStatus) {
            return res.status(outcome.errorStatus).json({ error: outcome.error });
          }
          if (outcome.state) {
            broadcastState(outcome.state);
          }
          return res.json({ record: outcome.record, state: outcome.state });
        }

        const outcome = await mutateDb((state) => {
          const idx = state.records.findIndex((r) => r.id === id);
          if (idx === -1) {
            return { errorStatus: 404 as const, error: 'Registro não encontrado.' };
          }

          const prev = state.records[idx];
          const nextStatus = patch.status ?? prev.status;

          if (role === 'Recepção') {
            if (prev.status === 'Faturado') {
              return {
                errorStatus: 403 as const,
                error: 'Registros já faturados não podem ser alterados pela Recepção.',
              };
            }
            if (nextStatus === 'Faturado') {
              return {
                errorStatus: 403 as const,
                error: 'A Recepção só pode alterar o status para Coletado, Sem Retorno ou Pendente.',
              };
            }
          }

          const now = new Date().toISOString();
          const allowedRecepcaoPatch: Partial<CobrancaRecord> =
            role === 'Recepção'
              ? {
                  patrimonio: patch.patrimonio,
                  horimetro: patch.horimetro,
                  dataColeta: patch.dataColeta,
                  nomeContato: patch.nomeContato,
                  telefoneContato: patch.telefoneContato,
                  emailContato: patch.emailContato,
                  observacoes: patch.observacoes,
                  status: patch.status,
                }
              : patch;

          const cleanedPatch: Partial<CobrancaRecord> = {};
          for (const [k, v] of Object.entries(allowedRecepcaoPatch)) {
            if (v !== undefined && k !== 'id' && k !== 'criadoEm' && k !== 'anexos') {
              (cleanedPatch as Record<string, unknown>)[k] = v;
            }
          }

          const updated: CobrancaRecord = {
            ...prev,
            ...cleanedPatch,
            id: prev.id,
            criadoEm: prev.criadoEm,
            atualizadoEm: now,
            coletadoEm:
              nextStatus === 'Coletado' && prev.status !== 'Coletado'
                ? now
                : prev.coletadoEm,
            faturadoEm:
              nextStatus === 'Faturado' && prev.status !== 'Faturado'
                ? now
                : prev.faturadoEm,
          };

          state.records[idx] = updated;
          return { errorStatus: null, updated, state };
        });

        if (outcome.errorStatus) {
          return res.status(outcome.errorStatus).json({ error: outcome.error });
        }

        broadcastState(outcome.state);
        return res.json({
          record: outcome.updated,
          state: getPublicState(outcome.state),
        });
      } catch (error) {
        return res.status(500).json({
          error: error instanceof Error ? error.message : 'Erro ao atualizar registro.',
        });
      }
    }
  );

  app.post(
    '/api/records/bulk-status',
    requireAuth,
    requireRoles('Desenvolvedor', 'Recebimento'),
    async (req, res) => {
      try {
        const { ids, status } = req.body as {
          ids: string[];
          status: StatusHorimetro;
        };
        if (!Array.isArray(ids) || ids.length === 0) {
          return res.status(400).json({ error: 'Nenhum registro selecionado.' });
        }

        if (isSupabaseConfigured()) {
          const state = await sbBulkUpdateStatus(ids, status);
          broadcastState(state);
          return res.json({ state });
        }

        const state = await mutateDb((s) => {
          const now = new Date().toISOString();
          const idSet = new Set(ids);

          s.records = s.records.map((rec) => {
            if (!idSet.has(rec.id)) return rec;
            return {
              ...rec,
              status,
              atualizadoEm: now,
              coletadoEm: status === 'Coletado' ? now : rec.coletadoEm,
              faturadoEm: status === 'Faturado' ? now : rec.faturadoEm,
            };
          });
          return s;
        });

        broadcastState(state);
        return res.json({ state: getPublicState(state) });
      } catch (error) {
        return res.status(500).json({
          error: error instanceof Error ? error.message : 'Erro ao atualizar em lote.',
        });
      }
    }
  );

  // Attachments
  app.post(
    '/api/records/:id/attachments',
    requireAuth,
    requireRoles('Desenvolvedor', 'Recebimento', 'Recepção'),
    async (req: AuthenticatedRequest, res) => {
      try {
        const { id } = req.params;
        const { fileName, mimeType, dataBase64 } = req.body as {
          fileName?: string;
          mimeType?: string;
          dataBase64?: string;
        };

        const cleanMime = String(mimeType || '').trim().toLowerCase();
        const ext = ALLOWED_MIME_EXTENSIONS[cleanMime];
        if (!ext) {
          return res.status(400).json({
            error: 'Formato não permitido. Envie imagens (JPG, PNG, WEBP, GIF) ou PDF.',
          });
        }

        const rawBase64 = String(dataBase64 || '').replace(/^data:[^;]+;base64,/, '');
        if (!rawBase64) {
          return res.status(400).json({ error: 'Arquivo vazio.' });
        }

        const fileBuffer = Buffer.from(rawBase64, 'base64');
        if (fileBuffer.length === 0 || fileBuffer.length > MAX_ATTACHMENT_BYTES) {
          return res.status(400).json({
            error: 'O arquivo deve ter no máximo 8 MB.',
          });
        }

        const attachmentId = crypto.randomUUID();
        const storedFileName = `${attachmentId}.${ext}`;
        const safeOriginalName =
          path
            .basename(String(fileName || `anexo.${ext}`))
            .replace(/[^\w.\- ()]/g, '_')
            .slice(0, 120) || `anexo.${ext}`;
        const normalizedMime = cleanMime === 'image/jpg' ? 'image/jpeg' : cleanMime;

        if (isSupabaseConfigured()) {
          const outcome = await sbUploadAttachment({
            recordId: id,
            attachmentId,
            storagePath: `${id}/${storedFileName}`,
            nomeOriginal: safeOriginalName,
            mimeType: normalizedMime,
            fileBuffer,
            enviadoPor: req.authUser?.nome || 'Usuário',
            enviadoPorId: req.authUser?.id,
            role: req.authUser?.role,
          });
          if (outcome.errorStatus) {
            return res.status(outcome.errorStatus).json({ error: outcome.error });
          }
          if (outcome.state) {
            broadcastState(outcome.state);
          }
          return res.json({
            attachment: outcome.attachment,
            record: outcome.record,
            state: outcome.state,
          });
        }

        ensureDbFile();
        const destPath = resolveUploadPath(storedFileName);
        if (!destPath) {
          return res.status(400).json({ error: 'Nome de arquivo inválido.' });
        }

        await fs.promises.writeFile(destPath, fileBuffer);

        const outcome = await mutateDb((state) => {
          const idx = state.records.findIndex((r) => r.id === id);
          if (idx === -1) {
            return { errorStatus: 404 as const, error: 'Registro não encontrado.' };
          }
          const current = state.records[idx];
          if (req.authUser?.role === 'Recepção' && current.status === 'Faturado') {
            return {
              errorStatus: 403 as const,
              error: 'Registros já faturados não podem ser alterados pela Recepção.',
            };
          }
          const currentAnexos = Array.isArray(current.anexos) ? current.anexos : [];
          if (currentAnexos.length >= 10) {
            return {
              errorStatus: 400 as const,
              error: 'Limite máximo de 10 anexos por ficha atingido.',
            };
          }

          const now = new Date().toISOString();
          const newAttachment: StoredAttachment = {
            id: attachmentId,
            nomeOriginal: safeOriginalName,
            mimeType: normalizedMime,
            tamanhoBytes: fileBuffer.length,
            storedFileName,
            enviadoPor: req.authUser?.nome || 'Usuário',
            enviadoEm: now,
          };

          state.records[idx] = {
            ...current,
            anexos: [...currentAnexos, newAttachment],
            atualizadoEm: now,
          };
          return { errorStatus: null, newAttachment, record: state.records[idx], state };
        });

        if (outcome.errorStatus) {
          if (fs.existsSync(destPath)) {
            fs.unlinkSync(destPath);
          }
          return res.status(outcome.errorStatus).json({ error: outcome.error });
        }

        broadcastState(outcome.state);
        return res.json({
          attachment: outcome.newAttachment,
          record: outcome.record,
          state: getPublicState(outcome.state),
        });
      } catch (error) {
        return res.status(500).json({
          error: error instanceof Error ? error.message : 'Erro ao salvar anexo.',
        });
      }
    }
  );

  app.get('/api/records/:id/attachments/:attachmentId', requireAuth, async (req, res) => {
    try {
      const { id, attachmentId } = req.params;

      if (isSupabaseConfigured()) {
        const outcome = await sbDownloadAttachment(id, attachmentId);
        if (outcome.errorStatus || !outcome.buffer) {
          return res.status(outcome.errorStatus || 404).json({ error: outcome.error });
        }
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Content-Type', outcome.mimeType || 'application/octet-stream');
        res.setHeader(
          'Content-Disposition',
          `inline; filename="${String(outcome.nomeOriginal || 'anexo').replace(/"/g, '')}"`
        );
        return res.send(outcome.buffer);
      }

      const state = readDb();
      const record = state.records.find((r) => r.id === id);
      if (!record) {
        return res.status(404).json({ error: 'Registro não encontrado.' });
      }

      const attachment = (record.anexos || []).find((a) => a.id === attachmentId);
      if (!attachment) {
        return res.status(404).json({ error: 'Anexo não encontrado.' });
      }

      const filePath = resolveUploadPath(attachment.storedFileName);
      if (!filePath || !fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'Arquivo não encontrado no servidor.' });
      }

      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Content-Type', attachment.mimeType);
      res.setHeader(
        'Content-Disposition',
        `inline; filename="${attachment.nomeOriginal.replace(/"/g, '')}"`
      );
      return res.sendFile(filePath);
    } catch (error) {
      return res.status(500).json({
        error: error instanceof Error ? error.message : 'Erro ao carregar anexo.',
      });
    }
  });

  app.delete(
    '/api/records/:id/attachments/:attachmentId',
    requireAuth,
    requireRoles('Desenvolvedor', 'Recebimento', 'Recepção'),
    async (req: AuthenticatedRequest, res) => {
      try {
        const { id, attachmentId } = req.params;

        if (isSupabaseConfigured()) {
          const outcome = await sbDeleteAttachment(
            id,
            attachmentId,
            req.authUser?.role
          );
          if (outcome.errorStatus) {
            return res.status(outcome.errorStatus).json({ error: outcome.error });
          }
          if (outcome.state) {
            broadcastState(outcome.state);
          }
          return res.json({ record: outcome.record, state: outcome.state });
        }

        const outcome = await mutateDb((state) => {
          const idx = state.records.findIndex((r) => r.id === id);
          if (idx === -1) {
            return { errorStatus: 404 as const, error: 'Registro não encontrado.' };
          }

          const current = state.records[idx];
          if (req.authUser?.role === 'Recepção' && current.status === 'Faturado') {
            return {
              errorStatus: 403 as const,
              error: 'Registros já faturados não podem ser alterados pela Recepção.',
            };
          }

          const target = (current.anexos || []).find((a) => a.id === attachmentId);
          if (!target) {
            return { errorStatus: 404 as const, error: 'Anexo não encontrado.' };
          }

          removeAttachmentFiles([target]);

          state.records[idx] = {
            ...current,
            anexos: (current.anexos || []).filter((a) => a.id !== attachmentId),
            atualizadoEm: new Date().toISOString(),
          };
          return { errorStatus: null, record: state.records[idx], state };
        });

        if (outcome.errorStatus) {
          return res.status(outcome.errorStatus).json({ error: outcome.error });
        }

        broadcastState(outcome.state);
        return res.json({
          record: outcome.record,
          state: getPublicState(outcome.state),
        });
      } catch (error) {
        return res.status(500).json({
          error: error instanceof Error ? error.message : 'Erro ao remover anexo.',
        });
      }
    }
  );

  app.delete(
    '/api/records/:id',
    requireAuth,
    requireRoles('Desenvolvedor', 'Recebimento'),
    async (req, res) => {
      try {
        const { id } = req.params;

        if (isSupabaseConfigured()) {
          const state = await sbDeleteRecord(id);
          broadcastState(state);
          return res.json({ state });
        }

        const state = await mutateDb((s) => {
          const removed = s.records.find((r) => r.id === id);
          if (removed) {
            removeAttachmentFiles(removed.anexos);
          }
          s.records = s.records.filter((r) => r.id !== id);
          return s;
        });

        broadcastState(state);
        return res.json({ state: getPublicState(state) });
      } catch (error) {
        return res.status(500).json({
          error: error instanceof Error ? error.message : 'Erro ao remover registro.',
        });
      }
    }
  );

  app.delete(
    '/api/batches/:id',
    requireAuth,
    requireRoles('Desenvolvedor', 'Recebimento'),
    async (req, res) => {
      try {
        const { id } = req.params;

        if (isSupabaseConfigured()) {
          const state = await sbDeleteBatch(id);
          broadcastState(state);
          return res.json({ state });
        }

        const state = await mutateDb((s) => {
          for (const rec of s.records) {
            if (rec.loteId === id) {
              removeAttachmentFiles(rec.anexos);
            }
          }
          s.records = s.records.filter((r) => r.loteId !== id);
          s.batches = s.batches.filter((b) => b.id !== id);
          return s;
        });

        broadcastState(state);
        return res.json({ state: getPublicState(state) });
      } catch (error) {
        return res.status(500).json({
          error: error instanceof Error ? error.message : 'Erro ao remover lote.',
        });
      }
    }
  );

  // Preventive Maintenance Plans (Desenvolvedor, Manutenção Preventiva)
  app.post(
    '/api/preventive-plans',
    requireAuth,
    requireRoles('Desenvolvedor', 'Manutenção Preventiva'),
    async (req: AuthenticatedRequest, res) => {
      try {
        const {
          cliente,
          patrimonio,
          horimetroBase,
          proximaTroca,
          avisoAntecedenciaHoras,
          observacoes,
        } = req.body as {
          cliente?: string;
          patrimonio?: string;
          horimetroBase?: number;
          proximaTroca?: number;
          avisoAntecedenciaHoras?: number;
          observacoes?: string;
        };

        const cleanCliente = String(cliente || '').trim().toUpperCase();
        const cleanPat = String(patrimonio || '').trim().toUpperCase();
        const base = Number(horimetroBase);
        const prox = Number(proximaTroca);
        const aviso = Number(avisoAntecedenciaHoras ?? 10);

        if (!cleanCliente || !cleanPat) {
          return res.status(400).json({ error: 'Cliente e patrimônio são obrigatórios.' });
        }
        if (!Number.isFinite(base) || !Number.isFinite(prox) || prox <= base) {
          return res.status(400).json({
            error: 'A próxima troca deve ser um número maior que o horímetro base.',
          });
        }
        if (!Number.isFinite(aviso) || aviso < 0) {
          return res.status(400).json({ error: 'Aviso de antecedência inválido.' });
        }

        if (isSupabaseConfigured()) {
          const result = await sbUpsertPreventivePlan({
            cliente: cleanCliente,
            patrimonio: cleanPat,
            horimetroBase: base,
            proximaTroca: prox,
            avisoAntecedenciaHoras: aviso,
            observacoes: String(observacoes || '').trim(),
            atualizadoPor: req.authUser?.nome || 'Manutenção',
            atualizadoPorId: req.authUser?.id,
          });
          broadcastState(result.state);
          return res.json(result);
        }

        const result = await mutateDb((state) => {
          const now = new Date().toISOString();
          const idx = state.preventivePlans.findIndex(
            (p) =>
              p.cliente.toUpperCase() === cleanCliente &&
              p.patrimonio.toUpperCase() === cleanPat
          );

          const plan: PreventivePlan = {
            id: idx >= 0 ? state.preventivePlans[idx].id : crypto.randomUUID(),
            cliente: cleanCliente,
            patrimonio: cleanPat,
            horimetroBase: base,
            proximaTroca: prox,
            intervaloHoras: Number((prox - base).toFixed(2)),
            avisoAntecedenciaHoras: aviso,
            observacoes: String(observacoes || '').trim(),
            ultimaPreventivaEm: idx >= 0 ? state.preventivePlans[idx].ultimaPreventivaEm : undefined,
            atualizadoPor: req.authUser?.nome || 'Manutenção',
            atualizadoEm: now,
          };

          if (idx >= 0) {
            state.preventivePlans[idx] = plan;
          } else {
            state.preventivePlans.unshift(plan);
          }

          return { plan, state };
        });

        broadcastState(result.state);
        return res.json({ plan: result.plan, state: getPublicState(result.state) });
      } catch (error) {
        return res.status(500).json({
          error: error instanceof Error ? error.message : 'Erro ao salvar plano preventivo.',
        });
      }
    }
  );

  app.post(
    '/api/preventive-plans/:id/complete',
    requireAuth,
    requireRoles('Desenvolvedor', 'Manutenção Preventiva'),
    async (req: AuthenticatedRequest, res) => {
      try {
        const { id } = req.params;
        const { horimetroRealizado } = req.body as { horimetroRealizado?: number };
        const realizado = Number(horimetroRealizado);
        if (!Number.isFinite(realizado) || realizado < 0) {
          return res.status(400).json({ error: 'Informe o horímetro da preventiva realizada.' });
        }

        if (isSupabaseConfigured()) {
          const outcome = await sbCompletePreventivePlan({
            id,
            horimetroRealizado: realizado,
            atualizadoPor: req.authUser?.nome || 'Manutenção',
            atualizadoPorId: req.authUser?.id,
          });
          if (outcome.notFound) {
            return res.status(404).json({ error: 'Plano preventivo não encontrado.' });
          }
          if (outcome.state) {
            broadcastState(outcome.state);
          }
          return res.json({ plan: outcome.plan, state: outcome.state });
        }

        const outcome = await mutateDb((state) => {
          const idx = state.preventivePlans.findIndex((p) => p.id === id);
          if (idx === -1) return { notFound: true as const };

          const current = state.preventivePlans[idx];
          const intervalo =
            current.intervaloHoras > 0
              ? current.intervaloHoras
              : Math.max(10, current.proximaTroca - current.horimetroBase);
          const now = new Date().toISOString();

          const updated: PreventivePlan = {
            ...current,
            horimetroBase: realizado,
            proximaTroca: Number((realizado + intervalo).toFixed(2)),
            intervaloHoras: intervalo,
            ultimaPreventivaEm: now,
            atualizadoPor: req.authUser?.nome || 'Manutenção',
            atualizadoEm: now,
          };

          state.preventivePlans[idx] = updated;
          return { notFound: false as const, plan: updated, state };
        });

        if (outcome.notFound) {
          return res.status(404).json({ error: 'Plano preventivo não encontrado.' });
        }

        broadcastState(outcome.state);
        return res.json({ plan: outcome.plan, state: getPublicState(outcome.state) });
      } catch (error) {
        return res.status(500).json({
          error: error instanceof Error ? error.message : 'Erro ao concluir preventiva.',
        });
      }
    }
  );

  app.delete(
    '/api/preventive-plans/:id',
    requireAuth,
    requireRoles('Desenvolvedor', 'Manutenção Preventiva'),
    async (req, res) => {
      try {
        const { id } = req.params;

        if (isSupabaseConfigured()) {
          const state = await sbDeletePreventivePlan(id);
          broadcastState(state);
          return res.json({ state });
        }

        const state = await mutateDb((s) => {
          s.preventivePlans = s.preventivePlans.filter((p) => p.id !== id);
          return s;
        });
        broadcastState(state);
        return res.json({ state: getPublicState(state) });
      } catch (error) {
        return res.status(500).json({
          error: error instanceof Error ? error.message : 'Erro ao remover plano preventivo.',
        });
      }
    }
  );

  return app;
}
