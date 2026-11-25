import type { CobrancaRecord, PatrimonioItem } from '../types/cobranca';

export function parseHorimetroNumber(raw: string | number | undefined | null): number | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;

  let str = String(raw).trim().toLowerCase().replace(/h|hrs|horas/g, '').trim();
  if (!str) return null;

  // Keep only digits, dots, commas, minus
  str = str.replace(/[^0-9.,-]/g, '');
  if (!str) return null;

  const hasComma = str.includes(',');
  const hasDot = str.includes('.');

  if (hasComma && hasDot) {
    // e.g. 6.330,6 -> 6330.6
    if (str.lastIndexOf(',') > str.lastIndexOf('.')) {
      str = str.replace(/\./g, '').replace(',', '.');
    } else {
      str = str.replace(/,/g, '');
    }
  } else if (hasComma) {
    str = str.replace(',', '.');
  }

  const parsed = Number(str);
  return Number.isFinite(parsed) ? parsed : null;
}

export function formatHorimetroHours(val: number): string {
  return `${val.toFixed(2)}h`;
}

export function getRecordEquipmentItems(
  record: Pick<CobrancaRecord, 'patrimonio' | 'horimetro' | 'patrimoniosItens'>
): PatrimonioItem[] {
  if (Array.isArray(record.patrimoniosItens) && record.patrimoniosItens.length > 0) {
    const cleaned = record.patrimoniosItens
      .map((item) => ({
        patrimonio: String(item.patrimonio || '').trim().toUpperCase(),
        horimetro: String(item.horimetro || '').trim(),
      }))
      .filter((item) => item.patrimonio !== '' || item.horimetro !== '');
    if (cleaned.length > 0) return cleaned;
  }

  const rawPat = String(record.patrimonio || '').trim();
  const rawHor = String(record.horimetro || '').trim();
  if (!rawPat && !rawHor) return [];

  const splitValues = (raw: string) =>
    raw
      .split(/\s*(?:\/|\||;|\n)\s*/)
      .map((s) => s.trim())
      .filter(Boolean);

  const pats = splitValues(rawPat);
  const hors = splitValues(rawHor);

  if (pats.length > 1) {
    return pats.map((pat, idx) => ({
      patrimonio: pat.toUpperCase(),
      horimetro: hors[idx] ?? (hors.length === 1 && idx === 0 ? hors[0] : ''),
    }));
  }

  return [
    {
      patrimonio: rawPat.toUpperCase(),
      horimetro: rawHor,
    },
  ];
}

export function getHorimetroForPatrimonio(
  record: Pick<CobrancaRecord, 'patrimonio' | 'horimetro' | 'patrimoniosItens'>,
  patrimonio: string
): string {
  const target = patrimonio.trim().toUpperCase();
  const items = getRecordEquipmentItems(record);
  const matched = items.find((item) => item.patrimonio.toUpperCase() === target);
  if (matched) return matched.horimetro;
  return record.horimetro || '';
}

export function parseBrDateToTimestamp(dateStr: string | undefined, fallbackIso?: string): number {
  if (dateStr) {
    const match = dateStr.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (match) {
      const day = parseInt(match[1], 10);
      const month = parseInt(match[2], 10) - 1;
      const year = parseInt(match[3], 10);
      return Date.UTC(year, month, day);
    }
  }
  if (fallbackIso) {
    const t = Date.parse(fallbackIso);
    if (!Number.isNaN(t)) return t;
  }
  return 0;
}

export function compareRecordsNewestFirst(a: CobrancaRecord, b: CobrancaRecord): number {
  const timeA = Math.max(
    parseBrDateToTimestamp(a.fim, a.faturadoEm || a.atualizadoEm),
    parseBrDateToTimestamp(a.inicio, a.faturadoEm || a.atualizadoEm)
  );
  const timeB = Math.max(
    parseBrDateToTimestamp(b.fim, b.faturadoEm || b.atualizadoEm),
    parseBrDateToTimestamp(b.inicio, b.faturadoEm || b.atualizadoEm)
  );
  if (timeB !== timeA) return timeB - timeA;

  const fatA = Date.parse(a.faturadoEm || a.coletadoEm || a.atualizadoEm || '') || 0;
  const fatB = Date.parse(b.faturadoEm || b.coletadoEm || b.atualizadoEm || '') || 0;
  if (fatB !== fatA) return fatB - fatA;

  const numA = parseHorimetroNumber(a.horimetro) ?? -1;
  const numB = parseHorimetroNumber(b.horimetro) ?? -1;
  return numB - numA;
}

