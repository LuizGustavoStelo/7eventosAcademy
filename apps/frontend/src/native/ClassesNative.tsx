import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { apiRequest } from './api';

type Course = {
  id: string;
  name: string;
};

type Student = {
  id: string;
  name: string;
  email: string;
};

type Enrollment = {
  id: string;
  classId: string;
  studentId: string;
  status: 'ACTIVE' | 'CANCELED' | 'COMPLETED';
};

type SchoolClass = {
  id: string;
  courseId: string;
  name: string;
  totalSeats: number;
  occupiedSeats?: number;
  status: 'PLANNING' | 'ENROLLMENTS_OPEN' | 'IN_PROGRESS' | 'CLOSED';
  startDate: string;
  endDate: string | null;
  course?: Course;
  _count?: { enrollments?: number };
};

type RecurrenceKind = 'none' | 'weekly' | 'monthly';

type ClassFormState = {
  id: string;
  name: string;
  courseId: string;
  totalSeats: string;
  startDateTime: string;
  endDate: string;
  status: 'PLANNING' | 'ENROLLMENTS_OPEN' | 'IN_PROGRESS' | 'CLOSED';
  selectedStudentIds: string[];
  recurrenceKind: RecurrenceKind;
  repeatUntil: string;
  monthDay: string;
  weeklyDays: number[];
};

type AgendaEvent = {
  id: string;
  type: string;
  title?: string;
  classId?: string | null;
  className?: string;
  teacher?: string;
  datetime?: string;
  provider?: string | null;
  recurrenceKind?: RecurrenceKind;
  recurrenceUntil?: string | null;
  recurrenceWeekdays?: number[];
  recurrenceMonthDay?: number | null;
  seriesId?: string;
};

type ClassEventMeta = {
  classId: string;
  recurrenceKind: RecurrenceKind;
  repeatUntil: string | null;
  monthDay: number | null;
  weeklyDays: number[];
};

type ClassesNativeProps = {
  token: string;
};

const OPEN_CLASS_EDITOR_KEY = 'academy-open-class-editor';
const SESSION_USER_KEY = 'academy-auth-user';

const classStatusLabel: Record<SchoolClass['status'], string> = {
  PLANNING: 'Planejamento',
  ENROLLMENTS_OPEN: 'Matrículas abertas',
  IN_PROGRESS: 'Em andamento',
  CLOSED: 'Encerrada',
};

const statusToApiValue: Record<SchoolClass['status'], string> = {
  PLANNING: 'planning',
  ENROLLMENTS_OPEN: 'enrollments_open',
  IN_PROGRESS: 'in_progress',
  CLOSED: 'closed',
};

const weekdayOptions: Array<{ value: number; label: string }> = [
  { value: 0, label: 'Dom' },
  { value: 1, label: 'Seg' },
  { value: 2, label: 'Ter' },
  { value: 3, label: 'Qua' },
  { value: 4, label: 'Qui' },
  { value: 5, label: 'Sex' },
  { value: 6, label: 'Sáb' },
];

function formatDate(value: string | null): string {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat('pt-BR').format(date);
}

