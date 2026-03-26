import { useEffect, useMemo, useState } from 'react';
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
  const [marks, setMarks] = useState<Record<string, { present: 'present' | 'absent' | 'pending'; note: string }>>({});

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

    const nextMarks: Record<string, { present: 'present' | 'absent' | 'pending'; note: string }> = {};
    data.students.forEach((item) => {
      nextMarks[item.studentId] = {
        present: item.present === null ? 'pending' : item.present ? 'present' : 'absent',
        note: item.note || '',
      };
    });
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
      return;
    }

    void loadSessions(selectedClassId);
  }, [selectedClassId]);

  useEffect(() => {
    if (!selectedClassId || !selectedSessionId) {
      setRoster(null);
      return;
    }

    void loadRoster(selectedClassId, selectedSessionId);
  }, [selectedClassId, selectedSessionId]);

  const updateMark = (
    studentId: string,
    field: 'present' | 'note',
    value: string,
  ) => {
    setMarks((current) => ({
      ...current,
      [studentId]: {
        present:
          field === 'present'
            ? (value as 'present' | 'absent' | 'pending')
            : current[studentId]?.present ?? 'pending',
        note: field === 'note' ? value : current[studentId]?.note ?? '',
      },
    }));
  };

  const saveAttendance = async () => {
    if (!selectedClassId || !selectedSessionId || !roster) return;

    if (!roster.canMark) {
      setError('Essa aula ainda não aconteceu. Presença só pode ser lançada após a data/hora da aula.');
      return;
    }

    setSaving(true);
    setError('');
    setFeedback('');

    try {
      const items = roster.students
        .map((student) => ({
          studentId: student.studentId,
          present: marks[student.studentId]?.present,
          note: marks[student.studentId]?.note?.trim() || undefined,
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

      setFeedback('Presença salva com sucesso.');
      await Promise.all([loadSessions(selectedClassId), loadRoster(selectedClassId, selectedSessionId)]);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Falha ao salvar presença.');
    } finally {
      setSaving(false);
    }
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
        <section className="native-panel">
          <header className="native-panel-header">
            <h3>{selectedSession.title}</h3>
            <small>{formatDateTime(selectedSession.datetime)}</small>
          </header>

          {!selectedSession.canMark ? (
            <p className="native-info">
              Essa aula ainda não ocorreu. O lançamento de presença será liberado automaticamente após o horário da aula.
            </p>
          ) : null}

          <div className="native-kpi-grid native-kpi-grid-small">
            <article className="native-kpi-card">
              <span>Presentes</span>
              <strong>{selectedSession.presentCount}</strong>
            </article>
            <article className="native-kpi-card">
              <span>Faltas</span>
              <strong>{selectedSession.absentCount}</strong>
            </article>
            <article className="native-kpi-card">
              <span>Pendente</span>
              <strong>{selectedSession.pendingCount}</strong>
            </article>
          </div>
        </section>
      ) : null}

      {roster ? (
        <section className="native-panel native-lessons-roster">
          <header className="native-panel-header">
            <h3>Lista de presença</h3>
            <small>{roster.students.length} aluno(s)</small>
          </header>

          <div className="native-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Aluno</th>
                  <th>Status</th>
                  <th>Observação</th>
                </tr>
              </thead>
              <tbody>
                {roster.students.map((student) => (
                  <tr key={student.studentId}>
                    <td>
                      <strong>{student.name}</strong>
                      <div>{student.email}</div>
                    </td>
                    <td>
                      <select
                        value={marks[student.studentId]?.present ?? 'pending'}
                        onChange={(event) =>
                          updateMark(student.studentId, 'present', event.target.value)
                        }
                        disabled={!roster.canMark || saving}
                      >
                        <option value="pending">Pendente</option>
                        <option value="present">Presente</option>
                        <option value="absent">Falta</option>
                      </select>
                    </td>
                    <td>
                      <input
                        value={marks[student.studentId]?.note ?? ''}
                        onChange={(event) =>
                          updateMark(student.studentId, 'note', event.target.value)
                        }
                        placeholder="Observação opcional"
                        disabled={!roster.canMark || saving}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="native-modal-actions">
            <button type="button" onClick={() => void saveAttendance()} disabled={!roster.canMark || saving}>
              {saving ? 'Salvando...' : 'Salvar presença'}
            </button>
          </div>
        </section>
      ) : null}
    </section>
  );
}
