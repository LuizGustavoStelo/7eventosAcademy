(() => {
  const API_BASE_URL = '/api';
  const TOKEN_KEY = 'academy-auth-token';

  const cardsContainer = document.getElementById('cards-cursos');
  const modal = document.getElementById('modal-curso');
  const modalOverlay = document.getElementById('modal-overlay');
  const form = document.getElementById('curso-form');
  const novoCursoBtn = document.getElementById('novo-curso');
  const fecharModalBtn = document.getElementById('fechar-modal');
  const cancelarModalBtn = document.getElementById('cancelar-modal');
  const apagarCursoBtn = document.getElementById('apagar-curso');
  const modalTitle = document.getElementById('modal-title');
  const bannerFileInput = document.getElementById('bannerFile');
  const bannerSelectorBtn = document.getElementById('selecionar-banner');
  const bannerFileName = document.getElementById('banner-file-name');
  const installmentsFields = document.getElementById('installments-fields');

  const previewMap = {
    bannerUrl: document.getElementById('preview-banner'),
    nome: document.getElementById('preview-nome'),
    categoria: document.getElementById('preview-categoria'),
    descricao: document.getElementById('preview-descricao'),
    cargaHoraria: document.getElementById('preview-carga'),
    valorTotal: document.getElementById('preview-valor-total'),
    modalidade: document.getElementById('preview-modalidade'),
    status: document.getElementById('preview-status'),
    pagamento: document.getElementById('preview-pagamento'),
  };

  const statusMeta = {
    ACTIVE: { label: 'Ativo', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
    DRAFT: { label: 'Rascunho', className: 'bg-amber-50 text-amber-700 border-amber-200' },
    INACTIVE: { label: 'Inativo', className: 'bg-zinc-100 text-zinc-700 border-zinc-300' },
  };

  const modalityLabels = {
    PRESENTIAL: 'Presencial',
    HYBRID: 'Híbrido',
    EAD: 'EAD',
  };

  const paymentLabels = {
    CASH: 'Pagamento à vista',
    INSTALLMENTS: 'Mensalidades',
  };

  let courses = [];
  let cursoEditandoId = null;
  let bannerSelecionado = null;

  const formatMoney = (value) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value || 0));

  const getToken = () => window.sessionStorage.getItem(TOKEN_KEY) || '';

  const escapeHtml = (value) =>
    String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');

  const readErrorMessage = async (response) => {
    try {
      const data = await response.json();
      if (Array.isArray(data?.message)) return data.message.join(' ');
      if (typeof data?.message === 'string') return data.message;
    } catch {
      // sem conteúdo json
    }
    return `Falha na requisição (${response.status}).`;
  };

  const requestJson = async (path, options = {}) => {
    const token = getToken();
    const response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
    });

    if (!response.ok) {
      throw new Error(await readErrorMessage(response));
    }

    return response.json();
  };

  const loadCourses = async () => {
    courses = await requestJson('/courses');
    renderCards();
  };

  const paymentSummary = (course) => {
    if (course.paymentModel !== 'INSTALLMENTS') {
      return 'À vista';
    }

    const months = Number(course.installmentMonths || 0);
    const installment = Number(course.installmentValue || 0);
    return `${months}x de ${formatMoney(installment)}`;
  };

  const renderCards = () => {
    if (!cardsContainer) return;

    cardsContainer.innerHTML = courses
      .map((course) => {
        const meta = statusMeta[course.status] || statusMeta.ACTIVE;

        return `
          <article class="overflow-hidden rounded-2xl border border-zinc-200 bg-card shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
            <img src="${escapeHtml(course.bannerUrl || 'https://images.unsplash.com/photo-1516321497487-e288fb19713f?auto=format&fit=crop&w=1200&q=80')}" alt="Banner do curso" class="h-44 w-full object-cover" />
            <div class="space-y-3 p-4">
              <div class="flex items-start justify-between gap-3">
                <h3 class="text-lg font-extrabold leading-tight">${escapeHtml(course.name)}</h3>
                <span class="rounded-full border px-2.5 py-1 text-[11px] font-bold ${meta.className}">${meta.label}</span>
              </div>
              <p class="text-sm text-zinc-600 line-clamp-3">${escapeHtml(course.description || 'Sem descrição cadastrada.')}</p>
              <div class="grid grid-cols-2 gap-2 text-xs font-semibold text-zinc-600">
                <p>Categoria: <span class="text-zinc-900">${escapeHtml(course.category || '-')}</span></p>
                <p>Modalidade: <span class="text-zinc-900">${modalityLabels[course.modality] || 'Presencial'}</span></p>
                <p>Carga horária: <span class="text-zinc-900">${Number(course.workloadHours || 0)}h</span></p>
                <p>Valor total: <span class="text-zinc-900">${formatMoney(course.price)}</span></p>
                <p class="col-span-2">Pagamento: <span class="text-zinc-900">${paymentSummary(course)}</span></p>
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
    bannerSelecionado = null;

    const selected = courses.find((item) => item.id === courseId);
    const data = selected || {
      name: '',
      description: '',
      category: '',
      coordinator: '',
      workloadHours: 1,
      price: 0,
      paymentModel: 'CASH',
      installmentMonths: 12,
      installmentValue: 0,
      modality: 'PRESENTIAL',
      status: 'ACTIVE',
      bannerUrl:
        'https://images.unsplash.com/photo-1516321497487-e288fb19713f?auto=format&fit=crop&w=1200&q=80',
    };

    form.nome.value = data.name || '';
    form.bannerUrl.value = data.bannerUrl || '';
    form.cargaHoraria.value = Number(data.workloadHours || 1);
    form.valor.value = Number(data.price || 0);
    form.paymentModel.value = data.paymentModel || 'CASH';
    form.installmentMonths.value = Number(data.installmentMonths || 12);
    form.installmentValue.value = Number(data.installmentValue || 0);
    form.descricao.value = data.description || '';
    form.categoria.value = data.category || '';
    form.modalidade.value = data.modality || 'PRESENTIAL';
    form.status.value = data.status || 'ACTIVE';
    form.coordenador.value = data.coordinator || '';

    if (bannerFileInput) {
      bannerFileInput.value = '';
    }

    if (bannerFileName) {
      bannerFileName.textContent = 'Nenhum arquivo selecionado.';
    }

    if (modalTitle) {
      modalTitle.textContent = selected ? selected.name : 'Novo curso acadêmico';
    }

    if (apagarCursoBtn) {
      apagarCursoBtn.classList.toggle('hidden', !selected);
    }

    updateInstallmentsUI();
    if (form.paymentModel.value === 'INSTALLMENTS' && !selected) {
      recalculateInstallment();
    }
    refreshPreview();

    modal?.classList.remove('hidden');
    modalOverlay?.classList.remove('hidden');
  };

  const closeModal = () => {
    modal?.classList.add('hidden');
    modalOverlay?.classList.add('hidden');
    cursoEditandoId = null;
    bannerSelecionado = null;
  };

  const updateInstallmentsUI = () => {
    const isInstallments = form.paymentModel.value === 'INSTALLMENTS';
    installmentsFields?.classList.toggle('hidden', !isInstallments);
  };

  const recalculateInstallment = () => {
    if (form.paymentModel.value !== 'INSTALLMENTS') return;

    const total = Number(form.valor.value || 0);
    const months = Math.max(1, Number(form.installmentMonths.value || 1));
    const value = total > 0 ? total / months : 0;
    form.installmentValue.value = value.toFixed(2);
  };

  const refreshPreview = () => {
    const fallbackBanner =
      'https://images.unsplash.com/photo-1516321497487-e288fb19713f?auto=format&fit=crop&w=1200&q=80';
    previewMap.bannerUrl.src = form.bannerUrl.value || fallbackBanner;
    previewMap.nome.textContent = form.nome.value || 'Curso';
    previewMap.categoria.textContent = form.categoria.value || 'Categoria';
    previewMap.descricao.textContent = form.descricao.value || 'Descrição do curso.';
    previewMap.cargaHoraria.textContent = `${Number(form.cargaHoraria.value || 0)}h`;
    previewMap.valorTotal.textContent = formatMoney(form.valor.value || 0);
    previewMap.modalidade.textContent = modalityLabels[form.modalidade.value] || 'Presencial';
    previewMap.status.textContent = statusMeta[form.status.value]?.label || 'Ativo';

    if (form.paymentModel.value === 'INSTALLMENTS') {
      previewMap.pagamento.textContent = `${Number(form.installmentMonths.value || 0)}x de ${formatMoney(form.installmentValue.value || 0)}`;
    } else {
      previewMap.pagamento.textContent = paymentLabels.CASH;
    }
  };

  const uploadBanner = async (courseId, file) => {
    const token = getToken();
    const formData = new FormData();
    formData.append('banner', file);

    const response = await fetch(`${API_BASE_URL}/courses/${courseId}/banner`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: formData,
    });

    if (!response.ok) {
      throw new Error(await readErrorMessage(response));
    }

    return response.json();
  };

  const saveCourse = async (event) => {
    event.preventDefault();

    const payload = {
      name: form.nome.value.trim(),
      description: form.descricao.value.trim(),
      category: form.categoria.value.trim(),
      coordinator: form.coordenador.value.trim(),
      workloadHours: Number(form.cargaHoraria.value || 0),
      price: Number(form.valor.value || 0),
      paymentModel: form.paymentModel.value,
      installmentMonths:
        form.paymentModel.value === 'INSTALLMENTS'
          ? Number(form.installmentMonths.value || 1)
          : null,
      installmentValue:
        form.paymentModel.value === 'INSTALLMENTS'
          ? Number(form.installmentValue.value || 0)
          : null,
      modality: form.modalidade.value,
      status: form.status.value,
    };

    if (!payload.name || !payload.category || !payload.coordinator) {
      alert('Preencha nome, categoria e coordenador/professor.');
      return;
    }

    try {
      let courseId = cursoEditandoId;

      if (courseId) {
        await requestJson(`/courses/${courseId}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
      } else {
        const created = await requestJson('/courses', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        courseId = created.id;
      }

      if (bannerSelecionado && courseId) {
        await uploadBanner(courseId, bannerSelecionado);
      }

      await loadCourses();
      closeModal();
    } catch (error) {
      alert(error.message || 'Não foi possível salvar o curso.');
    }
  };

  const deleteCourse = async () => {
    if (!cursoEditandoId) return;

    try {
      await requestJson(`/courses/${cursoEditandoId}`, { method: 'DELETE' });
      await loadCourses();
      closeModal();
    } catch (error) {
      alert(error.message || 'Não foi possível excluir o curso.');
    }
  };

  const bindEvents = () => {
    form?.addEventListener('submit', saveCourse);
    novoCursoBtn?.addEventListener('click', () => openModal());
    fecharModalBtn?.addEventListener('click', closeModal);
    cancelarModalBtn?.addEventListener('click', closeModal);
    modalOverlay?.addEventListener('click', closeModal);
    apagarCursoBtn?.addEventListener('click', deleteCourse);

    bannerSelectorBtn?.addEventListener('click', () => bannerFileInput?.click());

    bannerFileInput?.addEventListener('change', () => {
      const file = bannerFileInput.files?.[0];
      bannerSelecionado = file || null;

      if (!file) {
        if (bannerFileName) bannerFileName.textContent = 'Nenhum arquivo selecionado.';
        refreshPreview();
        return;
      }

      if (bannerFileName) {
        bannerFileName.textContent = file.name;
      }

      const objectUrl = URL.createObjectURL(file);
      form.bannerUrl.value = objectUrl;
      refreshPreview();
    });

    form?.paymentModel?.addEventListener('change', () => {
      updateInstallmentsUI();
      if (form.paymentModel.value === 'INSTALLMENTS') {
        recalculateInstallment();
      }
      refreshPreview();
    });

    form?.valor?.addEventListener('input', () => {
      recalculateInstallment();
      refreshPreview();
    });

    form?.installmentMonths?.addEventListener('input', () => {
      recalculateInstallment();
      refreshPreview();
    });

    ['nome', 'cargaHoraria', 'descricao', 'categoria', 'modalidade', 'status', 'installmentValue'].forEach((name) => {
      form?.[name]?.addEventListener('input', refreshPreview);
      form?.[name]?.addEventListener('change', refreshPreview);
    });
  };

  const init = async () => {
    bindEvents();

    try {
      await loadCourses();
    } catch (error) {
      cardsContainer.innerHTML = `
        <div class="col-span-full rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
          Falha ao carregar cursos: ${escapeHtml(error.message || 'erro desconhecido')}
        </div>
      `;
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
