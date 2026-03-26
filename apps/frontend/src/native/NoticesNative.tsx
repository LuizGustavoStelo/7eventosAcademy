import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { apiRequest } from './api';

type SchoolClass = {
  id: string;
  name: string;
};

type NoticePriority = 'normal' | 'importante' | 'urgente';

type ClassNotice = {
  id: string;
  classId: string;
  title: string;
  body: string;
  priority: NoticePriority | string;
  createdAt: string;
  publishedAt?: string;
  schoolClass?: {
    name: string;
  };
};

type NoticeFormState = {
  classId: string;
  title: string;
  priority: NoticePriority;
  body: string;
};

type NoticesNativeProps = {
  token: string;
};

function defaultForm(): NoticeFormState {
  return {
    classId: '',
    title: '',
    priority: 'normal',
    body: '',
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

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function NoticesNative({ token }: NoticesNativeProps) {
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [notices, setNotices] = useState<ClassNotice[]>([]);
  const [search, setSearch] = useState('');
  const [classFilter, setClassFilter] = useState('ALL');
  const [priorityFilter, setPriorityFilter] = useState<'all' | NoticePriority>('all');
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
        loadError instanceof Error
          ? loadError.message
          : 'Falha ao carregar avisos.',
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
    return notices.filter((notice) => {
      if (classFilter !== 'ALL' && notice.classId !== classFilter) return false;
      if (priorityFilter !== 'all' && notice.priority !== priorityFilter) return false;

      if (!query) return true;
      const title = notice.title?.toLowerCase() ?? '';
      const body = notice.body?.toLowerCase() ?? '';
      const className = notice.schoolClass?.name?.toLowerCase() ?? '';
      return (
        title.includes(query) ||
        body.includes(query) ||
        className.includes(query)
      );
    });
  }, [notices, search, classFilter, priorityFilter]);

  const urgentCount = notices.filter((item) => item.priority === 'urgente').length;
  const importantCount = notices.filter((item) => item.priority === 'importante').length;
  const reachedClasses = new Set(notices.map((item) => item.classId)).size;
  const recent30d = notices.filter((item) => {
    const createdAt = new Date(item.createdAt).getTime();
    const threshold = Date.now() - 30 * 24 * 60 * 60 * 1000;
    return Number.isFinite(createdAt) && createdAt >= threshold;
  }).length;

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
        }),
      });

      await loadData(false);
      setForm((current) => ({ ...defaultForm(), classId: current.classId }));
      setFeedback('Comunicado enviado com sucesso.');
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
          Canal nativo para comunicados por turma, com filtros de prioridade e
          histórico de envio.
        </p>
      </header>

      <div className="native-kpi-grid native-kpi-grid-small">
        <article className="native-kpi-card">
          <span>Avisos totais</span>
          <strong>{notices.length}</strong>
          <small>{recent30d} no período de 30 dias</small>
        </article>
        <article className="native-kpi-card">
          <span>Urgentes</span>
          <strong>{urgentCount}</strong>
          <small>{importantCount} importantes</small>
        </article>
        <article className="native-kpi-card">
          <span>Turmas atingidas</span>
          <strong>{reachedClasses}</strong>
          <small>{classes.length} turma(s) cadastrada(s)</small>
        </article>
      </div>

      <div className="native-toolbar">
        <input
          type="text"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Buscar por título, conteúdo ou turma..."
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

          <select
            className="native-finance-select"
            value={priorityFilter}
            onChange={(event) =>
              setPriorityFilter(event.target.value as 'all' | NoticePriority)
            }
          >
            <option value="all">Todas as prioridades</option>
            <option value="normal">Normal</option>
            <option value="importante">Importante</option>
            <option value="urgente">Urgente</option>
          </select>
        </div>
      </div>

      {loading ? <p className="native-info">Carregando avisos...</p> : null}
      {error ? <p className="native-error">{error}</p> : null}
      {feedback ? <p className="native-success">{feedback}</p> : null}

      <div className="native-notices-grid">
        <article className="native-panel">
          <header className="native-panel-header">
            <h3>Compor novo aviso</h3>
          </header>

          <form className="native-form-grid native-notice-form" onSubmit={submitNotice}>
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

            <label>
              Prioridade
              <select
                value={form.priority}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    priority: event.target.value as NoticePriority,
                  }))
                }
              >
                <option value="normal">Normal</option>
                <option value="importante">Importante</option>
                <option value="urgente">Urgente</option>
              </select>
            </label>

            <label>
              Conteúdo da mensagem
              <textarea
                rows={6}
                value={form.body}
                onChange={(event) =>
                  setForm((current) => ({ ...current, body: event.target.value }))
                }
                placeholder="Escreva sua mensagem aqui..."
                required
              />
            </label>

            {formError ? <p className="native-error">{formError}</p> : null}

            <div className="native-modal-actions">
              <button type="submit" disabled={saving}>
                {saving ? 'Enviando...' : 'Enviar comunicado'}
              </button>
            </div>
          </form>
        </article>

        <article className="native-panel">
          <header className="native-panel-header">
            <h3>Avisos recentes</h3>
            <small>{filteredNotices.length} item(ns)</small>
          </header>

          <div className="native-notice-list">
            {filteredNotices.length === 0 ? (
              <p className="native-info">Nenhum aviso encontrado.</p>
            ) : (
              filteredNotices.map((notice) => (
                <article key={notice.id} className="native-notice-item">
                  <div className="native-notice-head">
                    <span className={`native-status-chip ${priorityTone(notice.priority)}`}>
                      {priorityLabel(notice.priority)}
                    </span>
                    <small>
                      {formatDateTime(notice.createdAt)} •{' '}
                      {notice.schoolClass?.name || 'Turma não informada'}
                    </small>
                  </div>
                  <strong>{notice.title}</strong>
                  <p>{notice.body}</p>
                </article>
              ))
            )}
          </div>
        </article>
      </div>
    </section>
  );
}
