(() => {
  const API_BASE_URL = '/api';
  const TOKEN_KEY = 'academy-auth-token';
  const USER_KEY = 'academy-auth-user';
  const AGENDA_STORAGE_KEY = 'academy-agenda-events-v1';
  const OPEN_CLASS_EDITOR_KEY = 'academy-open-class-editor';

  const state = {
    classes: [],
    courses: [],
    students: [],
    enrollments: [],
    filteredClasses: [],
    editingClassId: null,
  };

  const tableBody = document.getElementById('classes-table-body');
  const footerCounter = document.getElementById('classes-footer-counter');
  const searchInput = document.getElementById('classes-search');

  const kpiActiveClasses = document.getElementById('kpi-active-classes');
  const kpiActiveClassesNote = document.getElementById('kpi-active-classes-note');
  const kpiOccupancy = document.getElementById('kpi-occupancy');
  const kpiOccupancyBar = document.getElementById('kpi-occupancy-bar');
  const kpiEvents = document.getElementById('kpi-events');

  const openModalButton = document.getElementById('open-class-modal');
  const modal = document.getElementById('class-modal');
  const modalOverlay = document.getElementById('class-modal-overlay');
  const modalCloseButton = document.getElementById('class-modal-close');
  const modalCancelButton = document.getElementById('class-modal-cancel');
  const form = document.getElementById('class-form');
  const submitButton = document.getElementById('class-modal-submit');

  const classIdInput = document.getElementById('class-id');
  const classNameInput = document.getElementById('class-name');
  const classCourseIdInput = document.getElementById('class-course-id');
  const classTotalSeatsInput = document.getElementById('class-total-seats');
  const classStartDateInput = document.getElementById('class-start-date');
  const classStartTimeInput = document.getElementById('class-start-time');
  const classRecurrenceKindInput = document.getElementById('class-recurrence-kind');
  const classRepeatUntilInput = document.getElementById('class-repeat-until');
  const classMonthDayInput = document.getElementById('class-month-day');
  const weeklyOptions = document.getElementById('weekly-options');
  const monthlyOptions = document.getElementById('monthly-options');
  const weekdaysInputs = Array.from(document.querySelectorAll('.recurrence-weekday'));

  const availableStudentsList = document.getElementById('available-students-list');
  const availableStudentsCounter = document.getElementById('available-students-counter');
  const modalTitle = document.getElementById('class-modal-title');
  const modalSubtitle = document.getElementById('class-modal-subtitle');

  const getToken = () => (new URLSearchParams(window.location.search).get('token') || (function(){try{return window.localStorage.getItem(TOKEN_KEY)||window.sessionStorage.getItem(TOKEN_KEY);}catch{return null;}}())) || '';
  const getUser = () => {
    try {
      const raw = (new URLSearchParams(window.location.search).get('usr') || (function(){try{return window.localStorage.getItem(USER_KEY)||window.sessionStorage.getItem(USER_KEY);}catch{return null;}}()));
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  };

  const parseError = async (response) => {
    try {
      const data = await response.json();
      if (Array.isArray(data?.message)) return data.message.join(', ');
      if (typeof data?.message === 'string') return data.message;
    } catch {
      // ignora
    }
    return `Erro ${response.status}`;
  };

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
      throw new Error(await parseError(response));
    }

    return response.json();
  };

  const setLoadingState = (loading) => {
    if (!submitButton) return;
    submitButton.disabled = loading;
    submitButton.textContent = loading ? 'Salvando...' : 'Salvar turma';
  };

  const formatDate = (value) => {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '-';
    return date.toLocaleDateString('pt-BR');
  };

  const formatClassStatus = (status) => {
    if (status === 'IN_PROGRESS') return 'Em andamento';
    if (status === 'PLANNING') return 'Planejamento';
    if (status === 'ENROLLMENTS_OPEN') return 'Matrículas abertas';
    if (status === 'CLOSED') return 'Encerrada';
    return 'Indefinido';
  };

  const statusClass = (status) => {
    if (status === 'IN_PROGRESS') return 'bg-blue-100 text-blue-700';
    if (status === 'PLANNING') return 'bg-amber-100 text-amber-700';
    if (status === 'ENROLLMENTS_OPEN') return 'bg-emerald-100 text-emerald-700';
    if (status === 'CLOSED') return 'bg-zinc-200 text-zinc-600';
    return 'bg-zinc-100 text-zinc-600';
  };

  const getOccupiedSeats = (item) => {
    if (typeof item.occupiedSeats === 'number') return item.occupiedSeats;
    if (typeof item?._count?.enrollments === 'number') return item._count.enrollments;
    return 0;
  };

  const readAgendaEvents = () => {
    try {
      const raw = window.localStorage.getItem(AGENDA_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  };

  const writeAgendaEvents = (events) => {
    window.localStorage.setItem(AGENDA_STORAGE_KEY, JSON.stringify(events));
  };

  const getClassRecurrenceMetadata = (classId) => {
    const classEvents = readAgendaEvents().filter(
      (event) => event && event.type === 'class' && event.classId === classId,
    );
    if (!classEvents.length) {
      return {
        recurrenceKind: 'none',
        repeatUntil: '',
        monthDay: '',
        weeklyDays: [],
      };
    }

    const first = classEvents[0];
    const weeklyDays = Array.isArray(first.recurrenceWeekdays)
      ? first.recurrenceWeekdays.map((item) => Number(item)).filter((item) => !Number.isNaN(item))
      : [];

    return {
      recurrenceKind: first.recurrenceKind || 'none',
      repeatUntil: first.recurrenceUntil || '',
      monthDay: first.recurrenceMonthDay ? String(first.recurrenceMonthDay) : '',
      weeklyDays,
    };
  };

  const countClassEvents = () =>
    readAgendaEvents().filter((item) => item && item.type === 'class').length;

  const renderKpis = () => {
    const total = state.classes.length;
    const active = state.classes.filter((item) => item.status !== 'CLOSED').length;
    const totalSeats = state.classes.reduce(
      (acc, item) => acc + Number(item.totalSeats || 0),
      0,
    );
    const occupiedSeats = state.classes.reduce(
      (acc, item) => acc + getOccupiedSeats(item),
      0,
    );
    const occupancy = totalSeats > 0 ? Math.round((occupiedSeats / totalSeats) * 100) : 0;

    if (kpiActiveClasses) kpiActiveClasses.textContent = String(active);
    if (kpiActiveClassesNote) {
      kpiActiveClassesNote.textContent =
        total > 0 ? `${total} turma(s) cadastrada(s)` : 'Sem turmas criadas.';
    }
    if (kpiOccupancy) kpiOccupancy.textContent = `${occupancy}%`;
    if (kpiOccupancyBar) kpiOccupancyBar.style.width = `${occupancy}%`;
    if (kpiEvents) kpiEvents.textContent = String(countClassEvents());
  };

  const renderCourseOptions = () => {
    if (!classCourseIdInput) return;
    const currentValue = classCourseIdInput.value;
    const options = ['<option value="">Selecione um curso</option>']
      .concat(state.courses.map((course) => `<option value="${course.id}">${course.name}</option>`));
    classCourseIdInput.innerHTML = options.join('');
    if (currentValue && state.courses.some((course) => course.id === currentValue)) {
      classCourseIdInput.value = currentValue;
    }
  };

  const getActiveEnrollmentStudentSet = (exceptClassId) => {
    const ids = new Set();
    state.enrollments.forEach((enrollment) => {
      if (enrollment.status !== 'ACTIVE') return;
      if (exceptClassId && enrollment.classId === exceptClassId) return;
      ids.add(enrollment.studentId);
    });
    return ids;
  };

  const getClassEnrollmentStudentSet = (classId) => {
    const ids = new Set();
    state.enrollments.forEach((enrollment) => {
      if (enrollment.classId === classId && enrollment.status === 'ACTIVE') {
        ids.add(enrollment.studentId);
      }
    });
    return ids;
  };

  const renderAvailableStudents = (selectedIds = new Set(), classId = null) => {
    if (!availableStudentsList) return;

    const unavailable = getActiveEnrollmentStudentSet(classId);
    const list = state.students.filter((student) => !unavailable.has(student.id) || selectedIds.has(student.id));

    if (availableStudentsCounter) {
      availableStudentsCounter.textContent = `${list.length} aluno(s) disponível(is)`;
    }

    if (!list.length) {
      availableStudentsList.innerHTML = `
        <p class="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-500">
          Não há alunos sem turma no momento.
        </p>
      `;
      return;
    }

    availableStudentsList.innerHTML = list
      .map(
        (student) => `
          <label class="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-zinc-200 bg-white px-3 py-2">
            <div class="min-w-0">
              <p class="truncate text-sm font-bold text-zinc-900">${student.name}</p>
              <p class="truncate text-xs text-zinc-500">${student.email}</p>
            </div>
            <input
              type="checkbox"
              class="assign-student-checkbox h-4 w-4 rounded border-zinc-300 text-primary focus:ring-primary"
              value="${student.id}"
              ${selectedIds.has(student.id) ? 'checked' : ''}
            />
          </label>
        `,
      )
      .join('');
  };

  const renderTable = () => {
    if (!tableBody) return;

    const classes = state.filteredClasses;

    if (!classes.length) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="6" class="px-6 py-7 text-sm font-semibold text-zinc-500">
            Nenhuma turma encontrada.
          </td>
        </tr>
      `;
      if (footerCounter) footerCounter.textContent = 'Mostrando 0 de 0 turmas';
      return;
    }

    tableBody.innerHTML = classes
      .map((item) => {
        const occupied = getOccupiedSeats(item);
        const totalSeats = Number(item.totalSeats || 0);
        return `
          <tr class="bg-white transition hover:bg-zinc-50">
            <td class="px-6 py-4">
              <p class="text-sm font-bold text-zinc-900">${item.name}</p>
              <p class="text-xs text-zinc-500">ID ${item.id.slice(0, 8).toUpperCase()}</p>
            </td>
            <td class="px-6 py-4 text-sm font-semibold text-zinc-700">${item.course?.name || 'Sem curso'}</td>
            <td class="px-6 py-4 text-sm text-zinc-700">${formatDate(item.startDate)} - ${formatDate(item.endDate)}</td>
            <td class="px-6 py-4 text-sm font-semibold text-zinc-700">${occupied}/${totalSeats}</td>
            <td class="px-6 py-4">
              <span class="inline-flex rounded-md px-2.5 py-1 text-xs font-bold ${statusClass(item.status)}">
                ${formatClassStatus(item.status)}
              </span>
            </td>
            <td class="px-6 py-4 text-right">
              <button
                type="button"
                data-edit-class-id="${item.id}"
                class="inline-flex items-center gap-1 rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-bold text-zinc-700 transition hover:border-primary hover:text-primary"
              >
                <span class="material-symbols-outlined text-sm">edit</span>
                Editar
              </button>
            </td>
          </tr>
        `;
      })
      .join('');

    if (footerCounter) {
      footerCounter.textContent = `Mostrando ${classes.length} de ${state.classes.length} turmas`;
    }
  };

  const applySearch = () => {
    const query = String(searchInput?.value || '').trim().toLowerCase();
    if (!query) {
      state.filteredClasses = [...state.classes];
      renderTable();
      return;
    }

    state.filteredClasses = state.classes.filter((item) => {
      const name = String(item.name || '').toLowerCase();
      const course = String(item?.course?.name || '').toLowerCase();
      return name.includes(query) || course.includes(query);
    });
    renderTable();
  };

  const resetForm = () => {
    if (!form) return;
    form.reset();
    if (classIdInput) classIdInput.value = '';
    if (classTotalSeatsInput) classTotalSeatsInput.value = '30';
    if (classRecurrenceKindInput) classRecurrenceKindInput.value = 'none';
    if (classMonthDayInput) classMonthDayInput.value = '1';
    weekdaysInputs.forEach((input) => {
      input.checked = false;
    });

    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');

    if (classStartDateInput) classStartDateInput.value = today;
    if (classStartTimeInput) classStartTimeInput.value = `${hh}:${mm}`;
    if (classRepeatUntilInput) classRepeatUntilInput.value = '';
    state.editingClassId = null;

    if (modalTitle) modalTitle.textContent = 'Criar turma';
    if (modalSubtitle) modalSubtitle.textContent = 'Defina curso, alunos e recorrência da agenda.';
    renderAvailableStudents(new Set(), null);
    updateRecurrenceVisibility();
  };

  const openModal = () => {
    if (!modal) return;
    modal.classList.remove('hidden');
    modal.classList.add('flex');
  };

  const closeModal = () => {
    if (!modal) return;
    modal.classList.add('hidden');
    modal.classList.remove('flex');
    resetForm();
    setLoadingState(false);
  };

  const updateRecurrenceVisibility = () => {
    const value = classRecurrenceKindInput?.value || 'none';
    const isWeekly = value === 'weekly';
    const isMonthly = value === 'monthly';
    const isRepeat = isWeekly || isMonthly;

    if (weeklyOptions) weeklyOptions.classList.toggle('hidden', !isWeekly);
    if (monthlyOptions) monthlyOptions.classList.toggle('hidden', !isMonthly);

    if (classRepeatUntilInput) {
      classRepeatUntilInput.required = isRepeat;
    }
  };

  const splitDateTime = (dateValue) => {
    if (!dateValue) {
      return { date: '', time: '' };
    }
    const parsed = new Date(dateValue);
    if (Number.isNaN(parsed.getTime())) {
      return { date: '', time: '' };
    }
    const date = parsed.toISOString().slice(0, 10);
    const time = `${String(parsed.getHours()).padStart(2, '0')}:${String(parsed.getMinutes()).padStart(2, '0')}`;
    return { date, time };
  };

  const openEditModal = (classItem) => {
    if (!classItem) return;
    resetForm();
    openModal();

    state.editingClassId = classItem.id;
    if (classIdInput) classIdInput.value = classItem.id;
    if (classNameInput) classNameInput.value = classItem.name || '';
    if (classCourseIdInput) classCourseIdInput.value = classItem.courseId || '';
    if (classTotalSeatsInput) classTotalSeatsInput.value = String(classItem.totalSeats || 30);

    const { date, time } = splitDateTime(classItem.startDate);
    if (classStartDateInput) classStartDateInput.value = date;
    if (classStartTimeInput) classStartTimeInput.value = time || '18:00';
    if (classRepeatUntilInput) {
      classRepeatUntilInput.value = classItem.endDate
        ? splitDateTime(classItem.endDate).date
        : '';
    }

    const recurrence = getClassRecurrenceMetadata(classItem.id);
    if (classRecurrenceKindInput) {
      classRecurrenceKindInput.value = recurrence.recurrenceKind;
    }
    if (classRepeatUntilInput && recurrence.repeatUntil) {
      classRepeatUntilInput.value = recurrence.repeatUntil;
    }
    if (classMonthDayInput && recurrence.monthDay) {
      classMonthDayInput.value = recurrence.monthDay;
    }
    weekdaysInputs.forEach((input) => {
      input.checked = recurrence.weeklyDays.includes(Number(input.value));
    });

    if (modalTitle) modalTitle.textContent = 'Editar turma';
    if (modalSubtitle) modalSubtitle.textContent = 'Atualize dados da turma e gere novamente os eventos da agenda.';

    const selectedInClass = getClassEnrollmentStudentSet(classItem.id);
    renderAvailableStudents(selectedInClass, classItem.id);
    updateRecurrenceVisibility();
  };

  const toIsoDateTime = (dateValue, timeValue, fallbackTime = '00:00') => {
    const time = timeValue || fallbackTime;
    const parsed = new Date(`${dateValue}T${time}:00`);
    if (Number.isNaN(parsed.getTime())) return null;
    return parsed.toISOString();
  };

  const buildWeeklyDates = (start, until, weekdays) => {
    const result = [];
    const cursor = new Date(start.getTime());
    while (cursor <= until && result.length < 300) {
      if (weekdays.includes(cursor.getDay()) && cursor >= start) {
        result.push(new Date(cursor.getTime()));
      }
      cursor.setDate(cursor.getDate() + 1);
    }
    return result;
  };

  const buildMonthlyDates = (start, until, monthDay) => {
    const result = [];
    const hour = start.getHours();
    const minute = start.getMinutes();
    const cursor = new Date(start.getFullYear(), start.getMonth(), 1, hour, minute, 0, 0);

    while (cursor <= until && result.length < 300) {
      const candidate = new Date(cursor.getFullYear(), cursor.getMonth(), monthDay, hour, minute, 0, 0);
      if (candidate.getMonth() === cursor.getMonth() && candidate >= start && candidate <= until) {
        result.push(candidate);
      }
      cursor.setMonth(cursor.getMonth() + 1);
    }

    return result;
  };

  const buildOccurrenceDates = ({
    startDate,
    startTime,
    recurrenceKind,
    repeatUntil,
    weeklyDays,
    monthDay,
  }) => {
    const start = new Date(`${startDate}T${startTime}:00`);
    if (Number.isNaN(start.getTime())) return [];

    if (recurrenceKind === 'none') return [start];

    const until = repeatUntil
      ? new Date(`${repeatUntil}T23:59:59`)
      : null;
    if (!until || Number.isNaN(until.getTime()) || until < start) {
      return [start];
    }

    if (recurrenceKind === 'weekly') {
      const validWeekdays = weeklyDays.length ? weeklyDays : [start.getDay()];
      return buildWeeklyDates(start, until, validWeekdays);
    }

    if (recurrenceKind === 'monthly') {
      const day = Number(monthDay);
      const safeDay = Number.isNaN(day) ? start.getDate() : Math.max(1, Math.min(31, day));
      return buildMonthlyDates(start, until, safeDay);
    }

    return [start];
  };

  const syncClassEventsToAgenda = ({
    classId,
    className,
    teacherName,
    startDate,
    startTime,
    recurrenceKind,
    repeatUntil,
    weeklyDays,
    monthDay,
  }) => {
    const allEvents = readAgendaEvents();
    const preservedEvents = allEvents.filter((event) => !(event.type === 'class' && event.classId === classId));
    const seriesId = window.crypto?.randomUUID?.() || `series-${Date.now()}`;

    const occurrenceDates = buildOccurrenceDates({
      startDate,
      startTime,
      recurrenceKind,
      repeatUntil,
      weeklyDays,
      monthDay,
    });

    const classEvents = occurrenceDates.map((date) => ({
      id: window.crypto?.randomUUID?.() || `evt-${Date.now()}-${Math.random()}`,
      type: 'class',
      title: className,
      classId,
      className,
      teacher: teacherName,
      datetime: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}T${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:00`,
      provider: null,
      recurrenceKind,
      recurrenceUntil: repeatUntil || null,
      recurrenceWeekdays: weeklyDays,
      recurrenceMonthDay: monthDay || null,
      seriesId,
    }));

    writeAgendaEvents([...preservedEvents, ...classEvents]);
  };

  const syncStudentsInClass = async (classId, selectedStudentIds) => {
    const currentSet = getClassEnrollmentStudentSet(classId);
    const selectedSet = new Set(selectedStudentIds);

    const toAdd = selectedStudentIds.filter((studentId) => !currentSet.has(studentId));
    const toRemove = Array.from(currentSet).filter((studentId) => !selectedSet.has(studentId));

    const failures = [];

    for (const studentId of toAdd) {
      try {
        await request('/enrollments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            classId,
            studentId,
          }),
        });
      } catch (error) {
        failures.push(
          error instanceof Error
            ? `Falha ao adicionar aluno: ${error.message}`
            : 'Falha ao adicionar aluno.',
        );
      }
    }

    for (const studentId of toRemove) {
      try {
        await request(`/enrollments/class/${classId}/student/${studentId}`, {
          method: 'DELETE',
        });
      } catch (error) {
        failures.push(
          error instanceof Error
            ? `Falha ao remover aluno: ${error.message}`
            : 'Falha ao remover aluno.',
        );
      }
    }

    if (failures.length) {
      window.alert(`Algumas alterações de alunos falharam:\n- ${failures.join('\n- ')}`);
    }
  };

  const buildPayloadFromForm = () => {
    const classId = String(classIdInput?.value || '').trim();
    const name = String(classNameInput?.value || '').trim();
    const courseId = String(classCourseIdInput?.value || '').trim();
    const totalSeats = Number(classTotalSeatsInput?.value || 0);
    const startDate = String(classStartDateInput?.value || '').trim();
    const startTime = String(classStartTimeInput?.value || '').trim();
    const recurrenceKind = String(classRecurrenceKindInput?.value || 'none');
    const repeatUntil = String(classRepeatUntilInput?.value || '').trim();
    const monthDay = String(classMonthDayInput?.value || '').trim();

    const weeklyDays = weekdaysInputs
      .filter((input) => input.checked)
      .map((input) => Number(input.value))
      .filter((value) => !Number.isNaN(value));

    if (!name || !courseId || !totalSeats || !startDate || !startTime) {
      throw new Error('Preencha os campos obrigatórios da turma.');
    }

    if (recurrenceKind !== 'none' && !repeatUntil) {
      throw new Error('Informe até quando a recorrência deve se repetir.');
    }

    const selectedStudentIds = Array.from(
      document.querySelectorAll('.assign-student-checkbox:checked'),
    ).map((input) => String(input.value));

    const startDateIso = toIsoDateTime(startDate, startTime);
    if (!startDateIso) {
      throw new Error('Data e horário de início inválidos.');
    }

    let endDateIso;
    if (repeatUntil) {
      endDateIso = toIsoDateTime(repeatUntil, '23:59');
      if (!endDateIso) {
        throw new Error('Data de término da recorrência inválida.');
      }
    }

    return {
      classId,
      classData: {
        courseId,
        name,
        totalSeats,
        startDate: startDateIso,
        endDate: endDateIso,
      },
      scheduleData: {
        startDate,
        startTime,
        recurrenceKind,
        repeatUntil,
        weeklyDays,
        monthDay,
      },
      selectedStudentIds,
    };
  };

  const saveClass = async (event) => {
    event.preventDefault();
    setLoadingState(true);

    try {
      const user = getUser();
      const payload = buildPayloadFromForm();
      const isEditing = Boolean(payload.classId);

      const classRecord = isEditing
        ? await request(`/classes/${payload.classId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload.classData),
          })
        : await request('/classes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload.classData),
          });

      await syncStudentsInClass(classRecord.id, payload.selectedStudentIds);

      syncClassEventsToAgenda({
        classId: classRecord.id,
        className: classRecord.name,
        teacherName: user?.name || 'Professor',
        ...payload.scheduleData,
      });

      await reloadData();
      closeModal();
      window.parent.postMessage(
        { type: 'academy:navigate', section: 'admin_agenda' },
        window.location.origin,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Falha ao salvar turma.';
      window.alert(message);
      setLoadingState(false);
    }
  };

  const handleTableClick = (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    const button = target.closest('[data-edit-class-id]');
    if (!button) return;
    const classId = button.getAttribute('data-edit-class-id');
    if (!classId) return;
    const classItem = state.classes.find((item) => item.id === classId);
    if (!classItem) return;
    openEditModal(classItem);
  };

  const handleOpenFromAgenda = () => {
    try {
      const raw = window.localStorage.getItem(OPEN_CLASS_EDITOR_KEY);
      if (!raw) return;
      window.localStorage.removeItem(OPEN_CLASS_EDITOR_KEY);

      const parsed = JSON.parse(raw);
      if (!parsed?.classId) return;
      const classItem = state.classes.find((item) => item.id === parsed.classId);
      if (!classItem) return;
      openEditModal(classItem);
    } catch {
      // ignora
    }
  };

  const bindEvents = () => {
    openModalButton?.addEventListener('click', () => {
      resetForm();
      openModal();
    });

    modalOverlay?.addEventListener('click', closeModal);
    modalCloseButton?.addEventListener('click', closeModal);
    modalCancelButton?.addEventListener('click', closeModal);
    form?.addEventListener('submit', saveClass);
    classRecurrenceKindInput?.addEventListener('change', updateRecurrenceVisibility);
    searchInput?.addEventListener('input', applySearch);
    tableBody?.addEventListener('click', handleTableClick);
  };

  const reloadData = async () => {
    const [classes, courses, students, enrollments] = await Promise.all([
      request('/classes'),
      request('/courses'),
      request('/students'),
      request('/enrollments'),
    ]);

    state.classes = Array.isArray(classes) ? classes : [];
    state.courses = Array.isArray(courses) ? courses : [];
    state.students = Array.isArray(students) ? students : [];
    state.enrollments = Array.isArray(enrollments) ? enrollments : [];
    state.filteredClasses = [...state.classes];

    renderCourseOptions();
    renderKpis();
    renderTable();
    renderAvailableStudents(new Set(), null);
  };

  const init = async () => {
    bindEvents();
    resetForm();

    try {
      await reloadData();
      handleOpenFromAgenda();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Falha ao carregar dados de turmas.';
      if (tableBody) {
        tableBody.innerHTML = `
          <tr>
            <td colspan="6" class="px-6 py-7 text-sm font-semibold text-error">
              ${message}
            </td>
          </tr>
        `;
      }
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => void init());
  } else {
    void init();
  }
})();
