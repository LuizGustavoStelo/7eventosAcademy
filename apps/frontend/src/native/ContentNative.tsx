import { useEffect, useMemo, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { apiRequest } from './api';

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
      setError(
        loadError instanceof Error
          ? loadError.message
          : 'Falha ao carregar materiais.',
      );
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  useEffect(() => {
    void loadData(true);
  }, [token]);

  const filteredMaterials = useMemo(() => {
    const query = search.trim().toLowerCase();
    return materials.filter((material) => {
      if (classFilter !== 'ALL' && material.classId !== classFilter) return false;

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
  }, [materials, search, classFilter]);

  const storagePercent = useMemo(() => {
    if (!storage) return 0;
    if (storage.limitGb <= 0) return 0;
    return Math.min(100, Math.round((storage.usedGb / storage.limitGb) * 100));
  }, [storage]);

  const classesWithMaterials = new Set(materials.map((item) => item.classId)).size;
  const externalLinks = materials.filter((item) => Boolean(item.externalUrl)).length;
  const recent30d = materials.filter((item) => {
    const createdAt = new Date(item.createdAt).getTime();
    const threshold = Date.now() - 30 * 24 * 60 * 60 * 1000;
    return Number.isFinite(createdAt) && createdAt >= threshold;
  }).length;

  const submitMaterial = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError('');
    setError('');
    setFeedback('');

    const title = form.title.trim();
    if (!form.classId || !title) {
      setFormError('Selecione a turma e informe o título do material.');
      return;
    }

    if (form.kind === 'link' && !form.externalUrl.trim() && selectedFiles.length === 0) {
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
          `Formato não suportado em "${invalidFile.name}". Use PDF, DOC, DOCX, PPT, PPTX, XLS, XLSX, TXT, JPG, JPEG, PNG, GIF ou WEBP.`,
        );
        return;
      }
    }

    setSaving(true);
    try {
      let successMessage = 'Material cadastrado com sucesso.';
      if (selectedFiles.length > 0) {
        if (selectedFiles.length === 1) {
          const payload = new FormData();
          payload.append('file', selectedFiles[0]);
          payload.append('title', title);
          payload.append('description', form.description.trim());
          payload.append('kind', form.kind);
          payload.append('externalUrl', form.externalUrl.trim());
          await apiRequest<StudyMaterial>(
            token,
            `/classes/${form.classId}/materials/upload`,
            {
              method: 'POST',
              body: payload,
            },
          );
        } else {
          const payload = new FormData();
          selectedFiles.forEach((file) => payload.append('files', file));
          payload.append('title', title);
          payload.append('description', form.description.trim());
          payload.append('kind', form.kind);
          payload.append('externalUrl', form.externalUrl.trim());

          const batch = await apiRequest<UploadBatchResponse>(
            token,
            `/classes/${form.classId}/materials/upload-batch`,
            {
              method: 'POST',
              body: payload,
            },
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
      setForm((current) => ({
        ...defaultForm(),
        classId: current.classId,
      }));
      setSelectedFiles([]);
      setFeedback(successMessage);
    } catch (submitError) {
      setFormError(
        submitError instanceof Error
          ? submitError.message
          : 'Falha ao cadastrar material.',
      );
    } finally {
      setSaving(false);
    }
  };

  const onFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const nextFiles = Array.from(event.target.files ?? []);
    setSelectedFiles(nextFiles);
  };

  return (
    <section className="native-page native-content">
      <header className="native-page-header">
        <h2>Conteúdo e materiais</h2>
        <p>
          Biblioteca acadêmica nativa para organizar materiais por turma com
          cadastro rápido e controle de armazenamento.
        </p>
      </header>

      <div className="native-kpi-grid native-kpi-grid-small">
        <article className="native-kpi-card">
          <span>Materiais totais</span>
          <strong>{materials.length}</strong>
          <small>{recent30d} adicionados em 30 dias</small>
        </article>
        <article className="native-kpi-card">
          <span>Turmas com material</span>
          <strong>{classesWithMaterials}</strong>
          <small>{classes.length} turma(s) cadastrada(s)</small>
        </article>
        <article className="native-kpi-card">
          <span>Links externos</span>
          <strong>{externalLinks}</strong>
          <small>Itens com URL de referência</small>
        </article>
      </div>

      <div className="native-content-grid">
        <aside className="native-content-side">
          <article className="native-panel">
            <header className="native-panel-header">
              <h3>Novo material</h3>
            </header>

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
                Título
                <input
                  value={form.title}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, title: event.target.value }))
                  }
                  placeholder="Ex: Aula 04 - Logística"
                  required
                />
              </label>

              <label>
                Tipo do material
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
                  <option value="VIDEO">Vídeo</option>
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
                    setForm((current) => ({
                      ...current,
                      kind: event.target.value as MaterialFormState['kind'],
                    }))
                  }
                >
                  <option value="file">Arquivo</option>
                  <option value="link">Link</option>
                  <option value="exercise">Exercício</option>
                </select>
              </label>

              <label>
                URL externa (opcional)
                <input
                  value={form.externalUrl}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      externalUrl: event.target.value,
                    }))
                  }
                  placeholder="https://..."
                />
              </label>

              <label>
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
                  Formatos aceitos: PDF, DOC, DOCX, PPT, PPTX, XLS, XLSX, TXT, JPG, JPEG, PNG, GIF, WEBP.
                </small>
              </label>

              <label>
                Descrição (opcional)
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

              {formError ? <p className="native-error">{formError}</p> : null}

              <div className="native-modal-actions">
                <button type="submit" disabled={saving}>
                  {saving ? 'Salvando...' : 'Cadastrar material'}
                </button>
              </div>
            </form>
          </article>

          <article className="native-panel">
            <header className="native-panel-header">
              <h3>Armazenamento</h3>
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
          <header className="native-panel-header">
            <h3>Biblioteca da turma</h3>
            <small>{filteredMaterials.length} item(ns)</small>
          </header>

          <div className="native-toolbar">
            <input
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar por título, turma ou curso..."
            />
            <div className="native-toolbar-actions">
              <select
                className="native-finance-select"
                value={classFilter}
                onChange={(event) => setClassFilter(event.target.value)}
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
              <p className="native-info">Nenhum material encontrado.</p>
            ) : (
              filteredMaterials.map((material) => (
                <article key={material.id} className="native-content-item">
                  <div className={`native-content-icon ${fileTone(material.mimeType)}`}>
                    <span className="material-symbols-outlined">
                      {fileIcon(material.mimeType)}
                    </span>
                  </div>
                  <div className="native-content-meta">
                    <strong>{material.title}</strong>
                    <small>
                      {material.schoolClass?.name || 'Turma'} •{' '}
                      {material.schoolClass?.course?.name || 'Curso'} •{' '}
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
    </section>
  );
}
