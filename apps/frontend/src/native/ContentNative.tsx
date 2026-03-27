import { useEffect, useMemo, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { API_BASE_URL, apiRequest } from './api';

type SchoolClass = {
  id: string;
  name: string;
  course?: { name: string };
};

type StorageLimit = {
  limitGb: number;
  usedBytes: number;
  usedGb: number;
};

type StudyMaterial = {
  id: string;
  classId: string;
  title: string;
  description?: string | null;
  fileUrl?: string | null;
  externalUrl?: string | null;
  mimeType?: string | null;
  kind: string;
  createdAt: string;
  schoolClass?: {
    name: string;
    course?: { name: string };
  };
};

type UploadBatchResponse = {
  created: StudyMaterial[];
  rejected: Array<{ fileName: string; reason: string }>;
  summary: {
    total: number;
    created: number;
    rejected: number;
  };
};

type MaterialFormState = {
  classId: string;
  title: string;
  description: string;
  materialType: 'PDF' | 'VIDEO' | 'DOC' | 'LINK' | 'OTHER';
  kind: 'file' | 'link' | 'exercise';
  externalUrl: string;
};

type ContentNativeProps = {
  token: string;
};

const SUPPORTED_UPLOAD_EXTENSIONS = [
  '.pdf',
  '.doc',
  '.docx',
  '.ppt',
  '.pptx',
  '.xls',
  '.xlsx',
  '.txt',
  '.jpg',
  '.jpeg',
  '.png',
  '.gif',
  '.webp',
  '.mp4',
  '.mov',
  '.avi',
  '.mkv',
  '.webm',
  '.m4v',
];

function defaultForm(): MaterialFormState {
  return {
    classId: '',
    title: '',
    description: '',
    materialType: 'PDF',
    kind: 'file',
    externalUrl: '',
  };
}

function materialMimeType(materialType: MaterialFormState['materialType']): string {
  switch (materialType) {
    case 'PDF':
      return 'application/pdf';
    case 'VIDEO':
      return 'video/mp4';
    case 'DOC':
      return 'application/msword';
    case 'LINK':
      return 'text/uri-list';
    default:
      return 'application/octet-stream';
  }
}

function fileIcon(mimeType?: string | null): string {
  const mime = (mimeType || '').toLowerCase();
  if (mime.includes('pdf')) return 'picture_as_pdf';
  if (mime.includes('video') || mime.includes('mp4')) return 'video_library';
  if (mime.includes('image')) return 'image';
  if (mime.includes('word') || mime.includes('text')) return 'description';
  return 'description';
}

function fileTone(mimeType?: string | null): string {
  const mime = (mimeType || '').toLowerCase();
  if (mime.includes('pdf')) return 'is-warning';
  if (mime.includes('video') || mime.includes('mp4')) return 'is-info';
  if (mime.includes('image')) return 'is-success';
  return 'is-neutral';
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date);
}

