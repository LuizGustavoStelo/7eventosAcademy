import { useEffect, useMemo, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { apiRequest, formatCurrency } from './api';

type CourseStatus = 'ACTIVE' | 'DRAFT' | 'INACTIVE';
type CourseModality = 'PRESENTIAL' | 'HYBRID' | 'EAD';
type CoursePaymentModel = 'CASH' | 'INSTALLMENTS';

type Course = {
  id: string;
  name: string;
  description?: string | null;
  workloadHours?: number | null;
  category?: string | null;
  coordinator?: string | null;
  price?: number | null;
  modality?: CourseModality | null;
  status?: CourseStatus | null;
  paymentModel?: CoursePaymentModel | null;
  installmentMonths?: number | null;
  installmentValue?: number | null;
  bannerUrl?: string | null;
  enrolledStudentsCount?: number;
};

type CourseFormState = {
  id: string;
  name: string;
  description: string;
  workloadHours: string;
  category: string;
  coordinator: string;
  price: string;
  modality: CourseModality;
  status: CourseStatus;
  paymentModel: CoursePaymentModel;
  installmentMonths: string;
  installmentValue: string;
};

type CourseBannerUploadResponse = {
  courseId: string;
  bannerAssetId: string;
  bannerUrl: string;
};

type CoursesNativeProps = {
  token: string;
};

const FALLBACK_BANNER =
  'https://images.unsplash.com/photo-1516321497487-e288fb19713f?auto=format&fit=crop&w=1200&q=80';

const statusLabel: Record<CourseStatus, string> = {
  ACTIVE: 'Ativo',
  DRAFT: 'Rascunho',
  INACTIVE: 'Inativo',
};

const modalityLabel: Record<CourseModality, string> = {
  PRESENTIAL: 'Presencial',
  HYBRID: 'Híbrido',
  EAD: 'EAD',
};

const paymentLabel: Record<CoursePaymentModel, string> = {
  CASH: 'Pagamento à vista',
  INSTALLMENTS: 'Mensalidades',
};

function emptyForm(): CourseFormState {
  return {
    id: '',
    name: '',
    description: '',
    workloadHours: '1',
    category: '',
    coordinator: '',
    price: '0',
    modality: 'PRESENTIAL',
    status: 'ACTIVE',
    paymentModel: 'CASH',
    installmentMonths: '12',
    installmentValue: '0',
  };
}

function statusTone(status: CourseStatus): string {
  switch (status) {
    case 'ACTIVE':
      return 'is-success';
    case 'DRAFT':
      return 'is-warning';
    case 'INACTIVE':
      return 'is-muted';
    default:
      return 'is-neutral';
  }
}

function parseIntSafe(value: string): number | undefined {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return undefined;
  const integer = Math.trunc(parsed);
  return integer > 0 ? integer : undefined;
}

function parseNumberSafe(value: string): number | undefined {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return undefined;
  return parsed >= 0 ? parsed : undefined;
}

export function CoursesNative({ token }: CoursesNativeProps) {
  const [courses, setCourses] = useState<Course[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');
  const [formError, setFormError] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [form, setForm] = useState<CourseFormState>(() => emptyForm());
  const [selectedBannerFile, setSelectedBannerFile] = useState<File | null>(null);
  const [previewBannerUrl, setPreviewBannerUrl] = useState(FALLBACK_BANNER);

  const loadCourses = async (showLoading = true) => {
    if (showLoading) setLoading(true);
    setError('');
    try {
      const data = await apiRequest<Course[]>(token, '/courses');
      setCourses(Array.isArray(data) ? data : []);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : 'Falha ao carregar cursos.',
      );
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  useEffect(() => {
    void loadCourses(true);
  }, [token]);

  useEffect(() => {
    if (!selectedBannerFile) return undefined;

    const objectUrl = URL.createObjectURL(selectedBannerFile);
    setPreviewBannerUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [selectedBannerFile]);

  const filteredCourses = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return courses;

    return courses.filter((course) => {
      const name = course.name?.toLowerCase() ?? '';
      const category = course.category?.toLowerCase() ?? '';
      const coordinator = course.coordinator?.toLowerCase() ?? '';
      const description = course.description?.toLowerCase() ?? '';

      return (
        name.includes(query) ||
        category.includes(query) ||
        coordinator.includes(query) ||
        description.includes(query)
      );
    });
  }, [courses, search]);

  const updateForm = <K extends keyof CourseFormState>(
    key: K,
    value: CourseFormState[K],
  ) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const openCreateModal = () => {
    setForm(emptyForm());
    setPreviewBannerUrl(FALLBACK_BANNER);
    setSelectedBannerFile(null);
    setFormError('');
    setDeleteConfirm(false);
    setModalOpen(true);
  };

  const openEditModal = (course: Course) => {
    const price = Number(course.price || 0);
    const months = Number(course.installmentMonths || 12);
    const installmentValue =
      Number(course.installmentValue || 0) ||
      (months > 0 ? price / months : 0);

    setForm({
      id: course.id,
      name: course.name || '',
      description: course.description || '',
      workloadHours: String(Number(course.workloadHours || 1)),
      category: course.category || '',
      coordinator: course.coordinator || '',
      price: String(price),
      modality: (course.modality as CourseModality) || 'PRESENTIAL',
      status: (course.status as CourseStatus) || 'ACTIVE',
      paymentModel: (course.paymentModel as CoursePaymentModel) || 'CASH',
      installmentMonths: String(Math.max(1, months)),
      installmentValue: String(installmentValue),
    });
    setPreviewBannerUrl(course.bannerUrl || FALLBACK_BANNER);
    setSelectedBannerFile(null);
    setFormError('');
    setDeleteConfirm(false);
    setModalOpen(true);
  };

  const onBannerChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    setSelectedBannerFile(file);
    if (!file) {
      setPreviewBannerUrl(FALLBACK_BANNER);
      return;
    }
  };

  const recalculateInstallment = (priceValue: string, monthsValue: string) => {
    if (form.paymentModel !== 'INSTALLMENTS') return;

    const price = parseNumberSafe(priceValue) ?? 0;
    const months = parseIntSafe(monthsValue) ?? 1;
    const installment = months > 0 ? price / months : 0;
    updateForm('installmentValue', installment.toFixed(2));
  };

  const uploadBanner = async (courseId: string, file: File) => {
    const body = new FormData();
    body.append('banner', file);
    await apiRequest<CourseBannerUploadResponse>(token, `/courses/${courseId}/banner`, {
      method: 'POST',
      body,
    });
  };

  const saveCourse = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError('');
    setError('');
    setFeedback('');

    const payloadBase = {
      name: form.name.trim(),
      description: form.description.trim() || undefined,
      workloadHours: parseIntSafe(form.workloadHours),
      category: form.category.trim() || undefined,
      coordinator: form.coordinator.trim() || undefined,
      price: parseNumberSafe(form.price),
      modality: form.modality,
      status: form.status,
      paymentModel: form.paymentModel,
    };

    if (!payloadBase.name || !payloadBase.category || !payloadBase.coordinator) {
      setFormError('Preencha nome, categoria e coordenador/professor.');
      return;
    }

    if (!payloadBase.workloadHours) {
      setFormError('Informe uma carga horária válida.');
      return;
    }

    if (payloadBase.price === undefined) {
      setFormError('Informe um valor total válido.');
      return;
    }

    const installments =
      form.paymentModel === 'INSTALLMENTS'
        ? {
            installmentMonths: parseIntSafe(form.installmentMonths),
            installmentValue: parseNumberSafe(form.installmentValue),
          }
        : { installmentMonths: undefined, installmentValue: undefined };

    if (form.paymentModel === 'INSTALLMENTS' && !installments.installmentMonths) {
      setFormError('Informe a duração das mensalidades em meses.');
      return;
    }

    setSaving(true);
    try {
      let courseId = form.id;
      const payload = {
        ...payloadBase,
        ...installments,
      };

      if (form.id) {
        await apiRequest<Course>(token, `/courses/${form.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      } else {
        const created = await apiRequest<Course>(token, '/courses', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        courseId = created.id;
      }

      if (selectedBannerFile && courseId) {
        await uploadBanner(courseId, selectedBannerFile);
      }

      await loadCourses(false);
      setModalOpen(false);
      setForm(emptyForm());
      setSelectedBannerFile(null);
      setPreviewBannerUrl(FALLBACK_BANNER);
      setFeedback('Curso salvo com sucesso.');
    } catch (saveError) {
      setFormError(
        saveError instanceof Error ? saveError.message : 'Falha ao salvar curso.',
      );
    } finally {
      setSaving(false);
    }
  };

  const removeCourse = async () => {
    if (!form.id) return;
    setSaving(true);
    setFormError('');
    setError('');
    setFeedback('');

    try {
      await apiRequest<{ success: boolean }>(token, `/courses/${form.id}`, {
        method: 'DELETE',
      });
      await loadCourses(false);
      setModalOpen(false);
      setForm(emptyForm());
      setSelectedBannerFile(null);
      setPreviewBannerUrl(FALLBACK_BANNER);
      setDeleteConfirm(false);
      setFeedback('Curso excluído com sucesso.');
    } catch (removeError) {
      setFormError(
        removeError instanceof Error
          ? removeError.message
          : 'Falha ao excluir curso.',
      );
    } finally {
      setSaving(false);
    }
  };

  const previewPayment = useMemo(() => {
    if (form.paymentModel !== 'INSTALLMENTS') return paymentLabel.CASH;
    const months = parseIntSafe(form.installmentMonths) || 1;
    const installment = parseNumberSafe(form.installmentValue) || 0;
    return `${months}x de ${formatCurrency(installment)}`;
  }, [form.paymentModel, form.installmentMonths, form.installmentValue]);

  return (
    <section className="native-page native-courses">
      <header className="native-page-header">
        <h2>Gestão de cursos</h2>
        <p>
          Catálogo acadêmico nativo com edição de preços, modalidade, pagamento e
          banner.
        </p>
      </header>

      <div className="native-toolbar">
        <input
          type="text"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Buscar por curso, categoria ou coordenador..."
        />
      </div>

      {loading ? <p className="native-info">Carregando cursos...</p> : null}
      {error ? <p className="native-error">{error}</p> : null}
      {feedback ? <p className="native-success">{feedback}</p> : null}

      {!loading ? (
        <div className="native-courses-grid">
          <button
            type="button"
            className="native-course-card native-course-card-add"
            onClick={openCreateModal}
          >
            <span className="native-course-card-add-icon" aria-hidden="true">
              +
            </span>
            <strong>Adicionar curso</strong>
          </button>

          {filteredCourses.length === 0 ? (
            <article className="native-panel native-course-empty">
              <p className="native-info">Nenhum curso encontrado.</p>
            </article>
          ) : (
            filteredCourses.map((course) => {
              const status = (course.status as CourseStatus) || 'ACTIVE';
              const modality = (course.modality as CourseModality) || 'PRESENTIAL';
              const paymentModel =
                (course.paymentModel as CoursePaymentModel) || 'CASH';
              const paymentSummary =
                paymentModel === 'INSTALLMENTS'
                  ? `${course.installmentMonths || 1}x de ${formatCurrency(
                      Number(course.installmentValue || 0),
                    )}`
                  : 'À vista';

              return (
                <article key={course.id} className="native-course-card">
                  <img
                    src={course.bannerUrl || FALLBACK_BANNER}
                    alt={`Banner do curso ${course.name}`}
                  />
                  <div className="native-course-card-body">
                    <div className="native-course-card-head">
                      <h3>{course.name}</h3>
                      <span className={`native-status-chip ${statusTone(status)}`}>
                        {statusLabel[status]}
                      </span>
                    </div>

                    <p>{course.description || 'Sem descrição cadastrada.'}</p>

                    <div className="native-course-meta">
                      <small>
                        Categoria: <strong>{course.category || '-'}</strong>
                      </small>
                      <small>
                        Modalidade: <strong>{modalityLabel[modality]}</strong>
                      </small>
                      <small>
                        Carga horária:{' '}
                        <strong>{Number(course.workloadHours || 0)}h</strong>
                      </small>
                      <small>
                        Valor total:{' '}
                        <strong>{formatCurrency(Number(course.price || 0))}</strong>
                      </small>
                      <small className="full">
                        Pagamento: <strong>{paymentSummary}</strong>
                      </small>
                      <small className="full">
                        Alunos matriculados:{' '}
                        <strong>{Number(course.enrolledStudentsCount ?? 0)}</strong>
                      </small>
                    </div>

                    <button type="button" onClick={() => openEditModal(course)}>
                      Editar curso
                    </button>
                  </div>
                </article>
              );
            })
          )}
        </div>
      ) : null}

      {modalOpen ? (
        <div className="native-modal-backdrop" onClick={() => setModalOpen(false)}>
          <section className="native-modal native-course-modal" onClick={(event) => event.stopPropagation()}>
            <header>
              <h3>{form.id ? 'Editar curso' : 'Novo curso acadêmico'}</h3>
              <button type="button" onClick={() => setModalOpen(false)}>
                Fechar
              </button>
            </header>

            <div className="native-course-modal-grid">
              <form className="native-form-grid native-course-form" onSubmit={saveCourse}>
                <label className="native-banner-picker">
                  Banner principal
                  <input
                    type="file"
                    accept="image/*"
                    onChange={onBannerChange}
                  />
                </label>

                <label>
                  Nome do curso
                  <input
                    value={form.name}
                    onChange={(event) => updateForm('name', event.target.value)}
                    required
                  />
                </label>

                <label>
                  Categoria
                  <input
                    value={form.category}
                    onChange={(event) => updateForm('category', event.target.value)}
                    required
                  />
                </label>

                <label>
                  Coordenador / Professor
                  <input
                    value={form.coordinator}
                    onChange={(event) =>
                      updateForm('coordinator', event.target.value)
                    }
                    required
                  />
                </label>

                <label>
                  Carga horária (horas)
                  <input
                    type="number"
                    min={1}
                    value={form.workloadHours}
                    onChange={(event) => updateForm('workloadHours', event.target.value)}
                    required
                  />
                </label>

                <label>
                  Valor total do curso (R$)
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={form.price}
                    onChange={(event) => {
                      updateForm('price', event.target.value);
                      recalculateInstallment(event.target.value, form.installmentMonths);
                    }}
                    required
                  />
                </label>

                <label>
                  Modelo de pagamento
                  <select
                    value={form.paymentModel}
                    onChange={(event) => {
                      const next = event.target.value as CoursePaymentModel;
                      updateForm('paymentModel', next);
                      if (next === 'INSTALLMENTS') {
                        recalculateInstallment(form.price, form.installmentMonths);
                      }
                    }}
                  >
                    <option value="CASH">Pagamento à vista</option>
                    <option value="INSTALLMENTS">Mensalidades</option>
                  </select>
                </label>

                {form.paymentModel === 'INSTALLMENTS' ? (
                  <>
                    <label>
                      Duração em meses
                      <input
                        type="number"
                        min={1}
                        step={1}
                        value={form.installmentMonths}
                        onChange={(event) => {
                          updateForm('installmentMonths', event.target.value);
                          recalculateInstallment(form.price, event.target.value);
                        }}
                      />
                    </label>

                    <label>
                      Valor da mensalidade (R$)
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={form.installmentValue}
                        onChange={(event) =>
                          updateForm('installmentValue', event.target.value)
                        }
                      />
                    </label>
                  </>
                ) : null}

                <label>
                  Modalidade
                  <select
                    value={form.modality}
                    onChange={(event) =>
                      updateForm('modality', event.target.value as CourseModality)
                    }
                  >
                    <option value="PRESENTIAL">Presencial</option>
                    <option value="HYBRID">Híbrido</option>
                    <option value="EAD">EAD</option>
                  </select>
                </label>

                <label>
                  Status
                  <select
                    value={form.status}
                    onChange={(event) =>
                      updateForm('status', event.target.value as CourseStatus)
                    }
                  >
                    <option value="ACTIVE">Ativo</option>
                    <option value="DRAFT">Rascunho</option>
                    <option value="INACTIVE">Inativo</option>
                  </select>
                </label>

                <label>
                  Descrição
                  <textarea
                    rows={6}
                    value={form.description}
                    onChange={(event) =>
                      updateForm('description', event.target.value)
                    }
                  />
                </label>

                {formError ? <p className="native-error">{formError}</p> : null}

                <div className="native-modal-actions">
                  {form.id ? (
                    <button
                      type="button"
                      className={deleteConfirm ? 'danger' : 'ghost'}
                      onClick={() => {
                        if (!deleteConfirm) {
                          setDeleteConfirm(true);
                          return;
                        }
                        void removeCourse();
                      }}
                      disabled={saving}
                    >
                      {deleteConfirm ? 'Confirmar exclusão' : 'Excluir curso'}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="ghost"
                    onClick={() => setModalOpen(false)}
                  >
                    Cancelar
                  </button>
                  <button type="submit" disabled={saving}>
                    {saving ? 'Salvando...' : 'Salvar curso'}
                  </button>
                </div>
              </form>

              <aside className="native-course-preview">
                <h4>Pré-visualização</h4>
                <article>
                  <img
                    src={previewBannerUrl || FALLBACK_BANNER}
                    alt="Prévia do banner do curso"
                  />
                  <div>
                    <strong>{form.name || 'Curso'}</strong>
                    <small>{form.category || 'Categoria'}</small>
                    <p>{form.description || 'Descrição do curso.'}</p>
                    <div className="native-course-preview-meta">
                      <span>{parseIntSafe(form.workloadHours) || 0}h</span>
                      <span>{formatCurrency(parseNumberSafe(form.price) || 0)}</span>
                      <span>{modalityLabel[form.modality]}</span>
                      <span>{statusLabel[form.status]}</span>
                      <span>{previewPayment}</span>
                    </div>
                  </div>
                </article>
              </aside>
            </div>
          </section>
        </div>
      ) : null}
    </section>
  );
}
