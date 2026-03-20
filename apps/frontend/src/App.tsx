import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';

type Role = 'user' | 'admin' | 'superadmin';
type AuthUser = { id: string; name: string; email: string; role: Role };
type AuthResponse = { accessToken: string; user: AuthUser };
type NavSection = {
  id: string;
  label: string;
  subtitle: string;
  templatePath: string;
};

type Course = { id: string; name: string };
type SchoolClass = {
  id: string;
  name: string;
  totalSeats: number;
  occupiedSeats: number;
  status: string;
  startDate: string;
  course: Course;
};
type Student = { id: string; name: string; email: string };
type Enrollment = {
  id: string;
  status: string;
  student: Student;
  schoolClass: { id: string; name: string; course: Course };
};
type Charge = {
  id: string;
  amount: number;
  dueDate: string;
  status: string;
  enrollment: Enrollment;
};
type FinanceOverview = {
  totalCharges: number;
  pendingCharges: number;
  paidCharges: number;
  overdueCharges: number;
};
type NavigateMessage = {
  type: 'academy:navigate';
  section: string;
  openDataPanel?: boolean;
};

const SESSION_TOKEN_KEY = 'academy-auth-token';
const SESSION_USER_KEY = 'academy-auth-user';
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '/api';

const SECOES_SUPERADMIN: NavSection[] = [
  {
    id: 'superadmin_dashboard_global',
    label: 'Dashboard Global',
    subtitle: 'Template fiel: superadmin_dashboard_global',
    templatePath: '/templates/superadmin_dashboard_global/index.html',
  },
  {
    id: 'superadmin_gestao_contas',
    label: 'Gestão de Contas',
    subtitle: 'Template fiel: superadmin_gestao_de_contas',
    templatePath: '/templates/superadmin_gestao_de_contas/index.html',
  },
  {
    id: 'superadmin_impersonacao',
    label: 'Impersonação',
    subtitle: 'Template fiel: superadmin_tela_de_impersonacao',
    templatePath: '/templates/superadmin_tela_de_impersonacao/index.html',
  },
];

const SECOES_ADMIN: NavSection[] = [
  {
    id: 'admin_dashboard_conta',
    label: 'Dashboard da Conta',
    subtitle: 'Template fiel: admin_professor_dashboard_da_conta',
    templatePath: '/templates/admin_professor_dashboard_da_conta/index.html',
  },
  {
    id: 'admin_gestao_turmas',
    label: 'Gestão de Turmas',
    subtitle: 'Template fiel: admin_professor_gestao_de_turmas',
    templatePath: '/templates/admin_professor_gestao_de_turmas/index.html',
  },
  {
    id: 'admin_alunos_matriculas',
    label: 'Alunos e Matrículas',
    subtitle: 'Template fiel: admin_professor_alunos_e_matriculas',
    templatePath: '/templates/admin_professor_alunos_e_matriculas/index.html',
  },
  {
    id: 'admin_agenda',
    label: 'Agenda',
    subtitle: 'Template fiel: admin_professor_agenda_de_aulas_e_lives',
    templatePath: '/templates/admin_professor_agenda_de_aulas_e_lives/index.html',
  },
  {
    id: 'admin_financeiro',
    label: 'Financeiro',
    subtitle: 'Template fiel: admin_professor_financeiro',
    templatePath: '/templates/admin_professor_financeiro/index.html',
  },
  {
    id: 'admin_conteudo',
    label: 'Conteúdo e Materiais',
    subtitle: 'Template fiel: admin_professor_conteudo_e_materiais',
    templatePath: '/templates/admin_professor_conteudo_e_materiais/index.html',
  },
  {
    id: 'admin_avisos',
    label: 'Avisos e Comunicação',
    subtitle: 'Template fiel: admin_professor_avisos_e_comunicacao',
    templatePath: '/templates/admin_professor_avisos_e_comunicacao/index.html',
  },
  {
    id: 'admin_relatorios',
    label: 'Relatórios e Análises',
    subtitle: 'Template fiel: admin_professor_relatorios_e_analises',
    templatePath: '/templates/admin_professor_relatorios_e_analises/index.html',
  },
  {
    id: 'admin_configuracoes',
    label: 'Configurações',
    subtitle: 'Template fiel: admin_professor_configuracoes',
    templatePath: '/templates/admin_professor_configuracoes/index.html',
  },
];

