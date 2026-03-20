(() => {
  const API_BASE_URL = '/api';
  const TOKEN_KEY = 'academy-auth-token';
  const FALLBACK_AVATAR =
    'https://lh3.googleusercontent.com/aida-public/AB6AXuBaWb3AowaZRTOaLmmhIxwaRoZzW7ORvNO9i6WRSYbLd2ty2RxM3lqGv-OUJI9rvhYpO3y2Vxo8AEBNLcEv218BWjSaxIke5Pw7b5GBnNzEHUNJPDCiUXo_KAXSw0rpf-nO1k_MxgnAMVtCjIAPLXEZ9CSZFwlzA6GbJHJTD4sM6aTxIk3k4rBUsz1SLehCFXgMQnI1d2ZaCxfXESVSduzOmshU0tssAX4_qjUK5xQ1PbXqlhrhEsi0Nc37g8HT7VG4omekKwHJcEsk';

  const tableBody = document.getElementById('students-table-body');
  const drawer = document.getElementById('student-drawer');
  const overlay = document.getElementById('student-drawer-overlay');
  const closeButton = document.getElementById('student-drawer-close');

  const drawerAvatar = document.getElementById('student-drawer-avatar');
  const drawerName = document.getElementById('student-drawer-name');
  const drawerRegistration = document.getElementById('student-drawer-registration');
  const avatarUploadTrigger = document.getElementById('student-avatar-upload-trigger');
  const avatarRemoveTrigger = document.getElementById('student-avatar-remove-trigger');
  const avatarFileInput = document.getElementById('student-avatar-file');

  let students = [];
  let selectedStudentId = null;

  const getToken = () => window.sessionStorage.getItem(TOKEN_KEY) || '';

  const request = async (path, options = {}) => {
    const token = getToken();
    const response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(options.headers || {}),
      },
    });

    if (!response.ok) {
      let message = `Erro ${response.status}`;
      try {
        const data = await response.json();
        if (typeof data?.message === 'string') {
          message = data.message;
        }
      } catch {
        // ignore
      }
      throw new Error(message);
    }

    return response.json();
  };

  const registrationCode = (id) => `#AC-${id.replace(/-/g, '').slice(0, 8).toUpperCase()}`;

  const openDrawer = () => {
    drawer?.classList.remove('translate-x-full');
    overlay?.classList.remove('opacity-0', 'pointer-events-none');
  };

  const closeDrawer = () => {
    drawer?.classList.add('translate-x-full');
    overlay?.classList.add('opacity-0', 'pointer-events-none');
  };

  const selectStudent = (studentId) => {
    selectedStudentId = studentId;
    const student = students.find((item) => item.id === studentId);
    if (!student) return;

    if (drawerAvatar) {
      drawerAvatar.src = student.avatarUrl || FALLBACK_AVATAR;
    }
    if (drawerName) {
      drawerName.textContent = student.name;
    }
    if (drawerRegistration) {
      drawerRegistration.textContent = `Matrícula ${registrationCode(student.id)}`;
    }

    openDrawer();
  };

  const renderRows = () => {
    if (!tableBody) return;

    tableBody.innerHTML = students
      .map((student) => {
        const attendance = 80;
        return `
          <tr class="js-open-student hover:bg-surface-container-low/30 transition-colors cursor-pointer group" data-student-id="${student.id}">
            <td class="px-6 py-5">
              <div class="flex items-center gap-3">
                <img class="w-10 h-10 rounded-full object-cover" data-alt="Foto do aluno" src="${student.avatarUrl || FALLBACK_AVATAR}"/>
                <div>
                  <p class="text-sm font-bold text-on-surface group-hover:text-primary transition-colors">${student.name}</p>
                  <p class="text-[11px] text-outline font-medium">${student.email}</p>
                </div>
              </div>
            </td>
            <td class="px-6 py-5 text-sm font-mono text-outline">${registrationCode(student.id)}</td>
            <td class="px-6 py-5">
              <p class="text-sm font-semibold text-on-surface">Curso não vinculado</p>
              <p class="text-[11px] text-outline font-medium">Sem turma ativa</p>
            </td>
            <td class="px-6 py-5">
              <div class="flex flex-col items-center gap-1">
                <div class="w-20 h-1.5 bg-outline-variant/20 rounded-full overflow-hidden">
                  <div class="h-full bg-primary-container" style="width:${attendance}%"></div>
                </div>
                <span class="text-[10px] font-bold text-on-surface">${attendance}%</span>
              </div>
            </td>
            <td class="px-6 py-5">
              <span class="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold uppercase bg-emerald-100 text-emerald-700">Adimplente</span>
            </td>
            <td class="px-6 py-5">
              <span class="flex items-center gap-1.5 text-xs font-bold text-emerald-600">
                <span class="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> Ativo
              </span>
            </td>
            <td class="px-6 py-5 text-right">
              <button class="p-2 text-outline hover:text-primary transition-colors" type="button">
                <span class="material-symbols-outlined" data-icon="chevron_right">chevron_right</span>
              </button>
            </td>
          </tr>
        `;
      })
      .join('');

    tableBody.querySelectorAll('[data-student-id]').forEach((row) => {
      row.addEventListener('click', () => {
        const studentId = row.getAttribute('data-student-id');
        if (!studentId) return;
        selectStudent(studentId);
      });
    });
  };

  const loadStudents = async () => {
    students = await request('/students');
    renderRows();

    if (selectedStudentId) {
      const updated = students.find((item) => item.id === selectedStudentId);
      if (updated) {
        selectStudent(updated.id);
      }
    }
  };

  const uploadSelectedStudentAvatar = async (file) => {
    if (!selectedStudentId) return;

    const token = getToken();
    const formData = new FormData();
    formData.append('avatar', file);

    const response = await fetch(`${API_BASE_URL}/students/${selectedStudentId}/avatar`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: formData,
    });

    if (!response.ok) {
      throw new Error('Falha ao enviar foto do aluno.');
    }

    await loadStudents();
  };

  const removeSelectedStudentAvatar = async () => {
    if (!selectedStudentId) return;

    await request(`/students/${selectedStudentId}/avatar`, { method: 'DELETE' });
    await loadStudents();
  };

  const bindEvents = () => {
    closeButton?.addEventListener('click', closeDrawer);
    overlay?.addEventListener('click', closeDrawer);

    window.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') closeDrawer();
    });

    avatarUploadTrigger?.addEventListener('click', () => avatarFileInput?.click());

    avatarFileInput?.addEventListener('change', async (event) => {
      const file = event.target.files?.[0];
      if (!file) return;

      try {
        await uploadSelectedStudentAvatar(file);
      } catch (error) {
        alert(error instanceof Error ? error.message : 'Erro ao subir foto.');
      } finally {
        event.target.value = '';
      }
    });

    avatarRemoveTrigger?.addEventListener('click', async () => {
      try {
        await removeSelectedStudentAvatar();
      } catch (error) {
        alert(error instanceof Error ? error.message : 'Erro ao remover foto.');
      }
    });
  };

  const init = async () => {
    bindEvents();

    try {
      await loadStudents();
    } catch (error) {
      if (tableBody) {
        tableBody.innerHTML = `
          <tr>
            <td colspan="7" class="px-6 py-6 text-sm font-semibold text-red-700">
              Não foi possível carregar os alunos.
            </td>
          </tr>
        `;
      }
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
