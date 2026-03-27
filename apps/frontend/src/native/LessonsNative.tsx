import { useEffect, useMemo, useRef, useState } from 'react';
import { apiRequest } from './api';

type TeacherClass = {
  id: string;
  name: string;
  courseName: string;
  status: string;
  enrollments: number;
  sessionsTotal: number;
  sessionsPast: number;
  startDate: string;
  endDate: string | null;
};

type ClassSession = {
  id: string;
  title: string;
  datetime: string;
  canMark: boolean;
  presentCount: number;
  absentCount: number;
  pendingCount: number;
  updatedAt: string | null;
};

type SessionStudent = {
  studentId: string;
  name: string;
  email: string;
  enrollmentStatus: string;
  present: boolean | null;
  note: string | null;
  markedAt: string | null;
};

type SessionRoster = {
  classId: string;
  session: {
    id: string;
    title: string;
    datetime: string;
  };
  canMark: boolean;
  students: SessionStudent[];
};

type LessonsNativeProps = {
  token: string;
};

type MarkStatus = 'present' | 'absent' | 'pending';
type MarksMap = Record<string, { present: MarkStatus; note: string }>;

function formatDateTime(value: string | null | undefined) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function LessonsNative({ token }: LessonsNativeProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');

  const [classes, setClasses] = useState<TeacherClass[]>([]);
  const [selectedClassId, setSelectedClassId] = useState('');
  const [sessions, setSessions] = useState<ClassSession[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState('');
  const [roster, setRoster] = useState<SessionRoster | null>(null);
  const [marks, setMarks] = useState<MarksMap>({});
  const skipAutoSaveRef = useRef(true);

  const selectedClass = useMemo(
    () => classes.find((item) => item.id === selectedClassId) ?? null,
    [classes, selectedClassId],
  );

  const selectedSession = useMemo(
    () => sessions.find((item) => item.id === selectedSessionId) ?? null,
    [sessions, selectedSessionId],
  );

  const loadClasses = async () => {
    const data = await apiRequest<TeacherClass[]>(token, '/attendance/teacher/classes', undefined, {
      cacheTtlMs: 6_000,
    });
    const normalized = Array.isArray(data) ? data : [];
    setClasses(normalized);
    if (!selectedClassId && normalized[0]?.id) {
      setSelectedClassId(normalized[0].id);
    }
  };

  const loadSessions = async (classId: string) => {
    const data = await apiRequest<ClassSession[]>(
      token,
      `/attendance/teacher/classes/${classId}/sessions`,
      undefined,
      { cacheTtlMs: 4_000, bypassCache: true },
    );

    const normalized = Array.isArray(data) ? data : [];
    setSessions(normalized);

    const nextSelected =
      normalized.find((item) => item.id === selectedSessionId)?.id ||
      normalized.find((item) => item.canMark)?.id ||
      normalized[0]?.id ||
      '';

    setSelectedSessionId(nextSelected);
  };

  const loadRoster = async (classId: string, sessionId: string) => {
    const data = await apiRequest<SessionRoster>(
      token,
      `/attendance/teacher/classes/${classId}/sessions/${sessionId}`,
      undefined,
      { cacheTtlMs: 2_000, bypassCache: true },
    );

    setRoster(data);

    const nextMarks: MarksMap = {};
    data.students.forEach((item) => {
      nextMarks[item.studentId] = {
        present: item.present === null ? 'pending' : item.present ? 'present' : 'absent',
        note: item.note || '',
      };
    });

    skipAutoSaveRef.current = true;
    setMarks(nextMarks);
  };

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        await loadClasses();
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : 'Falha ao carregar aulas.');
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [token]);

  useEffect(() => {
    if (!selectedClassId) {
      setSessions([]);
      setSelectedSessionId('');
      setRoster(null);
      setMarks({});
      return;
    }

    void loadSessions(selectedClassId);
  }, [selectedClassId]);

  useEffect(() => {
    if (!selectedClassId || !selectedSessionId) {
      setRoster(null);
      setMarks({});
      return;
    }

    void loadRoster(selectedClassId, selectedSessionId);
  }, [selectedClassId, selectedSessionId]);

  const attendanceTotals = useMemo(() => {
    if (!roster) {
      return {
        present: selectedSession?.presentCount ?? 0,
        absent: selectedSession?.absentCount ?? 0,
        pending: selectedSession?.pendingCount ?? 0,
      };
    }

    return roster.students.reduce(
      (acc, student) => {
        const status = marks[student.studentId]?.present ?? 'pending';
        if (status === 'present') acc.present += 1;
        else if (status === 'absent') acc.absent += 1;
        else acc.pending += 1;
        return acc;
      },
      { present: 0, absent: 0, pending: 0 },
    );
  }, [marks, roster, selectedSession?.absentCount, selectedSession?.pendingCount, selectedSession?.presentCount]);

  const saveAttendance = async (snapshotMarks: MarksMap) => {
    if (!selectedClassId || !selectedSessionId || !roster?.canMark) return;

    setSaving(true);
    setError('');

    try {
      const items = roster.students
        .map((student) => ({
          studentId: student.studentId,
          present: snapshotMarks[student.studentId]?.present,
          note: snapshotMarks[student.studentId]?.note?.trim() || undefined,
        }))
        .filter((item) => item.present === 'present' || item.present === 'absent')
        .map((item) => ({
          studentId: item.studentId,
          present: item.present === 'present',
          note: item.note,
        }));

      await apiRequest(token, `/attendance/teacher/classes/${selectedClassId}/sessions/${selectedSessionId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items }),
      });

      setFeedback('Alterações salvas automaticamente.');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Falha ao salvar presença.');
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    if (!roster?.canMark || !selectedClassId || !selectedSessionId) return;
    if (Object.keys(marks).length === 0) return;

    if (skipAutoSaveRef.current) {
      skipAutoSaveRef.current = false;
      return;
    }

    const timer = window.setTimeout(() => {
      void saveAttendance(marks);
    }, 450);

    return () => {
      window.clearTimeout(timer);
    };
  }, [marks, roster?.canMark, selectedClassId, selectedSessionId]);

  const updateMark = (studentId: string, field: 'present' | 'note', value: string) => {
    if (!roster?.canMark) return;
    setFeedback('');
    setError('');

    setMarks((current) => ({
      ...current,
      [studentId]: {
        present:
          field === 'present'
            ? (value as MarkStatus)
            : current[studentId]?.present ?? 'pending',
        note: field === 'note' ? value : current[studentId]?.note ?? '',
      },
    }));
  };

  const markAll = (status: MarkStatus) => {
    if (!roster?.canMark) return;
    setFeedback('');
    setError('');

    setMarks((current) => {
      const next = { ...current };
      roster.students.forEach((student) => {
        next[student.studentId] = {
          present: status,
          note: current[student.studentId]?.note ?? '',
        };
      });
      return next;
    });
  };

  return (
    <section className="native-page native-lessons">
      <header className="native-page-header">
        <h2>Aulas e presença</h2>
        <p>
          Lance presença das aulas já realizadas, inclusive retroativamente. Aulas futuras ficam bloqueadas.
        </p>
      </header>

      {loading ? <p className="native-info">Carregando turmas...</p> : null}
      {error ? <p className="native-error">{error}</p> : null}
      {feedback ? <p className="native-success">{feedback}</p> : null}

      <section className="native-panel native-lessons-filters">
        <div className="native-reports-filter-grid">
          <label>
            Turma
            <select
              value={selectedClassId}
              onChange={(event) => {
                setSelectedClassId(event.target.value);
                setFeedback('');
                setError('');
              }}
            >
              <option value="">Selecione</option>
              {classes.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} - {item.courseName}
                </option>
              ))}
            </select>
          </label>

          <label>
            Aula
            <select
              value={selectedSessionId}
              onChange={(event) => {
                setSelectedSessionId(event.target.value);
                setFeedback('');
                setError('');
              }}
              disabled={!selectedClassId || sessions.length === 0}
            >
              <option value="">Selecione</option>
              {sessions.map((session) => (
                <option key={session.id} value={session.id}>
                  {formatDateTime(session.datetime)} - {session.title}
                  {session.canMark ? '' : ' (futura)'}
                </option>
              ))}
            </select>
          </label>
        </div>

        {selectedClass ? (
          <div className="native-lessons-class-summary">
            <small>
              {selectedClass.enrollments} aluno(s) • {selectedClass.sessionsPast}/{selectedClass.sessionsTotal} aulas realizadas
            </small>
          </div>
        ) : null}
      </section>

      {selectedSession ? (
        <section className="native-lessons-overview">
          <article className="native-panel native-lessons-status-card">
            <small>Status da aula</small>
            <h3>{selectedSession.title}</h3>
            <p>Agendada para {formatDateTime(selectedSession.datetime)}</p>

            {!selectedSession.canMark ? (
              <div className="native-lessons-status-alert">
                Essa aula ainda não ocorreu. O lançamento de presença será liberado automaticamente após o horário da aula.
              </div>
            ) : (
              <div className="native-lessons-status-alert is-ready">Lançamento de presença liberado.</div>
            )}
          </article>

          <div className="native-lessons-metrics">
            <article className="native-panel native-lessons-metric is-present">
              <span>Presentes</span>
              <strong>{attendanceTotals.present}</strong>
            </article>
            <article className="native-panel native-lessons-metric is-absent">
              <span>Faltas</span>
              <strong>{attendanceTotals.absent}</strong>
            </article>
            <article className="native-panel native-lessons-metric is-pending">
              <span>Pendente</span>
              <strong>{attendanceTotals.pending}</strong>
            </article>
          </div>
        </section>
      ) : null}

      {roster ? (
        <section className="native-panel native-lessons-roster">
          <header className="native-panel-header native-lessons-roster-header">
            <div>
              <h3>Lista de presença</h3>
              <small>{roster.students.length} aluno(s) matriculados nesta turma</small>
            </div>
            <div className="native-lessons-roster-actions">
              <button type="button" onClick={() => markAll('present')} disabled={!roster.canMark}>
                Marcar todos presentes
              </button>
              <button type="button" onClick={() => markAll('absent')} disabled={!roster.canMark}>
                Marcar todos faltas
              </button>
              <button type="button" onClick={() => markAll('pending')} disabled={!roster.canMark}>
                Limpar
              </button>
            </div>
          </header>

          {saving ? <small className="native-lessons-saving">Salvando alterações...</small> : null}

          <div className="native-lessons-roster-list">
            {roster.students.map((student) => (
              <article key={student.studentId} className="native-lessons-student-row">
                <div className="native-lessons-student-meta">
                  <strong>{student.name}</strong>
                  <small>{student.email}</small>
                </div>

                <select
                  className="native-lessons-status-select"
                  value={marks[student.studentId]?.present ?? 'pending'}
                  onChange={(event) => updateMark(student.studentId, 'present', event.target.value)}
                  disabled={!roster.canMark}
                >
                  <option value="pending">Pendente</option>
                  <option value="present">Presente</option>
                  <option value="absent">Falta</option>
                </select>

                <input
                  className="native-lessons-note-input"
                  value={marks[student.studentId]?.note ?? ''}
                  onChange={(event) => updateMark(student.studentId, 'note', event.target.value)}
                  placeholder="Observação opcional"
                  disabled={!roster.canMark}
                />
              </article>
            ))}
          </div>
        </section>
      ) : null}
    </section>
  );
}
