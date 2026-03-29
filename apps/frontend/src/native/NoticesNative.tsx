import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { apiRequest } from './api';

type SchoolClass = {
  id: string;
  name: string;
};

type NoticePriority = 'normal' | 'importante' | 'urgente';
type NoticeStatus = 'entregue' | 'programado' | 'finalizado';
type NoticeViewMode = 'lista' | 'grade';

type ClassNotice = {
  id: string;
  classId: string;
  title: string;
  body: string;
  priority: NoticePriority | string;
  status?: NoticeStatus | string;
  publishedAt?: string;
  expiresAt?: string | null;
  archivedUntil?: string | null;
  expectedViewers?: number;
  viewedCount?: number;
  deliveredRate?: number;
  createdAt: string;
  schoolClass?: {
    name: string;
  };
};

type NoticeFormState = {
  classId: string;
  title: string;
  priority: NoticePriority;
  body: string;
  scheduledAt: string;
  expiresAt: string;
};

type NoticesNativeProps = {
  token: string;
};

const PAGE_SIZE = 6;
const STATUS_ORDER: NoticeStatus[] = ['programado', 'entregue', 'finalizado'];
const UTC_MINUS_4_TIMEZONE = 'Etc/GMT+4';

function defaultForm(): NoticeFormState {
  return {
    classId: '',
    title: '',
    priority: 'normal',
    body: '',
    scheduledAt: '',
    expiresAt: '',
  };
}

function priorityLabel(value: string): string {
  if (value === 'urgente') return 'Urgente';
  if (value === 'importante') return 'Importante';
  return 'Normal';
}

function priorityTone(value: string): string {
  if (value === 'urgente') return 'is-danger';
  if (value === 'importante') return 'is-warning';
  return 'is-info';
}

function normalizeStatus(value?: string): NoticeStatus {
  if (value === 'programado' || value === 'finalizado') return value;
  return 'entregue';
}

function statusLabel(value?: string): string {
  if (value === 'programado') return 'Aguardando';
  if (value === 'finalizado') return 'Finalizado';
  return 'Entregue';
}

function statusTone(value?: string): string {
  if (value === 'programado') return 'is-info';
  if (value === 'finalizado') return 'is-muted';
  return 'is-success';
}

function formatDateTime(value?: string | null): string {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: UTC_MINUS_4_TIMEZONE,
  }).format(date);
}

function toUtcMinus4Iso(value: string): string | undefined {
  if (!value) return undefined;

  const match = value.match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/,
  );
  if (!match) return undefined;

  const [, yearRaw, monthRaw, dayRaw, hourRaw, minuteRaw] = match;
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const day = Number(dayRaw);
  const hour = Number(hourRaw);
  const minute = Number(minuteRaw);

  if (
    !Number.isFinite(year) ||
    !Number.isFinite(month) ||
    !Number.isFinite(day) ||
    !Number.isFinite(hour) ||
    !Number.isFinite(minute)
  ) {
    return undefined;
  }

  // O campo datetime-local é interpretado como horário UTC-4 fixo.
  const utcMillis = Date.UTC(year, month - 1, day, hour + 4, minute, 0, 0);
  const asDate = new Date(utcMillis);
  return Number.isNaN(asDate.getTime()) ? undefined : asDate.toISOString();
}