function toLocalDateTimeInput(value: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  const pad = (num: number) => String(num).padStart(2, '0');
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function getCurrentUserName(): string {
  try {
    const raw = window.localStorage.getItem(SESSION_USER_KEY);
    if (!raw) return 'Professor';
    const parsed = JSON.parse(raw) as { name?: string };
    return parsed.name?.trim() || 'Professor';
  } catch {
    return 'Professor';
  }
}

function getClassRecurrenceMetadata(meta?: ClassEventMeta) {
  if (!meta) {
    return {
      recurrenceKind: 'none' as RecurrenceKind,
      repeatUntil: '',
      monthDay: '',
      weeklyDays: [] as number[],
    };
  }

  return {
    recurrenceKind: meta.recurrenceKind ?? 'none',
    repeatUntil: meta.repeatUntil ?? '',
    monthDay:
      meta.monthDay !== undefined && meta.monthDay !== null
        ? String(meta.monthDay)
        : '',
    weeklyDays: Array.isArray(meta.weeklyDays) ? meta.weeklyDays : [],
  };
}

function buildWeeklyDates(start: Date, until: Date, weekdays: number[]) {
  const result: Date[] = [];
  const cursor = new Date(start.getTime());

  while (cursor <= until && result.length < 300) {
    if (weekdays.includes(cursor.getDay())) {
      result.push(new Date(cursor.getTime()));
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  return result;
}

function buildMonthlyDates(start: Date, until: Date, monthDay: number) {
  const result: Date[] = [];
  const hour = start.getHours();
  const minute = start.getMinutes();
  const cursor = new Date(
    start.getFullYear(),
    start.getMonth(),
    1,
    hour,
    minute,
    0,
    0,
  );

  while (cursor <= until && result.length < 300) {
    const candidate = new Date(
      cursor.getFullYear(),
      cursor.getMonth(),
      monthDay,
      hour,
      minute,
      0,
      0,
    );
    if (candidate.getMonth() === cursor.getMonth()) {
      if (candidate >= start && candidate <= until) {
        result.push(candidate);
      }
    }
    cursor.setMonth(cursor.getMonth() + 1);
  }

  return result;
}

function buildOccurrenceDates(input: {
  startDateTime: string;
  recurrenceKind: RecurrenceKind;
  repeatUntil: string;
  weeklyDays: number[];
  monthDay: string;
}) {
  const start = new Date(input.startDateTime);
  if (Number.isNaN(start.getTime())) return [];

  if (input.recurrenceKind === 'none') return [start];

  const until = input.repeatUntil
    ? new Date(`${input.repeatUntil}T23:59:59`)
    : null;
  if (!until || Number.isNaN(until.getTime()) || until < start) {
    return [start];
  }

  if (input.recurrenceKind === 'weekly') {
    const weekdays = input.weeklyDays.length > 0 ? input.weeklyDays : [start.getDay()];
    return buildWeeklyDates(start, until, weekdays);
  }

  const rawMonthDay = Number(input.monthDay);
  const safeMonthDay = Number.isNaN(rawMonthDay)
    ? start.getDate()
    : Math.max(1, Math.min(31, rawMonthDay));
  return buildMonthlyDates(start, until, safeMonthDay);
}

function formatDateForEvent(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate(),
  )}T${pad(date.getHours())}:${pad(date.getMinutes())}:00`;
}

function defaultClassForm(): ClassFormState {
  const now = new Date();
  const startDateTime = toLocalDateTimeInput(now.toISOString());

  return {
    id: '',
    name: '',
    courseId: '',
    totalSeats: '30',
    startDateTime,
    endDate: '',
    status: 'ENROLLMENTS_OPEN',
    selectedStudentIds: [],
    recurrenceKind: 'none',
    repeatUntil: '',
    monthDay: '1',
    weeklyDays: [],
  };
}

export function ClassesNative({ token }: ClassesNativeProps) {
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<ClassFormState>(() => defaultClassForm());
  const [pendingClassFromAgenda, setPendingClassFromAgenda] = useState<string | null>(
    null,
  );
  const [classEventMetaByClassId, setClassEventMetaByClassId] = useState<Record<string, ClassEventMeta>>({});

  const loadData = async () => {
    setError('');
    try {
      const [classesData, coursesData, studentsData, enrollmentsData, classMetaData] =
        await Promise.all([
          apiRequest<SchoolClass[]>(token, '/classes'),
          apiRequest<Course[]>(token, '/courses'),
          apiRequest<Student[]>(token, '/students'),
          apiRequest<Enrollment[]>(token, '/enrollments'),
          apiRequest<ClassEventMeta[]>(token, '/agenda/class-events/meta'),
        ]);

      setClasses(Array.isArray(classesData) ? classesData : []);
      setCourses(Array.isArray(coursesData) ? coursesData : []);
      setStudents(Array.isArray(studentsData) ? studentsData : []);
      setEnrollments(Array.isArray(enrollmentsData) ? enrollmentsData : []);
      const byClass: Record<string, ClassEventMeta> = {};
      if (Array.isArray(classMetaData)) {
        classMetaData.forEach((item) => {
          if (item?.classId) byClass[item.classId] = item;
        });
      }
      setClassEventMetaByClassId(byClass);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : 'Falha ao carregar turmas.',
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(OPEN_CLASS_EDITOR_KEY);
      if (!raw) return;
      window.localStorage.removeItem(OPEN_CLASS_EDITOR_KEY);
      const parsed = JSON.parse(raw) as { classId?: string };
      if (parsed.classId) {
        setPendingClassFromAgenda(parsed.classId);
      }
    } catch {
      // ignora payload inválido
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [token]);

  const getClassEnrollmentStudentSet = (classId: string): Set<string> =>
    new Set(
      enrollments
        .filter((item) => item.classId === classId && item.status === 'ACTIVE')
        .map((item) => item.studentId),
    );

  const getActiveEnrollmentStudentSet = (exceptClassId?: string): Set<string> =>
    new Set(
      enrollments
        .filter(
          (item) =>
            item.status === 'ACTIVE' &&
            (!exceptClassId || item.classId !== exceptClassId),
        )
        .map((item) => item.studentId),
    );

  const openEditModal = (schoolClass: SchoolClass) => {
    const selectedStudentIds = Array.from(
      getClassEnrollmentStudentSet(schoolClass.id),
    );
    const recurrence = getClassRecurrenceMetadata(classEventMetaByClassId[schoolClass.id]);

    setForm({
      id: schoolClass.id,
      name: schoolClass.name,
      courseId: schoolClass.courseId,
      totalSeats: String(schoolClass.totalSeats || 30),
      startDateTime: toLocalDateTimeInput(schoolClass.startDate),
      endDate: schoolClass.endDate
        ? toLocalDateTimeInput(schoolClass.endDate).slice(0, 10)
        : '',
      status: schoolClass.status,
      selectedStudentIds,
      recurrenceKind: recurrence.recurrenceKind,
      repeatUntil: recurrence.repeatUntil,
      monthDay: recurrence.monthDay || '1',
      weeklyDays: recurrence.weeklyDays,
    });
    setModalOpen(true);
  };

  useEffect(() => {
    if (!pendingClassFromAgenda) return;
    if (classes.length === 0) return;

    const targetClass = classes.find((item) => item.id === pendingClassFromAgenda);
    setPendingClassFromAgenda(null);
    if (!targetClass) return;
    openEditModal(targetClass);
  }, [pendingClassFromAgenda, classes, enrollments, classEventMetaByClassId]);

  const filteredClasses = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return classes;
    return classes.filter((item) => {
      const className = item.name?.toLowerCase() ?? '';
      const courseName = item.course?.name?.toLowerCase() ?? '';
      return className.includes(query) || courseName.includes(query);
    });
  }, [classes, search]);

  const activeCount = classes.filter((item) => item.status !== 'CLOSED').length;
  const totalSeats = classes.reduce(
    (acc, item) => acc + Number(item.totalSeats || 0),
    0,
  );
  const occupiedSeats = classes.reduce((acc, item) => {
    if (typeof item.occupiedSeats === 'number') return acc + item.occupiedSeats;
    return acc + Number(item._count?.enrollments ?? 0);
  }, 0);
  const occupancyRate =
    totalSeats > 0 ? Math.round((occupiedSeats / totalSeats) * 100) : 0;

  const openCreateModal = () => {
    setForm(defaultClassForm());
    setModalOpen(true);
  };

  const toggleStudentSelection = (studentId: string) => {
    setForm((current) => {
      const selected = new Set(current.selectedStudentIds);
      if (selected.has(studentId)) selected.delete(studentId);
      else selected.add(studentId);

      return {
        ...current,
        selectedStudentIds: Array.from(selected),
      };
    });
  };

  const toggleWeekday = (weekday: number) => {
    setForm((current) => {
      const next = new Set(current.weeklyDays);
      if (next.has(weekday)) next.delete(weekday);
      else next.add(weekday);

      return {
        ...current,
        weeklyDays: Array.from(next).sort((a, b) => a - b),
      };
    });
  };

  const syncEnrollments = async (
    classId: string,
    selectedStudentIds: string[],
  ) => {
    const currentStudentIds = getClassEnrollmentStudentSet(classId);
    const desiredStudentIds = new Set(selectedStudentIds);

    const toAdd = selectedStudentIds.filter(
      (studentId) => !currentStudentIds.has(studentId),
    );
    const toRemove = Array.from(currentStudentIds).filter(
      (studentId) => !desiredStudentIds.has(studentId),
    );

    const failures: string[] = [];

    for (const studentId of toAdd) {
      try {
        await apiRequest(token, '/enrollments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ classId, studentId }),
        });
      } catch (syncError) {
        failures.push(
          syncError instanceof Error
            ? `Falha ao adicionar aluno: ${syncError.message}`
            : 'Falha ao adicionar aluno.',
        );
      }
    }

    for (const studentId of toRemove) {
      try {
        await apiRequest(
          token,
          `/enrollments/class/${classId}/student/${studentId}`,
          {
            method: 'DELETE',
          },
        );
      } catch (syncError) {
        failures.push(
          syncError instanceof Error
            ? `Falha ao remover aluno: ${syncError.message}`
            : 'Falha ao remover aluno.',
        );
      }
    }

    if (failures.length > 0) {
      throw new Error(failures.join('\n'));
    }
  };

  const syncClassEventsToAgenda = async (params: {
    classId: string;
    className: string;
    startDateTime: string;
    recurrenceKind: RecurrenceKind;
    repeatUntil: string;
    weeklyDays: number[];
    monthDay: string;
  }) => {
    const occurrenceDates = buildOccurrenceDates({
      startDateTime: params.startDateTime,
      recurrenceKind: params.recurrenceKind,
      repeatUntil: params.repeatUntil,
      weeklyDays: params.weeklyDays,
      monthDay: params.monthDay,
    });

    const teacherName = getCurrentUserName();
    const classEvents: AgendaEvent[] = occurrenceDates.map((date) => ({
      id: '',
      type: 'class',
      title: params.className,
      classId: params.classId,
      className: params.className,
      teacher: teacherName,
      datetime: formatDateForEvent(date),
      provider: null,
    }));

    await apiRequest(token, '/agenda/class-events/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        classId: params.classId,
        className: params.className,
        teacher: teacherName,
        recurrenceKind: params.recurrenceKind,
        repeatUntil: params.repeatUntil || null,
        monthDay: params.monthDay.trim() === '' ? null : Number(params.monthDay),
        weeklyDays: params.weeklyDays,
        events: classEvents.map((item) => ({
          type: item.type,
          title: item.title,
          datetime: item.datetime,
          provider: item.provider ?? null,
        })),
      }),
    });
  };

  const availableStudents = useMemo(() => {
    const unavailable = getActiveEnrollmentStudentSet(form.id || undefined);
    const selected = new Set(form.selectedStudentIds);

    return students.filter(
      (student) => !unavailable.has(student.id) || selected.has(student.id),
    );
  }, [students, enrollments, form.id, form.selectedStudentIds]);

  const saveClass = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');

    if (!form.name.trim() || !form.courseId || !form.startDateTime) {
      setError('Preencha nome, curso e data de início.');
      return;
    }

    if (form.recurrenceKind !== 'none' && !form.repeatUntil) {
      setError('Informe até quando a recorrência deve se repetir.');
      return;
    }

    if (form.recurrenceKind === 'weekly' && form.weeklyDays.length === 0) {
      setError('Selecione pelo menos um dia da semana para recorrência.');
      return;
    }

    const totalSeatsNumber = Number(form.totalSeats);
    if (!Number.isFinite(totalSeatsNumber) || totalSeatsNumber <= 0) {
      setError('Informe um total de vagas válido.');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        courseId: form.courseId,
        totalSeats: totalSeatsNumber,
        startDate: new Date(form.startDateTime).toISOString(),
        endDate:
          form.recurrenceKind === 'none'
            ? form.endDate
              ? new Date(`${form.endDate}T23:59:59`).toISOString()
              : undefined
            : new Date(`${form.repeatUntil}T23:59:59`).toISOString(),
      };

      let classId = form.id;
      let previousStatus: SchoolClass['status'] | null = null;

      if (form.id) {
        const current = classes.find((item) => item.id === form.id);
        previousStatus = current?.status ?? null;

        await apiRequest(token, `/classes/${form.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      } else {
        const created = await apiRequest<SchoolClass>(token, '/classes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        classId = created.id;
      }

      if (!classId) {
        throw new Error('Não foi possível identificar a turma salva.');
      }

      if (previousStatus !== form.status) {
        await apiRequest(token, `/classes/${classId}/status`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: statusToApiValue[form.status] }),
        });
      }

      await syncEnrollments(classId, form.selectedStudentIds);
      await syncClassEventsToAgenda({
        classId,
        className: form.name.trim(),
        startDateTime: form.startDateTime,
        recurrenceKind: form.recurrenceKind,
        repeatUntil: form.repeatUntil,
        weeklyDays: form.weeklyDays,
        monthDay: form.monthDay,
      });

      await loadData();
      setModalOpen(false);
      setForm(defaultClassForm());
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : 'Falha ao salvar turma.',
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="native-page native-classes">
      <header className="native-page-header">
        <h2>Gestão de turmas</h2>
        <p>
          Versão nativa em React com recorrência e sincronização da agenda
          administrativa.
        </p>
      </header>

      <div className="native-kpi-grid native-kpi-grid-small">
        <article className="native-kpi-card">
          <span>Turmas ativas</span>
          <strong>{activeCount}</strong>
          <small>{classes.length} turma(s) cadastrada(s)</small>
        </article>
        <article className="native-kpi-card">
          <span>Ocupação</span>
          <strong>{occupancyRate}%</strong>
          <small>
            {occupiedSeats}/{totalSeats} vagas ocupadas
          </small>
        </article>
      </div>

      <div className="native-toolbar">
        <input
          type="text"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Buscar por turma ou curso..."
        />
        <button type="button" onClick={openCreateModal}>
          Nova turma
        </button>
      </div>

      {loading ? <p className="native-info">Carregando turmas...</p> : null}
      {error ? <p className="native-error">{error}</p> : null}

      {!loading ? (
        <div className="native-panel native-table-wrap">
          <table className="native-table">
            <thead>
              <tr>
                <th>Turma</th>
                <th>Curso</th>
                <th>Período</th>
                <th>Vagas</th>
                <th>Status</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {filteredClasses.length === 0 ? (
                <tr>
                  <td colSpan={6}>Nenhuma turma encontrada.</td>
                </tr>
              ) : (
                filteredClasses.map((item) => {
                  const occupied =
                    typeof item.occupiedSeats === 'number'
                      ? item.occupiedSeats
                      : Number(item._count?.enrollments ?? 0);

                  return (
                    <tr key={item.id}>
                      <td>{item.name}</td>
                      <td>{item.course?.name ?? '-'}</td>
                      <td>
                        {formatDate(item.startDate)} - {formatDate(item.endDate)}
                      </td>
                      <td>
                        {occupied}/{item.totalSeats}
                      </td>
                      <td>{classStatusLabel[item.status]}</td>
                      <td>
                        <button type="button" onClick={() => openEditModal(item)}>
                          Editar
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      ) : null}

      {modalOpen ? (
        <div className="native-modal-backdrop" onClick={() => setModalOpen(false)}>
          <section
            className="native-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <header>
              <h3>{form.id ? 'Editar turma' : 'Nova turma'}</h3>
              <button type="button" onClick={() => setModalOpen(false)}>
                Fechar
              </button>
            </header>

            <form onSubmit={saveClass} className="native-form-grid">
              <label>
                Nome da turma
                <input
                  value={form.name}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, name: event.target.value }))
                  }
                  required
                />
              </label>

              <label>
                Curso
                <select
                  value={form.courseId}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      courseId: event.target.value,
                    }))
                  }
                  required
                >
                  <option value="">Selecione</option>
                  {courses.map((course) => (
                    <option key={course.id} value={course.id}>
                      {course.name}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Total de vagas
                <input
                  type="number"
                  min={1}
                  value={form.totalSeats}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      totalSeats: event.target.value,
                    }))
                  }
                  required
                />
              </label>

              <label>
                Data e hora de início
                <input
                  type="datetime-local"
                  value={form.startDateTime}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      startDateTime: event.target.value,
                    }))
                  }
                  required
                />
              </label>

              <label>
                Status
                <select
                  value={form.status}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      status: event.target.value as ClassFormState['status'],
                    }))
                  }
                >
                  {Object.entries(classStatusLabel).map(([status, label]) => (
                    <option key={status} value={status}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Recorrência
                <select
                  value={form.recurrenceKind}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      recurrenceKind: event.target.value as RecurrenceKind,
                    }))
                  }
                >
                  <option value="none">Sem repetição</option>
                  <option value="weekly">Semanal</option>
                  <option value="monthly">Mensal</option>
                </select>
              </label>

              {form.recurrenceKind === 'none' ? (
                <label>
                  Data de término (opcional)
                  <input
                    type="date"
                    value={form.endDate}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        endDate: event.target.value,
                      }))
                    }
                  />
                </label>
              ) : null}

              {form.recurrenceKind !== 'none' ? (
                <label>
                  Repetir até
                  <input
                    type="date"
                    value={form.repeatUntil}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        repeatUntil: event.target.value,
                      }))
                    }
                    required
                  />
                </label>
              ) : null}

              {form.recurrenceKind === 'monthly' ? (
                <label>
                  Dia do mês
                  <input
                    type="number"
                    min={1}
                    max={31}
                    value={form.monthDay}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        monthDay: event.target.value,
                      }))
                    }
                  />
                </label>
              ) : null}

              {form.recurrenceKind === 'weekly' ? (
                <fieldset className="native-inline-days">
                  <legend>Dias da semana</legend>
                  <div className="native-inline-days-grid">
                    {weekdayOptions.map((weekday) => (
                      <label key={weekday.value}>
                        <input
                          type="checkbox"
                          checked={form.weeklyDays.includes(weekday.value)}
                          onChange={() => toggleWeekday(weekday.value)}
                        />
                        <span>{weekday.label}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>
              ) : null}

              <fieldset className="native-student-list">
                <legend>
                  Alunos disponíveis ({availableStudents.length}/{students.length})
                </legend>
                {availableStudents.length === 0 ? (
                  <p>Nenhum aluno disponível para esta turma.</p>
                ) : (
                  availableStudents.map((student) => (
                    <label key={student.id}>
                      <input
                        type="checkbox"
                        checked={form.selectedStudentIds.includes(student.id)}
                        onChange={() => toggleStudentSelection(student.id)}
                      />
                      <span>
                        {student.name}
                        <small>{student.email}</small>
                      </span>
                    </label>
                  ))
                )}
              </fieldset>

              <div className="native-modal-actions">
                <button
                  type="button"
                  className="ghost"
                  onClick={() => setModalOpen(false)}
                >
                  Cancelar
                </button>
                <button type="submit" disabled={saving}>
                  {saving ? 'Salvando...' : 'Salvar turma'}
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}
    </section>
  );
}
