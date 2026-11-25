export type StatusHorimetro = 'Pendente' | 'Sem Retorno' | 'Coletado' | 'Faturado';

export type UserRole =
  | 'Desenvolvedor'
  | 'Recebimento'
  | 'Recepção'
  | 'Pesquisa'
  | 'Manutenção Preventiva';

export interface AppUser {
  id: string;
  nome: string;
  login: string;
  role: UserRole;
  ativo: boolean;
  criadoEm: string;
  atualizadoEm: string;
}

export interface FichaAttachment {
  id: string;
  nomeOriginal: string;
  mimeType: string;
  tamanhoBytes: number;
  enviadoPor: string;
  enviadoEm: string;
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
  dataColeta: string;
  nomeContato: string;
  telefoneContato: string;
  emailContato: string;
  observacoes: string;
  anexos?: FichaAttachment[];
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

export interface ParsedImportRow {
  tempId: string;
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
  dataColeta: string;
  nomeContato: string;
  telefoneContato: string;
  emailContato: string;
  observacoes: string;
  isDuplicate: boolean;
  existingRecordId?: string;
}

export interface ClientCatalogEntry {
  cliente: string;
  patrimonios: string[];
  ultimoPatrimonio: string;
  ultimoNomeContato: string;
  ultimoTelefoneContato: string;
  ultimoEmailContato: string;
  ultimaEmpresa: string;
  ultimaAtualizacao: string;
  totalRegistros: number;
}

export type WorkspaceTab =
  | 'visao-geral'
  | 'recebimento-importar'
  | 'recepcao-coleta'
  | 'recebimento-faturamento'
  | 'pesquisa-horimetros'
  | 'manutencao-preventiva'
  | 'base-clientes'
  | 'usuarios-gerenciar';
