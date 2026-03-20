(() => {
  const API_BASE_URL = '/api';
  const TOKEN_KEY = 'academy-auth-token';
  const FALLBACK_AVATAR =
    'https://lh3.googleusercontent.com/aida-public/AB6AXuBaWb3AowaZRTOaLmmhIxwaRoZzW7ORvNO9i6WRSYbLd2ty2RxM3lqGv-OUJI9rvhYpO3y2Vxo8AEBNLcEv218BWjSaxIke5Pw7b5GBnNzEHUNJPDCiUXo_KAXSw0rpf-nO1k_MxgnAMVtCjIAPLXEZ9CSZFwlzA6GbJHJTD4sM6aTxIk3k4rBUsz1SLehCFXgMQnI1d2ZaCxfXESVSduzOmshU0tssAX4_qjUK5xQ1PbXqlhrhEsi0Nc37g8HT7VG4omekKwHJcEsk';

  const tableBody = document.getElementById('students-table-body');
  const drawer = document.getElementById('student-drawer');
  const overlay = document.getElementById('student-drawer-overlay');
  const closeButton = document.getElementById('student-drawer-close');
  const footerCounter = document.querySelector('p.text-xs.text-outline.font-medium');

  const drawerAvatar = document.getElementById('student-drawer-avatar');
  const drawerName = document.getElementById('student-drawer-name');
  const drawerRegistration = document.getElementById('student-drawer-registration');
  const avatarUploadTrigger = document.getElementById('student-avatar-upload-trigger');
  const avatarRemoveTrigger = document.getElementById('student-avatar-remove-trigger');
  const avatarFileInput = document.getElementById('student-avatar-file');

  const importCsvTrigger = document.getElementById('students-import-csv-trigger');
  const importCsvInput = document.getElementById('students-import-csv-input');
  const importCsvModal = document.getElementById('students-import-csv-modal');
  const importCsvOverlay = document.getElementById('students-import-csv-overlay');
  const importCsvClose = document.getElementById('students-import-csv-close');
  const importCsvSelectFile = document.getElementById('students-import-csv-select-file');
  const importCsvFileName = document.getElementById('students-import-csv-file-name');
  const importCsvSubmit = document.getElementById('students-import-csv-submit');
  const importCsvDownloadModel = document.getElementById('students-import-csv-download-model');

  const exportCsvTrigger = document.getElementById('students-export-csv-trigger');

  const manualCreateTopTrigger = document.getElementById('student-manual-create-top-trigger');
  const manualCreateModal = document.getElementById('student-manual-create-modal');
  const manualCreateOverlay = document.getElementById('student-manual-create-overlay');
  const manualCreateClose = document.getElementById('student-manual-create-close');
  const manualCreateCancel = document.getElementById('student-manual-create-cancel');
  const manualCreateForm = document.getElementById('student-manual-create-form');
  const manualCreateCoursesSelect = document.getElementById('manual-student-course-ids');

  let students = [];
  let selectedStudentId = null;
  let courses = [];
  let selectedCsvFile = null;

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
        if (Array.isArray(data?.message)) {
          message = data.message.join(', ');
        } else if (typeof data?.message === 'string') {
          message = data.message;
        }
      } catch {
        // ignora
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

  const openManualCreateModal = () => {
    manualCreateModal?.classList.remove('hidden');
    manualCreateModal?.classList.add('flex');
  };

  const closeManualCreateModal = () => {
    manualCreateModal?.classList.add('hidden');
    manualCreateModal?.classList.remove('flex');
    manualCreateForm?.reset();
  };

  const openImportCsvModal = () => {
    importCsvModal?.classList.remove('hidden');
    importCsvModal?.classList.add('flex');
  };

  const closeImportCsvModal = () => {
    importCsvModal?.classList.add('hidden');
    importCsvModal?.classList.remove('flex');
    selectedCsvFile = null;
    if (importCsvInput) {
      importCsvInput.value = '';
    }
    if (importCsvFileName) {
      importCsvFileName.textContent = 'Nenhum arquivo selecionado.';
    }
    if (importCsvSubmit) {
      importCsvSubmit.disabled = true;
    }
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

  const renderCourseOptions = () => {
    if (!manualCreateCoursesSelect) return;

    if (!courses.length) {
      manualCreateCoursesSelect.innerHTML = '<option disabled>Nenhum curso disponível</option>';
      return;
    }

    manualCreateCoursesSelect.innerHTML = courses
      .map((course) => `<option value="${course.id}">${course.name}</option>`)
      .join('');
  };

  const renderRows = () => {
    if (!tableBody) return;

    if (!students.length) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="7" class="px-6 py-6 text-sm font-semibold text-outline">
            Nenhum aluno cadastrado até o momento.
          </td>
        </tr>
      `;
      if (footerCounter) {
        footerCounter.textContent = 'Mostrando 0 de 0 alunos';
      }
      return;
    }

    tableBody.innerHTML = students
      .map((student) => {
        const firstCourse = student.courses?.[0]?.course;
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
              <p class="text-sm font-semibold text-on-surface">${firstCourse?.name || 'Curso não vinculado'}</p>
              <p class="text-[11px] text-outline font-medium">${firstCourse ? 'Múltiplos cursos permitidos' : 'Sem turma ativa'}</p>
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

    if (footerCounter) {
      footerCounter.textContent = `Mostrando ${students.length} de ${students.length} alunos`;
    }

    tableBody.querySelectorAll('[data-student-id]').forEach((row) => {
      row.addEventListener('click', () => {
        const studentId = row.getAttribute('data-student-id');
        if (!studentId) return;
        selectStudent(studentId);
      });
    });
  };

  const loadCourses = async () => {
    courses = await request('/courses');
    renderCourseOptions();
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

  const importCsv = async (file) => {
    const token = getToken();
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch(`${API_BASE_URL}/students/import-csv`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: formData,
    });

    if (!response.ok) {
      let message = 'Falha ao importar CSV.';
      try {
        const data = await response.json();
        if (typeof data?.message === 'string') {
          message = data.message;
        }
      } catch {
        // ignora
      }
      throw new Error(message);
    }

    return response.json();
  };

  const submitManualCreate = async (event) => {
    event.preventDefault();
    if (!manualCreateForm) return;

    const formData = new FormData(manualCreateForm);
    const selectedCourseIds = Array.from(manualCreateCoursesSelect?.selectedOptions || []).map(
      (option) => option.value,
    );

    const payload = {
      name: String(formData.get('name') || '').trim(),
      email: String(formData.get('email') || '').trim(),
      password: String(formData.get('password') || '').trim(),
      documentCpf: String(formData.get('documentCpf') || '').trim(),
      phone: String(formData.get('phone') || '').trim(),
      birthDate: String(formData.get('birthDate') || '').trim(),
      courseIds: selectedCourseIds,
    };

    await request('/students/public-register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    closeManualCreateModal();
    await loadStudents();
  };

  const exportCsv = () => {
    const header = ['nome', 'email', 'cpf', 'telefone', 'dataNascimento', 'courseIds'];

    const lines = students.map((student) => [
      student.name || '',
      student.email || '',
      student.profile?.documentCpf || '',
      student.profile?.phone || '',
      student.profile?.birthDate
        ? new Date(student.profile.birthDate).toISOString().slice(0, 10)
        : '',
      (student.courses || []).map((item) => item.course?.id).filter(Boolean).join('|'),
    ]);

    const csv = [header, ...lines]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(';'))
      .join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'alunos.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  const downloadCsvModel = () => {
    const model = [
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
    ]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(';'))
      .join('\n');

    const blob = new Blob([model], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'modelo-importacao-alunos.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  const bindEvents = () => {
    closeButton?.addEventListener('click', closeDrawer);
    overlay?.addEventListener('click', closeDrawer);

    window.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        closeDrawer();
        closeManualCreateModal();
        closeImportCsvModal();
      }
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

    manualCreateTopTrigger?.addEventListener('click', openManualCreateModal);
    manualCreateOverlay?.addEventListener('click', closeManualCreateModal);
    manualCreateClose?.addEventListener('click', closeManualCreateModal);
    manualCreateCancel?.addEventListener('click', closeManualCreateModal);
    manualCreateForm?.addEventListener('submit', async (event) => {
      try {
        await submitManualCreate(event);
      } catch (error) {
        alert(error instanceof Error ? error.message : 'Erro ao salvar aluno.');
      }
    });

    importCsvTrigger?.addEventListener('click', openImportCsvModal);
    importCsvOverlay?.addEventListener('click', closeImportCsvModal);
    importCsvClose?.addEventListener('click', closeImportCsvModal);
    importCsvDownloadModel?.addEventListener('click', downloadCsvModel);
    importCsvSelectFile?.addEventListener('click', () => importCsvInput?.click());

    importCsvInput?.addEventListener('change', (event) => {
      const file = event.target.files?.[0];
      selectedCsvFile = file || null;

      if (importCsvFileName) {
        importCsvFileName.textContent = file ? `Arquivo: ${file.name}` : 'Nenhum arquivo selecionado.';
      }
      if (importCsvSubmit) {
        importCsvSubmit.disabled = !file;
      }
    });

    importCsvSubmit?.addEventListener('click', async () => {
      if (!selectedCsvFile) return;

      try {
        const result = await importCsv(selectedCsvFile);
        await loadStudents();
        closeImportCsvModal();
        alert(
          `Importação concluída. Sucesso: ${result.importedCount}. Falhas: ${result.failedCount}.`,
        );
      } catch (error) {
        alert(error instanceof Error ? error.message : 'Erro ao importar CSV.');
      }
    });

    exportCsvTrigger?.addEventListener('click', exportCsv);
  };

  const init = async () => {
    bindEvents();

    try {
      await Promise.all([loadCourses(), loadStudents()]);
    } catch (error) {
      const message =
        error instanceof Error && /401|403|token|unauthorized/i.test(error.message)
          ? 'Sessão inválida. Faça login novamente para carregar os alunos.'
          : 'Não foi possível carregar os alunos.';
      if (tableBody) {
        tableBody.innerHTML = `
          <tr>
            <td colspan="7" class="px-6 py-6 text-sm font-semibold text-red-700">
              ${message}
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
