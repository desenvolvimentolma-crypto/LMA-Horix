import * as XLSX from 'xlsx';
import type { CobrancaRecord, ParsedImportRow, StatusHorimetro } from '../types/cobranca';

const MESES_PT = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
];

export function normalizeHeader(raw: string): string {
  return String(raw || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

export function formatExcelDate(value: unknown): string {
  if (value === null || value === undefined || value === '') return '';

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${pad2(value.getUTCDate())}/${pad2(value.getUTCMonth() + 1)}/${value.getUTCFullYear()}`;
  }

  if (typeof value === 'number') {
    if (value <= 1) return ''; // 0 or 1 corresponds to 1900-01-00 ghost formulas
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed && parsed.y > 1900) {
      return `${pad2(parsed.d)}/${pad2(parsed.m)}/${parsed.y}`;
    }
    return '';
  }

  const str = String(value).trim();
  if (!str) return '';

  // DD/MM/YYYY or D/M/YYYY
  const brMatch = str.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (brMatch) {
    const day = parseInt(brMatch[1], 10);
    const month = parseInt(brMatch[2], 10);
    let year = parseInt(brMatch[3], 10);
    if (year < 100) year += 2000;
    if (year <= 1900) return '';
    return `${pad2(day)}/${pad2(month)}/${year}`;
  }

  // YYYY-MM-DD
  const isoMatch = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (isoMatch) {
    const year = parseInt(isoMatch[1], 10);
    if (year <= 1900) return '';
    return `${pad2(parseInt(isoMatch[3], 10))}/${pad2(parseInt(isoMatch[2], 10))}/${year}`;
  }

  return str;
}

export function deriveMesAnoRef(
  dateStr: string,
  explicitMes?: string,
  explicitAno?: unknown
): { mesRef: string; anoRef: number } {
  const cleanMes = String(explicitMes || '').trim().toLowerCase();
  const parsedAno =
    typeof explicitAno === 'number'
      ? explicitAno
      : parseInt(String(explicitAno || '').replace(/\D/g, ''), 10);

  const match = dateStr.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (match) {
    const monthIdx = parseInt(match[2], 10) - 1;
    const yearFromDate = parseInt(match[3], 10);
    const derivedMes = MESES_PT[monthIdx] || 'janeiro';
    return {
      mesRef: cleanMes && cleanMes !== 'janeiro' ? cleanMes : derivedMes,
      anoRef: !Number.isNaN(parsedAno) && parsedAno > 1900 ? parsedAno : yearFromDate,
    };
  }

  const now = new Date();
  return {
    mesRef: cleanMes || MESES_PT[now.getMonth()],
    anoRef: !Number.isNaN(parsedAno) && parsedAno > 1900 ? parsedAno : now.getFullYear(),
  };
}

function normalizeStatus(raw: unknown): StatusHorimetro {
  const norm = normalizeHeader(String(raw || ''));
  if (norm.includes('faturad')) return 'Faturado';
  if (norm.includes('coletad')) return 'Coletado';
  if (norm.includes('semretorno')) return 'Sem Retorno';
  return 'Pendente';
}

type CanonicalField =
  | 'status'
  | 'mesRef'
  | 'anoRef'
  | 'inicio'
  | 'fim'
  | 'numeroFicha'
  | 'cliente'
  | 'empresa'
  | 'patrimonio'
  | 'horimetro'
  | 'dataColeta'
  | 'nomeContato'
  | 'telefoneContato'
  | 'emailContato'
  | 'observacoes';

const HEADER_ALIASES: Record<string, CanonicalField> = {
  statushorimetro: 'status',
  status: 'status',
  situacao: 'status',
  mesrefcobranca: 'mesRef',
  mesref: 'mesRef',
  mes: 'mesRef',
  anorefcobranca: 'anoRef',
  anoref: 'anoRef',
  ano: 'anoRef',
  inicio: 'inicio',
  datainicio: 'inicio',
  dtinicio: 'inicio',
  fim: 'fim',
  datafim: 'fim',
  dtfim: 'fim',
  nficha: 'numeroFicha',
  nuficha: 'numeroFicha',
  numficha: 'numeroFicha',
  numeroficha: 'numeroFicha',
  numerodaficha: 'numeroFicha',
  ndaficha: 'numeroFicha',
  ficha: 'numeroFicha',
  cliente: 'cliente',
  razaosocial: 'cliente',
  empresa: 'empresa',
  locadora: 'empresa',
  patrimonio: 'patrimonio',
  equipamento: 'patrimonio',
  horimetro: 'horimetro',
  leitura: 'horimetro',
  data: 'dataColeta',
  datacoleta: 'dataColeta',
  dataleitura: 'dataColeta',
  nome: 'nomeContato',
  contatoresponsavel: 'nomeContato',
  responsavel: 'nomeContato',
  contato: 'telefoneContato',
  telefone: 'telefoneContato',
  fone: 'telefoneContato',
  celular: 'telefoneContato',
  whatsapp: 'telefoneContato',
  email: 'emailContato',
  observacoes: 'observacoes',
  observacao: 'observacoes',
  obs: 'observacoes',
};

function findHeaderRow(rows: unknown[][]): {
  headerIndex: number;
  columnMap: Map<number, CanonicalField>;
} {
  let bestIndex = -1;
  let bestMap = new Map<number, CanonicalField>();

  const scanLimit = Math.min(rows.length, 15);
  for (let r = 0; r < scanLimit; r++) {
    const row = rows[r] || [];
    const currentMap = new Map<number, CanonicalField>();

    row.forEach((cell, colIdx) => {
      const norm = normalizeHeader(String(cell || ''));
      if (!norm) return;
      const matched = HEADER_ALIASES[norm];
      if (matched && !Array.from(currentMap.values()).includes(matched)) {
        currentMap.set(colIdx, matched);
      }
    });

    if (currentMap.size > bestMap.size) {
      bestMap = currentMap;
      bestIndex = r;
    }
  }

  return { headerIndex: bestIndex, columnMap: bestMap };
}

export function buildRecordKey(numeroFicha: string, inicio: string): string {
  return `${numeroFicha.trim().toUpperCase()}__${inicio.trim()}`;
}

export function mapMatrixToImportRows(
  matrix: unknown[][],
  existingRecords: CobrancaRecord[]
): { rows: ParsedImportRow[]; hasHeader: boolean; ignoredGhostRows: number } {
  const existingMap = new Map<string, CobrancaRecord>();
  existingRecords.forEach((rec) => {
    existingMap.set(buildRecordKey(rec.numeroFicha, rec.inicio), rec);
  });

  const { headerIndex, columnMap } = findHeaderRow(matrix);
  const hasHeader = columnMap.size >= 3;

  // Fallback column order if user pasted raw rows without headers:
  // Supports both 5-col paste (Início, Fim, Nº Ficha, Cliente, Empresa)
  // and 4-col paste (Início, Fim, Nº Ficha, Empresa)
  const effectiveMap = new Map<number, CanonicalField>(columnMap);
  const startRow = hasHeader ? headerIndex + 1 : 0;

  if (!hasHeader) {
    const sampleRow = matrix.find((r) => r.some((c) => String(c || '').trim() !== '')) || [];
    const colCount = sampleRow.length;
    if (colCount === 4) {
      effectiveMap.set(0, 'inicio');
      effectiveMap.set(1, 'fim');
      effectiveMap.set(2, 'numeroFicha');
      effectiveMap.set(3, 'empresa');
    } else if (colCount >= 5 && colCount <= 8) {
      effectiveMap.set(0, 'inicio');
      effectiveMap.set(1, 'fim');
      effectiveMap.set(2, 'numeroFicha');
      effectiveMap.set(3, 'cliente');
      effectiveMap.set(4, 'empresa');
      if (colCount >= 6) effectiveMap.set(5, 'patrimonio');
      if (colCount >= 7) effectiveMap.set(6, 'horimetro');
    } else {
      // Full Cobrança Oficial column layout
      effectiveMap.set(0, 'status');
      effectiveMap.set(1, 'mesRef');
      effectiveMap.set(2, 'anoRef');
      effectiveMap.set(3, 'inicio');
      effectiveMap.set(4, 'fim');
      effectiveMap.set(5, 'numeroFicha');
      effectiveMap.set(6, 'cliente');
      effectiveMap.set(7, 'empresa');
      effectiveMap.set(8, 'patrimonio');
      effectiveMap.set(9, 'horimetro');
      effectiveMap.set(10, 'dataColeta');
      effectiveMap.set(11, 'nomeContato');
      effectiveMap.set(12, 'telefoneContato');
      effectiveMap.set(13, 'emailContato');
    }
  }

  const parsedRows: ParsedImportRow[] = [];
  let ignoredGhostRows = 0;

  for (let i = startRow; i < matrix.length; i++) {
    const row = matrix[i];
    if (!row || row.every((cell) => String(cell ?? '').trim() === '')) {
      continue;
    }

    const extracted: Partial<Record<CanonicalField, unknown>> = {};
    effectiveMap.forEach((field, colIdx) => {
      extracted[field] = row[colIdx];
    });

    const numeroFicha = String(extracted.numeroFicha ?? '').trim();
    const cliente = String(extracted.cliente ?? '').trim();
    const inicio = formatExcelDate(extracted.inicio);
    const fim = formatExcelDate(extracted.fim);

    // Filter out Excel ghost formula rows like "janeiro | 1900" with no ficha/cliente/inicio
    if (!numeroFicha && !cliente && !inicio) {
      ignoredGhostRows++;
      continue;
    }

    if (!numeroFicha && !cliente) {
      ignoredGhostRows++;
      continue;
    }

    const { mesRef, anoRef } = deriveMesAnoRef(
      inicio || fim,
      String(extracted.mesRef ?? ''),
      extracted.anoRef
    );

    const patrimonio = String(extracted.patrimonio ?? '').trim();
    const horimetro = String(extracted.horimetro ?? '').trim();
    const dataColeta = formatExcelDateOrShort(extracted.dataColeta);
    const nomeContato = String(extracted.nomeContato ?? '').trim();
    const telefoneContato = String(extracted.telefoneContato ?? '').trim();
    const emailContato = String(extracted.emailContato ?? '').trim();
    const observacoes = String(extracted.observacoes ?? '').trim();

    let status = normalizeStatus(extracted.status);
    if (!extracted.status && horimetro && patrimonio) {
      status = 'Coletado';
    }

    const dupKey = buildRecordKey(numeroFicha, inicio);
    const existing = existingMap.get(dupKey);

    parsedRows.push({
      tempId: `tmp_${i}_${Math.random().toString(36).slice(2, 8)}`,
      status,
      mesRef,
      anoRef,
      inicio,
      fim,
      numeroFicha,
      cliente: cliente || 'CLIENTE NÃO INFORMADO',
      empresa: String(extracted.empresa ?? '').trim() || 'BALOC',
      patrimonio,
      horimetro,
      dataColeta,
      nomeContato,
      telefoneContato,
      emailContato,
      observacoes,
      isDuplicate: Boolean(existing),
      existingRecordId: existing?.id,
    });
  }

  return { rows: parsedRows, hasHeader, ignoredGhostRows };
}

function formatExcelDateOrShort(value: unknown): string {
  if (value === null || value === undefined || value === '') return '';
  if (typeof value === 'number') {
    return formatExcelDate(value);
  }
  return String(value).trim();
}

export async function parseSpreadsheetFile(
  file: File,
  existingRecords: CobrancaRecord[]
): Promise<{ rows: ParsedImportRow[]; hasHeader: boolean; ignoredGhostRows: number; sheetName: string }> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: false });
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(worksheet, {
    header: 1,
    defval: '',
    blankrows: false,
  });

  const result = mapMatrixToImportRows(matrix, existingRecords);
  return { ...result, sheetName };
}

export function parsePastedSpreadsheetText(
  text: string,
  existingRecords: CobrancaRecord[]
): { rows: ParsedImportRow[]; hasHeader: boolean; ignoredGhostRows: number } {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trimEnd())
    .filter((l) => l.trim().length > 0);

  const separator = lines.some((l) => l.includes('\t')) ? '\t' : ';';
  const matrix = lines.map((line) => line.split(separator).map((cell) => cell.trim()));

  return mapMatrixToImportRows(matrix, existingRecords);
}

export function exportRecordsToXlsx(records: CobrancaRecord[], filename: string): void {
  const worksheetData = records.map((r) => ({
    'STATUS HORÍMETRO': r.status,
    'MÊS REF COBRANÇA.': r.mesRef,
    'ANO REF COBRANÇA': r.anoRef,
    'INÍCIO': r.inicio,
    'FIM': r.fim,
    'N° FICHA': r.numeroFicha,
    'CLIENTE': r.cliente,
    'EMPRESA': r.empresa,
    'PATRIMÔNIO': r.patrimonio,
    'HORÍMETRO': r.horimetro,
    'DATA': r.dataColeta,
    'NOME': r.nomeContato,
    'CONTATO': r.telefoneContato,
    'E-MAIL': r.emailContato,
    'OBSERVAÇÕES': r.observacoes,
    'ANEXOS': r.anexos?.length || 0,
  }));

  const worksheet = XLSX.utils.json_to_sheet(worksheetData);
  worksheet['!cols'] = [
    { wch: 16 },
    { wch: 18 },
    { wch: 16 },
    { wch: 13 },
    { wch: 13 },
    { wch: 14 },
    { wch: 42 },
    { wch: 14 },
    { wch: 14 },
    { wch: 14 },
    { wch: 12 },
    { wch: 18 },
    { wch: 18 },
    { wch: 28 },
    { wch: 26 },
    { wch: 10 },
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Cobrança');
  XLSX.writeFile(workbook, filename);
}

export function exportRecordsToCsv(records: CobrancaRecord[], filename: string): void {
  const headers = [
    'STATUS HORÍMETRO',
    'MÊS REF COBRANÇA.',
    'ANO REF COBRANÇA',
    'INÍCIO',
    'FIM',
    'N° FICHA',
    'CLIENTE',
    'EMPRESA',
    'PATRIMÔNIO',
    'HORÍMETRO',
    'DATA',
    'NOME',
    'CONTATO',
    'E-MAIL',
    'OBSERVAÇÕES',
    'ANEXOS',
  ];

  const escapeCsv = (val: string | number) => {
    const str = String(val ?? '');
    if (str.includes(';') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const rows = records.map((r) =>
    [
      r.status,
      r.mesRef,
      r.anoRef,
      r.inicio,
      r.fim,
      r.numeroFicha,
      r.cliente,
      r.empresa,
      r.patrimonio,
      r.horimetro,
      r.dataColeta,
      r.nomeContato,
      r.telefoneContato,
      r.emailContato,
      r.observacoes,
      r.anexos?.length || 0,
    ]
      .map(escapeCsv)
      .join(';')
  );

  const csvContent = '\uFEFF' + [headers.join(';'), ...rows].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function downloadImportTemplateXlsx(): void {
  const sampleRows = [
    {
      'INÍCIO': '01/11/2026',
      'FIM': '30/11/2026',
      'N° FICHA': 'GG.007681',
      'CLIENTE': 'GSF AGRICOLA LTDA',
      'EMPRESA': 'BALOC',
    },
    {
      'INÍCIO': '01/11/2026',
      'FIM': '30/11/2026',
      'N° FICHA': 'EM.000901',
      'CLIENTE': 'BOREALIS BRASIL S.A.',
      'EMPRESA': 'BALOC',
    },
  ];
  const ws = XLSX.utils.json_to_sheet(sampleRows);
  ws['!cols'] = [{ wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 36 }, { wch: 14 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Recebimento');
  XLSX.writeFile(wb, 'modelo_planilha_recebimento.xlsx');
}

export function formatRecordsAsTsv(records: CobrancaRecord[]): string {
  return records
    .map((r) =>
      [
        r.status,
        r.mesRef,
        r.anoRef,
        r.inicio,
        r.fim,
        r.numeroFicha,
        r.cliente,
        r.empresa,
        r.patrimonio,
        r.horimetro,
        r.dataColeta,
        r.nomeContato,
        r.telefoneContato,
        r.emailContato,
      ].join('\t')
    )
    .join('\n');
}