export function NoticesNative({ token }: NoticesNativeProps) {
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [notices, setNotices] = useState<ClassNotice[]>([]);
  const [search, setSearch] = useState('');
  const [classFilter, setClassFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState<'all' | NoticeStatus>('all');
  const [viewMode, setViewMode] = useState<NoticeViewMode>('lista');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');
  const [formError, setFormError] = useState('');
  const [form, setForm] = useState<NoticeFormState>(() => defaultForm());

  const loadData = async (showLoading = true) => {
    if (showLoading) setLoading(true);
    setError('');
    try {
      const [classesData, noticesData] = await Promise.all([
        apiRequest<SchoolClass[]>(token, '/classes'),
        apiRequest<ClassNotice[]>(token, '/classes/notices/all'),
      ]);

      const normalizedClasses = Array.isArray(classesData) ? classesData : [];
      const normalizedNotices = Array.isArray(noticesData) ? noticesData : [];

      setClasses(normalizedClasses);
      setNotices(normalizedNotices);
      setForm((current) => ({
        ...current,
        classId: current.classId || normalizedClasses[0]?.id || '',
      }));
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : 'Falha ao carregar avisos.',
      );
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  useEffect(() => {
    void loadData(true);
  }, [token]);

  const filteredNotices = useMemo(() => {
    const query = search.trim().toLowerCase();

    return notices
      .filter((notice) => {
        if (classFilter !== 'ALL' && notice.classId !== classFilter) return false;

        const status = normalizeStatus(notice.status);
        if (statusFilter !== 'all' && status !== statusFilter) return false;

        if (!query) return true;
        const className = notice.schoolClass?.name?.toLowerCase() ?? '';
        return (
          notice.title.toLowerCase().includes(query) ||
          notice.body.toLowerCase().includes(query) ||
          className.includes(query)
        );
      })
      .sort((a, b) => {
        const statusA = normalizeStatus(a.status);
        const statusB = normalizeStatus(b.status);
        const statusDiff = STATUS_ORDER.indexOf(statusA) - STATUS_ORDER.indexOf(statusB);
        if (statusDiff !== 0) return statusDiff;

        const dateA = new Date(a.publishedAt || a.createdAt).getTime();
        const dateB = new Date(b.publishedAt || b.createdAt).getTime();
        return dateB - dateA;
      });
  }, [notices, search, classFilter, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredNotices.length / PAGE_SIZE));

  const paginatedNotices = useMemo(() => {
    const currentPage = Math.min(page, totalPages);
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredNotices.slice(start, start + PAGE_SIZE);
  }, [filteredNotices, page, totalPages]);

  useEffect(() => {
    setPage(1);
  }, [search, classFilter, statusFilter]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const submitNotice = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError('');
    setError('');
    setFeedback('');

    const title = form.title.trim();
    const body = form.body.trim();
    if (!form.classId || !title || !body) {
      setFormError('Preencha turma, título e conteúdo.');
      return;
    }

    setSaving(true);
    try {
      await apiRequest<ClassNotice>(token, `/classes/${form.classId}/notices`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          body,
          priority: form.priority,
          scheduledAt: toUtcMinus4Iso(form.scheduledAt),
          expiresAt: toUtcMinus4Iso(form.expiresAt),
        }),
      });

      await loadData(false);
      setForm((current) => ({ ...defaultForm(), classId: current.classId }));
      setFeedback('Comunicado salvo com sucesso.');
    } catch (submitError) {
      setFormError(
        submitError instanceof Error
          ? submitError.message
          : 'Falha ao enviar comunicado.',
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="native-page native-notices">
      <header className="native-page-header">
        <h2>Avisos e comunicação</h2>
        <p>
          Publique comunicados por turma, com agendamento, entrega, visualizações
          e arquivamento automático.
        </p>
      </header>

      {loading ? <p className="native-info">Carregando avisos...</p> : null}
      {error ? <p className="native-error">{error}</p> : null}
      {feedback ? <p className="native-success">{feedback}</p> : null}

      <div className="native-notices-split">
        <article className="native-panel native-notice-compose-panel">
          <header className="native-panel-header">
            <h3>Compor novo aviso</h3>
          </header>

          <form className="native-notice-compose" onSubmit={submitNotice}>
            <label>
              Turma (alvo)
              <select
                value={form.classId}
                onChange={(event) =>
                  setForm((current) => ({ ...current, classId: event.target.value }))
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
              Título do aviso
              <input
                value={form.title}
                onChange={(event) =>
                  setForm((current) => ({ ...current, title: event.target.value }))
                }
                placeholder="Ex: Alteração no horário da aula"
                required
              />
            </label>

            <fieldset className="native-notice-priority-fieldset">
              <legend>Prioridade</legend>
              <div className="native-notice-priority-group">
                {(['normal', 'importante', 'urgente'] as NoticePriority[]).map((option) => (
                  <button
                    key={option}
                    type="button"
                    className={`native-notice-priority-btn ${
                      form.priority === option ? 'is-active' : ''
                    } ${priorityTone(option)}`}
                    onClick={() =>
                      setForm((current) => ({ ...current, priority: option }))
                    }
                  >
                    {priorityLabel(option)}
                  </button>
                ))}
              </div>
            </fieldset>

            <label>
              Conteúdo da mensagem
              <textarea
                rows={8}
                value={form.body}
                onChange={(event) =>
                  setForm((current) => ({ ...current, body: event.target.value }))
                }
                placeholder="Escreva sua mensagem aqui..."
                required
              />
            </label>

            <div className="native-notice-schedule-grid">
              <label>
                Agendar envio (UTC-4)
                <input
                  type="datetime-local"
                  value={form.scheduledAt}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      scheduledAt: event.target.value,
                    }))
                  }
                />
              </label>

              <label>
                Expiração (UTC-4)
                <input
                  type="datetime-local"
                  value={form.expiresAt}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, expiresAt: event.target.value }))
                  }
                />
              </label>
            </div>

            {formError ? <p className="native-error">{formError}</p> : null}

            <div className="native-modal-actions">
              <button type="submit" disabled={saving}>
                {saving ? 'Salvando...' : 'Enviar comunicado'}
              </button>
            </div>
          </form>
        </article>

        <article className="native-panel native-notice-recent-panel">
          <header className="native-panel-header">
            <h3>Avisos recentes</h3>
            <small>{filteredNotices.length} Item(s)</small>
          </header>

          <div className="native-notice-recent-filters">
            <input
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar por título, conteúdo ou turma..."
            />

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

            <select
              className="native-finance-select"
              value={statusFilter}
              onChange={(event) =>
                setStatusFilter(event.target.value as 'all' | NoticeStatus)
              }
            >
              <option value="all">Todos os status</option>
              <option value="programado">Programado</option>
              <option value="entregue">Entregue</option>
              <option value="finalizado">Finalizado</option>
            </select>

            <div className="native-notice-view-toggle" role="group" aria-label="Modo de visualização">
              <button
                type="button"
                className={viewMode === 'lista' ? 'is-active' : ''}
                onClick={() => setViewMode('lista')}
              >
                Lista
              </button>
              <button
                type="button"
                className={viewMode === 'grade' ? 'is-active' : ''}
                onClick={() => setViewMode('grade')}
              >
                Grade
              </button>
            </div>
          </div>

          <div
            className={`native-notice-list native-notice-list-pro ${
              viewMode === 'grade' ? 'is-grid' : 'is-list'
            }`}
          >
            {paginatedNotices.length === 0 ? (
              <p className="native-info">Nenhum aviso encontrado.</p>
            ) : (
              paginatedNotices.map((notice) => {
                const viewed = notice.viewedCount ?? 0;
                const expected = notice.expectedViewers ?? 0;
                const rate = notice.deliveredRate ?? 0;

                return (
                  <article key={notice.id} className="native-notice-item native-notice-item-pro">
                    <div className="native-notice-item-main">
                      <div className="native-notice-head">
                        <span className={`native-status-chip ${priorityTone(notice.priority)}`}>
                          {priorityLabel(notice.priority)}
                        </span>
                        <small>
                          {notice.schoolClass?.name || 'Turma não informada'} •{' '}
                          {formatDateTime(notice.publishedAt || notice.createdAt)}
                        </small>
                      </div>
                      <strong>{notice.title}</strong>
                      <p>{notice.body}</p>
                    </div>

                    <div className="native-notice-item-status">
                      <span className={`native-status-chip ${statusTone(notice.status)}`}>
                        {statusLabel(notice.status)}
                      </span>

                      {notice.status === 'programado' ? (
                        <small>Programado para {formatDateTime(notice.publishedAt)}</small>
                      ) : null}

                      {notice.status === 'entregue' ? (
                        <small>
                          {rate}% entregue • {viewed}/{expected} visualizações
                        </small>
                      ) : null}

                      {notice.status === 'finalizado' ? (
                        <small>Arquivado até {formatDateTime(notice.archivedUntil)}</small>
                      ) : null}
                    </div>
                  </article>
                );
              })
            )}
          </div>

          <footer className="native-notice-pagination">
            <small>
              Página {page} de {totalPages}
            </small>
            <div className="native-notice-pagination-actions">
              <button type="button" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>
                Anterior
              </button>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
              >
                Próxima
              </button>
            </div>
          </footer>
        </article>
      </div>
    </section>
  );
}