export interface PatrimonioSummary {
  patrimonio: string;
  ultimoRegistroFaturado: CobrancaRecord | null;
  ultimoRegistroQualquer: CobrancaRecord;
  ultimoHorimetroTexto: string;
  ultimoHorimetroNumero: number | null;
  historico: CobrancaRecord[];
}

export function buildPatrimonioSummaries(records: CobrancaRecord[]): PatrimonioSummary[] {
  const groups = new Map<string, CobrancaRecord[]>();

  for (const r of records) {
    const items = getRecordEquipmentItems(r);
    const seenInRecord = new Set<string>();
    for (const item of items) {
      const pat = item.patrimonio.trim().toUpperCase();
      if (!pat || seenInRecord.has(pat)) continue;
      seenInRecord.add(pat);
      const list = groups.get(pat) || [];
      list.push(r);
      groups.set(pat, list);
    }
  }

  const summaries: PatrimonioSummary[] = [];
  for (const [patrimonio, list] of groups.entries()) {
    const sorted = [...list].sort(compareRecordsNewestFirst);
    const billedWithReading = sorted.filter(
      (r) => r.status === 'Faturado' && getHorimetroForPatrimonio(r, patrimonio).trim() !== ''
    );
    const anyWithReading = sorted.filter(
      (r) => getHorimetroForPatrimonio(r, patrimonio).trim() !== ''
    );
    const latestBilled = billedWithReading[0] || null;
    const latestAny = anyWithReading[0] || sorted[0];
    const effective = latestBilled || latestAny;
    const effectiveHorimetro = effective ? getHorimetroForPatrimonio(effective, patrimonio) : '';

    summaries.push({
      patrimonio,
      ultimoRegistroFaturado: latestBilled,
      ultimoRegistroQualquer: latestAny,
      ultimoHorimetroTexto: effectiveHorimetro || '—',
      ultimoHorimetroNumero: parseHorimetroNumber(effectiveHorimetro),
      historico: sorted,
    });
  }

  return summaries.sort((a, b) => a.patrimonio.localeCompare(b.patrimonio, 'pt-BR'));
}

export interface ClientPlatformItem {
  cliente: string;
  patrimonio: string;
  empresa: string;
  ultimoFaturado: CobrancaRecord | null;
  ultimoRegistro: CobrancaRecord;
  horimetroFaturadoNumero: number | null;
  horimetroFaturadoTexto: string;
  totalCiclos: number;
}

export function buildClientPlatforms(records: CobrancaRecord[]): ClientPlatformItem[] {
  const groups = new Map<string, CobrancaRecord[]>();

  for (const r of records) {
    const cliente = r.cliente.trim().toUpperCase();
    if (!cliente) continue;
    const items = getRecordEquipmentItems(r);
    const seenInRecord = new Set<string>();
    for (const item of items) {
      const pat = item.patrimonio.trim().toUpperCase();
      if (!pat || seenInRecord.has(pat)) continue;
      seenInRecord.add(pat);
      const key = `${cliente}__${pat}`;
      const list = groups.get(key) || [];
      list.push(r);
      groups.set(key, list);
    }
  }

  const items: ClientPlatformItem[] = [];
  for (const [key, list] of groups.entries()) {
    const patrimonio = key.split('__')[1] || '';
    const sorted = [...list].sort(compareRecordsNewestFirst);
    const billedWithReading = sorted.filter(
      (r) => r.status === 'Faturado' && getHorimetroForPatrimonio(r, patrimonio).trim() !== ''
    );
    const latestBilled = billedWithReading[0] || null;
    const latest = sorted[0];
    const billedHorimetro = latestBilled
      ? getHorimetroForPatrimonio(latestBilled, patrimonio)
      : '';

    items.push({
      cliente: latest.cliente,
      patrimonio,
      empresa: latest.empresa,
      ultimoFaturado: latestBilled,
      ultimoRegistro: latest,
      horimetroFaturadoNumero: parseHorimetroNumber(billedHorimetro),
      horimetroFaturadoTexto: billedHorimetro,
      totalCiclos: sorted.length,
    });
  }

  return items.sort((a, b) => {
    const cmp = a.cliente.localeCompare(b.cliente, 'pt-BR');
    if (cmp !== 0) return cmp;
    return a.patrimonio.localeCompare(b.patrimonio, 'pt-BR');
  });
}

