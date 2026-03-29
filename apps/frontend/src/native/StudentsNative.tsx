import { useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { apiRequest } from './api';

type Course = {
  id: string;
  name: string;
};

type StudentCourse = {
  id: string;
  status: string;
  course?: Course | null;
};

type ClassReference = {
  id: string;
  name: string;
  course?: Course | null;
};

type StudentEnrollment = {
  id: string;
  status: 'ACTIVE' | 'CANCELED' | 'COMPLETED';
  class?: ClassReference | null;
};

type StudentProfile = {
  documentCpf?: string | null;
  phone?: string | null;
  birthDate?: string | null;
};

type Student = {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string | null;
  statusKey?: string;
  statusLabel?: string;
  profile?: StudentProfile | null;
  courses?: StudentCourse[];
  enrollments?: StudentEnrollment[];
};

type CsvImportResult = {
  totalRows: number;
  importedCount: number;
  failedCount: number;
  errors?: Array<{ line: number; message: string }>;
};

type StudentFormState = {
  id: string;
  name: string;
  email: string;
  password: string;
  documentCpf: string;
  phone: string;
  birthDate: string;
  courseIds: string[];
};

type StudentsNativeProps = {
  token: string;
};

const DEFAULT_AVATAR_BG = '#ece8e6';
const DEFAULT_AVATAR_TEXT = '#8f7065';

function defaultFormState(): StudentFormState {
  return {
    id: '',
    name: '',
    email: '',
    password: '',
    documentCpf: '',
    phone: '',
    birthDate: '',
    courseIds: [],
  };
}

function registrationCode(studentId: string): string {
  return `#AC-${studentId.replace(/-/g, '').slice(0, 8).toUpperCase()}`;
}

function getInitials(name: string): string {
  const parts = String(name)
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (parts.length === 0) return 'AL';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ''}${parts[parts.length - 1][0] ?? ''}`.toUpperCase();
}

function buildInitialsAvatar(name: string): string {
  const initials = getInitials(name);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96"><rect width="96" height="96" rx="18" fill="${DEFAULT_AVATAR_BG}" /><text x="48" y="56" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-size="30" font-weight="700" fill="${DEFAULT_AVATAR_TEXT}">${initials}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function toDateInput(value: string | null | undefined): string {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toISOString().slice(0, 10);
}

function toDisplayDate(value: string | null | undefined): string {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '-';
  return new Intl.DateTimeFormat('pt-BR').format(parsed);
}

function statusVisual(statusKey: string | undefined) {
  switch (statusKey) {
    case 'active':
      return { tone: 'is-success', label: 'Ativo' };
    case 'pre_active':
      return { tone: 'is-warning', label: 'Pré-matrícula' };
    case 'completed':
      return { tone: 'is-info', label: 'Concluído' };
    case 'inactive':
      return { tone: 'is-muted', label: 'Inativo' };
    case 'pending_course':
      return { tone: 'is-neutral', label: 'Sem curso' };
    default:
      return { tone: 'is-neutral', label: 'Sem definição' };
  }
}

function csvCell(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

function normalizeSearchText(value: string): string {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export function StudentsNative({ token }: StudentsNativeProps) {
  const [students, setStudents] = useState<Student[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyAvatar, setBusyAvatar] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');
  const [formError, setFormError] = useState('');
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [form, setForm] = useState<StudentFormState>(() => defaultFormState());
  const avatarInputRef = useRef<HTMLInputElement | null>(null);

  const selectedStudent = useMemo(
    () => students.find((item) => item.id === selectedStudentId) ?? null,
    [students, selectedStudentId],
  );

  const loadData = async (showLoading = true) => {
    if (showLoading) setLoading(true);
    setError('');

    try {
      const [studentsData, coursesData] = await Promise.all([
        apiRequest<Student[]>(token, '/students'),
        apiRequest<Course[]>(token, '/courses'),
      ]);
      setStudents(Array.isArray(studentsData) ? studentsData : []);
      setCourses(Array.isArray(coursesData) ? coursesData : []);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : 'Falha ao carregar alunos.',
      );
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  useEffect(() => {
    void loadData(true);
  }, [token]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setDrawerOpen(false);
      setModalOpen(false);
      setImportModalOpen(false);
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const filteredStudents = useMemo(() => {
    const query = normalizeSearchText(search);
    if (!query) return students;

    return students.filter((student) => {
      const firstCourseName =
        student.enrollments?.[0]?.class?.course?.name ||
        student.courses?.[0]?.course?.name ||
        '';
      const firstClassName = student.enrollments?.[0]?.class?.name || '';
      const studentName = normalizeSearchText(student.name);
      const studentEmail = normalizeSearchText(student.email);
      const courseName = normalizeSearchText(firstCourseName);
      const className = normalizeSearchText(firstClassName);

      return (
        studentName.includes(query) ||
        studentEmail.includes(query) ||
        courseName.includes(query) ||
        className.includes(query)
      );
    });
  }, [students, search]);

  const activeStudents = students.filter(
    (item) => (item.statusKey ?? '') === 'active',
  ).length;
  const preEnrollmentStudents = students.filter(
    (item) => (item.statusKey ?? '') === 'pre_active',
  ).length;
  const pendingCourseStudents = students.filter(
    (item) => (item.statusKey ?? '') === 'pending_course',
  ).length;
  const withEnrollments = students.filter(
    (item) => (item.enrollments?.length ?? 0) > 0,
  ).length;

  const openCreateModal = () => {
    setForm(defaultFormState());
    setFormError('');
    setModalOpen(true);
  };

  const openEditModal = (student: Student) => {
    setForm({
      id: student.id,
      name: student.name || '',
      email: student.email || '',
      password: '',
      documentCpf: student.profile?.documentCpf || '',
      phone: student.profile?.phone || '',
      birthDate: toDateInput(student.profile?.birthDate),
      courseIds:
        student.courses
          ?.map((item) => item.course?.id)
          .filter((id): id is string => Boolean(id)) ?? [],
    });
    setFormError('');
    setModalOpen(true);
  };

  const openDrawer = (studentId: string) => {
    setSelectedStudentId(studentId);
    setDrawerOpen(true);
  };

  const closeDrawer = () => {
    setDrawerOpen(false);
  };

  const toggleCourse = (courseId: string) => {
    setForm((current) => {
      const selected = new Set(current.courseIds);
      if (selected.has(courseId)) selected.delete(courseId);
      else selected.add(courseId);

      return {
        ...current,
        courseIds: Array.from(selected),
      };
    });
  };

  const saveStudent = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError('');
    setFeedback('');

    const name = form.name.trim();
    const email = form.email.trim().toLowerCase();
    const password = form.password.trim();
    const documentCpf = form.documentCpf.trim();
    const phone = form.phone.trim();
    const birthDate = form.birthDate;

    if (!name || !email) {
      setFormError('Informe nome e e-mail.');
      return;
    }

    if (!form.id) {
      if (!password || password.length < 8) {
        setFormError('A senha deve ter no mínimo 8 caracteres.');
        return;
      }
      if (!documentCpf || !phone || !birthDate) {
        setFormError('Para novo aluno, CPF, telefone e nascimento são obrigatórios.');
        return;
      }
    }

    setSaving(true);
    try {
      if (form.id) {
        await apiRequest<Student>(token, `/students/${form.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name,
            email,
            password: password || undefined,
            documentCpf: documentCpf || undefined,
            phone: phone || undefined,
            birthDate: birthDate || undefined,
            courseIds: form.courseIds,
          }),
        });
        setFeedback('Aluno atualizado com sucesso.');
      } else {
        await apiRequest<Student>(token, '/students/public-register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name,
            email,
            password,
            documentCpf,
            phone,
            birthDate,
            courseIds: form.courseIds,
          }),
        });
        setFeedback('Aluno cadastrado com sucesso.');
      }

      await loadData(false);
      setModalOpen(false);
      setForm(defaultFormState());
    } catch (saveError) {
      setFormError(
        saveError instanceof Error ? saveError.message : 'Falha ao salvar aluno.',
      );
    } finally {
      setSaving(false);
    }
  };

  const uploadSelectedAvatar = async (file: File) => {
    if (!selectedStudent) return;

    setBusyAvatar(true);
    setError('');
    setFeedback('');
    try {
      const payload = new FormData();
      payload.append('avatar', file);
      await apiRequest<Student>(token, `/students/${selectedStudent.id}/avatar`, {
        method: 'POST',
        body: payload,
      });
      await loadData(false);
      setFeedback('Foto do aluno atualizada.');
    } catch (uploadError) {
      setError(
        uploadError instanceof Error
          ? uploadError.message
          : 'Falha ao enviar foto do aluno.',
      );
    } finally {
      setBusyAvatar(false);
    }
  };

  const removeSelectedAvatar = async () => {
    if (!selectedStudent) return;

    setBusyAvatar(true);
    setError('');
    setFeedback('');
    try {
      await apiRequest<Student>(token, `/students/${selectedStudent.id}/avatar`, {
        method: 'DELETE',
      });
      await loadData(false);
      setFeedback('Foto do aluno removida.');
    } catch (removeError) {
      setError(
        removeError instanceof Error
          ? removeError.message
          : 'Falha ao remover foto do aluno.',
      );
    } finally {
      setBusyAvatar(false);
    }
  };

  const onAvatarChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    await uploadSelectedAvatar(file);
    event.target.value = '';
  };

  const submitCsvImport = async () => {
    if (!csvFile) return;

    setImporting(true);
    setError('');
    setFeedback('');
    try {
      const payload = new FormData();
      payload.append('file', csvFile);

      const result = await apiRequest<CsvImportResult>(
        token,
        '/students/import-csv',
        {
          method: 'POST',
          body: payload,
        },
      );

      await loadData(false);
      setImportModalOpen(false);
      setCsvFile(null);
      setFeedback(
        `Importação concluída. Sucesso: ${result.importedCount}. Falhas: ${result.failedCount}.`,
      );
    } catch (importError) {
      setError(
        importError instanceof Error ? importError.message : 'Falha ao importar CSV.',
      );
    } finally {
      setImporting(false);
    }
  };

  const exportCsv = () => {
    const header = ['nome', 'email', 'cpf', 'telefone', 'dataNascimento', 'courseIds'];
    const lines = students.map((student) => [
      student.name || '',
      student.email || '',
      student.profile?.documentCpf || '',
      student.profile?.phone || '',
      toDateInput(student.profile?.birthDate),
      (student.courses || [])
        .map((item) => item.course?.id)
        .filter((id): id is string => Boolean(id))
        .join('|'),
    ]);

    const csvContent = [header, ...lines]
      .map((row) => row.map((cell) => csvCell(String(cell))).join(';'))
      .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'alunos.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  const downloadCsvModel = () => {
    const modelRows = [
      ['nome', 'email', 'senha', 'cpf', 'telefone', 'dataNascimento', 'courseIds'],
      [
        'João Silva',
        'joao@email.com',
        'Senha@123',
        '12345678901',
        '65999990000',
        '1998-03-10',
        'uuid-curso-1|uuid-curso-2',
      ],
    ];

    const csvContent = modelRows
      .map((row) => row.map((cell) => csvCell(String(cell))).join(';'))
      .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'modelo-importacao-alunos.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="native-page native-students">
      <header className="native-page-header">
        <h2>Alunos e matrículas</h2>
        <p>
          Gestão nativa da base de alunos com edição rápida, importação em lote e
          menor custo de renderização.
        </p>
      </header>

      <div className="native-kpi-grid">
        <article className="native-kpi-card">
          <span>Total de alunos</span>
          <strong>{students.length}</strong>
          <small>Base completa da conta</small>
        </article>
        <article className="native-kpi-card">
          <span>Ativos</span>
          <strong>{activeStudents}</strong>
          <small>{preEnrollmentStudents} em pré-matrícula</small>
        </article>
        <article className="native-kpi-card">
          <span>Com matrícula</span>
          <strong>{withEnrollments}</strong>
          <small>{students.length - withEnrollments} sem turma ativa</small>
        </article>
        <article className="native-kpi-card">
          <span>Sem curso</span>
          <strong>{pendingCourseStudents}</strong>
          <small>Precisam de vínculo com curso</small>
        </article>
      </div>

      <div className="native-toolbar">
        <input
          type="text"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Buscar por nome, e-mail, curso ou turma..."
        />
        <div className="native-toolbar-actions">
          <button type="button" className="ghost" onClick={downloadCsvModel}>
            Modelo CSV
          </button>
          <button type="button" className="ghost" onClick={exportCsv}>
            Exportar CSV
          </button>
          <button type="button" className="ghost" onClick={() => setImportModalOpen(true)}>
            Importar CSV
          </button>
          <button type="button" onClick={openCreateModal}>
            Novo aluno
          </button>
        </div>
      </div>

      {loading ? <p className="native-info">Carregando alunos...</p> : null}
      {error ? <p className="native-error">{error}</p> : null}
      {feedback ? <p className="native-success">{feedback}</p> : null}

      {!loading ? (
        <div className="native-panel native-table-wrap">
          <table className="native-table">
            <thead>
              <tr>
                <th>Aluno</th>
                <th>Matrícula</th>
                <th>Curso principal</th>
                <th>Turmas</th>
                <th>Status</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {filteredStudents.length === 0 ? (
                <tr>
                  <td colSpan={6}>Nenhum aluno encontrado.</td>
                </tr>
              ) : (
                filteredStudents.map((student) => {
                  const visual = statusVisual(student.statusKey);
                  const firstCourse =
                    student.enrollments?.[0]?.class?.course?.name ||
                    student.courses?.[0]?.course?.name ||
                    'Curso não vinculado';

                  return (
                    <tr key={student.id}>
                      <td>
                        <div className="native-student-cell">
                          <img
                            src={student.avatarUrl || buildInitialsAvatar(student.name)}
                            alt={`Avatar de ${student.name}`}
                          />
                          <div>
                            <strong>{student.name}</strong>
                            <small>{student.email}</small>
                          </div>
                        </div>
                      </td>
                      <td>{registrationCode(student.id)}</td>
                      <td>{firstCourse}</td>
                      <td>{student.enrollments?.length ?? 0}</td>
                      <td>
                        <span className={`native-status-chip ${visual.tone}`}>
                          {student.statusLabel || visual.label}
                        </span>
                      </td>
                      <td className="native-actions-cell">
                        <button type="button" onClick={() => openDrawer(student.id)}>
                          Detalhes
                        </button>
                        <button type="button" onClick={() => openEditModal(student)}>
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

      {drawerOpen && selectedStudent ? (
        <div className="native-drawer-backdrop" onClick={closeDrawer}>
          <aside className="native-drawer" onClick={(event) => event.stopPropagation()}>
            <header>
              <h3>Perfil do aluno</h3>
              <button type="button" onClick={closeDrawer}>
                Fechar
              </button>
            </header>

            <div className="native-drawer-profile">
              <img
                src={selectedStudent.avatarUrl || buildInitialsAvatar(selectedStudent.name)}
                alt={`Avatar de ${selectedStudent.name}`}
              />
              <div>
                <strong>{selectedStudent.name}</strong>
                <small>{registrationCode(selectedStudent.id)}</small>
                <small>{selectedStudent.email}</small>
              </div>
            </div>

            <div className="native-drawer-grid">
              <article>
                <span>CPF</span>
                <strong>{selectedStudent.profile?.documentCpf || '-'}</strong>
              </article>
              <article>
                <span>Telefone</span>
                <strong>{selectedStudent.profile?.phone || '-'}</strong>
              </article>
              <article>
                <span>Nascimento</span>
                <strong>{toDisplayDate(selectedStudent.profile?.birthDate)}</strong>
              </article>
              <article>
                <span>Matrículas em turma</span>
                <strong>{selectedStudent.enrollments?.length ?? 0}</strong>
              </article>
            </div>

            <section className="native-drawer-list">
              <h4>Cursos vinculados</h4>
              {selectedStudent.courses?.length ? (
                <ul>
                  {selectedStudent.courses.map((item) => (
                    <li key={item.id}>{item.course?.name ?? 'Curso removido'}</li>
                  ))}
                </ul>
              ) : (
                <p>Nenhum curso vinculado.</p>
              )}
            </section>

            <section className="native-drawer-list">
              <h4>Turmas</h4>
              {selectedStudent.enrollments?.length ? (
                <ul>
                  {selectedStudent.enrollments.map((item) => (
                    <li key={item.id}>
                      {item.class?.name ?? 'Turma não encontrada'} (
                      {item.class?.course?.name ?? 'Curso indefinido'})
                    </li>
                  ))}
                </ul>
              ) : (
                <p>Nenhuma turma ativa.</p>
              )}
            </section>

            <input
              ref={avatarInputRef}
              type="file"
              accept="image/*"
              className="native-hidden-input"
              onChange={onAvatarChange}
            />

            <div className="native-drawer-actions">
              <button
                type="button"
                className="ghost"
                onClick={() => {
                  setDrawerOpen(false);
                  openEditModal(selectedStudent);
                }}
              >
                Editar aluno
              </button>
              <button
                type="button"
                className="ghost"
                onClick={() => avatarInputRef.current?.click()}
                disabled={busyAvatar}
              >
                {busyAvatar ? 'Processando...' : 'Trocar foto'}
              </button>
              <button
                type="button"
                className="danger"
                onClick={() => {
                  void removeSelectedAvatar();
                }}
                disabled={busyAvatar}
              >
                {busyAvatar ? 'Processando...' : 'Remover foto'}
              </button>
            </div>
          </aside>
        </div>
      ) : null}

      {modalOpen ? (
        <div className="native-modal-backdrop" onClick={() => setModalOpen(false)}>
          <section className="native-modal" onClick={(event) => event.stopPropagation()}>
            <header>
              <h3>{form.id ? 'Editar aluno' : 'Novo aluno'}</h3>
              <button type="button" onClick={() => setModalOpen(false)}>
                Fechar
              </button>
            </header>

            <form className="native-form-grid" onSubmit={saveStudent}>
              <label>
                Nome completo
                <input
                  value={form.name}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, name: event.target.value }))
                  }
                  required
                />
              </label>

              <label>
                E-mail
                <input
                  type="email"
                  value={form.email}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, email: event.target.value }))
                  }
                  required
                />
              </label>

              <label>
                Senha {form.id ? '(opcional para edição)' : ''}
                <input
                  type="password"
                  value={form.password}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, password: event.target.value }))
                  }
                  required={!form.id}
                  minLength={8}
                />
              </label>

              <label>
                CPF {!form.id ? '(obrigatório no cadastro)' : ''}
                <input
                  value={form.documentCpf}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      documentCpf: event.target.value,
                    }))
                  }
                />
              </label>

              <label>
                Telefone {!form.id ? '(obrigatório no cadastro)' : ''}
                <input
                  value={form.phone}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, phone: event.target.value }))
                  }
                />
              </label>

              <label>
                Data de nascimento {!form.id ? '(obrigatória no cadastro)' : ''}
                <input
                  type="date"
                  value={form.birthDate}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, birthDate: event.target.value }))
                  }
                />
              </label>

              <fieldset className="native-course-list">
                <legend>Cursos vinculados</legend>
                {courses.length === 0 ? (
                  <p>Nenhum curso cadastrado.</p>
                ) : (
                  <div className="native-course-list-grid">
                    {courses.map((course) => (
                      <label key={course.id}>
                        <input
                          type="checkbox"
                          checked={form.courseIds.includes(course.id)}
                          onChange={() => toggleCourse(course.id)}
                        />
                        <span>{course.name}</span>
                      </label>
                    ))}
                  </div>
                )}
              </fieldset>

              {formError ? <p className="native-error">{formError}</p> : null}

              <div className="native-modal-actions">
                <button
                  type="button"
                  className="ghost"
                  onClick={() => setModalOpen(false)}
                >
                  Cancelar
                </button>
                <button type="submit" disabled={saving}>
                  {saving ? 'Salvando...' : 'Salvar aluno'}
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}

      {importModalOpen ? (
        <div className="native-modal-backdrop" onClick={() => setImportModalOpen(false)}>
          <section className="native-modal native-modal-sm" onClick={(event) => event.stopPropagation()}>
            <header>
              <h3>Importar CSV de alunos</h3>
              <button type="button" onClick={() => setImportModalOpen(false)}>
                Fechar
              </button>
            </header>

            <div className="native-import-body">
              <p>
                Selecione um arquivo CSV no padrão da plataforma. Use o botão
                <strong> Modelo CSV</strong> para baixar a estrutura correta.
              </p>

              <label className="native-file-input">
                <input
                  type="file"
                  accept=".csv,text/csv"
                  onChange={(event) => setCsvFile(event.target.files?.[0] ?? null)}
                />
              </label>

              <p className="native-file-name">
                {csvFile ? `Arquivo: ${csvFile.name}` : 'Nenhum arquivo selecionado.'}
              </p>

              <div className="native-modal-actions">
                <button
                  type="button"
                  className="ghost"
                  onClick={() => setImportModalOpen(false)}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => {
                    void submitCsvImport();
                  }}
                  disabled={!csvFile || importing}
                >
                  {importing ? 'Importando...' : 'Importar arquivo'}
                </button>
              </div>
            </div>
          </section>
        </div>
      ) : null}
    </section>
  );
}