export function ContentNative({ token }: ContentNativeProps) {
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [materials, setMaterials] = useState<StudyMaterial[]>([]);
  const [storage, setStorage] = useState<StorageLimit | null>(null);
  const [search, setSearch] = useState('');
  const [classFilter, setClassFilter] = useState('ALL');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');
  const [formError, setFormError] = useState('');
  const [form, setForm] = useState<MaterialFormState>(() => defaultForm());
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [activeTab, setActiveTab] = useState<'class' | 'all'>('class');
  const [sortMode, setSortMode] = useState<'recent' | 'size'>('recent');
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const isLinkKind = form.kind === 'link';

  const loadData = async (showLoading = true) => {
    if (showLoading) setLoading(true);
    setError('');
    try {
      const [classesData, materialsData, storageData] = await Promise.all([
        apiRequest<SchoolClass[]>(token, '/classes'),
        apiRequest<StudyMaterial[]>(token, '/classes/materials/all'),
        apiRequest<StorageLimit>(token, '/settings/storage-limit'),
      ]);

      const normalizedClasses = Array.isArray(classesData) ? classesData : [];
      setClasses(normalizedClasses);
      setMaterials(Array.isArray(materialsData) ? materialsData : []);
      setStorage(storageData);
      setForm((current) => ({
        ...current,
        classId: current.classId || normalizedClasses[0]?.id || '',
      }));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Falha ao carregar materiais.');
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  useEffect(() => {
    void loadData(true);
  }, [token]);

  const filteredMaterials = useMemo(() => {
    const query = search.trim().toLowerCase();
    const scoped = materials.filter((material) => {
      if (activeTab === 'all') return true;
      if (classFilter === 'ALL') return true;
      return material.classId === classFilter;
    });

    const filtered = scoped.filter((material) => {
      if (!query) return true;
      const title = material.title?.toLowerCase() ?? '';
      const description = material.description?.toLowerCase() ?? '';
      const className = material.schoolClass?.name?.toLowerCase() ?? '';
      const courseName = material.schoolClass?.course?.name?.toLowerCase() ?? '';
      return (
        title.includes(query) ||
        description.includes(query) ||
        className.includes(query) ||
        courseName.includes(query)
      );
    });

    if (sortMode === 'size') {
      return [...filtered].sort((a, b) => Number(Boolean(b.fileUrl)) - Number(Boolean(a.fileUrl)));
    }

    return [...filtered].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }, [materials, search, classFilter, activeTab, sortMode]);

  const storagePercent = useMemo(() => {
    if (!storage) return 0;
    if (storage.limitGb <= 0) return 0;
    return Math.min(100, Math.round((storage.usedGb / storage.limitGb) * 100));
  }, [storage]);

  const totalMaterials = materials.length;
  const visibleMaterials = filteredMaterials.length;

  const exportAll = () => {
    const headers = ['TÃ­tulo', 'Turma', 'Curso', 'Data', 'Tipo', 'Arquivo', 'Link'];
    const rows = filteredMaterials.map((item) => [
      item.title,
      item.schoolClass?.name ?? '-',
      item.schoolClass?.course?.name ?? '-',
      formatDate(item.createdAt),
      item.kind,
      item.fileUrl ?? '',
      item.externalUrl ?? '',
    ]);
    const csv = [headers, ...rows]
      .map((row) => row.map((col) => `"${String(col).replace(/"/g, '""')}"`).join(','))
      .join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'materiais.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const openUploadModal = () => {
    setFormError('');
    setUploadProgress(null);
    setUploadModalOpen(true);
  };

  const uploadMultipartWithProgress = async <T,>(path: string, body: FormData): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${API_BASE_URL}${path}`);
      xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      xhr.timeout = 120_000;

      xhr.upload.onprogress = (event) => {
        if (!event.lengthComputable) return;
        const percent = Math.round((event.loaded / event.total) * 95);
        setUploadProgress(Math.max(0, Math.min(100, percent)));
      };

      xhr.onerror = () => reject(new Error('Falha de conex\u00e3o durante o upload.'));
      xhr.ontimeout = () =>
        reject(new Error('Falha no envio por tempo limite (504). Tente novamente em instantes ou envie um arquivo menor.'));
      xhr.onabort = () => reject(new Error('Envio cancelado pelo usu\u00e1rio.'));

      xhr.onload = () => {
        setUploadProgress(100);
        const raw = xhr.responseText || '';
        const payload = (() => {
          try {
            return raw ? (JSON.parse(raw) as { message?: string | string[] }) : null;
          } catch {
            return null;
          }
        })();

        if (xhr.status >= 200 && xhr.status < 300) {
          resolve((payload as T) ?? (undefined as T));
          return;
        }

        let message = `Falha na requisiÃ§Ã£o (${xhr.status}).`;
        if (payload) {
          if (Array.isArray(payload.message)) message = payload.message.join(' ');
          else if (typeof payload.message === 'string') message = payload.message;
        }
        reject(new Error(message));
      };

      xhr.send(body);
    });

  const submitMaterial = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError('');
    setError('');
    setFeedback('');

    const title = form.title.trim();
    if (!form.classId || !title) {
      setFormError('Selecione a turma e informe o tÃ­tulo do material.');
      return;
    }

    if (isLinkKind && !form.externalUrl.trim()) {
      setFormError('Para material do tipo link, informe uma URL externa.');
      return;
    }

    if (selectedFiles.length > 0) {
      const invalidFile = selectedFiles.find((file) => {
        const lowerName = file.name.toLowerCase();
        return !SUPPORTED_UPLOAD_EXTENSIONS.some((ext) => lowerName.endsWith(ext));
      });
      if (invalidFile) {
        setFormError(
          `Formato não suportado em "${invalidFile.name}". Use PDF, DOC, DOCX, PPT, PPTX, XLS, XLSX, TXT, JPG, JPEG, PNG, GIF, WEBP, MP4, MOV, AVI, MKV, WEBM ou M4V.`,
        );
        return;
      }
    }

    setSaving(true);
    try {
      let successMessage = 'Material cadastrado com sucesso.';
      if (selectedFiles.length > 0) {
        setUploadProgress(0);

        if (selectedFiles.length === 1) {
          const payload = new FormData();
          payload.append('file', selectedFiles[0]);
          payload.append('title', title);
          payload.append('description', form.description.trim());
          payload.append('kind', form.kind);
          payload.append('externalUrl', form.externalUrl.trim());
          await uploadMultipartWithProgress<StudyMaterial>(
            `/classes/${form.classId}/materials/upload`,
            payload,
          );
        } else {
          const payload = new FormData();
          selectedFiles.forEach((file) => payload.append('files', file));
          payload.append('title', title);
          payload.append('description', form.description.trim());
          payload.append('kind', form.kind);
          payload.append('externalUrl', form.externalUrl.trim());

          const batch = await uploadMultipartWithProgress<UploadBatchResponse>(
            `/classes/${form.classId}/materials/upload-batch`,
            payload,
          );

          if (batch.rejected.length > 0) {
            const firstErrors = batch.rejected
              .slice(0, 3)
              .map((item) => `${item.fileName}: ${item.reason}`)
              .join(' | ');
            successMessage = `${batch.summary.created} arquivo(s) enviado(s). ${batch.summary.rejected} rejeitado(s). ${firstErrors}`;
          } else {
            successMessage = `${batch.summary.created} arquivo(s) enviados com sucesso.`;
          }
        }
      } else {
        await apiRequest<StudyMaterial>(token, `/classes/${form.classId}/materials`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title,
            description: form.description.trim() || undefined,
            kind: form.kind,
            mimeType: materialMimeType(form.materialType),
            externalUrl: form.externalUrl.trim() || undefined,
          }),
        });
      }

      await loadData(false);
      setForm((current) => ({ ...defaultForm(), classId: current.classId }));
      setSelectedFiles([]);
      setFeedback(successMessage);
      setUploadModalOpen(false);
    } catch (submitError) {
      const message =
        submitError instanceof Error ? submitError.message : 'Falha ao cadastrar material.';

      if (message.includes('(504)')) {
        setFormError(
          'Falha no envio por tempo limite (504). Tente novamente em instantes ou envie um arquivo menor.',
        );
      } else {
        setFormError(message);
      }
    } finally {
      setSaving(false);
      setUploadProgress(null);
    }
  };

  const onFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const nextFiles = Array.from(event.target.files ?? []);
    setSelectedFiles(nextFiles);
  };

  return (
    <section className="native-page native-content">
      <header className="native-content-pro-header">
        <div>
          <h2>Gerenciamento de ConteÃºdo</h2>
          <p>
            Organize seus materiais de aula e mantenha a biblioteca acadÃªmica atualizada para seus alunos.
          </p>
          <small className="native-content-pro-meta">
            {visibleMaterials} de {totalMaterials} material(is) exibido(s)
          </small>
        </div>
        <div className="native-content-pro-actions">
          <button type="button" className="ghost" onClick={exportAll}>
            Exportar Tudo
          </button>
          <button type="button" className="is-primary" onClick={openUploadModal}>
            Novo Material
          </button>
        </div>
      </header>

      <div className="native-content-grid">
        <aside className="native-content-side">
          <button type="button" className="native-content-upload-trigger" onClick={openUploadModal}>
            <span className="native-content-upload-trigger-icon" aria-hidden="true">
              +
            </span>
            <strong>Adicionar material</strong>
            <small>Abra o formulÃ¡rio de upload em destaque</small>
          </button>

          <article className="native-panel native-content-storage-card">
            <header className="native-panel-header">
              <h3>Armazenamento Usado</h3>
            </header>
            <div className="native-storage-box">
              <strong>{(storage?.usedGb ?? 0).toFixed(2)} GB</strong>
              <small>de {storage?.limitGb ?? 0} GB</small>
              <div className="native-storage-track">
                <div
                  className={`native-storage-fill ${storagePercent > 90 ? 'is-danger' : ''}`}
                  style={{ width: `${storagePercent}%` }}
                />
              </div>
              <small>{storagePercent}% utilizado</small>
            </div>
          </article>
        </aside>

        <section className="native-panel native-content-list-panel">
          <header className="native-content-tabs">
            <button
              type="button"
              className={activeTab === 'class' ? 'active' : ''}
              onClick={() => setActiveTab('class')}
            >
              Materiais da Turma
            </button>
            <button
              type="button"
              className={activeTab === 'all' ? 'active' : ''}
              onClick={() => setActiveTab('all')}
            >
              Biblioteca Geral
            </button>
          </header>

          <div className="native-content-filter-row">
            <strong>Filtrar por:</strong>
            <button
              type="button"
              className={sortMode === 'recent' ? 'active' : ''}
              onClick={() => setSortMode('recent')}
            >
              Mais recentes
            </button>
            <button
              type="button"
              className={sortMode === 'size' ? 'active' : ''}
              onClick={() => setSortMode('size')}
            >
              Maior tamanho
            </button>
          </div>

          <div className="native-toolbar">
            <input
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar por tÃ­tulo, turma ou curso..."
            />
            <div className="native-toolbar-actions">
              <select
                className="native-finance-select"
                value={classFilter}
                onChange={(event) => setClassFilter(event.target.value)}
                disabled={activeTab === 'all'}
              >
                <option value="ALL">Todas as turmas</option>
                {classes.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {loading ? <p className="native-info">Carregando materiais...</p> : null}
          {error ? <p className="native-error">{error}</p> : null}
          {feedback ? <p className="native-success">{feedback}</p> : null}

          <div className="native-content-list">
            {!loading && filteredMaterials.length === 0 ? (
              <p className="native-info native-content-empty-state">
                Fim da lista atual. Nenhum material encontrado.
              </p>
            ) : (
              filteredMaterials.map((material) => (
                <article key={material.id} className="native-content-item">
                  <div className={`native-content-icon ${fileTone(material.mimeType)}`}>
                    <span className="material-symbols-outlined">{fileIcon(material.mimeType)}</span>
                  </div>
                  <div className="native-content-meta">
                    <strong>{material.title}</strong>
                    <small>
                      {material.schoolClass?.name || 'Turma'} â€¢{' '}
                      {material.schoolClass?.course?.name || 'Curso'} â€¢{' '}
                      {formatDate(material.createdAt)}
                    </small>
                    {material.description ? <p>{material.description}</p> : null}
                    {material.externalUrl ? (
                      <a href={material.externalUrl} target="_blank" rel="noreferrer">
                        Abrir link externo
                      </a>
                    ) : null}
                    {material.fileUrl ? (
                      <a href={material.fileUrl} target="_blank" rel="noreferrer">
                        Baixar arquivo
                      </a>
                    ) : null}
                  </div>
                </article>
              ))
            )}
          </div>
        </section>
      </div>

      {uploadModalOpen ? (
        <div
          className="native-content-upload-backdrop"
          onClick={() => {
            if (saving) return;
            setUploadModalOpen(false);
            setFormError('');
            setUploadProgress(null);
          }}
        >
          <section className="native-content-upload-modal" onClick={(event) => event.stopPropagation()}>
            <header>
              <h3>Upload RÃ¡pido</h3>
              <button
                type="button"
                onClick={() => {
                  if (saving) return;
                  setUploadModalOpen(false);
                  setFormError('');
                  setUploadProgress(null);
                }}
              >
                Fechar
              </button>
            </header>

            <p className="native-content-panel-hint">
              Preencha os metadados e envie um ou mais arquivos para publicar na turma.
            </p>

            <form className="native-form-grid native-content-form" onSubmit={submitMaterial}>
              <label>
                Turma
                <select
                  value={form.classId}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      classId: event.target.value,
                    }))
                  }
                  required
                >
                  <option value="">Selecione</option>
                  {classes.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                TÃ­tulo
                <input
                  value={form.title}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, title: event.target.value }))
                  }
                  placeholder="Ex: Aula 04 - LogÃ­stica"
                  required
                />
              </label>

              <label>
                Tipo
                <select
                  value={form.materialType}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      materialType: event.target.value as MaterialFormState['materialType'],
                    }))
                  }
                >
                  <option value="PDF">PDF</option>
                  <option value="VIDEO">VÃ­deo</option>
                  <option value="DOC">Documento</option>
                  <option value="LINK">Link</option>
                  <option value="OTHER">Outro</option>
                </select>
              </label>

              <label>
                Categoria
                <select
                  value={form.kind}
                  onChange={(event) =>
                    setForm((current) => {
                      const nextKind = event.target.value as MaterialFormState['kind'];
                      if (nextKind === 'link') {
                        setSelectedFiles([]);
                      }
                      return {
                        ...current,
                        kind: nextKind,
                        externalUrl: nextKind === 'link' ? current.externalUrl : '',
                      };
                    })
                  }
                >
                  <option value="file">Arquivo</option>
                  <option value="link">Link</option>
                  <option value="exercise">ExercÃ­cio</option>
                </select>
              </label>

              {isLinkKind ? (
                <label className="native-content-field-full">
                  URL externa
                  <input
                    value={form.externalUrl}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        externalUrl: event.target.value,
                      }))
                    }
                    placeholder="https://..."
                    required
                  />
                </label>
              ) : (
                <label className="native-content-field-full">
                  Arquivo (opcional)
                  <input
                    type="file"
                    multiple
                    accept={SUPPORTED_UPLOAD_EXTENSIONS.join(',')}
                    onChange={onFileChange}
                  />
                  {selectedFiles.length > 0 ? (
                    <small>
                      {selectedFiles.length} arquivo(s) selecionado(s):{' '}
                      {selectedFiles.slice(0, 2).map((file) => file.name).join(', ')}
                      {selectedFiles.length > 2 ? '...' : ''}
                    </small>
                  ) : null}
                  <small>
                    Formatos aceitos: PDF, DOC, DOCX, PPT, PPTX, XLS, XLSX, TXT, JPG, JPEG, PNG, GIF, WEBP, MP4, MOV, AVI, MKV, WEBM, M4V.
                  </small>
                </label>
              )}

              <label className="native-content-field-full">
                DescriÃ§Ã£o (opcional)
                <textarea
                  rows={4}
                  value={form.description}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      description: event.target.value,
                    }))
                  }
                  placeholder="Detalhes para os alunos..."
                />
              </label>

              {uploadProgress !== null ? (
                <div className="native-upload-progress">
                  <div className="native-upload-progress-head">
                    <strong>Enviando material</strong>
                    <span>{uploadProgress}%</span>
                  </div>
                  <div className="native-upload-progress-track" aria-hidden="true">
                    <div className="native-upload-progress-fill" style={{ width: `${uploadProgress}%` }} />
                  </div>
                </div>
              ) : null}

              {formError ? <p className="native-error">{formError}</p> : null}

              <div className="native-modal-actions native-content-modal-actions">
                <button
                  type="button"
                  className="ghost"
                  onClick={() => {
                    if (saving) return;
                    setUploadModalOpen(false);
                    setFormError('');
                    setUploadProgress(null);
                  }}
                >
                  Cancelar
                </button>
                <button type="submit" className="native-content-submit-btn" disabled={saving}>
                  {saving ? 'Enviando...' : 'Subir Material'}
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}
    </section>
  );
}

