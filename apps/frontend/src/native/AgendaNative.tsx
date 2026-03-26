import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { apiRequest } from './api';

type SchoolClass = {
  id: string;
  name: string;
};

type AgendaEventType = 'class' | 'live';

type AgendaEvent = {
  id: string;
  type: AgendaEventType;
  title: string;
  classId?: string | null;
  className?: string;
  teacher?: string;
  datetime: string;
  provider?: string | null;
};

type AgendaNativeProps = {
  token: string;
  onNavigate: (sectionId: string) => void;
};

const SESSION_USER_KEY = 'academy-auth-user';
const AGENDA_STORAGE_KEY = 'academy-agenda-events-v1';
const OPEN_CLASS_EDITOR_KEY = 'academy-open-class-editor';

function normalizeText(value: string): string {
  return String(value || '').toLowerCase().trim();
}

function parseEventDate(datetime: string): Date | null {
  const parsed = new Date(datetime);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function getEventDateKey(datetime: string): string {
  const parsed = parseEventDate(datetime);
  if (!parsed) return '';
  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, '0');
  const day = String(parsed.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getCurrentUserName(): string {
  try {
    const raw = window.localStorage.getItem(SESSION_USER_KEY);
    if (!raw) return 'Professor(a)';
    const parsed = JSON.parse(raw) as { name?: string };
    return parsed.name?.trim() || 'Professor(a)';
  } catch {
    return 'Professor(a)';
  }
}

function readEvents(): AgendaEvent[] {
  try {
    const raw = window.localStorage.getItem(AGENDA_STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is AgendaEvent =>
        Boolean(item) &&
        typeof (item as AgendaEvent).id === 'string' &&
        typeof (item as AgendaEvent).datetime === 'string',
    );
  } catch {
    return [];
  }
}

function writeEvents(events: AgendaEvent[]) {
  window.localStorage.setItem(AGENDA_STORAGE_KEY, JSON.stringify(events));
}

function formatMonthTitle(date: Date): string {
  return new Intl.DateTimeFormat('pt-BR', {
    month: 'long',
    year: 'numeric',
  }).format(date);
}

function formatShortMonth(date: Date): string {
  return new Intl.DateTimeFormat('pt-BR', { month: 'short' }).format(date);
}

function formatTime(datetime: string): string {
  const parsed = parseEventDate(datetime);
  if (!parsed) return '--:--';
  return new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(parsed);
}

export function AgendaNative({ token, onNavigate }: AgendaNativeProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [events, setEvents] = useState<AgendaEvent[]>([]);
  const [monthCursor, setMonthCursor] = useState(() => new Date());
  const [filter, setFilter] = useState<'all' | AgendaEventType>('all');
  const [quickType, setQuickType] = useState<AgendaEventType>('class');
  const [search, setSearch] = useState('');
  const [quickTitle, setQuickTitle] = useState('');
  const [quickClassId, setQuickClassId] = useState('');
  const [quickDate, setQuickDate] = useState('');
  const [quickTime, setQuickTime] = useState('');
  const [quickProvider, setQuickProvider] = useState('YouTube');

  useEffect(() => {
    const load = async () => {
      setError('');
      setLoading(true);
      try {
        const classesData = await apiRequest<SchoolClass[]>(token, '/classes');
        setClasses(Array.isArray(classesData) ? classesData : []);
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : 'Falha ao carregar turmas da agenda.',
        );
      } finally {
        setEvents(readEvents());
        setLoading(false);
      }
    };

    void load();
  }, [token]);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== AGENDA_STORAGE_KEY) return;
      setEvents(readEvents());
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const filteredEvents = useMemo(() => {
    const query = normalizeText(search);

    return events
      .filter((event) => {
        if (filter === 'all') return true;
        return event.type === filter;
      })
      .filter((event) => {
        if (!query) return true;
        return (
          normalizeText(event.title).includes(query) ||
          normalizeText(event.className || '').includes(query) ||
          normalizeText(event.teacher || '').includes(query)
        );
      });
  }, [events, filter, search]);

  const calendarCells = useMemo(() => {
    const cursor = new Date(monthCursor.getFullYear(), monthCursor.getMonth(), 1);
    const month = cursor.getMonth();
    const firstDay = new Date(cursor.getFullYear(), month, 1);
    const lastDay = new Date(cursor.getFullYear(), month + 1, 0);
    const offsetStart = firstDay.getDay();
    const daysInMonth = lastDay.getDate();

    return Array.from({ length: 42 }, (_, index) => {
      const dayNumber = index - offsetStart + 1;
      const inMonth = dayNumber >= 1 && dayNumber <= daysInMonth;
      if (!inMonth) {
        return {
          key: `empty-${index}`,
          inMonth: false,
          dayNumber: 0,
          dayEvents: [] as AgendaEvent[],
        };
      }

      const dateKey = `${cursor.getFullYear()}-${String(month + 1).padStart(2, '0')}-${String(dayNumber).padStart(2, '0')}`;
      const dayEvents = filteredEvents
        .filter((event) => getEventDateKey(event.datetime) === dateKey)
        .sort((a, b) => {
          const first = parseEventDate(a.datetime)?.getTime() ?? 0;
          const second = parseEventDate(b.datetime)?.getTime() ?? 0;
          return first - second;
        });

      return {
        key: dateKey,
        inMonth: true,
        dayNumber,
        dayEvents,
      };
    });
  }, [filteredEvents, monthCursor]);

  const upcomingEvents = useMemo(() => {
    const now = Date.now();
    return filteredEvents
      .filter((event) => {
        const eventTime = parseEventDate(event.datetime)?.getTime() ?? 0;
        return eventTime >= now;
      })
      .sort((a, b) => {
        const first = parseEventDate(a.datetime)?.getTime() ?? 0;
        const second = parseEventDate(b.datetime)?.getTime() ?? 0;
        return first - second;
      })
      .slice(0, 8);
  }, [filteredEvents]);

  const openClassEditor = (eventItem: AgendaEvent) => {
    if (eventItem.type !== 'class' || !eventItem.classId) return;
    window.localStorage.setItem(
      OPEN_CLASS_EDITOR_KEY,
      JSON.stringify({ classId: eventItem.classId }),
    );
    onNavigate('admin_gestao_turmas');
  };

  const createEvent = (payload: Omit<AgendaEvent, 'id'>) => {
    const id = window.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
    const next = [...events, { id, ...payload }];
    setEvents(next);
    writeEvents(next);
  };

  const submitQuickCreate = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');

    const title = quickTitle.trim();
    if (!title || !quickDate || !quickTime) {
      setError('Preencha título, data e hora para agendar.');
      return;
    }

    const classItem = classes.find((item) => item.id === quickClassId);
    const datetime = `${quickDate}T${quickTime}:00`;
    createEvent({
      type: quickType,
      title,
      classId: quickClassId || null,
      className: classItem?.name || 'Sem turma',
      teacher: getCurrentUserName(),
      datetime,
      provider: quickType === 'live' ? quickProvider : null,
    });

    setQuickTitle('');
    setQuickDate('');
    setQuickTime('');
  };

  return (
    <section className="native-page native-agenda">
      <header className="native-page-header">
        <h2>Agenda acadêmica</h2>
        <p>
          Calendário nativo integrado à gestão de turmas, com criação rápida de
          aulas e lives.
        </p>
      </header>

      <div className="native-grid-2 native-agenda-grid">
        <article className="native-panel native-agenda-calendar-panel">
          <div className="native-agenda-toolbar">
            <div className="native-agenda-month">
              <h3>{formatMonthTitle(monthCursor)}</h3>
              <div className="native-agenda-month-actions">
                <button
                  type="button"
                  onClick={() =>
                    setMonthCursor(
                      (current) =>
                        new Date(
                          current.getFullYear(),
                          current.getMonth() - 1,
                          1,
                        ),
                    )
                  }
                >
                  {'<'}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setMonthCursor(
                      (current) =>
                        new Date(
                          current.getFullYear(),
                          current.getMonth() + 1,
                          1,
                        ),
                    )
                  }
                >
                  {'>'}
                </button>
              </div>
            </div>

            <div className="native-agenda-filters">
              <button
                type="button"
                className={filter === 'all' ? 'active' : ''}
                onClick={() => setFilter('all')}
              >
                Todos
              </button>
              <button
                type="button"
                className={filter === 'class' ? 'active' : ''}
                onClick={() => setFilter('class')}
              >
                Aulas
              </button>
              <button
                type="button"
                className={filter === 'live' ? 'active' : ''}
                onClick={() => setFilter('live')}
              >
                Lives
              </button>
              <button
                type="button"
                onClick={() => setMonthCursor(new Date())}
              >
                Hoje
              </button>
            </div>
          </div>

          <label className="native-agenda-search">
            <input
              type="text"
              value={search}
              onChange={(inputEvent) => setSearch(inputEvent.target.value)}
              placeholder="Buscar na agenda..."
            />
          </label>

          {loading ? <p className="native-info">Carregando agenda...</p> : null}
          {error ? <p className="native-error">{error}</p> : null}

          <div className="native-agenda-weekdays">
            <span>Dom</span>
            <span>Seg</span>
            <span>Ter</span>
            <span>Qua</span>
            <span>Qui</span>
            <span>Sex</span>
            <span>Sáb</span>
          </div>

          <div className="native-agenda-days">
            {calendarCells.map((cell) =>
              !cell.inMonth ? (
                <div key={cell.key} className="native-agenda-day is-off" />
              ) : (
                <div key={cell.key} className="native-agenda-day">
                  <strong>{cell.dayNumber}</strong>
                  <div className="native-agenda-day-events">
                    {cell.dayEvents.slice(0, 2).map((eventItem) => (
                      <button
                        key={eventItem.id}
                        type="button"
                        className={
                          eventItem.type === 'live'
                            ? 'is-live'
                            : 'is-class'
                        }
                        onClick={() => openClassEditor(eventItem)}
                        title={
                          eventItem.type === 'class'
                            ? 'Abrir edição da turma'
                            : 'Evento de live'
                        }
                      >
                        {formatTime(eventItem.datetime)} - {eventItem.title}
                      </button>
                    ))}
                    {cell.dayEvents.length > 2 ? (
                      <small>+{cell.dayEvents.length - 2} item(ns)</small>
                    ) : null}
                  </div>
                </div>
              ),
            )}
          </div>
        </article>

        <div className="native-agenda-side">
          <article className="native-panel">
            <header className="native-panel-header">
              <h3>Criação rápida</h3>
            </header>

            <form className="native-form-grid native-agenda-form" onSubmit={submitQuickCreate}>
              <fieldset className="native-type-switch">
                <legend>Tipo de sessão</legend>
                <div>
                  <button
                    type="button"
                    className={quickType === 'class' ? 'active' : ''}
                    onClick={() => setQuickType('class')}
                  >
                    Aula
                  </button>
                  <button
                    type="button"
                    className={quickType === 'live' ? 'active' : ''}
                    onClick={() => setQuickType('live')}
                  >
                    Live
                  </button>
                </div>
              </fieldset>

              <label>
                Título
                <input
                  value={quickTitle}
                  onChange={(inputEvent) => setQuickTitle(inputEvent.target.value)}
                  placeholder="Ex: Aula de métricas avançadas"
                  required
                />
              </label>

              <label>
                Turma
                <select
                  value={quickClassId}
                  onChange={(inputEvent) => setQuickClassId(inputEvent.target.value)}
                >
                  <option value="">Sem turma</option>
                  {classes.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Data
                <input
                  type="date"
                  value={quickDate}
                  onChange={(inputEvent) => setQuickDate(inputEvent.target.value)}
                  required
                />
              </label>

              <label>
                Hora
                <input
                  type="time"
                  value={quickTime}
                  onChange={(inputEvent) => setQuickTime(inputEvent.target.value)}
                  required
                />
              </label>

              {quickType === 'live' ? (
                <label>
                  Provedor
                  <select
                    value={quickProvider}
                    onChange={(inputEvent) => setQuickProvider(inputEvent.target.value)}
                  >
                    <option value="YouTube">YouTube</option>
                    <option value="Zoom">Zoom</option>
                    <option value="Meet">Meet</option>
                  </select>
                </label>
              ) : null}

              <div className="native-modal-actions">
                <button type="submit">Agendar sessão</button>
              </div>
            </form>
          </article>

          <article className="native-panel">
            <header className="native-panel-header">
              <h3>Próximos eventos</h3>
              <small>{upcomingEvents.length} item(ns)</small>
            </header>

            <div className="native-agenda-upcoming">
              {upcomingEvents.length === 0 ? (
                <p className="native-info">Nenhum evento para o filtro selecionado.</p>
              ) : (
                upcomingEvents.map((eventItem) => {
                  const eventDate = parseEventDate(eventItem.datetime);
                  if (!eventDate) return null;

                  return (
                    <button
                      key={eventItem.id}
                      type="button"
                      className="native-agenda-upcoming-item"
                      onClick={() => openClassEditor(eventItem)}
                    >
                      <div className="native-agenda-upcoming-date">
                        <span>{formatShortMonth(eventDate)}</span>
                        <strong>{String(eventDate.getDate()).padStart(2, '0')}</strong>
                      </div>
                      <div className="native-agenda-upcoming-meta">
                        <strong>{eventItem.title}</strong>
                        <small>
                          {eventItem.className || 'Sem turma'} -{' '}
                          {eventItem.teacher || 'Professor(a)'}
                        </small>
                        <small>
                          {eventItem.type === 'live' ? 'Live' : 'Aula'} -{' '}
                          {formatTime(eventItem.datetime)}
                        </small>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </article>
        </div>
      </div>
    </section>
  );
}
