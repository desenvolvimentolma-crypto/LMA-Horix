import { useRef, useState } from 'react';
import {
  Check,
  ClipboardPaste,
  Download,
  FileSpreadsheet,
  Trash2,
  Upload,
} from 'lucide-react';
import type { CobrancaRecord, ImportBatch, ParsedImportRow } from '../types/cobranca';
import {
  downloadImportTemplateXlsx,
  parsePastedSpreadsheetText,
  parseSpreadsheetFile,
} from '../utils/spreadsheet';

interface RecebimentoImportViewProps {
  records: CobrancaRecord[];
  batches: ImportBatch[];
  onImportConfirm: (params: {
    rows: ParsedImportRow[];
    nomeArquivo: string;
    origem: ImportBatch['origem'];
    duplicateMode: 'skip' | 'overwrite';
  }) => Promise<{ insertedCount: number; updatedCount: number; skippedCount: number }>;
  onDeleteBatch: (batchId: string) => Promise<void>;
  onGoToRecepcao: () => void;
}

export function RecebimentoImportView({
  records,
  batches,
  onImportConfirm,
  onDeleteBatch,
  onGoToRecepcao,
}: RecebimentoImportViewProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [mode, setMode] = useState<'arquivo' | 'colar'>('arquivo');
  const [pasteText, setPasteText] = useState('');
  const [dragActive, setDragActive] = useState(false);

  const [parsedRows, setParsedRows] = useState<ParsedImportRow[]>([]);
  const [sourceName, setSourceName] = useState('');
  const [sourceOrigin, setSourceOrigin] = useState<ImportBatch['origem']>('planilha');
  const [ignoredGhostRows, setIgnoredGhostRows] = useState(0);
  const [duplicateMode, setDuplicateMode] = useState<'skip' | 'overwrite'>('skip');

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const handleFile = async (file: File) => {
    setErrorMsg('');
    setSuccessMsg('');
    setLoading(true);
    try {
      const result = await parseSpreadsheetFile(file, records);
      if (result.rows.length === 0) {
        setErrorMsg(
          'Nenhuma linha válida encontrada na planilha. Verifique se existem colunas como Início, Fim, Nº Ficha, Cliente e Empresa.'
        );
        setParsedRows([]);
        return;
      }
      setParsedRows(result.rows);
      setSourceName(file.name);
      setSourceOrigin('planilha');
      setIgnoredGhostRows(result.ignoredGhostRows);
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Não foi possível ler o arquivo enviado.'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleParsePaste = () => {
    setErrorMsg('');
    setSuccessMsg('');
    if (!pasteText.trim()) {
      setErrorMsg('Cole as linhas copiadas do Excel antes de extrair.');
      return;
    }
    const result = parsePastedSpreadsheetText(pasteText, records);
    if (result.rows.length === 0) {
      setErrorMsg(
        'Não foi possível identificar registros válidos no texto colado. Copie as colunas Início, Fim, Nº Ficha, Cliente e Empresa direto do Excel.'
      );
      return;
    }
    setParsedRows(result.rows);
    setSourceName(`Colagem Excel (${new Date().toLocaleDateString('pt-BR')})`);
    setSourceOrigin('colagem');
    setIgnoredGhostRows(result.ignoredGhostRows);
  };

  const handleConfirmImport = async () => {
    if (parsedRows.length === 0) return;
    setLoading(true);
    setErrorMsg('');
    try {
      const result = await onImportConfirm({
        rows: parsedRows,
        nomeArquivo: sourceName || 'Importação Recebimento',
        origem: sourceOrigin,
        duplicateMode,
      });
      setParsedRows([]);
      setPasteText('');
      setSuccessMsg(
        `Importação concluída: ${result.insertedCount} novos cadastros gerados${
          result.updatedCount > 0 ? `, ${result.updatedCount} atualizados` : ''
        }${result.skippedCount > 0 ? `, ${result.skippedCount} duplicados ignorados` : ''}. A Recepção já pode iniciar a coleta.`
      );
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Erro ao gravar registros.');
    } finally {
      setLoading(false);
    }
  };

  const duplicateCount = parsedRows.filter((r) => r.isDuplicate).length;
  const newCount = parsedRows.length - duplicateCount;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-[#10203A]">
            Recebimento · Importação Semanal de Planilha
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Suba a planilha semanal ou cole as linhas de Início, Fim, Nº da Ficha, Cliente e Empresa. O sistema gera automaticamente os cadastros da semana para a Recepção.
          </p>
        </div>

        <button
          type="button"
          onClick={downloadImportTemplateXlsx}
          className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
        >
          <Download className="h-3.5 w-3.5" aria-hidden="true" />
          Baixar Modelo (.xlsx)
        </button>
      </div>

      {errorMsg && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {errorMsg}
        </div>
      )}

      {successMsg && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          <div className="flex items-center gap-2">
            <Check className="h-4 w-4 text-emerald-700 shrink-0" aria-hidden="true" />
            <span>{successMsg}</span>
          </div>
          <button
            type="button"
            onClick={onGoToRecepcao}
            className="rounded-md bg-[#10203A] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#193056] whitespace-nowrap shrink-0"
          >
            Abrir Fila da Recepção
          </button>
        </div>
      )}

      <div className="rounded-lg border border-slate-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-3">
          <div className="inline-flex items-center gap-1 rounded-md bg-slate-100 p-1">
            <button
              type="button"
              onClick={() => setMode('arquivo')}
              className={`inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                mode === 'arquivo'
                  ? 'bg-[#10203A] text-white'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <FileSpreadsheet className="h-3.5 w-3.5" aria-hidden="true" />
              Subir Arquivo (.xlsx / .csv)
            </button>
            <button
              type="button"
              onClick={() => setMode('colar')}
              className={`inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                mode === 'colar'
                  ? 'bg-[#10203A] text-white'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <ClipboardPaste className="h-3.5 w-3.5" aria-hidden="true" />
              Colar Direto do Excel
            </button>
          </div>

          <span className="text-xs text-slate-500">
            Colunas aceitas: Início · Fim · Nº Ficha · Cliente · Empresa
          </span>
        </div>

        <div className="p-5">
          {mode === 'arquivo' ? (
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragActive(true);
              }}
              onDragLeave={() => setDragActive(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragActive(false);
                const file = e.dataTransfer.files?.[0];
                if (file) handleFile(file);
              }}
              className={`flex flex-col items-center justify-center rounded-lg border-2 border-dashed px-6 py-10 text-center transition-colors ${
                dragActive
                  ? 'border-[#10203A] bg-amber-50/40'
                  : 'border-slate-300 bg-slate-50/50 hover:border-slate-400'
              }`}
            >
              <Upload className="h-8 w-8 text-slate-400 mb-3" aria-hidden="true" />
              <p className="text-sm font-medium text-slate-900">
                Arraste a planilha semanal do Recebimento aqui ou selecione do computador
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Formatos suportados: .xlsx, .xls e .csv. Clientes repetidos de semanas anteriores são preservados normalmente por período.
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFile(file);
                  e.target.value = '';
                }}
              />
              <button
                type="button"
                disabled={loading}
                onClick={() => fileInputRef.current?.click()}
                className="mt-4 rounded-md bg-[#F4C430] px-4 py-2 text-xs font-bold text-[#10203A] hover:bg-[#e5b520] disabled:opacity-50"
              >
                {loading ? 'Lendo planilha...' : 'Selecionar Planilha'}
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <label className="block text-xs font-medium text-slate-700">
                Selecione as células no Excel (com ou sem cabeçalho), pressione Ctrl+C e cole abaixo:
              </label>
              <textarea
                rows={7}
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                placeholder={`01/11/2026\t07/11/2026\tGG.007681\tGSF AGRICOLA LTDA\tBALOC`}
                className="w-full rounded-md border border-slate-300 bg-slate-50/50 p-3 font-mono text-xs text-slate-900 placeholder:text-slate-400 focus:border-[#10203A] focus:bg-white focus:outline-none"
              />
              <div className="flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setPasteText('');
                    setParsedRows([]);
                  }}
                  className="rounded-md border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  Limpar
                </button>
                <button
                  type="button"
                  onClick={handleParsePaste}
                  className="rounded-md bg-[#F4C430] px-4 py-2 text-xs font-bold text-[#10203A] hover:bg-[#e5b520]"
                >
                  Extrair e Organizar Dados
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {parsedRows.length > 0 && (
        <div className="rounded-lg border border-slate-200 bg-white">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 px-5 py-3.5">
            <div>
              <h2 className="text-sm font-semibold text-[#10203A]">
                Pré-visualização dos Dados Extraídos · {sourceName}
              </h2>
              <p className="mt-0.5 text-xs text-slate-600">
                <span className="font-medium text-slate-900 tabular-nums">{newCount}</span> novos registros
                {duplicateCount > 0 && (
                  <>
                    {' · '}
                    <span className="font-medium text-amber-700 tabular-nums">
                      {duplicateCount} já cadastrados neste período
                    </span>
                  </>
                )}
                {ignoredGhostRows > 0 && (
                  <>
                    {' · '}
                    <span className="text-slate-500 tabular-nums">
                      {ignoredGhostRows} linhas vazias/1900 descartadas
                    </span>
                  </>
                )}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {duplicateCount > 0 && (
                <select
                  value={duplicateMode}
                  onChange={(e) => setDuplicateMode(e.target.value as 'skip' | 'overwrite')}
                  className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-800"
                >
                  <option value="skip">Ignorar duplicados ({duplicateCount})</option>
                  <option value="overwrite">Atualizar duplicados existentes</option>
                </select>
              )}

              <button
                type="button"
                onClick={() => setParsedRows([])}
                className="rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={loading || (newCount === 0 && duplicateMode === 'skip')}
                onClick={handleConfirmImport}
                className="rounded-md bg-[#10203A] px-4 py-2 text-xs font-semibold text-white hover:bg-[#193056] disabled:opacity-50 whitespace-nowrap"
              >
                {loading
                  ? 'Salvando...'
                  : `Confirmar e Gerar Cadastros (${
                      duplicateMode === 'skip' ? newCount : parsedRows.length
                    })`}
              </button>
            </div>
          </div>

          <div className="max-h-96 overflow-auto">
            <table className="w-full border-collapse text-left text-xs">
              <thead className="sticky top-0 bg-slate-100 text-slate-600 border-b border-slate-200">
                <tr>
                  <th className="px-3 py-2.5 font-semibold">Ref.</th>
                  <th className="px-3 py-2.5 font-semibold">Início</th>
                  <th className="px-3 py-2.5 font-semibold">Fim</th>
                  <th className="px-3 py-2.5 font-semibold">Nº Ficha</th>
                  <th className="px-3 py-2.5 font-semibold">Cliente</th>
                  <th className="px-3 py-2.5 font-semibold">Empresa</th>
                  <th className="px-3 py-2.5 font-semibold">Situação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {parsedRows.map((row) => (
                  <tr
                    key={row.tempId}
                    className={row.isDuplicate ? 'bg-amber-50/40' : 'hover:bg-slate-50'}
                  >
                    <td className="px-3 py-2 capitalize text-slate-600 whitespace-nowrap">
                      {row.mesRef}/{row.anoRef}
                    </td>
                    <td className="px-3 py-2 font-mono tabular-nums text-slate-800 whitespace-nowrap">
                      {row.inicio || '—'}
                    </td>
                    <td className="px-3 py-2 font-mono tabular-nums text-slate-800 whitespace-nowrap">
                      {row.fim || '—'}
                    </td>
                    <td className="px-3 py-2 font-mono font-medium text-slate-900 whitespace-nowrap">
                      {row.numeroFicha}
                    </td>
                    <td className="px-3 py-2 font-medium text-slate-900">{row.cliente}</td>
                    <td className="px-3 py-2 text-slate-700 whitespace-nowrap">{row.empresa}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {row.isDuplicate ? (
                        <span className="text-amber-700 font-medium">Já existe nesta semana</span>
                      ) : (
                        <span className="text-emerald-700 font-medium">Novo cadastro</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="rounded-lg border border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-5 py-3.5">
          <h2 className="text-sm font-semibold text-[#10203A]">
            Histórico de Lotes Enviados para a Recepção
          </h2>
        </div>

        {batches.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-slate-500">
            Nenhuma planilha importada ainda. Suba a planilha da semana acima para gerar os cadastros.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-2.5 font-semibold">Arquivo / Origem</th>
                  <th className="px-4 py-2.5 font-semibold">Tipo</th>
                  <th className="px-4 py-2.5 font-semibold text-right">Registros</th>
                  <th className="px-4 py-2.5 font-semibold">Importado em</th>
                  <th className="px-4 py-2.5 font-semibold text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {batches.map((batch) => (
                  <tr key={batch.id} className="hover:bg-slate-50">
                    <td className="px-4 py-2.5 font-medium text-slate-900">{batch.nomeArquivo}</td>
                    <td className="px-4 py-2.5 capitalize text-slate-600">{batch.origem}</td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums text-slate-800">
                      {batch.quantidadeTotal}
                    </td>
                    <td className="px-4 py-2.5 font-mono tabular-nums text-slate-600">
                      {new Date(batch.criadoEm).toLocaleString('pt-BR')}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <button
                        type="button"
                        onClick={() => onDeleteBatch(batch.id)}
                        className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-red-700 hover:bg-red-50"
                        title="Remover lote e seus registros"
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                        Remover Lote
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
