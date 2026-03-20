(() => {
  const TOKEN_KEY = 'academy-auth-token';
  const USER_KEY = 'academy-auth-user';
  const API_BASE_URL = '/api';
  const agendaNavigationTargets = {
    primary: 'admin_gestao_turmas',
    secondary: 'admin_agenda',
  };

  const setText = (id, value) => {
    const element = document.getElementById(id);
    if (element) {
      element.textContent = value;
    }
  };

  const setHtml = (id, value) => {
    const element = document.getElementById(id);
    if (element) {
      element.innerHTML = value;
    }
  };

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value || 0);
  };

  const formatDateTime = (iso) => {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return 'Sem hor?rio definido';

    return new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  };

  const parseDate = (iso) => {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return null;
    return date;
  };

  const normalizeClassStatus = (status) => {
    const statusMap = {
      PLANNING: 'Planejamento',
      ENROLLMENTS_OPEN: 'Matr?culas abertas',
      IN_PROGRESS: 'Em andamento',
      CLOSED: 'Encerrada',
    };

    return statusMap[status] || status;
  };

  const applyUserIdentity = () => {
    const rawUser = window.sessionStorage.getItem(USER_KEY);
    if (!rawUser) return;

    try {
      const user = JSON.parse(rawUser);
      const fullName = (user?.name || 'Professor(a)').trim();
      const firstName = fullName.split(' ')[0] || 'Professor(a)';

      setText('welcome-title', `Bom dia, ${firstName}`);
      setText('profile-name', fullName);
      setText('profile-role', user?.role === 'superadmin' ? 'Superadmin' : 'Administrador');
    } catch {
      // Ignora erro de parse da sess?o.
    }
  };

  const fetchJson = async (path) => {
    const token = window.sessionStorage.getItem(TOKEN_KEY);
    if (!token) {
      throw new Error('Token de autentica??o n?o encontrado.');
    }

    const response = await fetch(`${API_BASE_URL}${path}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Falha ao carregar ${path}`);
    }

    return response.json();
  };

  const renderAgendaCard = (prefix, item) => {
    setText(`${prefix}-badge`, item.badge);
    setText(`${prefix}-time`, item.time);
    setText(`${prefix}-title`, item.title);
    setText(`${prefix}-subtitle`, item.subtitle);
    setText(`${prefix}-action-label`, item.actionLabel);
  };

  const setAgendaTarget = (key, section) => {
    agendaNavigationTargets[key] = section;
  };

  const navigateToSection = (targetKey) => {
    const section = agendaNavigationTargets[targetKey];
    if (!section || window.parent === window) return;

    const shouldOpenDataPanel =
      section === 'admin_gestao_turmas' || section === 'admin_financeiro';

    window.parent.postMessage(
      {
        type: 'academy:navigate',
        section,
        openDataPanel: shouldOpenDataPanel,
      },
      '*',
    );
  };

  const wireAgendaButtons = () => {
    const goToAgenda = (event) => {
      event.preventDefault();
      window.parent?.postMessage(
        { type: 'academy:navigate', section: 'admin_agenda', openDataPanel: false },
        '*',
      );
    };

    const agendaTriggers = [
      document.getElementById('dashboard-go-agenda'),
      document.getElementById('dashboard-go-agenda-inline'),
      ...Array.from(document.querySelectorAll('[data-go=\"agenda\"]')),
    ].filter(Boolean);

    agendaTriggers.forEach((element) => {
      element.addEventListener('click', goToAgenda);
    });

    const primaryButton = document.getElementById('agenda-primary-action');
    if (primaryButton) {
      primaryButton.addEventListener('click', (event) => {
        event.preventDefault();
        navigateToSection('primary');
      });
    }

    const secondaryButton = document.getElementById('agenda-secondary-action');
    if (secondaryButton) {
      secondaryButton.addEventListener('click', (event) => {
        event.preventDefault();
        navigateToSection('secondary');
      });
    }
  };

  const renderPendingOperations = (operations) => {
    const urgentCount = operations.filter((item) => item.urgent).length;
    setText('pending-urgent-badge', `${urgentCount} urgente(s)`);

    const escapeHtml = (text) => {
      return String(text)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
    };

    const html = operations
      .map((item) => {
        const iconClass = item.urgent
          ? 'text-error group-hover:border-error'
          : 'text-zinc-400 group-hover:border-primary group-hover:text-primary';

        return `
          <div class="bg-surface-container-lowest p-4 rounded-xl flex items-center justify-between group hover:bg-zinc-50 transition-colors">
            <div class="flex items-center gap-4">
              <div class="w-10 h-10 rounded-full border-2 border-zinc-100 flex items-center justify-center ${iconClass} transition-all">
                <span class="material-symbols-outlined">${item.icon}</span>
              </div>
              <div>
                <h5 class="font-body text-sm font-bold text-zinc-900">${escapeHtml(item.title)}</h5>
                <p class="text-xs text-on-surface-variant mt-0.5">${escapeHtml(item.subtitle)}</p>
              </div>
            </div>
            <button class="text-zinc-400 hover:text-zinc-900">
              <span class="material-symbols-outlined">more_vert</span>
            </button>
          </div>
        `;
      })
      .join('');

    setHtml(
      'pending-operations-list',
      html ||
        `
        <div class="bg-surface-container-lowest p-4 rounded-xl">
          <p class="text-sm font-semibold text-zinc-800">Nenhuma pend?ncia cr?tica no momento.</p>
        </div>
      `,
    );
  };

  const loadDashboard = async () => {
    try {
      const [students, classes, enrollments, overview, charges] = await Promise.all([
        fetchJson('/students'),
        fetchJson('/classes'),
        fetchJson('/enrollments'),
        fetchJson('/finance/overview'),
        fetchJson('/finance/charges'),
      ]);

      const activeEnrollments = enrollments.filter((item) => item.status === 'ACTIVE').length;
      const openClasses = classes.filter((item) => item.status !== 'CLOSED').length;
      const totalSeats = classes.reduce((acc, item) => acc + Number(item.totalSeats || 0), 0);
      const occupiedSeats = classes.reduce((acc, item) => acc + Number(item.occupiedSeats || 0), 0);
      const occupancyRate = totalSeats > 0 ? (occupiedSeats / totalSeats) * 100 : 0;

      const pendingChargesCount = Number(overview?.pendingCharges || 0) + Number(overview?.overdueCharges || 0);
      const pendingAmount = charges
        .filter((item) => item.status === 'PENDING' || item.status === 'OVERDUE')
        .reduce((acc, item) => acc + Number(item.amount || 0), 0);

      setText('kpi-students-value', String(students.length));
      setText('kpi-students-trend-value', `${activeEnrollments} matr?cula(s) ativa(s)`);
      setText('kpi-students-note', 'base de alunos cadastrados');

      setText('kpi-classes-value', String(openClasses));
      setText(
        'kpi-classes-trend',
        classes.some((item) => item.status === 'IN_PROGRESS')
          ? 'H? turmas em andamento'
          : 'Sem turmas em andamento',
      );
      setText('kpi-classes-note', `${classes.length} turma(s) no total`);

      setText('kpi-occupancy-value', `${occupancyRate.toFixed(1)}%`);
      setText('kpi-occupancy-trend-value', `${occupiedSeats}/${totalSeats} vagas`);
      setText('kpi-occupancy-note', 'ocupa??o m?dia atual');

      setText('kpi-finance-value', formatCurrency(pendingAmount));
      setText('kpi-finance-trend-value', `${pendingChargesCount} pend?ncia(s)`);
      setText('kpi-finance-note', 'mensalidades pendentes e atrasadas');

      const upcomingClasses = classes
        .map((item) => ({ ...item, startAt: parseDate(item.startDate) }))
        .filter((item) => item.startAt)
        .sort((a, b) => a.startAt - b.startAt);

      const pendingCharges = charges
        .filter((item) => item.status === 'PENDING' || item.status === 'OVERDUE')
        .map((item) => ({ ...item, dueAt: parseDate(item.dueDate) }))
        .filter((item) => item.dueAt)
        .sort((a, b) => a.dueAt - b.dueAt);

      const firstClass = upcomingClasses[0] || null;
      const secondClass = upcomingClasses[1] || null;
      const firstPendingCharge = pendingCharges[0] || null;

      if (firstClass) {
        renderAgendaCard('agenda-primary', {
          badge: firstClass.status === 'IN_PROGRESS' ? 'Turma em andamento' : 'Pr?xima turma',
          time: formatDateTime(firstClass.startDate),
          title: firstClass.name,
          subtitle: `${firstClass.course?.name || 'Curso'} " ${normalizeClassStatus(firstClass.status)}`,
          actionLabel: 'Abrir turma',
        });
        setAgendaTarget('primary', 'admin_gestao_turmas');
      }

      if (secondClass) {
        renderAgendaCard('agenda-secondary', {
          badge: 'Pr?xima turma',
          time: formatDateTime(secondClass.startDate),
          title: secondClass.name,
          subtitle: `${secondClass.course?.name || 'Curso'} " ${normalizeClassStatus(secondClass.status)}`,
          actionLabel: 'Ver detalhes',
        });
        setAgendaTarget('secondary', 'admin_agenda');
      } else if (firstPendingCharge) {
        renderAgendaCard('agenda-secondary', {
          badge: 'Financeiro',
          time: `Vence em ${formatDateTime(firstPendingCharge.dueDate)}`,
          title: `Cobran?a de ${firstPendingCharge.enrollment?.student?.name || 'aluno'}`,
          subtitle: `${firstPendingCharge.enrollment?.schoolClass?.name || 'Turma'} " ${formatCurrency(firstPendingCharge.amount)}`,
          actionLabel: 'Abrir financeiro',
        });
        setAgendaTarget('secondary', 'admin_financeiro');
      } else {
        setAgendaTarget('secondary', 'admin_agenda');
      }

      const now = new Date();
      const sameDay = (date) => {
        return (
          date.getDate() === now.getDate() &&
          date.getMonth() === now.getMonth() &&
          date.getFullYear() === now.getFullYear()
        );
      };

      const classesToday = upcomingClasses.filter((item) => item.startAt && sameDay(item.startAt)).length;
      const planningClasses = classes.filter((item) => item.status === 'PLANNING').length;

      const operations = [];

      if (classesToday > 0) {
        operations.push({
          title: `Preparar ${classesToday} aula(s) de hoje`,
          subtitle: 'Confirme presen?a, materiais e comunica??o da turma.',
          icon: 'calendar_today',
          urgent: true,
        });
      }

      if (pendingChargesCount > 0) {
        operations.push({
          title: 'Revisar inadimpl?ncia',
          subtitle: `${pendingChargesCount} cobran?a(s) pendente(s) somando ${formatCurrency(pendingAmount)}.`,
          icon: 'payments',
          urgent: true,
        });
      }

      if (planningClasses > 0) {
        operations.push({
          title: 'Publicar turmas em planejamento',
          subtitle: `${planningClasses} turma(s) aguardando abertura de matr?culas.`,
          icon: 'school',
          urgent: false,
        });
      }

      if (operations.length === 0) {
        operations.push({
          title: 'Opera??o est?vel',
          subtitle: 'Nenhuma pend?ncia cr?tica identificada neste momento.',
          icon: 'check_circle',
          urgent: false,
        });
      }

      renderPendingOperations(operations);
    } catch (error) {
      console.error('[dashboard] erro ao carregar dados reais:', error);
    }
  };

  const init = () => {
    wireAgendaButtons();
    applyUserIdentity();
    loadDashboard();
    window.setInterval(loadDashboard, 60000);
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
