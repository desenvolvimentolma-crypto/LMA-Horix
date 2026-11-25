import { useEffect, useRef, useState } from 'react';
import {
  Calendar,
  CheckCircle2,
  Download,
  FileText,
  ImagePlus,
  Maximize2,
  Paperclip,
  Phone,
  PhoneMissed,
  Plus,
  Save,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import type {
  ClientCatalogEntry,
  CobrancaRecord,
  FichaAttachment,
  PatrimonioItem,
  StatusHorimetro,
  UserRole,
} from '../types/cobranca';
import { getRecordEquipmentItems } from '../utils/horimetro';
import { StatusIndicator } from './StatusIndicator';

interface RecordDrawerProps {
  record: CobrancaRecord | null;
  userRole: UserRole;
  clientSuggestion?: ClientCatalogEntry;
  onClose: () => void;
  onSave: (id: string, patch: Partial<CobrancaRecord>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onUploadAttachment: (recordId: string, file: File) => Promise<void>;
  onDeleteAttachment: (recordId: string, attachmentId: string) => Promise<void>;
  onFetchAttachmentBlob: (recordId: string, attachmentId: string) => Promise<Blob>;
}

const MESES_ABREV = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function RecordDrawer({
  record,
  userRole,
  clientSuggestion,
  onClose,
  onSave,
  onDelete,
  onUploadAttachment,
  onDeleteAttachment,
  onFetchAttachmentBlob,
}: RecordDrawerProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const loadedRecordIdRef = useRef<string | null>(null);

  const [patrimoniosItens, setPatrimoniosItens] = useState<PatrimonioItem[]>([
    { patrimonio: '', horimetro: '' },
  ]);
  const [dataColeta, setDataColeta] = useState('');
  const [nomeContato, setNomeContato] = useState('');
  const [telefoneContato, setTelefoneContato] = useState('');
  const [emailContato, setEmailContato] = useState('');
  const [observacoes, setObservacoes] = useState('');
  const [status, setStatus] = useState<StatusHorimetro>('Pendente');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [validationError, setValidationError] = useState('');

  const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({});
  const [lightboxImage, setLightboxImage] = useState<{
    url: string;
    name: string;
  } | null>(null);

  // Only reset form state when opening a different ficha so fast background sync does not overwrite edits
  useEffect(() => {
    if (!record) {
      loadedRecordIdRef.current = null;
      return;
    }
    if (loadedRecordIdRef.current === record.id) {
      return;
    }
    loadedRecordIdRef.current = record.id;

    const initialItems = getRecordEquipmentItems(record);
    setPatrimoniosItens(
      initialItems.length > 0 ? initialItems : [{ patrimonio: '', horimetro: '' }]
    );
    setDataColeta(record.dataColeta || '');
    setNomeContato(record.nomeContato || '');
    setTelefoneContato(record.telefoneContato || '');
    setEmailContato(record.emailContato || '');
    setObservacoes(record.observacoes || '');
    setStatus(record.status);
    setValidationError('');
  }, [record]);

  // Fetch authenticated blob previews for image attachments
  useEffect(() => {
    if (!record || !record.anexos || record.anexos.length === 0) {
      setPreviewUrls({});
      return;
    }

    let cancelled = false;
    const createdUrls: string[] = [];

    const loadPreviews = async () => {
      const nextMap: Record<string, string> = {};
      for (const anexo of record.anexos || []) {
        if (!anexo.mimeType.startsWith('image/')) continue;
        try {
          const blob = await onFetchAttachmentBlob(record.id, anexo.id);
          if (cancelled) break;
          const url = URL.createObjectURL(blob);
          createdUrls.push(url);
          nextMap[anexo.id] = url;
        } catch {
          // Ignore failed thumbnail loads
        }
      }
      if (!cancelled) {
        setPreviewUrls(nextMap);
      }
    };

    loadPreviews();

    return () => {
      cancelled = true;
      for (const u of createdUrls) {
        URL.revokeObjectURL(u);
      }
    };
  }, [record?.id, record?.anexos, onFetchAttachmentBlob]);

  if (!record) return null;

  const isLockedForRecepcao = userRole === 'Recepção' && record.status === 'Faturado';
  const isReadOnly =
    isLockedForRecepcao ||
    userRole === 'Pesquisa' ||
    userRole === 'Manutenção Preventiva';
  const canDelete = userRole === 'Desenvolvedor' || userRole === 'Recebimento';
  const canSetFaturado = userRole === 'Desenvolvedor' || userRole === 'Recebimento';
  const anexos = record.anexos || [];

  const firstPatrimonioEmpty = !patrimoniosItens.some((i) => i.patrimonio.trim() !== '');

  const hasSuggestion =
    Boolean(clientSuggestion) &&
    (clientSuggestion!.ultimoPatrimonio !== '' ||
      clientSuggestion!.ultimoNomeContato !== '' ||
      clientSuggestion!.ultimoTelefoneContato !== '');

  const applySuggestion = () => {
    if (!clientSuggestion) return;
    if (firstPatrimonioEmpty && clientSuggestion.ultimoPatrimonio) {
      setPatrimoniosItens((prev) => {
        const next = [...prev];
        next[0] = {
          patrimonio: clientSuggestion.ultimoPatrimonio,
          horimetro: next[0]?.horimetro || '',
        };
        return next;
      });
    }
    if (!nomeContato && clientSuggestion.ultimoNomeContato) {
      setNomeContato(clientSuggestion.ultimoNomeContato);
    }
    if (!telefoneContato && clientSuggestion.ultimoTelefoneContato) {
      setTelefoneContato(clientSuggestion.ultimoTelefoneContato);
    }
    if (!emailContato && clientSuggestion.ultimoEmailContato) {
      setEmailContato(clientSuggestion.ultimoEmailContato);
    }
  };

  const updatePatrimonioItem = (
    index: number,
    field: keyof PatrimonioItem,
    value: string
  ) => {
    setPatrimoniosItens((prev) =>
      prev.map((item, idx) => (idx === index ? { ...item, [field]: value } : item))
    );
  };

  const addPatrimonioItem = (prefillPatrimonio = '') => {
    setPatrimoniosItens((prev) => {
      if (
        prev.length === 1 &&
        !prev[0].patrimonio.trim() &&
        !prev[0].horimetro.trim() &&
        prefillPatrimonio
      ) {
        return [{ patrimonio: prefillPatrimonio.toUpperCase(), horimetro: '' }];
      }
      return [
        ...prev,
        { patrimonio: prefillPatrimonio.toUpperCase(), horimetro: '' },
      ];
    });
  };

  const removePatrimonioItem = (index: number) => {
    setPatrimoniosItens((prev) => {
      if (prev.length <= 1) return [{ patrimonio: '', horimetro: '' }];
      return prev.filter((_, idx) => idx !== index);
    });
  };

  const fillToday = () => {
    const now = new Date();
    const day = String(now.getDate()).padStart(2, '0');
    const mes = MESES_ABREV[now.getMonth()];
    setDataColeta(`${day}/${mes}`);
  };

  const handleFilesSelected = async (files: FileList | File[]) => {
    if (isReadOnly) return;
    const list = Array.from(files);
    if (list.length === 0) return;

    setValidationError('');
    setUploading(true);
    try {
      for (const file of list) {
        await onUploadAttachment(record.id, file);
      }
    } catch (err) {
      setValidationError(err instanceof Error ? err.message : 'Erro ao anexar arquivo.');
    } finally {
      setUploading(false);
    }
  };

  const handlePaste = async (e: React.ClipboardEvent) => {
    if (isReadOnly) return;
    const items = e.clipboardData?.items;
    if (!items) return;
    const imageFiles: File[] = [];
    for (const item of Array.from(items)) {
      if (item.kind === 'file' && item.type.startsWith('image/')) {
        const f = item.getAsFile();
        if (f) {
          const ext = item.type.split('/')[1] || 'png';
          const namedFile = new File([f], `foto_horimetro_${Date.now()}.${ext}`, {
            type: item.type,
          });
          imageFiles.push(namedFile);
        }
      }
    }
    if (imageFiles.length > 0) {
      e.preventDefault();
      await handleFilesSelected(imageFiles);
    }
  };

  const handleDownloadAttachment = async (anexo: FichaAttachment) => {
    try {
      const blob = await onFetchAttachmentBlob(record.id, anexo.id);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = anexo.nomeOriginal;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setValidationError(err instanceof Error ? err.message : 'Erro ao baixar anexo.');
    }
  };

  const handleOpenAttachment = async (anexo: FichaAttachment) => {
    if (anexo.mimeType.startsWith('image/')) {
      const existingUrl = previewUrls[anexo.id];
      if (existingUrl) {
        setLightboxImage({ url: existingUrl, name: anexo.nomeOriginal });
        return;
      }
      const blob = await onFetchAttachmentBlob(record.id, anexo.id);
      const url = URL.createObjectURL(blob);
      setLightboxImage({ url, name: anexo.nomeOriginal });
    } else {
      await handleDownloadAttachment(anexo);
    }
  };

  const handleSave = async (targetStatus?: StatusHorimetro) => {
    const finalStatus = targetStatus ?? status;
    const normalizedItems = patrimoniosItens
      .map((item) => ({
        patrimonio: item.patrimonio.trim().toUpperCase(),
        horimetro: item.horimetro.trim(),
      }))
      .filter((item) => item.patrimonio !== '' || item.horimetro !== '');

    if (finalStatus === 'Coletado') {
      if (normalizedItems.length === 0) {
        setValidationError(
          'Informe ao menos um Patrimônio e Horímetro antes de marcar como Coletado.'
        );
        return;
      }
      const missingPat = normalizedItems.find((i) => !i.patrimonio);
      if (missingPat) {
        setValidationError('Preencha o código do Patrimônio em todos os equipamentos.');
        return;
      }
      const missingHor = normalizedItems.find((i) => !i.horimetro);
      if (missingHor) {
        setValidationError(
          `Informe a leitura do Horímetro para o patrimônio ${missingHor.patrimonio}.`
        );
        return;
      }
    }

    const joinedPatrimonio = normalizedItems
      .map((i) => i.patrimonio)
      .filter(Boolean)
      .join(' / ');
    const joinedHorimetro = normalizedItems
      .map((i) => i.horimetro)
      .filter(Boolean)
      .join(' / ');

    setValidationError('');
    setSaving(true);
    try {
      await onSave(record.id, {
        patrimonio: joinedPatrimonio,
        horimetro: joinedHorimetro,
        patrimoniosItens: normalizedItems,
        dataColeta: dataColeta.trim(),
        nomeContato: nomeContato.trim().toUpperCase(),
        telefoneContato: telefoneContato.trim(),
        emailContato: emailContato.trim().toLowerCase(),
        observacoes: observacoes.trim(),
        status: finalStatus,
      });
      onClose();
    } catch (err) {
      setValidationError(err instanceof Error ? err.message : 'Erro ao salvar registro.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setSaving(true);
    try {
      await onDelete(record.id);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const currentPatSet = new Set(
    patrimoniosItens.map((i) => i.patrimonio.trim().toUpperCase()).filter(Boolean)
  );
  const availableExtraPatrimonios = (clientSuggestion?.patrimonios || []).filter(
    (p) => p && !currentPatSet.has(p.trim().toUpperCase())
  );

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-slate-900/35 backdrop-blur-[1px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="drawer-title"
      onPaste={handlePaste}
    >
      <div className="flex h-full w-full max-w-xl flex-col border-l border-slate-200 bg-white shadow-xl">
        {/* Drawer Header */}
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2.5 text-xs text-slate-500">
              <span className="font-mono font-medium text-slate-800">{record.numeroFicha}</span>
              <span aria-hidden="true">·</span>
              <span>{record.empresa}</span>
              <span aria-hidden="true">·</span>
              <span className="capitalize">
                {record.mesRef} {record.anoRef}
              </span>
            </div>
            <h2 id="drawer-title" className="mt-1 text-lg font-semibold text-slate-900 truncate">
              {record.cliente}
            </h2>
            <div className="mt-1.5 flex items-center gap-3">
              <StatusIndicator status={status} />
              <span className="text-xs font-mono tabular-nums text-slate-500">
                Período: {record.inicio || '—'} até {record.fim || '—'}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition-colors"
            aria-label="Fechar painel"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Top Action Bar (positioned away from bottom-right Netlify watermark) */}
        {!isReadOnly && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-6 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => handleSave()}
                disabled={saving}
                className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-100 disabled:opacity-50 whitespace-nowrap shadow-2xs"
              >
                <Save className="h-3.5 w-3.5 text-[#10203A]" aria-hidden="true" />
                {saving ? 'Salvando...' : 'Salvar Alterações'}
              </button>

              {status !== 'Coletado' && status !== 'Faturado' && (
                <button
                  type="button"
                  onClick={() => handleSave('Coletado')}
                  disabled={saving}
                  className="inline-flex items-center gap-1.5 rounded-md bg-[#10203A] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#193056] disabled:opacity-50 whitespace-nowrap"
                >
                  <CheckCircle2 className="h-4 w-4 text-[#F4C430]" aria-hidden="true" />
                  Marcar Coletado
                </button>
              )}

              {status !== 'Sem Retorno' && status !== 'Faturado' && (
                <button
                  type="button"
                  onClick={() => handleSave('Sem Retorno')}
                  disabled={saving}
                  className="inline-flex items-center gap-1.5 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-800 hover:bg-rose-100 disabled:opacity-50 whitespace-nowrap"
                >
                  <PhoneMissed className="h-3.5 w-3.5" aria-hidden="true" />
                  Sem Retorno
                </button>
              )}
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {isLockedForRecepcao && (
            <div className="rounded-md border border-slate-200 bg-slate-100 px-3.5 py-2.5 text-xs text-slate-700">
              Este registro já foi faturado pelo Recebimento e está bloqueado para alterações da Recepção.
            </div>
          )}

          {!isLockedForRecepcao && isReadOnly && (
            <div className="rounded-md border border-slate-200 bg-slate-100 px-3.5 py-2.5 text-xs text-slate-700">
              Modo de consulta ({userRole}). As fotos e leituras abaixo estão disponíveis apenas para visualização.
            </div>
          )}

          {hasSuggestion && (firstPatrimonioEmpty || !telefoneContato) && !isReadOnly && (
            <div className="flex items-center justify-between gap-3 rounded-lg border border-blue-200 bg-blue-50/70 px-4 py-3">
              <div className="min-w-0 text-xs text-blue-950">
                <p className="font-medium">Histórico encontrado para este cliente</p>
                <p className="mt-0.5 text-blue-800 truncate">
                  {clientSuggestion?.ultimoPatrimonio
                    ? `Patrimônio: ${clientSuggestion.ultimoPatrimonio}`
                    : ''}
                  {clientSuggestion?.ultimoPatrimonio && clientSuggestion?.ultimoTelefoneContato
                    ? ' · '
                    : ''}
                  {clientSuggestion?.ultimoNomeContato
                    ? `${clientSuggestion.ultimoNomeContato} `
                    : ''}
                  {clientSuggestion?.ultimoTelefoneContato || ''}
                </p>
              </div>
              <button
                type="button"
                onClick={applySuggestion}
                className="inline-flex items-center gap-1.5 rounded-md bg-blue-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-800 transition-colors whitespace-nowrap shrink-0"
              >
                <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                Preencher
              </button>
            </div>
          )}

          {validationError && (
            <div className="rounded-md border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs font-medium text-red-800">
              {validationError}
            </div>
          )}

          {/* Patrimonios & Horimetros section (supports 1 or multiple equipments inside the same ficha) */}
          <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-700">
                  Patrimônios e Horímetros ({patrimoniosItens.length})
                </h3>
                <p className="text-[11px] text-slate-500">
                  Se esta ficha tiver mais de um equipamento, adicione cada patrimônio e seu horímetro abaixo.
                </p>
              </div>

              {!isReadOnly && (
                <button
                  type="button"
                  onClick={() => addPatrimonioItem()}
                  className="inline-flex items-center gap-1 rounded-md border border-[#10203A]/25 bg-white px-2.5 py-1.5 text-xs font-semibold text-[#10203A] hover:bg-[#FEF7DB] transition-colors whitespace-nowrap"
                >
                  <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                  Adicionar Patrimônio
                </button>
              )}
            </div>

            <div className="space-y-2.5">
              {patrimoniosItens.map((item, idx) => (
                <div
                  key={idx}
                  className="grid grid-cols-1 gap-2.5 rounded-md border border-slate-200 bg-white p-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
                >
                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 mb-1">
                      Patrimônio {patrimoniosItens.length > 1 ? `#${idx + 1}` : '*'}
                    </label>
                    <input
                      type="text"
                      disabled={isReadOnly}
                      value={item.patrimonio}
                      onChange={(e) =>
                        updatePatrimonioItem(idx, 'patrimonio', e.target.value)
                      }
                      placeholder="Ex: GG-216"
                      className="w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-mono uppercase text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/15 disabled:bg-slate-100"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 mb-1">
                      Horímetro {patrimoniosItens.length > 1 ? `#${idx + 1}` : 'Coletado *'}
                    </label>
                    <input
                      type="text"
                      disabled={isReadOnly}
                      value={item.horimetro}
                      onChange={(e) =>
                        updatePatrimonioItem(idx, 'horimetro', e.target.value)
                      }
                      placeholder="Ex: 6330.6h"
                      className="w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-mono text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/15 disabled:bg-slate-100"
                    />
                  </div>

                  {!isReadOnly && patrimoniosItens.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removePatrimonioItem(idx)}
                      className="inline-flex h-9 items-center justify-center rounded-md border border-red-200 bg-white px-2.5 text-xs text-red-700 hover:bg-red-50"
                      title="Remover este patrimônio da ficha"
                      aria-label={`Remover patrimônio ${idx + 1}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  )}
                </div>
              ))}
            </div>

            {!isReadOnly && availableExtraPatrimonios.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                <span className="text-[11px] font-medium text-slate-500">
                  Do histórico deste cliente:
                </span>
                {availableExtraPatrimonios.slice(0, 6).map((pat) => (
                  <button
                    key={pat}
                    type="button"
                    onClick={() => addPatrimonioItem(pat)}
                    className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2 py-0.5 font-mono text-[11px] font-medium text-slate-700 hover:border-[#10203A] hover:bg-slate-50"
                  >
                    <Plus className="h-2.5 w-2.5" aria-hidden="true" />
                    {pat}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">
                Data da Coleta
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  disabled={isReadOnly}
                  value={dataColeta}
                  onChange={(e) => setDataColeta(e.target.value)}
                  placeholder="Ex: 27/out"
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-mono text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/15 disabled:bg-slate-100"
                />
                <button
                  type="button"
                  disabled={isReadOnly}
                  onClick={fillToday}
                  className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-slate-50 px-2.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100 whitespace-nowrap shrink-0 disabled:opacity-50"
                  title="Preencher com a data de hoje"
                >
                  <Calendar className="h-3.5 w-3.5" aria-hidden="true" />
                  Hoje
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">
                Status do Registro
              </label>
              <select
                value={status}
                disabled={isReadOnly}
                onChange={(e) => setStatus(e.target.value as StatusHorimetro)}
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/15 disabled:bg-slate-100"
              >
                <option value="Pendente">Pendente</option>
                <option value="Sem Retorno">Sem Retorno</option>
                <option value="Coletado">Coletado</option>
                {canSetFaturado && <option value="Faturado">Faturado</option>}
              </select>
            </div>
          </div>

          {/* Fotos e Arquivos do Horímetro */}
          <div className="border-t border-slate-200 pt-4">
            <div className="flex items-center justify-between gap-2 mb-3">
              <div className="flex items-center gap-1.5">
                <Paperclip className="h-3.5 w-3.5 text-slate-500" aria-hidden="true" />
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Fotos / Arquivos do Horímetro ({anexos.length})
                </h3>
              </div>

              {!isReadOnly && (
                <>
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept="image/jpeg,image/png,image/webp,image/gif,application/pdf"
                    className="hidden"
                    onChange={(e) => {
                      if (e.target.files) handleFilesSelected(e.target.files);
                      e.target.value = '';
                    }}
                  />
                  <button
                    type="button"
                    disabled={uploading}
                    onClick={() => fileInputRef.current?.click()}
                    className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50"
                  >
                    <ImagePlus className="h-3.5 w-3.5 text-blue-700" aria-hidden="true" />
                    {uploading ? 'Enviando...' : 'Anexar Foto / PDF'}
                  </button>
                </>
              )}
            </div>

            {!isReadOnly && (
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  if (e.dataTransfer.files) handleFilesSelected(e.dataTransfer.files);
                }}
                onClick={() => fileInputRef.current?.click()}
                className="cursor-pointer rounded-md border border-dashed border-slate-300 bg-slate-50/60 px-4 py-3 text-center text-xs text-slate-500 hover:border-slate-400 hover:bg-slate-50 transition-colors"
              >
                Arraste a foto do horímetro aqui, clique para escolher ou pressione{' '}
                <span className="font-mono font-medium text-slate-700">Ctrl+V</span> para colar do WhatsApp (JPG, PNG, WEBP ou PDF até 8 MB).
              </div>
            )}

            {anexos.length > 0 && (
              <div className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                {anexos.map((anexo) => {
                  const isImage = anexo.mimeType.startsWith('image/');
                  const thumbUrl = previewUrls[anexo.id];
                  return (
                    <div
                      key={anexo.id}
                      className="flex items-center gap-3 rounded-md border border-slate-200 bg-white p-2.5"
                    >
                      {isImage ? (
                        <button
                          type="button"
                          onClick={() => handleOpenAttachment(anexo)}
                          className="relative h-14 w-14 shrink-0 overflow-hidden rounded border border-slate-200 bg-slate-100 group"
                          title="Ampliar foto"
                        >
                          {thumbUrl ? (
                            <img
                              src={thumbUrl}
                              alt={anexo.nomeOriginal}
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-[10px] text-slate-400">
                              ...
                            </div>
                          )}
                          <span className="absolute inset-0 flex items-center justify-center bg-slate-900/35 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Maximize2 className="h-4 w-4 text-white" />
                          </span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleOpenAttachment(anexo)}
                          className="flex h-14 w-14 shrink-0 items-center justify-center rounded border border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100"
                          title="Baixar arquivo"
                        >
                          <FileText className="h-6 w-6" />
                        </button>
                      )}

                      <div className="min-w-0 flex-1">
                        <p
                          className="truncate text-xs font-medium text-slate-900"
                          title={anexo.nomeOriginal}
                        >
                          {anexo.nomeOriginal}
                        </p>
                        <p className="mt-0.5 text-[11px] text-slate-500 tabular-nums">
                          {formatBytes(anexo.tamanhoBytes)} · {anexo.enviadoPor}
                        </p>
                        <div className="mt-1.5 flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleDownloadAttachment(anexo)}
                            className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-700 hover:underline"
                          >
                            <Download className="h-3 w-3" aria-hidden="true" />
                            Baixar
                          </button>
                          {!isReadOnly && (
                            <button
                              type="button"
                              onClick={() => onDeleteAttachment(record.id, anexo.id)}
                              className="inline-flex items-center gap-1 text-[11px] font-medium text-red-700 hover:underline"
                            >
                              <Trash2 className="h-3 w-3" aria-hidden="true" />
                              Remover
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="border-t border-slate-200 pt-4 pb-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">
              Dados do Contato no Cliente
            </h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  Nome do Contato
                </label>
                <input
                  type="text"
                  disabled={isReadOnly}
                  value={nomeContato}
                  onChange={(e) => setNomeContato(e.target.value)}
                  placeholder="Ex: IANNER"
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm uppercase text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/15 disabled:bg-slate-100"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  Telefone / WhatsApp
                </label>
                <div className="relative">
                  <input
                    type="text"
                    disabled={isReadOnly}
                    value={telefoneContato}
                    onChange={(e) => setTelefoneContato(e.target.value)}
                    placeholder="Ex: (35)99758-1892"
                    className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 pr-9 text-sm font-mono text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/15 disabled:bg-slate-100"
                  />
                  {telefoneContato && (
                    <a
                      href={`tel:${telefoneContato.replace(/\D/g, '')}`}
                      className="absolute right-2.5 top-2.5 text-slate-400 hover:text-blue-700"
                      title="Ligar para este número"
                    >
                      <Phone className="h-4 w-4" />
                    </a>
                  )}
                </div>
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  E-mail do Contato
                </label>
                <input
                  type="email"
                  disabled={isReadOnly}
                  value={emailContato}
                  onChange={(e) => setEmailContato(e.target.value)}
                  placeholder="contato@empresa.com.br"
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/15 disabled:bg-slate-100"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  Observações da Ligação / Coleta
                </label>
                <textarea
                  rows={3}
                  disabled={isReadOnly}
                  value={observacoes}
                  onChange={(e) => setObservacoes(e.target.value)}
                  placeholder="Ex: Ligado às 10h, sem retorno. Cliente enviou foto do horímetro via WhatsApp."
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/15 disabled:bg-slate-100"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Bar left-aligned so bottom-right Netlify watermark never blocks buttons */}
        {(canDelete || !isReadOnly) && (
          <div className="flex flex-wrap items-center justify-start gap-2.5 border-t border-slate-200 bg-slate-50 px-6 py-4 pr-28">
            {!isReadOnly && (
              <button
                type="button"
                onClick={() => handleSave()}
                disabled={saving}
                className="inline-flex items-center gap-1.5 rounded-md bg-[#10203A] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#193056] disabled:opacity-50 whitespace-nowrap"
              >
                <Save className="h-3.5 w-3.5 text-[#F4C430]" aria-hidden="true" />
                {saving ? 'Salvando...' : 'Salvar'}
              </button>
            )}

            {canDelete && (
              <button
                type="button"
                onClick={handleDelete}
                disabled={saving}
                className="inline-flex items-center gap-1.5 rounded-md border border-red-200 bg-white px-3 py-2 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50 whitespace-nowrap"
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                Excluir Ficha
              </button>
            )}
          </div>
        )}
      </div>

      {/* Image Lightbox Modal */}
      {lightboxImage && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/80 p-4"
          onClick={() => setLightboxImage(null)}
        >
          <div
            className="relative max-h-[90vh] max-w-4xl overflow-hidden rounded-lg bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2.5">
              <span className="text-xs font-medium text-slate-800 truncate">
                {lightboxImage.name}
              </span>
              <button
                type="button"
                onClick={() => setLightboxImage(null)}
                className="rounded p-1 text-slate-500 hover:bg-slate-100"
                aria-label="Fechar visualização"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="bg-slate-900 flex items-center justify-center p-2">
              <img
                src={lightboxImage.url}
                alt={lightboxImage.name}
                className="max-h-[80vh] max-w-full object-contain"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
