(() => {
  const STORAGE_KEY = 'academy-courses';

  const seedCourses = [
    {
      id: 'curso-1',
      nome: 'Engenharia de Prompt para IA',
      bannerUrl: 'https://images.unsplash.com/photo-1498050108023-c5249f4df085?auto=format&fit=crop&w=1200&q=80',
      cargaHoraria: 48,
      valor: 1497,
      descricao: 'Curso avançado para criação de prompts profissionais, automações e fluxos de IA aplicados ao mercado.',
      categoria: 'Tecnologia',
      modalidade: 'Híbrido',
      status: 'ATIVO',
      coordenador: 'Prof. Ricardo Silva',
    },
    {
      id: 'curso-2',
      nome: 'Gestão Acadêmica com Dados',
      bannerUrl: 'https://images.unsplash.com/photo-1552664730-d307ca884978?auto=format&fit=crop&w=1200&q=80',
      cargaHoraria: 36,
      valor: 990,
      descricao: 'Métricas, indicadores e rotinas de acompanhamento para coordenadores e professores.',
      categoria: 'Gestão',
      modalidade: 'EAD',
      status: 'RASCUNHO',
      coordenador: 'Prof. Ana Souza',
    },
    {
      id: 'curso-3',
      nome: 'Didática Digital e Conteúdo Interativo',
      bannerUrl: 'https://images.unsplash.com/photo-1513258496099-48168024aec0?auto=format&fit=crop&w=1200&q=80',
      cargaHoraria: 24,
      valor: 690,
      descricao: 'Práticas para estruturar aulas com recursos multimídia, avaliações e engajamento contínuo.',
      categoria: 'Educação',
      modalidade: 'Presencial',
      status: 'INATIVO',
      coordenador: 'Prof. Bruno Martins',
    },
  ];

  const cardsContainer = document.getElementById('cards-cursos');
  const modal = document.getElementById('modal-curso');
  const modalOverlay = document.getElementById('modal-overlay');
  const form = document.getElementById('curso-form');
  const novoCursoBtn = document.getElementById('novo-curso');
  const fecharModalBtn = document.getElementById('fechar-modal');
  const cancelarModalBtn = document.getElementById('cancelar-modal');
  const apagarCursoBtn = document.getElementById('apagar-curso');
  const modalTitle = document.getElementById('modal-title');

  const previewMap = {
    bannerUrl: document.getElementById('preview-banner'),
    nome: document.getElementById('preview-nome'),
    categoria: document.getElementById('preview-categoria'),
    descricao: document.getElementById('preview-descricao'),
    cargaHoraria: document.getElementById('preview-carga'),
    valor: document.getElementById('preview-valor'),
    modalidade: document.getElementById('preview-modalidade'),
    status: document.getElementById('preview-status'),
  };

  const statusMeta = {
    ATIVO: { label: 'Ativo', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
    RASCUNHO: { label: 'Rascunho', className: 'bg-amber-50 text-amber-700 border-amber-200' },
    INATIVO: { label: 'Inativo', className: 'bg-zinc-100 text-zinc-700 border-zinc-300' },
  };

  let courses = [];
  let cursoEditandoId = null;

  const formatMoney = (value) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value || 0));

  const persistCourses = () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(courses));
  };

  const loadCourses = () => {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      courses = [...seedCourses];
      persistCourses();
      return;
    }

    try {
      const parsed = JSON.parse(raw);
      courses = Array.isArray(parsed) ? parsed : [...seedCourses];
    } catch {
      courses = [...seedCourses];
    }
  };

  const escapeHtml = (value) =>
    String(value)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');

  const renderCards = () => {
    if (!cardsContainer) return;

    cardsContainer.innerHTML = courses
      .map((course) => {
        const meta = statusMeta[course.status] || statusMeta.ATIVO;

        return `
          <article class="overflow-hidden rounded-2xl border border-zinc-200 bg-card shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
            <img src="${escapeHtml(course.bannerUrl)}" alt="Banner do curso" class="h-44 w-full object-cover" />
            <div class="space-y-3 p-4">
              <div class="flex items-start justify-between gap-3">
                <h3 class="text-lg font-extrabold leading-tight">${escapeHtml(course.nome)}</h3>
                <span class="rounded-full border px-2.5 py-1 text-[11px] font-bold ${meta.className}">${meta.label}</span>
              </div>
              <p class="text-sm text-zinc-600 line-clamp-3">${escapeHtml(course.descricao)}</p>
              <div class="grid grid-cols-2 gap-2 text-xs font-semibold text-zinc-600">
                <p>Categoria: <span class="text-zinc-900">${escapeHtml(course.categoria)}</span></p>
                <p>Modalidade: <span class="text-zinc-900">${escapeHtml(course.modalidade)}</span></p>
                <p>Carga horária: <span class="text-zinc-900">${escapeHtml(course.cargaHoraria)}h</span></p>
                <p>Valor: <span class="text-zinc-900">${formatMoney(course.valor)}</span></p>
              </div>
              <button type="button" data-curso-id="${escapeHtml(course.id)}" class="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm font-bold text-zinc-700 hover:bg-zinc-100">
                Editar curso
              </button>
            </div>
          </article>
        `;
      })
      .join('');

    cardsContainer.querySelectorAll('[data-curso-id]').forEach((button) => {
      button.addEventListener('click', () => {
        openModal(button.getAttribute('data-curso-id'));
      });
    });
  };

  const openModal = (courseId = null) => {
    cursoEditandoId = courseId;

    const baseData = {
      nome: '',
      bannerUrl: 'https://images.unsplash.com/photo-1516321497487-e288fb19713f?auto=format&fit=crop&w=1200&q=80',
      cargaHoraria: 1,
      valor: 0,
      descricao: '',
      categoria: '',
      modalidade: 'Presencial',
      status: 'ATIVO',
      coordenador: '',
    };

    const selected = courses.find((item) => item.id === courseId);
    const data = selected ? { ...selected } : baseData;

    if (form) {
      form.nome.value = data.nome;
      form.bannerUrl.value = data.bannerUrl;
      form.cargaHoraria.value = data.cargaHoraria;
      form.valor.value = data.valor;
      form.descricao.value = data.descricao;
      form.categoria.value = data.categoria;
      form.modalidade.value = data.modalidade;
      form.status.value = data.status;
      form.coordenador.value = data.coordenador;
    }

    if (modalTitle) {
      modalTitle.textContent = selected ? selected.nome : 'Novo curso acadêmico';
    }

    if (apagarCursoBtn) {
      apagarCursoBtn.classList.toggle('hidden', !selected);
    }

    refreshPreview();

    modal?.classList.remove('hidden');
    modalOverlay?.classList.remove('hidden');
  };

  const closeModal = () => {
    modal?.classList.add('hidden');
    modalOverlay?.classList.add('hidden');
    cursoEditandoId = null;
  };

  const refreshPreview = () => {
    if (!form) return;

    previewMap.bannerUrl.src = form.bannerUrl.value || 'https://images.unsplash.com/photo-1516321497487-e288fb19713f?auto=format&fit=crop&w=1200&q=80';
    previewMap.nome.textContent = form.nome.value || 'Curso';
    previewMap.categoria.textContent = form.categoria.value || 'Categoria';
    previewMap.descricao.textContent = form.descricao.value || 'Descrição do curso.';
    previewMap.cargaHoraria.textContent = `${Number(form.cargaHoraria.value || 0)}h`;
    previewMap.valor.textContent = formatMoney(form.valor.value || 0);
    previewMap.modalidade.textContent = form.modalidade.value || 'Presencial';
    previewMap.status.textContent = statusMeta[form.status.value]?.label || 'Ativo';
  };

  const saveCourse = (event) => {
    event.preventDefault();
    if (!form) return;

    const payload = {
      id: cursoEditandoId || `curso-${Date.now()}`,
      nome: form.nome.value.trim(),
      bannerUrl: form.bannerUrl.value.trim(),
      cargaHoraria: Number(form.cargaHoraria.value || 0),
      valor: Number(form.valor.value || 0),
      descricao: form.descricao.value.trim(),
      categoria: form.categoria.value.trim(),
      modalidade: form.modalidade.value,
      status: form.status.value,
      coordenador: form.coordenador.value.trim(),
    };

    if (!payload.nome || !payload.categoria || !payload.coordenador) return;

    const index = courses.findIndex((item) => item.id === payload.id);
    if (index >= 0) {
      courses[index] = payload;
    } else {
      courses.unshift(payload);
    }

    persistCourses();
    renderCards();
    closeModal();
  };

  const deleteCourse = () => {
    if (!cursoEditandoId) return;

    courses = courses.filter((item) => item.id !== cursoEditandoId);
    persistCourses();
    renderCards();
    closeModal();
  };

  const bindEvents = () => {
    form?.addEventListener('submit', saveCourse);
    novoCursoBtn?.addEventListener('click', () => openModal());
    fecharModalBtn?.addEventListener('click', closeModal);
    cancelarModalBtn?.addEventListener('click', closeModal);
    modalOverlay?.addEventListener('click', closeModal);
    apagarCursoBtn?.addEventListener('click', deleteCourse);

    ['nome', 'bannerUrl', 'cargaHoraria', 'valor', 'descricao', 'categoria', 'modalidade', 'status'].forEach((name) => {
      form?.[name]?.addEventListener('input', refreshPreview);
      form?.[name]?.addEventListener('change', refreshPreview);
    });
  };

  const init = () => {
    loadCourses();
    renderCards();
    bindEvents();
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