function formatarStatus(status: string) {
  return status.toLowerCase().replaceAll('_', ' ');
}

function formatarData(dataIso: string) {
  return new Date(dataIso).toLocaleDateString('pt-BR');
}

function formatarMoeda(valor: number) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(valor);
}

export default function App() {
  const [modoCadastro, setModoCadastro] = useState(false);
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [confirmacaoSenha, setConfirmacaoSenha] = useState('');
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(false);

  const [token, setToken] = useState(
    () => window.sessionStorage.getItem(SESSION_TOKEN_KEY) ?? '',
  );
  const [usuario, setUsuario] = useState<AuthUser | null>(() => {
    const saved = window.sessionStorage.getItem(SESSION_USER_KEY);
    if (!saved) return null;
    try {
      return JSON.parse(saved) as AuthUser;
    } catch {
      return null;
    }
  });

  const [secaoAtiva, setSecaoAtiva] = useState('');
  const [mostrarPainelDados, setMostrarPainelDados] = useState(false);

  const [adminErro, setAdminErro] = useState('');
  const [adminCarregando, setAdminCarregando] = useState(false);

  const [courses, setCourses] = useState<Course[]>([]);
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [charges, setCharges] = useState<Charge[]>([]);
  const [overview, setOverview] = useState<FinanceOverview | null>(null);

  const [courseName, setCourseName] = useState('');
  const [className, setClassName] = useState('');
  const [classCourseId, setClassCourseId] = useState('');
  const [classSeats, setClassSeats] = useState(30);
  const [classStartDate, setClassStartDate] = useState('');
  const [studentName, setStudentName] = useState('');
  const [studentEmail, setStudentEmail] = useState('');
  const [enrollmentClassId, setEnrollmentClassId] = useState('');
  const [enrollmentStudentId, setEnrollmentStudentId] = useState('');
  const [chargeEnrollmentId, setChargeEnrollmentId] = useState('');
  const [chargeAmount, setChargeAmount] = useState(0);
  const [chargeDueDate, setChargeDueDate] = useState('');

  const autenticado = Boolean(token && usuario);
  const secoes = usuario?.role === 'superadmin' ? SECOES_SUPERADMIN : SECOES_ADMIN;
  const secaoAtual = secoes.find((item) => item.id === secaoAtiva) ?? secoes[0];
  const perfil = usuario?.role === 'superadmin' ? 'Superadmin' : 'Admin/Professor';

  useEffect(() => {
    if (!autenticado || secoes.length === 0) return;
    if (!secoes.some((item) => item.id === secaoAtiva)) {
      setSecaoAtiva(secoes[0].id);
    }
  }, [autenticado, secoes, secaoAtiva]);

  useEffect(() => {
    if (!autenticado) return;

    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;

      const data = event.data as Partial<NavigateMessage>;
      if (data?.type !== 'academy:navigate' || typeof data.section !== 'string') {
        return;
      }

      if (!secoes.some((item) => item.id === data.section)) return;

      setSecaoAtiva(data.section);

      if (usuario?.role !== 'superadmin') {
        if (data.openDataPanel === true) setMostrarPainelDados(true);
        if (data.openDataPanel === false) setMostrarPainelDados(false);
      }
    };

    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [autenticado, secoes, usuario?.role]);

  const lerErroApi = async (response: Response) => {
    try {
      const data = (await response.json()) as { message?: string | string[] };
      if (Array.isArray(data.message)) return data.message.join(' ');
      if (typeof data.message === 'string') return data.message;
    } catch {
      return 'Falha na operação.';
    }
    return 'Falha na operação.';
  };

  const apiRequest = async <T,>(path: string, init?: RequestInit): Promise<T> => {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(init?.headers ?? {}),
      },
    });

    if (!response.ok) {
      throw new Error(await lerErroApi(response));
    }

    return (await response.json()) as T;
  };

  const carregarDadosAdmin = async () => {
    if (!usuario || usuario.role === 'superadmin' || !token) return;

    setAdminCarregando(true);
    setAdminErro('');

    try {
      const [coursesData, classesData, studentsData, enrollmentsData, chargesData, overviewData] =
        await Promise.all([
          apiRequest<Course[]>('/courses'),
          apiRequest<SchoolClass[]>('/classes'),
          apiRequest<Student[]>('/students'),
          apiRequest<Enrollment[]>('/enrollments'),
          apiRequest<Charge[]>('/finance/charges'),
          apiRequest<FinanceOverview>('/finance/overview'),
        ]);

      setCourses(coursesData);
      setClasses(classesData);
      setStudents(studentsData);
      setEnrollments(enrollmentsData);
      setCharges(chargesData);
      setOverview(overviewData);

      if (!classCourseId && coursesData[0]) setClassCourseId(coursesData[0].id);
      if (!enrollmentClassId && classesData[0]) setEnrollmentClassId(classesData[0].id);
      if (!enrollmentStudentId && studentsData[0]) setEnrollmentStudentId(studentsData[0].id);
      if (!chargeEnrollmentId && enrollmentsData[0]) setChargeEnrollmentId(enrollmentsData[0].id);
    } catch (error) {
      setAdminErro(error instanceof Error ? error.message : 'Falha ao carregar dados administrativos.');
    } finally {
      setAdminCarregando(false);
    }
  };

  useEffect(() => {
    void carregarDadosAdmin();
  }, [autenticado, token, usuario?.id, usuario?.role]);

  const persistirSessao = (auth: AuthResponse) => {
    window.sessionStorage.setItem(SESSION_TOKEN_KEY, auth.accessToken);
    window.sessionStorage.setItem(SESSION_USER_KEY, JSON.stringify(auth.user));
    setToken(auth.accessToken);
    setUsuario(auth.user);
  };

  const entrar = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErro('');

    if (!email || !senha) {
      setErro('Informe e-mail e senha para acessar.');
      return;
    }

    setCarregando(true);

    try {
      const response = await fetch(`${API_BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: senha }),
      });

      if (!response.ok) {
        setErro(await lerErroApi(response));
        return;
      }

      persistirSessao((await response.json()) as AuthResponse);
    } catch {
      setErro('Não foi possível conectar com o backend.');
    } finally {
      setCarregando(false);
    }
  };

  const cadastrar = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErro('');

    if (!nome || !email || !senha || !confirmacaoSenha) {
      setErro('Preencha todos os campos para cadastrar.');
      return;
    }

    if (senha !== confirmacaoSenha) {
      setErro('A confirmação de senha não confere.');
      return;
    }

    setCarregando(true);

    try {
      const response = await fetch(`${API_BASE_URL}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: nome, email, password: senha }),
      });

      if (!response.ok) {
        setErro(await lerErroApi(response));
        return;
      }

      persistirSessao((await response.json()) as AuthResponse);
      setModoCadastro(false);
      setConfirmacaoSenha('');
      setSenha('');
    } catch {
      setErro('Não foi possível conectar com o backend.');
    } finally {
      setCarregando(false);
    }
  };

  const sair = () => {
    window.sessionStorage.removeItem(SESSION_TOKEN_KEY);
    window.sessionStorage.removeItem(SESSION_USER_KEY);
    setToken('');
    setUsuario(null);
    setSecaoAtiva('');
    setMostrarPainelDados(false);
  };

  const criarCurso = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!courseName.trim()) return;

    setAdminErro('');
    try {
      await apiRequest('/courses', {
        method: 'POST',
        body: JSON.stringify({ name: courseName }),
      });
      setCourseName('');
      await carregarDadosAdmin();
    } catch (error) {
      setAdminErro(error instanceof Error ? error.message : 'Erro ao criar curso.');
    }
  };

  const criarTurma = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!className || !classCourseId || !classStartDate) return;

    setAdminErro('');
    try {
      await apiRequest('/classes', {
        method: 'POST',
        body: JSON.stringify({
          name: className,
          courseId: classCourseId,
          totalSeats: classSeats,
          startDate: `${classStartDate}T00:00:00.000Z`,
        }),
      });
      setClassName('');
      setClassStartDate('');
      await carregarDadosAdmin();
    } catch (error) {
      setAdminErro(error instanceof Error ? error.message : 'Erro ao criar turma.');
    }
  };

  const atualizarStatusTurma = async (id: string, status: string) => {
    setAdminErro('');

    try {
      await apiRequest(`/classes/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      await carregarDadosAdmin();
    } catch (error) {
      setAdminErro(error instanceof Error ? error.message : 'Erro ao atualizar status da turma.');
    }
  };

  const criarAluno = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!studentName || !studentEmail) return;

    setAdminErro('');
    try {
      await apiRequest('/students', {
        method: 'POST',
        body: JSON.stringify({ name: studentName, email: studentEmail }),
      });
      setStudentName('');
      setStudentEmail('');
      await carregarDadosAdmin();
    } catch (error) {
      setAdminErro(error instanceof Error ? error.message : 'Erro ao criar aluno.');
    }
  };

  const criarMatricula = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!enrollmentClassId || !enrollmentStudentId) return;

    setAdminErro('');
    try {
      await apiRequest('/enrollments', {
        method: 'POST',
        body: JSON.stringify({ classId: enrollmentClassId, studentId: enrollmentStudentId }),
      });
      await carregarDadosAdmin();
    } catch (error) {
      setAdminErro(error instanceof Error ? error.message : 'Erro ao criar matrícula.');
    }
  };

  const criarCobranca = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!chargeEnrollmentId || !chargeDueDate || chargeAmount <= 0) return;

    setAdminErro('');
    try {
      await apiRequest('/finance/charges', {
        method: 'POST',
        body: JSON.stringify({
          enrollmentId: chargeEnrollmentId,
          amount: chargeAmount,
          dueDate: `${chargeDueDate}T00:00:00.000Z`,
        }),
      });
      setChargeAmount(0);
      setChargeDueDate('');
      await carregarDadosAdmin();
    } catch (error) {
      setAdminErro(error instanceof Error ? error.message : 'Erro ao criar cobrança.');
    }
  };

  const registrarPagamento = async (charge: Charge) => {
    setAdminErro('');

    try {
      await apiRequest('/finance/transactions', {
        method: 'POST',
        body: JSON.stringify({
          monthlyChargeId: charge.id,
          amount: charge.amount,
          status: 'success',
          provider: 'manual',
        }),
      });
      await carregarDadosAdmin();
    } catch (error) {
      setAdminErro(error instanceof Error ? error.message : 'Erro ao registrar pagamento.');
    }
  };

  const renderPainelOperacional = () => {
    if (!mostrarPainelDados || !usuario || usuario.role === 'superadmin') return null;

    return (
      <aside className="ops-drawer">
        <header className="ops-header">
          <strong>Painel de dados (integração real)</strong>
          <button type="button" onClick={() => setMostrarPainelDados(false)}>
            Fechar
          </button>
        </header>

        {adminErro ? <div className="auth-error">{adminErro}</div> : null}
        {adminCarregando ? <div className="panel">Carregando dados...</div> : null}

        {secaoAtiva === 'admin_gestao_turmas' ? (
          <>
            <section className="panel">
              <h2>Cursos e turmas</h2>
              <form className="auth-form" onSubmit={criarCurso}>
                <input
                  value={courseName}
                  onChange={(event) => setCourseName(event.target.value)}
                  placeholder="Nome do curso"
                />
                <button type="submit" disabled={adminCarregando}>
                  Criar curso
                </button>
              </form>
              <form className="auth-form" onSubmit={criarTurma}>
                <input
                  value={className}
                  onChange={(event) => setClassName(event.target.value)}
                  placeholder="Nome da turma"
                />
                <select
                  value={classCourseId}
                  onChange={(event) => setClassCourseId(event.target.value)}
                >
                  <option value="">Selecione um curso</option>
                  {courses.map((course) => (
                    <option key={course.id} value={course.id}>
                      {course.name}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  min={1}
                  value={classSeats}
                  onChange={(event) => setClassSeats(Number(event.target.value))}
                />
                <input
                  type="date"
                  value={classStartDate}
                  onChange={(event) => setClassStartDate(event.target.value)}
                />
                <button type="submit" disabled={adminCarregando}>
                  Criar turma
                </button>
              </form>
            </section>

            <section className="panel">
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Turma</th>
                      <th>Curso</th>
                      <th>Vagas</th>
                      <th>Status</th>
                      <th>Início</th>
                      <th>Ação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {classes.map((item) => (
                      <tr key={item.id}>
                        <td>{item.name}</td>
                        <td>{item.course.name}</td>
                        <td>
                          {item.occupiedSeats}/{item.totalSeats}
                        </td>
                        <td>{formatarStatus(item.status)}</td>
                        <td>{formatarData(item.startDate)}</td>
                        <td>
                          <select
                            value={item.status.toLowerCase()}
                            onChange={(event) =>
                              void atualizarStatusTurma(item.id, event.target.value)
                            }
                          >
                            <option value="planning">planning</option>
                            <option value="enrollments_open">enrollments_open</option>
                            <option value="in_progress">in_progress</option>
                            <option value="closed">closed</option>
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        ) : null}

        {secaoAtiva === 'admin_alunos_matriculas' ? (
          <>
            <section className="panel">
              <h2>Alunos e matrículas</h2>
              <form className="auth-form" onSubmit={criarAluno}>
                <input
                  value={studentName}
                  onChange={(event) => setStudentName(event.target.value)}
                  placeholder="Nome do aluno"
                />
                <input
                  value={studentEmail}
                  onChange={(event) => setStudentEmail(event.target.value)}
                  placeholder="E-mail do aluno"
                />
                <button type="submit" disabled={adminCarregando}>
                  Cadastrar aluno
                </button>
              </form>
              <form className="auth-form" onSubmit={criarMatricula}>
                <select
                  value={enrollmentClassId}
                  onChange={(event) => setEnrollmentClassId(event.target.value)}
                >
                  <option value="">Selecione a turma</option>
                  {classes.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
                <select
                  value={enrollmentStudentId}
                  onChange={(event) => setEnrollmentStudentId(event.target.value)}
                >
                  <option value="">Selecione o aluno</option>
                  {students.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
                <button type="submit" disabled={adminCarregando}>
                  Registrar matrícula
                </button>
              </form>
            </section>

            <section className="panel">
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Aluno</th>
                      <th>E-mail</th>
                      <th>Turma</th>
                      <th>Curso</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {enrollments.map((item) => (
                      <tr key={item.id}>
                        <td>{item.student.name}</td>
                        <td>{item.student.email}</td>
                        <td>{item.schoolClass.name}</td>
                        <td>{item.schoolClass.course.name}</td>
                        <td>{formatarStatus(item.status)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        ) : null}

        {secaoAtiva === 'admin_financeiro' ? (
          <>
            <section className="kpi-grid">
              <article className="card">
                <p>Total de cobranças</p>
                <strong>{overview?.totalCharges ?? 0}</strong>
                <span>Pendentes: {overview?.pendingCharges ?? 0}</span>
              </article>
              <article className="card">
                <p>Cobranças pagas</p>
                <strong>{overview?.paidCharges ?? 0}</strong>
                <span>Atrasadas: {overview?.overdueCharges ?? 0}</span>
              </article>
            </section>

            <section className="panel">
              <h2>Cobranças</h2>
              <form className="auth-form" onSubmit={criarCobranca}>
                <select
                  value={chargeEnrollmentId}
                  onChange={(event) => setChargeEnrollmentId(event.target.value)}
                >
                  <option value="">Selecione a matrícula</option>
                  {enrollments.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.student.name} - {item.schoolClass.name}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={chargeAmount}
                  onChange={(event) => setChargeAmount(Number(event.target.value))}
                />
                <input
                  type="date"
                  value={chargeDueDate}
                  onChange={(event) => setChargeDueDate(event.target.value)}
                />
                <button type="submit" disabled={adminCarregando}>
                  Criar cobrança
                </button>
              </form>
            </section>

            <section className="panel">
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Aluno</th>
                      <th>Turma</th>
                      <th>Vencimento</th>
                      <th>Valor</th>
                      <th>Status</th>
                      <th>Ação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {charges.map((item) => (
                      <tr key={item.id}>
                        <td>{item.enrollment.student.name}</td>
                        <td>{item.enrollment.schoolClass.name}</td>
                        <td>{formatarData(item.dueDate)}</td>
                        <td>{formatarMoeda(item.amount)}</td>
                        <td>{formatarStatus(item.status)}</td>
                        <td>
                          <button
                            type="button"
                            onClick={() => void registrarPagamento(item)}
                            disabled={item.status === 'PAID' || adminCarregando}
                          >
                            Registrar pagamento
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        ) : null}

        {!['admin_gestao_turmas', 'admin_alunos_matriculas', 'admin_financeiro'].includes(
          secaoAtiva,
        ) ? (
          <section className="panel">
            <h2>Integração de dados</h2>
            <p>
              Nesta etapa, os módulos com integração ativa são: Gestão de Turmas, Alunos e
              Matrículas e Financeiro.
            </p>
          </section>
        ) : null}
      </aside>
    );
  };

  if (!autenticado) {
    return (
      <div className="auth-shell">
        <section className="auth-panel">
          <div className="brand auth-brand">
            <div className="brand-mark">7E</div>
            <div>
              <strong>7Eventos Academy</strong>
              <span>Acesso administrativo</span>
            </div>
          </div>

          <h1>Bem-vindo à plataforma Academy</h1>
          <p>
            Ambiente para gestão de contas, turmas, matrículas, financeiro e operação
            acadêmica.
          </p>
        </section>

        <section className="auth-card">
          <div className="auth-tabs">
            <button
              type="button"
              className={!modoCadastro ? 'active' : ''}
              onClick={() => {
                setErro('');
                setModoCadastro(false);
              }}
              disabled={carregando}
            >
              Entrar
            </button>
            <button
              type="button"
              className={modoCadastro ? 'active' : ''}
              onClick={() => {
                setErro('');
                setModoCadastro(true);
              }}
              disabled={carregando}
            >
              Cadastrar
            </button>
          </div>

          <h2>{modoCadastro ? 'Criar conta' : 'Entrar'}</h2>

          <form className="auth-form" onSubmit={modoCadastro ? cadastrar : entrar}>
            {modoCadastro ? (
              <>
                <label htmlFor="nome">Nome completo</label>
                <input
                  id="nome"
                  type="text"
                  value={nome}
                  onChange={(event) => setNome(event.target.value)}
                  disabled={carregando}
                />
              </>
            ) : null}

            <label htmlFor="email">E-mail</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              disabled={carregando}
            />

            <label htmlFor="senha">Senha</label>
            <input
              id="senha"
              type="password"
              value={senha}
              onChange={(event) => setSenha(event.target.value)}
              disabled={carregando}
            />

            {modoCadastro ? (
              <>
                <label htmlFor="confirmacaoSenha">Confirmar senha</label>
                <input
                  id="confirmacaoSenha"
                  type="password"
                  value={confirmacaoSenha}
                  onChange={(event) => setConfirmacaoSenha(event.target.value)}
                  disabled={carregando}
                />
              </>
            ) : null}

            {erro ? <div className="auth-error">{erro}</div> : null}

            <button type="submit" disabled={carregando}>
              {carregando
                ? 'Processando...'
                : modoCadastro
                  ? 'Cadastrar e continuar'
                  : 'Entrar na plataforma'}
            </button>
          </form>
        </section>
      </div>
    );
  }

  return (
    <div className="viewer-root">
      <iframe
        key={secaoAtual?.id}
        className="template-frame-full"
        src={secaoAtual?.templatePath}
        title={secaoAtual?.label ?? 'Template'}
      />

      <div className="viewer-overlay viewer-overlay-left">
        <strong>7Eventos Academy</strong>
        <small>
          {perfil} | {usuario?.name}
        </small>
        <select value={secaoAtiva} onChange={(event) => setSecaoAtiva(event.target.value)}>
          {secoes.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
            </option>
          ))}
        </select>
        <span className="viewer-subtitle">{secaoAtual?.subtitle}</span>
      </div>

      <div className="viewer-overlay viewer-overlay-right">
        {usuario?.role !== 'superadmin' ? (
          <button type="button" onClick={() => setMostrarPainelDados((current) => !current)}>
            {mostrarPainelDados ? 'Ocultar painel' : 'Painel de dados'}
          </button>
        ) : null}
        <button type="button" onClick={sair}>
          Sair
        </button>
      </div>

      {renderPainelOperacional()}
    </div>
  );
}
