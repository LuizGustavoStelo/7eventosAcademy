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
  ra?: string | null;
  registrationCode?: string | null;
  courses?: Array<{
    id: string;
    status: string;
    course?: {
      id: string;
      name: string;
    } | null;
  }>;
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
  autoEnrollNewStudents?: boolean;
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
  autoEnrollNewStudents: boolean;
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

type StudentFrequency = {
  present: number;
  absent: number;
  frequency: number;
  status: 'present' | 'absent' | 'pending';
};

type AttendanceClassCache = {
  sessions: ClassSession[];
  latestRoster: SessionRoster | null;
  studentFrequencyById: Record<string, StudentFrequency>;
};

type ClassesNativeProps = {
  token: string;
  onNavigate?: (sectionId: string) => void;
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

function normalizeFrequency(present: number, absent: number): number {
  const evaluated = present + absent;
  if (evaluated <= 0) return 100;
  return Math.max(0, Math.min(100, Math.round((present / evaluated) * 100)));
}

function formatDate(value: string | null): string {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat('pt-BR').format(date);
}

function formatDateTime(value: string | null): string {
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

function sanitizeOnlyLetters(value: string): string {
  return value
    .replace(/[^\p{L}\d\s-]/gu, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/^\s+/g, '');
}

function formatBrDateFromDate(date: Date): string {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = String(date.getFullYear());
  return `${day}/${month}/${year}`;
}

function formatBrDateTimeFromDate(date: Date): string {
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${formatBrDateFromDate(date)} ${hours}:${minutes}`;
}

function maskBrDate(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

function maskBrDateTime(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 12);
  if (digits.length <= 8) return maskBrDate(digits);
  const datePart = maskBrDate(digits.slice(0, 8));
  const timePart = digits.slice(8);
  if (timePart.length <= 2) return `${datePart} ${timePart}`;
  return `${datePart} ${timePart.slice(0, 2)}:${timePart.slice(2, 4)}`;
}

function parseBrDate(value: string): Date | null {
  const trimmed = value.trim();
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(trimmed);
  if (!match) return null;
  const [, dayRaw, monthRaw, yearRaw] = match;
  const day = Number(dayRaw);
  const month = Number(monthRaw);
  const year = Number(yearRaw);
  if (day < 1 || month < 1 || month > 12 || year < 1900) return null;
  const candidate = new Date(year, month - 1, day);
  if (
    candidate.getFullYear() !== year ||
    candidate.getMonth() !== month - 1 ||
    candidate.getDate() !== day
  ) {
    return null;
  }
  return candidate;
}

function parseBrDateTime(value: string): Date | null {
  const trimmed = value.trim();
  const match = /^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})$/.exec(trimmed);
  if (!match) return null;
  const [, dayRaw, monthRaw, yearRaw, hourRaw, minuteRaw] = match;
  const day = Number(dayRaw);
  const month = Number(monthRaw);
  const year = Number(yearRaw);
  const hour = Number(hourRaw);
  const minute = Number(minuteRaw);
  if (day < 1 || month < 1 || month > 12 || year < 1900) return null;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  const candidate = new Date(year, month - 1, day, hour, minute, 0, 0);
  if (
    candidate.getFullYear() !== year ||
    candidate.getMonth() !== month - 1 ||
    candidate.getDate() !== day
  ) {
    return null;
  }
  return candidate;
}

function toBrDateInput(value: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return formatBrDateFromDate(date);
}

function toBrDateTimeInput(value: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return formatBrDateTimeFromDate(date);
}

function getNameInitials(name: string): string {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);
  if (parts.length === 0) return 'AL';
  return parts.map((part) => part[0]?.toUpperCase() ?? '').join('');
}

function fallbackRegistrationCode(studentId: string): string {
  return `AC-${studentId.replace(/-/g, '').slice(0, 8).toUpperCase()}`;
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
  const start =
    parseBrDateTime(input.startDateTime) ??
    (input.startDateTime ? new Date(input.startDateTime) : null);
  if (!start || Number.isNaN(start.getTime())) return [];

  if (input.recurrenceKind === 'none') return [start];

  const repeatUntilDate =
    parseBrDate(input.repeatUntil) ??
    (input.repeatUntil ? new Date(input.repeatUntil) : null);
  const until = repeatUntilDate
    ? new Date(
        repeatUntilDate.getFullYear(),
        repeatUntilDate.getMonth(),
        repeatUntilDate.getDate(),
        23,
        59,
        59,
        0,
      )
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
  const startDateTime = formatBrDateTimeFromDate(now);

  return {
    id: '',
    name: '',
    courseId: '',
    totalSeats: '30',
    startDateTime,
    endDate: '',
    status: 'ENROLLMENTS_OPEN',
    autoEnrollNewStudents: true,
    selectedStudentIds: [],
    recurrenceKind: 'none',
    repeatUntil: '',
    monthDay: '1',
    weeklyDays: [],
  };
}

export function ClassesNative({ token, onNavigate }: ClassesNativeProps) {
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingClassId, setDeletingClassId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<ClassFormState>(() => defaultClassForm());
  const [pendingClassFromAgenda, setPendingClassFromAgenda] = useState<string | null>(
    null,
  );
  const [classEventMetaByClassId, setClassEventMetaByClassId] = useState<Record<string, ClassEventMeta>>({});
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null);
  const [selectedTab, setSelectedTab] = useState<'students' | 'agenda' | 'materials' | 'attendance'>(
    'attendance',
  );
  const [sessionRoster, setSessionRoster] = useState<SessionRoster | null>(null);
  const [attendanceLoading, setAttendanceLoading] = useState(false);
  const [attendanceCacheByClassId, setAttendanceCacheByClassId] = useState<
    Record<string, AttendanceClassCache>
  >({});

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

      const normalizedClasses = Array.isArray(classesData) ? classesData : [];
      setClasses(normalizedClasses);
      setCourses(Array.isArray(coursesData) ? coursesData : []);
      setStudents(Array.isArray(studentsData) ? studentsData : []);
      setEnrollments(Array.isArray(enrollmentsData) ? enrollmentsData : []);
      setSelectedClassId((current) => {
        if (current && normalizedClasses.some((item) => item.id === current)) return current;
        return normalizedClasses[0]?.id ?? null;
      });
      const byClass: Record<string, ClassEventMeta> = {};
      if (Array.isArray(classMetaData)) {
        classMetaData.forEach((item) => {
          if (item?.classId) byClass[item.classId] = item;
        });
      }
      setClassEventMetaByClassId((current) => ({
        ...current,
        ...byClass,
      }));
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

  const classById = useMemo(() => {
    const next = new Map<string, SchoolClass>();
    classes.forEach((item) => next.set(item.id, item));
    return next;
  }, [classes]);

  const getActiveEnrollmentStudentSet = (
    courseId: string,
    exceptClassId?: string,
  ): Set<string> =>
    new Set(
      enrollments
        .filter(
          (item) =>
            item.status === 'ACTIVE' &&
            classById.get(item.classId)?.courseId === courseId &&
            (!exceptClassId || item.classId !== exceptClassId),
        )
        .map((item) => item.studentId),
    );

  const getCourseEligibleStudentSet = (courseId: string): Set<string> =>
    new Set(
      students
        .filter((student) =>
          (student.courses ?? []).some(
            (studentCourse) =>
              studentCourse.course?.id === courseId &&
              (studentCourse.status === 'ACTIVE' ||
                studentCourse.status === 'INTERESTED'),
          ),
        )
        .map((student) => student.id),
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
      startDateTime: toBrDateTimeInput(schoolClass.startDate),
      endDate: toBrDateInput(schoolClass.endDate),
      status: schoolClass.status,
      autoEnrollNewStudents: schoolClass.autoEnrollNewStudents ?? true,
      selectedStudentIds,
      recurrenceKind: recurrence.recurrenceKind,
      repeatUntil: toBrDateInput(recurrence.repeatUntil),
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

  const selectedClass = useMemo(
    () => classes.find((item) => item.id === selectedClassId) ?? null,
    [classes, selectedClassId],
  );

  const classesStats = useMemo(() => {
    const active = classes.filter((item) => item.status !== 'CLOSED').length;
    const occupied = classes.reduce((acc, item) => {
      const total = typeof item.occupiedSeats === 'number'
        ? item.occupiedSeats
        : Number(item._count?.enrollments ?? 0);
      return acc + Math.max(0, total);
    }, 0);
    const totalSeats = classes.reduce((acc, item) => acc + Math.max(0, Number(item.totalSeats || 0)), 0);
    const occupancyRate = totalSeats > 0 ? Math.round((occupied / totalSeats) * 100) : 0;
    const classesStartingToday = classes.filter((item) => {
      const start = new Date(item.startDate);
      const now = new Date();
      return (
        start.getFullYear() === now.getFullYear() &&
        start.getMonth() === now.getMonth() &&
        start.getDate() === now.getDate()
      );
    }).length;

    return {
      active,
      occupied,
      totalSeats,
      occupancyRate,
      classesStartingToday,
      planningCount: classes.filter((item) => item.status === 'PLANNING').length,
    };
  }, [classes]);

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
    options?: {
      preserveExisting?: boolean;
      ignoreAlreadyEnrolledOnAdd?: boolean;
    },
  ) => {
    const currentStudentIds = getClassEnrollmentStudentSet(classId);
    const desiredStudentIds = new Set(selectedStudentIds);

    const toAdd = selectedStudentIds.filter(
      (studentId) => !currentStudentIds.has(studentId),
    );
    const toRemove = options?.preserveExisting
      ? []
      : Array.from(currentStudentIds).filter(
          (studentId) => !desiredStudentIds.has(studentId),
        );

    const failures: string[] = [];
    const isAlreadyEnrolledMessage = (message: string) =>
      /já está matriculado na turma|ja esta matriculado na turma|já está matriculado na turma/i.test(
        message,
      );

    for (const studentId of toAdd) {
      try {
        await apiRequest(token, '/enrollments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ classId, studentId }),
        });
      } catch (syncError) {
        if (
          options?.ignoreAlreadyEnrolledOnAdd &&
          syncError instanceof Error &&
          isAlreadyEnrolledMessage(syncError.message)
        ) {
          continue;
        }
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
    if (!form.courseId) return [];

    const eligibleStudentIds = getCourseEligibleStudentSet(form.courseId);
    const unavailable = getActiveEnrollmentStudentSet(
      form.courseId,
      form.id || undefined,
    );
    const selected = new Set(form.selectedStudentIds);

    return students.filter(
      (student) =>
        (eligibleStudentIds.has(student.id) || selected.has(student.id)) &&
        (!unavailable.has(student.id) || selected.has(student.id)),
    );
  }, [
    students,
    enrollments,
    classById,
    form.id,
    form.courseId,
    form.selectedStudentIds,
  ]);

  const selectedClassStudents = useMemo(() => {
    if (!selectedClass) return [];
    const selectedEnrollments = enrollments.filter(
      (item) => item.classId === selectedClass.id && item.status === 'ACTIVE',
    );
    return selectedEnrollments
      .map((enrollment) => {
        const student = students.find((item) => item.id === enrollment.studentId);
        if (!student) return null;
        return {
          id: student.id,
          name: student.name,
          email: student.email,
          ra: student.ra ?? student.registrationCode ?? null,
        };
      })
      .filter(
        (item): item is { id: string; name: string; email: string; ra: string | null } =>
          Boolean(item),
      );
  }, [selectedClass, enrollments, students]);

  useEffect(() => {
    if (!selectedClassId) {
      setSessionRoster(null);
      return;
    }
    if (selectedTab !== 'attendance') return;

    const cached = attendanceCacheByClassId[selectedClassId];
    if (cached) {
      setSessionRoster(cached.latestRoster);
      return;
    }

    let cancelled = false;
    const loadAttendancePreview = async () => {
      setAttendanceLoading(true);
      try {
        const sessions = await apiRequest<ClassSession[]>(
          token,
          `/attendance/teacher/classes/${selectedClassId}/sessions`,
        );
        if (cancelled) return;
        const normalizedSessions = Array.isArray(sessions) ? sessions : [];

        const now = Date.now();
        const pastSessions = normalizedSessions.filter(
          (session) => new Date(session.datetime).getTime() <= now,
        );
        const targetSession = pastSessions.at(-1) ?? normalizedSessions[0] ?? null;

        if (!targetSession) {
          setSessionRoster(null);
          return;
        }

        const roster = await apiRequest<SessionRoster>(
          token,
          `/attendance/teacher/classes/${selectedClassId}/sessions/${targetSession.id}`,
        );
        if (cancelled) return;
        setSessionRoster(roster);

        const historyRosters: SessionRoster[] = [];
        const chunkSize = 4;
        for (let index = 0; index < pastSessions.length; index += chunkSize) {
          const chunk = pastSessions.slice(index, index + chunkSize);
          const batch = await Promise.all(
            chunk.map((session) =>
              apiRequest<SessionRoster>(
                token,
                `/attendance/teacher/classes/${selectedClassId}/sessions/${session.id}`,
              ).catch(() => null),
            ),
          );
          if (cancelled) return;
          historyRosters.push(
            ...batch.filter((item): item is SessionRoster => Boolean(item)),
          );
        }

        const stats = new Map<string, StudentFrequency>();
        historyRosters.forEach((item) => {
          item.students.forEach((student) => {
            const current = stats.get(student.studentId) ?? {
              present: 0,
              absent: 0,
              frequency: 100,
              status: 'pending' as const,
            };
            if (student.present === true) current.present += 1;
            if (student.present === false) current.absent += 1;
            stats.set(student.studentId, current);
          });
        });

        roster.students.forEach((student) => {
          const current = stats.get(student.studentId) ?? {
            present: 0,
            absent: 0,
            frequency: 100,
            status: 'pending' as const,
          };
          current.status =
            student.present === true
              ? 'present'
              : student.present === false
                ? 'absent'
                : 'pending';
          current.frequency = normalizeFrequency(current.present, current.absent);
          stats.set(student.studentId, current);
        });

        const studentFrequencyById: Record<string, StudentFrequency> = {};
        stats.forEach((value, key) => {
          studentFrequencyById[key] = value;
        });

        setAttendanceCacheByClassId((current) => ({
          ...current,
          [selectedClassId]: {
            sessions: normalizedSessions,
            latestRoster: roster,
            studentFrequencyById,
          },
        }));
      } catch {
        if (!cancelled) {
          setSessionRoster(null);
        }
      } finally {
        if (!cancelled) setAttendanceLoading(false);
      }
    };

    void loadAttendancePreview();
    return () => {
      cancelled = true;
    };
  }, [token, selectedClassId, selectedTab, attendanceCacheByClassId]);

  const attendanceByStudentId = useMemo(() => {
    const cached = selectedClassId ? attendanceCacheByClassId[selectedClassId] : null;
    const byId = cached?.studentFrequencyById ?? {};
    const summary = new Map<string, StudentFrequency>();

    selectedClassStudents.forEach((student) => {
      const item = byId[student.id];
      summary.set(student.id, {
        present: item?.present ?? 0,
        absent: item?.absent ?? 0,
        frequency: item?.frequency ?? 100,
        status: item?.status ?? 'pending',
      });
    });

    return summary;
  }, [selectedClassStudents, selectedClassId, attendanceCacheByClassId]);

  useEffect(() => {
    if (!form.courseId) {
      if (form.selectedStudentIds.length === 0) return;
      setForm((current) => ({ ...current, selectedStudentIds: [] }));
      return;
    }

    const availableIds = new Set(availableStudents.map((student) => student.id));
    const nextSelected = form.selectedStudentIds.filter((id) =>
      availableIds.has(id),
    );

    if (nextSelected.length !== form.selectedStudentIds.length) {
      setForm((current) => ({
        ...current,
        selectedStudentIds: nextSelected,
      }));
    }
  }, [form.courseId, availableStudents, form.selectedStudentIds]);

  const saveClass = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    const cleanName = sanitizeOnlyLetters(form.name).trim();
    const startDateTimeParsed = parseBrDateTime(form.startDateTime);
    const endDateParsed = form.endDate ? parseBrDate(form.endDate) : null;
    const repeatUntilParsed = form.repeatUntil ? parseBrDate(form.repeatUntil) : null;

    if (!cleanName || !form.courseId || !startDateTimeParsed) {
      setError('Preencha nome, curso e data de início.');
      return;
    }

    if (form.recurrenceKind !== 'none' && !repeatUntilParsed) {
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

    if (form.recurrenceKind === 'none' && form.endDate && !endDateParsed) {
      setError('Informe uma data de término válida (DD/MM/AAAA).');
      return;
    }

    setSaving(true);
    try {
      const startDateIso = startDateTimeParsed.toISOString();
      const endDateIso =
        form.recurrenceKind === 'none'
          ? endDateParsed
            ? new Date(
                endDateParsed.getFullYear(),
                endDateParsed.getMonth(),
                endDateParsed.getDate(),
                23,
                59,
                59,
                0,
              ).toISOString()
            : undefined
          : repeatUntilParsed
            ? new Date(
                repeatUntilParsed.getFullYear(),
                repeatUntilParsed.getMonth(),
                repeatUntilParsed.getDate(),
                23,
                59,
                59,
                0,
              ).toISOString()
            : undefined;

      const payload = {
        name: cleanName,
        courseId: form.courseId,
        totalSeats: totalSeatsNumber,
        startDate: startDateIso,
        endDate: endDateIso,
        autoEnrollNewStudents: form.autoEnrollNewStudents,
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

      await syncEnrollments(classId, form.selectedStudentIds, {
        preserveExisting: !form.id && form.autoEnrollNewStudents,
        ignoreAlreadyEnrolledOnAdd: !form.id && form.autoEnrollNewStudents,
      });
      await syncClassEventsToAgenda({
        classId,
        className: cleanName,
        startDateTime: startDateIso,
        recurrenceKind: form.recurrenceKind,
        repeatUntil: endDateIso || '',
        weeklyDays: form.weeklyDays,
        monthDay: form.monthDay,
      });

      setClassEventMetaByClassId((current) => ({
        ...current,
        [classId]: {
          classId,
          recurrenceKind: form.recurrenceKind,
          repeatUntil: endDateIso || null,
          monthDay:
            form.recurrenceKind === 'monthly' && form.monthDay.trim() !== ''
              ? Number(form.monthDay)
              : null,
          weeklyDays: form.recurrenceKind === 'weekly' ? form.weeklyDays : [],
        },
      }));

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

  const removeClass = async (classId: string) => {
    if (
      !window.confirm(
        'Deseja realmente apagar esta turma? Os alunos continuam vinculados ao curso e poderão ser alocados em outra turma.',
      )
    ) {
      return;
    }

    setError('');
    setDeletingClassId(classId);
    try {
      await apiRequest<{ success: boolean }>(token, `/classes/${classId}`, {
        method: 'DELETE',
      });
      await loadData();
      setSelectedClassId((current) => (current === classId ? null : current));
      if (form.id === classId) {
        setModalOpen(false);
        setForm(defaultClassForm());
      }
    } catch (removeError) {
      setError(
        removeError instanceof Error
          ? removeError.message
          : 'Falha ao apagar turma.',
      );
    } finally {
      setDeletingClassId((current) => (current === classId ? null : current));
    }
  };

  return (
    <section className="native-page native-classes native-classes-pro">
      <header className="native-classes-pro-header">
        <div>
          <h2>Gestão de turmas</h2>
          <p>Controle operacional dos ciclos acadêmicos e disponibilidade das turmas.</p>
        </div>
        <div className="native-classes-pro-header-actions">
          <button type="button">Filtro rápido</button>
          <button type="button" className="is-primary" onClick={openCreateModal}>
            Nova turma
          </button>
        </div>
      </header>

      <section className="native-classes-pro-kpis" aria-label="Indicadores de turmas">
        <article className="native-classes-pro-kpi is-accent">
          <span>Turmas ativas</span>
          <strong>{classesStats.active}</strong>
          <small>{classes.length} turma(s) no total</small>
        </article>
        <article className="native-classes-pro-kpi is-info">
          <span>Ocupação total</span>
          <strong>{classesStats.occupancyRate}%</strong>
          <small>
            {classesStats.occupied}/{classesStats.totalSeats} vagas ocupadas
          </small>
        </article>
        <article className="native-classes-pro-kpi is-accent">
          <span>Aulas hoje</span>
          <strong>{classesStats.classesStartingToday}</strong>
          <small>Inícios programados para hoje</small>
        </article>
        <article className="native-classes-pro-kpi is-muted">
          <span>Planejamento</span>
          <strong>{classesStats.planningCount}</strong>
          <small>Turmas aguardando abertura</small>
        </article>
      </section>

      {loading ? <p className="native-info">Carregando turmas...</p> : null}
      {error ? <p className="native-error">{error}</p> : null}

      {!loading ? (
        <section className="native-classes-pro-main">
          <aside className="native-classes-pro-list">
            <div className="native-classes-pro-section-head">
              <h3>Registro de turmas</h3>
              <button type="button" onClick={openCreateModal}>
                Ver todas
              </button>
            </div>
            <div className="native-classes-pro-search">
              <input
                type="text"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar por turma ou curso..."
              />
            </div>
            <div className="native-classes-pro-items">
              {filteredClasses.length === 0 ? (
                <p className="native-info">Nenhuma turma encontrada.</p>
              ) : (
                filteredClasses.map((item) => {
                  const occupied =
                    typeof item.occupiedSeats === 'number'
                      ? item.occupiedSeats
                      : Number(item._count?.enrollments ?? 0);
                  const occupancy = item.totalSeats > 0
                    ? Math.round((occupied / item.totalSeats) * 100)
                    : 0;

                  return (
                    <button
                      type="button"
                      key={item.id}
                      className={`native-classes-pro-item ${selectedClassId === item.id ? 'active' : ''}`}
                      onClick={() => setSelectedClassId(item.id)}
                    >
                      <div className="native-classes-pro-item-top">
                        <span>{classStatusLabel[item.status]}</span>
                        <small>{formatDate(item.startDate)}</small>
                      </div>
                      <strong>{item.name}</strong>
                      <p>{item.course?.name ?? '-'}</p>
                      <div className="native-classes-pro-item-bottom">
                        <small>
                          {occupied}/{item.totalSeats} vagas
                        </small>
                        <small>{occupancy}%</small>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </aside>

          <article className="native-classes-pro-detail">
            {selectedClass ? (
              <>
                <header className="native-classes-pro-detail-head">
                  <div>
                    <small>Curso / Turma</small>
                    <h3>{selectedClass.name}</h3>
                    <p>
                      Responsável: {getCurrentUserName()} • {formatDate(selectedClass.startDate)} a{' '}
                      {formatDate(selectedClass.endDate)}
                    </p>
                  </div>
                  <div className="native-classes-pro-detail-actions">
                    <button type="button" onClick={() => openEditModal(selectedClass)}>
                      Editar
                    </button>
                    <button
                      type="button"
                      className="danger"
                      onClick={() => void removeClass(selectedClass.id)}
                      disabled={deletingClassId === selectedClass.id}
                    >
                      {deletingClassId === selectedClass.id ? 'Apagando...' : 'Apagar'}
                    </button>
                  </div>
                </header>

                <nav className="native-classes-pro-tabs">
                  <button
                    type="button"
                    className={selectedTab === 'students' ? 'active' : ''}
                    onClick={() => setSelectedTab('students')}
                  >
                    Alunos
                  </button>
                  <button
                    type="button"
                    className={selectedTab === 'agenda' ? 'active' : ''}
                    onClick={() => setSelectedTab('agenda')}
                  >
                    Agenda
                  </button>
                  <button
                    type="button"
                    className={selectedTab === 'materials' ? 'active' : ''}
                    onClick={() => setSelectedTab('materials')}
                  >
                    Materiais
                  </button>
                  <button
                    type="button"
                    className={selectedTab === 'attendance' ? 'active' : ''}
                    onClick={() => setSelectedTab('attendance')}
                  >
                    Presença
                  </button>
                </nav>

                {selectedTab === 'attendance' ? (
                  <section className="native-classes-pro-attendance">
                    <header>
                      <h4>Registro de presença</h4>
                      <small>
                        {sessionRoster?.session
                          ? `Sessão base: ${sessionRoster.session.title} • ${formatDateTime(sessionRoster.session.datetime)}`
                          : 'Sem sessões registradas para esta turma.'}
                      </small>
                    </header>
                    <div className="native-panel native-table-wrap">
                      <table className="native-table native-classes-pro-attendance-table">
                        <thead>
                          <tr>
                            <th>Aluno</th>
                            <th>Status</th>
                            <th>Frequência</th>
                          </tr>
                        </thead>
                        <tbody>
                          {attendanceLoading ? (
                            <tr>
                              <td colSpan={3}>Carregando presença...</td>
                            </tr>
                          ) : selectedClassStudents.length === 0 ? (
                            <tr>
                              <td colSpan={3}>Nenhum aluno ativo nesta turma.</td>
                            </tr>
                          ) : (
                            selectedClassStudents.map((student) => {
                              const preview = attendanceByStudentId.get(student.id);
                              const status = preview?.status ?? 'pending';
                              const frequency = preview?.frequency ?? 100;
                              return (
                                <tr key={student.id}>
                                  <td>
                                    <strong>{student.name}</strong>
                                    <small>{student.email}</small>
                                  </td>
                                  <td>
                                    <span
                                      className={`native-status-chip ${
                                        status === 'present'
                                          ? 'is-success'
                                          : status === 'absent'
                                            ? 'is-danger'
                                            : 'is-warning'
                                      }`}
                                    >
                                      {status === 'present'
                                        ? 'Presente'
                                        : status === 'absent'
                                          ? 'Falta'
                                          : 'Pendente'}
                                    </span>
                                  </td>
                                  <td>
                                    <strong>{frequency}%</strong>
                                    <span
                                      className={`native-status-chip ${
                                        frequency >= 75
                                          ? 'is-success'
                                          : frequency >= 60
                                            ? 'is-warning'
                                            : 'is-danger'
                                      }`}
                                    >
                                      {frequency >= 75
                                        ? 'Boa'
                                        : frequency >= 60
                                          ? 'Atenção'
                                          : 'Crítica'}
                                    </span>
                                  </td>
                                </tr>
                              );
                            })
                          )}
                        </tbody>
                      </table>
                    </div>
                    <div className="native-classes-pro-attendance-actions">
                      <button type="button" onClick={() => onNavigate?.('admin_aulas')}>
                        Abrir tela de presença
                      </button>
                    </div>
                  </section>
                ) : selectedTab === 'students' ? (
                  <section className="native-classes-pro-attendance">
                    <header>
                      <h4>Alunos vinculados</h4>
                      <small>{selectedClassStudents.length} aluno(s) ativo(s) nesta turma.</small>
                    </header>
                    <div className="native-panel native-table-wrap">
                      <table className="native-table native-classes-pro-attendance-table">
                        <thead>
                          <tr>
                            <th>Aluno</th>
                            <th>E-mail</th>
                            <th>Matrícula</th>
                          </tr>
                        </thead>
                        <tbody>
                          {selectedClassStudents.length === 0 ? (
                            <tr>
                              <td colSpan={3}>Nenhum aluno ativo nesta turma.</td>
                            </tr>
                          ) : (
                            selectedClassStudents.map((student) => (
                              <tr key={student.id}>
                                <td>
                                  <div className="native-student-cell">
                                    <span className="native-user-initials">
                                      {getNameInitials(student.name)}
                                    </span>
                                    <span>
                                      <strong>{student.name}</strong>
                                      <small>
                                        RA: {student.ra?.trim() || fallbackRegistrationCode(student.id)}
                                      </small>
                                    </span>
                                  </div>
                                </td>
                                <td>{student.email}</td>
                                <td>
                                  <span className="native-status-chip is-info">Ativa</span>
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                    <div className="native-classes-pro-attendance-actions">
                      <button type="button" onClick={() => openEditModal(selectedClass)}>
                        Gerenciar matrículas da turma
                      </button>
                    </div>
                  </section>
                ) : selectedTab === 'agenda' ? (
                  <section className="native-classes-pro-attendance">
                    <header>
                      <h4>Agenda da turma</h4>
                      <small>Sincronização de agenda ativa para esta turma.</small>
                    </header>
                    <div className="native-classes-pro-attendance-actions">
                      <button type="button" onClick={() => onNavigate?.('admin_agenda')}>
                        Abrir agenda
                      </button>
                    </div>
                  </section>
                ) : (
                  <section className="native-classes-pro-attendance">
                    <header>
                      <h4>Materiais da turma</h4>
                      <small>Publicações e arquivos de apoio vinculados às aulas.</small>
                    </header>
                    <div className="native-classes-pro-attendance-actions">
                      <button type="button" onClick={() => onNavigate?.('admin_conteudo')}>
                        Abrir materiais
                      </button>
                    </div>
                  </section>
                )}
              </>
            ) : (
              <p className="native-info">Selecione uma turma para ver os detalhes.</p>
            )}
          </article>
        </section>
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
                    setForm((current) => ({
                      ...current,
                      name: sanitizeOnlyLetters(event.target.value),
                    }))
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
                      totalSeats: event.target.value.replace(/\D/g, ''),
                    }))
                  }
                  required
                />
              </label>

              <label>
                Data e hora de início
                <input
                  type="text"
                  value={form.startDateTime}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      startDateTime: maskBrDateTime(event.target.value),
                    }))
                  }
                  placeholder="DD/MM/AAAA HH:MM"
                  inputMode="numeric"
                  maxLength={16}
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
                    type="text"
                    value={form.endDate}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        endDate: maskBrDate(event.target.value),
                      }))
                    }
                    placeholder="DD/MM/AAAA"
                    inputMode="numeric"
                    maxLength={10}
                  />
                </label>
              ) : null}

              {form.recurrenceKind !== 'none' ? (
                <label>
                  Repetir até
                  <input
                    type="text"
                    value={form.repeatUntil}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        repeatUntil: maskBrDate(event.target.value),
                      }))
                    }
                    placeholder="DD/MM/AAAA"
                    inputMode="numeric"
                    maxLength={10}
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

              <label className="native-classes-auto-enroll-toggle">
                <div>
                  <input
                    type="checkbox"
                    checked={form.autoEnrollNewStudents}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        autoEnrollNewStudents: event.target.checked,
                      }))
                    }
                  />
                  <span>Alunos recém-matriculados entram automaticamente</span>
                </div>
                <small>
                  Quando ativo, alunos do curso entram automaticamente nesta turma (respeitando o limite de vagas).
                </small>
              </label>

              <fieldset className="native-student-list">
                <legend>
                  Alunos matriculados disponíveis ({availableStudents.length})
                </legend>
                {!form.courseId ? (
                  <p>Selecione um curso para listar os alunos matriculados.</p>
                ) : availableStudents.length === 0 ? (
                  <p>Nenhum aluno matriculado disponível para este curso.</p>
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
                {form.id ? (
                  <button
                    type="button"
                    className="danger"
                    onClick={() => void removeClass(form.id)}
                    disabled={Boolean(deletingClassId)}
                  >
                    {deletingClassId === form.id ? 'Apagando...' : 'Apagar turma'}
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
