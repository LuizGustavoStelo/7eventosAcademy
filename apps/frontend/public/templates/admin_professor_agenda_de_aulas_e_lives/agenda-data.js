(() => {
  const TOKEN_KEY = 'academy-auth-token';
  const USER_KEY = 'academy-auth-user';
  const STORAGE_KEY = 'academy-agenda-events-v1';
  const API_BASE_URL = '/api';

  const state = {
    monthCursor: new Date(),
    filter: 'all',
    quickType: 'class',
    search: '',
    classes: [],
    events: [],
  };

  const $ = (id) => document.getElementById(id);

  const monthTitle = $('calendar-month-title');
  const calendarDays = $('calendar-days');
  const quickForm = $('quick-create-form');
  const quickTeacher = $('quick-teacher');
  const quickClassId = $('quick-class-id');
  const quickTitle = $('quick-title');
  const quickDate = $('quick-date');
  const quickTime = $('quick-time');
  const quickProvider = $('quick-provider');
  const providerWrap = $('provider-wrap');
  const upcomingList = $('upcoming-events-list');
  const upcomingCount = $('upcoming-count');
  const searchInput = $('calendar-search');

  const filterButtons = {
    all: $('filter-all'),
    class: $('filter-class'),
    live: $('filter-live'),
  };

  const quickTypeButtons = Array.from(document.querySelectorAll('.session-type-btn'));

  const monthName = (date) =>
    new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(date);

  const normalize = (text) => String(text || '').toLowerCase().trim();

  const getSession = () => {
    try {
      const raw = window.sessionStorage.getItem(USER_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  };

  const getToken = () => window.sessionStorage.getItem(TOKEN_KEY);

  const loadEvents = () => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      state.events = Array.isArray(parsed) ? parsed : [];
    } catch {
      state.events = [];
    }
  };

  const saveEvents = () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state.events));
  };

  const fetchClasses = async () => {
    const token = getToken();
    if (!token) {
      state.classes = [];
      return;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/classes`, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        state.classes = [];
        return;
      }

      const data = await response.json();
      state.classes = Array.isArray(data) ? data : [];
    } catch {
      state.classes = [];
    }
  };

  const applyQuickTeacher = () => {
    const user = getSession();
    quickTeacher.value = user?.name || 'Professor(a)';
  };

  const populateClassSelect = () => {
    const current = quickClassId.value;
    const options = ['<option value="">Sem turma</option>'];

    state.classes.forEach((item) => {
      options.push(`<option value="${item.id}">${item.name}</option>`);
    });

    quickClassId.innerHTML = options.join('');
    if (current && state.classes.some((item) => item.id === current)) {
      quickClassId.value = current;
    }
  };

  const setFilter = (filter) => {
    state.filter = filter;
    Object.entries(filterButtons).forEach(([key, button]) => {
      if (!button) return;
      if (key === filter) {
        button.className = 'px-4 py-1.5 rounded-lg text-xs font-semibold bg-white text-primary shadow-sm';
      } else {
        button.className = 'px-4 py-1.5 rounded-lg text-xs font-semibold text-zinc-600 hover:text-zinc-900';
      }
    });
    renderAll();
  };

  const setQuickType = (type) => {
    state.quickType = type;

    quickTypeButtons.forEach((button) => {
      const isActive = button.dataset.type === type;
      button.className = isActive
        ? 'session-type-btn flex items-center justify-center py-2 px-2 rounded-lg border-2 border-primary text-primary font-bold text-xs bg-orange-50/50'
        : 'session-type-btn flex items-center justify-center py-2 px-2 rounded-lg border-2 border-zinc-100 text-zinc-500 font-bold text-xs';
    });

    providerWrap.style.display = type === 'live' ? 'block' : 'none';
  };

  const filteredEvents = () => {
    const query = normalize(state.search);
    return state.events
      .filter((event) => {
        if (state.filter === 'all') return true;
        return event.type === state.filter;
      })
      .filter((event) => {
        if (!query) return true;
        return (
          normalize(event.title).includes(query) ||
          normalize(event.className).includes(query) ||
          normalize(event.teacher).includes(query)
        );
      });
  };

  const renderCalendar = () => {
    const cursor = new Date(state.monthCursor.getFullYear(), state.monthCursor.getMonth(), 1);
    const month = cursor.getMonth();

    monthTitle.textContent = monthName(cursor);

    const firstDay = new Date(cursor.getFullYear(), month, 1);
    const lastDay = new Date(cursor.getFullYear(), month + 1, 0);
    const offsetStart = firstDay.getDay();
    const daysInMonth = lastDay.getDate();

    const events = filteredEvents();

    const cells = [];
    for (let i = 0; i < 42; i += 1) {
      const dayNumber = i - offsetStart + 1;
      const inMonth = dayNumber >= 1 && dayNumber <= daysInMonth;

      if (!inMonth) {
        cells.push('<div class="day-cell border-r border-b border-zinc-50 p-2 bg-zinc-50/40"></div>');
        continue;
      }

      const dateKey = `${cursor.getFullYear()}-${String(month + 1).padStart(2, '0')}-${String(dayNumber).padStart(2, '0')}`;
      const dayEvents = events
        .filter((event) => event.datetime.startsWith(dateKey))
        .sort((a, b) => (a.datetime > b.datetime ? 1 : -1));

      const pills = dayEvents
        .slice(0, 2)
        .map((event) => {
          const colorClass = event.type === 'live'
            ? 'bg-blue-100 text-blue-800'
            : 'bg-orange-100 text-[#a73a00]';
          const time = new Date(event.datetime).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
          return `<div class="${colorClass} text-[10px] p-1.5 rounded-md font-bold leading-tight truncate">${time} - ${event.title}</div>`;
        })
        .join('');

      const extra = dayEvents.length > 2
        ? `<div class="text-[10px] font-bold text-zinc-500 px-1">+${dayEvents.length - 2} item(ns)</div>`
        : '';

      cells.push(`
        <div class="day-cell border-r border-b border-zinc-50 p-2 ${dayEvents.length ? 'bg-primary/5' : ''}">
          <span class="text-xs font-medium ${dayEvents.length ? 'text-primary' : 'text-zinc-700'}">${dayNumber}</span>
          <div class="mt-1 space-y-1">${pills}${extra}</div>
        </div>
      `);
    }

    calendarDays.innerHTML = cells.join('');
  };

  const renderUpcoming = () => {
    const now = new Date();
    const list = filteredEvents()
      .filter((event) => new Date(event.datetime) >= now)
      .sort((a, b) => (a.datetime > b.datetime ? 1 : -1))
      .slice(0, 8);

    upcomingCount.textContent = `${list.length} item(ns)`;

    if (!list.length) {
      upcomingList.innerHTML = `
        <div class="bg-white p-3 rounded-xl border border-zinc-50">
          <p class="text-xs text-zinc-500">Nenhum evento para o filtro selecionado.</p>
        </div>
      `;
      return;
    }

    upcomingList.innerHTML = list
      .map((event) => {
        const date = new Date(event.datetime);
        const month = new Intl.DateTimeFormat('pt-BR', { month: 'short' }).format(date);
        const day = String(date.getDate()).padStart(2, '0');
        const time = date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        const typeBadge = event.type === 'live' ? 'Live' : 'Aula';
        return `
          <div class="flex items-start gap-3 bg-white p-3 rounded-xl border border-zinc-50">
            <div class="min-w-[44px] h-[44px] rounded-lg bg-zinc-50 flex flex-col items-center justify-center border border-zinc-100">
              <span class="text-[10px] font-bold text-zinc-400 uppercase leading-none">${month}</span>
              <span class="text-lg font-bold text-zinc-700 leading-none">${day}</span>
            </div>
            <div class="overflow-hidden">
              <h5 class="text-xs font-bold text-on-surface truncate">${event.title}</h5>
              <p class="text-[10px] text-on-surface-variant mt-0.5">${event.className} - ${event.teacher}</p>
              <p class="text-[10px] text-on-surface-variant mt-0.5">${typeBadge} - ${time}</p>
            </div>
          </div>
        `;
      })
      .join('');
  };

  const renderAll = () => {
    renderCalendar();
    renderUpcoming();
  };

  const createEvent = (payload) => {
    const uuid = window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
    const event = {
      id: uuid,
      ...payload,
    };
    state.events.push(event);
    saveEvents();
  };

  const bindEvents = () => {
    $('btn-prev-month')?.addEventListener('click', () => {
      state.monthCursor = new Date(state.monthCursor.getFullYear(), state.monthCursor.getMonth() - 1, 1);
      renderCalendar();
    });

    $('btn-next-month')?.addEventListener('click', () => {
      state.monthCursor = new Date(state.monthCursor.getFullYear(), state.monthCursor.getMonth() + 1, 1);
      renderCalendar();
    });

    $('btn-today')?.addEventListener('click', () => {
      state.monthCursor = new Date();
      renderCalendar();
    });

    filterButtons.all?.addEventListener('click', () => setFilter('all'));
    filterButtons.class?.addEventListener('click', () => setFilter('class'));
    filterButtons.live?.addEventListener('click', () => setFilter('live'));

    quickTypeButtons.forEach((button) => {
      button.addEventListener('click', () => {
        const type = button.dataset.type;
        if (type === 'class' || type === 'live') {
          setQuickType(type);
        }
      });
    });

    searchInput?.addEventListener('input', () => {
      state.search = searchInput.value;
      renderAll();
    });

    quickForm?.addEventListener('submit', (event) => {
      event.preventDefault();

      const classId = quickClassId.value;
      const classItem = state.classes.find((item) => item.id === classId);
      const title = quickTitle.value.trim();
      const date = quickDate.value;
      const time = quickTime.value;

      if (!title || !date || !time) return;

      const datetime = `${date}T${time}:00`;
      createEvent({
        type: state.quickType,
        title,
        classId: classId || null,
        className: classItem?.name || 'Sem turma',
        teacher: quickTeacher.value || 'Professor(a)',
        datetime,
        provider: state.quickType === 'live' ? quickProvider.value : null,
      });

      quickTitle.value = '';
      quickDate.value = '';
      quickTime.value = '';

      renderAll();
    });

    $('btn-open-quick-create')?.addEventListener('click', () => {
      quickTitle.focus();
    });
  };

  const init = async () => {
    loadEvents();
    applyQuickTeacher();
    await fetchClasses();
    populateClassSelect();

    setQuickType('class');
    setFilter('all');
    bindEvents();
    renderAll();
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => void init());
  } else {
    void init();
  }
})();
