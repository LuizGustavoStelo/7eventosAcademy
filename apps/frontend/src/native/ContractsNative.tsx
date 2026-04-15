import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent, PointerEvent as ReactPointerEvent } from 'react';
import { API_BASE_URL, apiRequest } from './api';
import {
  CONTRACT_BASE_PRESETS,
  DEFAULT_CONTRACT_BASE_PRESET_ID,
} from './contractBaseTemplates';
import { ContractWordEditor, type ContractPlaceholder } from './ContractWordEditor';
import { buildContractPreviewSrcDoc } from './contractPreview';

type ContractTemplate = {
  id: string;
  institutionId: string;
  name: string;
  description: string | null;
  status: string;
  draftTitle: string;
  draftHtmlContent: string;
  latestVersionNumber: number;
  publishedAt: string | null;
  institutionSignedAt: string | null;
  institutionSignedByUserId: string | null;
  institutionSignedByName: string | null;
  updatedAt: string;
  autoSendEnabled: boolean;
  autoSendAllCourses: boolean;
  autoSendCourseIds: string[];
  latestVersion: {
    id: string;
    versionNumber: number;
    title: string;
    publishedAt: string;
  } | null;
};

type ContractInstanceItem = {
  id: string;
  status: string;
  sentAt: string | null;
  viewedAt: string | null;
  signedAt: string | null;
  signatureCode: string;
  institutionSignedAt: string | null;
  institutionSignedByName: string | null;
  institutionSignaturePending: boolean;
  template: {
    id: string;
    name: string;
  };
  templateVersion: {
    id: string;
    versionNumber: number;
    title: string;
  };
  student: {
    id: string;
    name: string;
    emailMasked: string;
  };
};

type ContractInstanceDetails = {
  id: string;
  status: string;
  sentAt: string | null;
  viewedAt: string | null;
  signedAt: string | null;
  signatureCode: string;
  institutionSignedAt: string | null;
  institutionSignedByName: string | null;
  institutionSignaturePending: boolean;
  snapshotTemplateTitle: string;
  documentHtml: string;
  student: {
    id: string;
    name: string;
    emailMasked: string;
  };
  template: {
    id: string;
    name: string;
  };
  templateVersion: {
    id: string;
    versionNumber: number;
    title: string;
  };
  auditLogs?: Array<{
    id: string;
    action: string;
    actorType: string;
    actorUserId: string | null;
    payload: unknown;
    createdAt: string;
  }>;
};

type StudentOption = {
  id: string;
  name: string;
  email: string;
};

type CourseOption = {
  id: string;
  name: string;
};

type ClassOption = {
  id: string;
  name: string;
};

type TemplateFormState = {
  name: string;
  description: string;
  draftTitle: string;
  draftHtmlContent: string;
};

type SendFormState = {
  templateIds: string[];
  studentId: string;
  courseId: string;
  classId: string;
  enrollmentId: string;
  expiresInHours: string;
  sendEmail: boolean;
};

type ContractsNativeProps = {
  token: string;
  mode?: 'hub' | 'editor';
};

type DrawState = {
  active: boolean;
  pointerId: number | null;
  lastX: number;
  lastY: number;
};

const EMPTY_DRAW_STATE: DrawState = {
  active: false,
  pointerId: null,
  lastX: 0,
  lastY: 0,
};
const MIN_REQUIRED_CONTRACTS_PER_SEND = 2;

const CONTRACT_EDITOR_PLACEHOLDERS: ContractPlaceholder[] = [
  { id: 'aluno_nome', label: 'Aluno: nome', token: '{{aluno_nome}}' },
  { id: 'aluno_email', label: 'Aluno: e-mail', token: '{{aluno_email}}' },
  { id: 'aluno_documento', label: 'Aluno: documento (CPF)', token: '{{aluno_documento}}' },
  { id: 'aluno_cpf', label: 'Aluno: CPF', token: '{{aluno_cpf}}' },
  { id: 'aluno_rg', label: 'Aluno: RG', token: '{{aluno_rg}}' },
  {
    id: 'aluno_orgao_expedidor',
    label: 'Aluno: \u00F3rg\u00E3o expedidor',
    token: '{{aluno_orgao_expedidor}}',
  },
  { id: 'aluno_telefone', label: 'Aluno: telefone', token: '{{aluno_telefone}}' },
  {
    id: 'aluno_data_nascimento',
    label: 'Aluno: data de nascimento',
    token: '{{aluno_data_nascimento}}',
  },
  { id: 'aluno_cidade_nascimento', label: 'Aluno: cidade de nascimento', token: '{{aluno_cidade_nascimento}}' },
  {
    id: 'aluno_estado_civil',
    label: 'Aluno: estado civil',
    token: '{{aluno_estado_civil}}',
  },
  { id: 'aluno_nome_pai', label: 'Aluno: nome do pai', token: '{{aluno_nome_pai}}' },
  { id: 'aluno_nome_mae', label: 'Aluno: nome da mãe', token: '{{aluno_nome_mae}}' },
  { id: 'aluno_graduacao', label: 'Aluno: graduação', token: '{{aluno_graduacao}}' },
  {
    id: 'aluno_ano_conclusao_graduacao',
    label: 'Aluno: ano de conclusão',
    token: '{{aluno_ano_conclusao_graduacao}}',
  },
  { id: 'aluno_empresa', label: 'Aluno: empresa', token: '{{aluno_empresa}}' },
  { id: 'aluno_cargo', label: 'Aluno: cargo', token: '{{aluno_cargo}}' },
  { id: 'aluno_cep', label: 'Aluno: CEP', token: '{{aluno_cep}}' },
  { id: 'aluno_endereco', label: 'Aluno: endereço', token: '{{aluno_endereco}}' },
  {
    id: 'aluno_numero_endereco',
    label: 'Aluno: número',
    token: '{{aluno_numero_endereco}}',
  },
  { id: 'curso_nome', label: 'Curso: nome', token: '{{curso_nome}}' },
  { id: 'turma_nome', label: 'Turma: nome', token: '{{turma_nome}}' },
  { id: 'matricula_id', label: 'Matrícula: ID', token: '{{matricula_id}}' },
  { id: 'contratada_nome', label: 'Contratada: nome', token: '{{contratada_nome}}' },
  { id: 'contratada_cnpj', label: 'Contratada: CNPJ', token: '{{contratada_cnpj}}' },
  { id: 'contratada_endereco', label: 'Contratada: endereço', token: '{{contratada_endereco}}' },
  { id: 'contrato_foro', label: 'Contrato: foro', token: '{{contrato_foro}}' },
  {
    id: 'financeiro_parcelas_total',
    label: 'Financeiro: total de parcelas',
    token: '{{financeiro_parcelas_total}}',
  },
  {
    id: 'financeiro_parcelas_texto',
    label: 'Financeiro: parcelas (texto)',
    token: '{{financeiro_parcelas_texto}}',
  },
  {
    id: 'financeiro_parcelas_tabela_html',
    label: 'Financeiro: tabela de parcelas (HTML)',
    token: '{{{financeiro_parcelas_tabela_html}}}',
  },
  {
    id: 'financeiro_forma_pagamento',
    label: 'Financeiro: forma de pagamento',
    token: '{{financeiro_forma_pagamento}}',
  },
  { id: 'financeiro_valor_total', label: 'Financeiro: valor total', token: '{{financeiro_valor_total}}' },
  {
    id: 'financeiro_taxa_matricula',
    label: 'Financeiro: taxa de matrícula',
    token: '{{financeiro_taxa_matricula}}',
  },
  {
    id: 'financeiro_quantidade_parcelas',
    label: 'Financeiro: quantidade de parcelas',
    token: '{{financeiro_quantidade_parcelas}}',
  },
  {
    id: 'financeiro_valor_parcela',
    label: 'Financeiro: valor da parcela',
    token: '{{financeiro_valor_parcela}}',
  },
  {
    id: 'financeiro_formas_valores_resumo',
    label: 'Financeiro: resumo formas/valores',
    token: '{{financeiro_formas_valores_resumo}}',
  },
  { id: 'contrato_cidade_assinatura', label: 'Contrato: cidade da assinatura', token: '{{contrato_cidade_assinatura}}' },
  { id: 'contrato_data_emissao', label: 'Contrato: data de emissão', token: '{{contrato_data_emissao}}' },
  {
    id: 'contrato_data_emissao_extenso',
    label: 'Contrato: data por extenso',
    token: '{{contrato_data_emissao_extenso}}',
  },
  {
    id: 'contrato_datahora_emissao',
    label: 'Contrato: data/hora de emissão',
    token: '{{contrato_datahora_emissao}}',
  },
  { id: 'assinado_por_nome', label: 'Assinante', token: '{{assinado_por_nome}}' },
  { id: 'assinado_em', label: 'Data/hora da assinatura', token: '{{assinado_em}}' },
  { id: 'codigo_assinatura', label: 'Código da assinatura', token: '{{codigo_assinatura}}' },
];

function resolveBasePresetForm(
  presetId = DEFAULT_CONTRACT_BASE_PRESET_ID,
): TemplateFormState {
  const preset =
    CONTRACT_BASE_PRESETS.find((item) => item.id === presetId) ??
    CONTRACT_BASE_PRESETS[0];

  return {
    name: preset?.form.name || '',
    description: preset?.form.description || '',
    draftTitle: preset?.form.draftTitle || 'Contrato Educacional',
    draftHtmlContent: preset?.form.draftHtmlContent || '',
  };
}

function defaultTemplateForm(): TemplateFormState {
  return resolveBasePresetForm();
}

function defaultSendForm(): SendFormState {
  return {
    templateIds: [],
    studentId: '',
    courseId: '',
    classId: '',
    enrollmentId: '',
    expiresInHours: '72',
    sendEmail: true,
  };
}

function formatDateTime(value: string | null | undefined): string {
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

function templateStatusLabel(status: string): string {
  const normalized = status.trim().toUpperCase();
  if (normalized === 'DRAFT') return 'Rascunho';
  if (normalized === 'PUBLISHED') return 'Publicado';
  if (normalized === 'ARCHIVED') return 'Arquivado';
  return status;
}

function templateStatusTone(status: string): string {
  const normalized = status.trim().toUpperCase();
  if (normalized === 'PUBLISHED') return 'is-success';
  if (normalized === 'ARCHIVED') return 'is-muted';
  return 'is-warning';
}

function contractStatusLabel(status: string): string {
  const normalized = status.trim().toUpperCase();
  if (normalized === 'SENT') return 'Enviado';
  if (normalized === 'VIEWED') return 'Visualizado';
  if (normalized === 'PIN_VERIFIED') return 'PIN validado';
  if (normalized === 'SIGNED') return 'Assinado';
  if (normalized === 'EXPIRED') return 'Expirado';
  if (normalized === 'ARCHIVED') return 'Arquivado';
  if (normalized === 'CANCELED') return 'Cancelado';
  return status;
}

function contractStatusTone(status: string): string {
  const normalized = status.trim().toUpperCase();
  if (normalized === 'SIGNED') return 'is-success';
  if (normalized === 'PIN_VERIFIED' || normalized === 'VIEWED') return 'is-info';
  if (normalized === 'EXPIRED' || normalized === 'CANCELED') return 'is-danger';
  if (normalized === 'ARCHIVED') return 'is-muted';
  return 'is-warning';
}

function hasStudentSignaturePending(status: string): boolean {
  const normalized = status.trim().toUpperCase();
  return normalized === 'SENT' || normalized === 'VIEWED' || normalized === 'PIN_VERIFIED';
}

function hasInstitutionSignaturePending(item: {
  status: string;
  institutionSignedAt?: string | null;
  institutionSignaturePending?: boolean;
}): boolean {
  const normalized = item.status.trim().toUpperCase();
  if (normalized === 'ARCHIVED' || normalized === 'CANCELED' || normalized === 'EXPIRED') {
    return false;
  }
  if (item.institutionSignaturePending === true) return true;
  return !item.institutionSignedAt;
}

function isTemplateInstitutionSigned(template: {
  institutionSignedAt?: string | null;
} | null | undefined): boolean {
  return Boolean(template?.institutionSignedAt);
}

function hasAnySignaturePending(item: {
  status: string;
  institutionSignedAt?: string | null;
  institutionSignaturePending?: boolean;
}): boolean {
  return hasStudentSignaturePending(item.status) || hasInstitutionSignaturePending(item);
}

function toSafePositiveInteger(value: string, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  const normalized = Math.trunc(parsed);
  return normalized > 0 ? normalized : fallback;
}

export function ContractsNative({ token, mode = 'hub' }: ContractsNativeProps) {
  const isEditorMode = mode === 'editor';
  const editorParams = isEditorMode ? new URLSearchParams(window.location.search) : null;
  const editorTemplateIdParam = editorParams?.get('templateId')?.trim() || '';
  const editorIsNewParam = editorParams?.get('novo') === '1';
  const [templates, setTemplates] = useState<ContractTemplate[]>([]);
  const [instances, setInstances] = useState<ContractInstanceItem[]>([]);
  const [allInstances, setAllInstances] = useState<ContractInstanceItem[]>([]);
  const [students, setStudents] = useState<StudentOption[]>([]);
  const [courses, setCourses] = useState<CourseOption[]>([]);
  const [classes, setClasses] = useState<ClassOption[]>([]);

  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [templateForm, setTemplateForm] = useState<TemplateFormState>(() => defaultTemplateForm());
  const [sendForm, setSendForm] = useState<SendFormState>(() => defaultSendForm());
  const [autoSendEnabled, setAutoSendEnabled] = useState(false);
  const [autoSendAllCourses, setAutoSendAllCourses] = useState(true);
  const [autoSendCourseIds, setAutoSendCourseIds] = useState<string[]>([]);
  const [sendAccordionOpen, setSendAccordionOpen] = useState(false);
  const [instanceStatusFilter, setInstanceStatusFilter] = useState('all');

  const [loading, setLoading] = useState(true);
  const [templateSaving, setTemplateSaving] = useState(false);
  const [templatePublishing, setTemplatePublishing] = useState(false);
  const [autoSendSaving, setAutoSendSaving] = useState(false);
  const [sendingInstance, setSendingInstance] = useState(false);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [downloadingInstanceId, setDownloadingInstanceId] = useState<string | null>(
    null,
  );
  const [deletingInstanceId, setDeletingInstanceId] = useState<string | null>(null);
  const [deletingTemplateId, setDeletingTemplateId] = useState<string | null>(null);
  const [signingInstitutionInstanceId, setSigningInstitutionInstanceId] = useState<string | null>(
    null,
  );
  const [signingTemplateInstitution, setSigningTemplateInstitution] = useState(false);
  const [institutionSignerName, setInstitutionSignerName] = useState('');
  const [institutionSignModalOpen, setInstitutionSignModalOpen] = useState(false);
  const [institutionSignerNameDraft, setInstitutionSignerNameDraft] = useState('');
  const [institutionAcceptTermsDraft, setInstitutionAcceptTermsDraft] = useState(false);
  const signatureCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawStateRef = useRef<DrawState>(EMPTY_DRAW_STATE);
  const [hasSignatureStroke, setHasSignatureStroke] = useState(false);

  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');
  const [formError, setFormError] = useState('');
  const [sendError, setSendError] = useState('');
  const [autoSendError, setAutoSendError] = useState('');

  const [detailsOpen, setDetailsOpen] = useState(false);
  const [selectedInstanceDetails, setSelectedInstanceDetails] =
    useState<ContractInstanceDetails | null>(null);

  const selectedTemplate = useMemo(
    () => templates.find((item) => item.id === selectedTemplateId) ?? null,
    [templates, selectedTemplateId],
  );
  const isSelectedTemplatePublished =
    selectedTemplate?.status.trim().toUpperCase() === 'PUBLISHED';
  const isSelectedTemplateInstitutionSigned = isTemplateInstitutionSigned(selectedTemplate);
  const selectedTemplateCourseNames = useMemo(() => {
    if (!selectedTemplate) return [] as string[];
    const ids = Array.isArray(selectedTemplate.autoSendCourseIds)
      ? selectedTemplate.autoSendCourseIds
      : [];
    if (ids.length === 0) return [] as string[];
    const courseMap = new Map(courses.map((course) => [course.id, course.name]));
    return ids.map((id) => courseMap.get(id) ?? id);
  }, [selectedTemplate, courses]);
  const isEditingTemplate = isEditorMode && !editorIsNewParam && Boolean(editorTemplateIdParam || selectedTemplateId);

  const resetSignatureCanvas = useCallback(() => {
    const canvas = signatureCanvasRef.current;
    if (!canvas) return;

    const width = Math.max(canvas.clientWidth || 0, 320);
    const height = Math.max(canvas.clientHeight || 0, 180);
    const ratio = Math.max(window.devicePixelRatio || 1, 1);

    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);

    const context = canvas.getContext('2d');
    if (!context) return;

    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.lineWidth = 2.6 * ratio;
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.strokeStyle = '#0f172a';

    drawStateRef.current = { ...EMPTY_DRAW_STATE };
    setHasSignatureStroke(false);
  }, []);

  const getCanvasPoint = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const canvas = signatureCanvasRef.current;
    if (!canvas) return null;

    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;

    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (event.clientX - rect.left) * scaleX,
      y: (event.clientY - rect.top) * scaleY,
    };
  };

  const handleSignaturePointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const canvas = signatureCanvasRef.current;
    const context = canvas?.getContext('2d');
    const point = getCanvasPoint(event);
    if (!canvas || !context || !point) return;

    canvas.setPointerCapture(event.pointerId);
    drawStateRef.current = {
      active: true,
      pointerId: event.pointerId,
      lastX: point.x,
      lastY: point.y,
    };

    context.beginPath();
    context.moveTo(point.x, point.y);
    context.lineTo(point.x + 0.01, point.y + 0.01);
    context.stroke();

    setHasSignatureStroke(true);
  };

  const handleSignaturePointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!drawStateRef.current.active) return;

    const context = signatureCanvasRef.current?.getContext('2d');
    const point = getCanvasPoint(event);
    if (!context || !point) return;

    context.beginPath();
    context.moveTo(drawStateRef.current.lastX, drawStateRef.current.lastY);
    context.lineTo(point.x, point.y);
    context.stroke();

    drawStateRef.current.lastX = point.x;
    drawStateRef.current.lastY = point.y;
    setHasSignatureStroke(true);
  };

  const finishSignaturePointer = (pointerId?: number) => {
    const canvas = signatureCanvasRef.current;

    if (
      pointerId !== undefined &&
      drawStateRef.current.pointerId !== null &&
      pointerId !== drawStateRef.current.pointerId
    ) {
      return;
    }

    if (canvas && drawStateRef.current.pointerId !== null) {
      try {
        canvas.releasePointerCapture(drawStateRef.current.pointerId);
      } catch {
        // Ignore release errors when the pointer was not captured.
      }
    }

    drawStateRef.current = { ...EMPTY_DRAW_STATE };
  };

  const createSignatureDataUrl = (): string | null => {
    if (!hasSignatureStroke) return null;
    const canvas = signatureCanvasRef.current;
    if (!canvas) return null;
    return canvas.toDataURL('image/png');
  };

  const sendableTemplates = useMemo(
    () =>
      templates.filter(
        (item) =>
          item.status.trim().toUpperCase() === 'PUBLISHED' &&
          Number(item.latestVersionNumber || 0) > 0 &&
          isTemplateInstitutionSigned(item),
      ),
    [templates],
  );

  const loadTemplates = async () => {
    const data = await apiRequest<ContractTemplate[]>(token, '/contracts/templates', undefined, {
      bypassCache: true,
    });
    setTemplates(Array.isArray(data) ? data : []);
  };

  const loadInstances = async (statusFilter: string) => {
    const params = new URLSearchParams();
    if (statusFilter !== 'all') {
      params.set('status', statusFilter);
    }

    const suffix = params.toString();
    const path = suffix ? `/contracts/instances?${suffix}` : '/contracts/instances';
    const data = await apiRequest<ContractInstanceItem[]>(token, path, undefined, {
      bypassCache: true,
    });
    setInstances(Array.isArray(data) ? data : []);
  };

  const loadAllInstancesForSignals = async () => {
    const data = await apiRequest<ContractInstanceItem[]>(
      token,
      '/contracts/instances',
      undefined,
      {
        bypassCache: true,
      },
    );
    setAllInstances(Array.isArray(data) ? data : []);
  };

  const loadOptions = async () => {
    const [studentsData, coursesData, classesData] = await Promise.all([
      apiRequest<StudentOption[]>(token, '/students', undefined, { bypassCache: true }),
      apiRequest<CourseOption[]>(token, '/courses', undefined, { bypassCache: true }),
      apiRequest<ClassOption[]>(token, '/classes', undefined, { bypassCache: true }),
    ]);

    const studentsSafe = (Array.isArray(studentsData) ? studentsData : []).map((item) => ({
      id: item.id,
      name: item.name,
      email: item.email,
    }));

    const coursesSafe = (Array.isArray(coursesData) ? coursesData : []).map((item) => ({
      id: item.id,
      name: item.name,
    }));

    const classesSafe = (Array.isArray(classesData) ? classesData : []).map((item) => ({
      id: item.id,
      name: item.name,
    }));

    setStudents(studentsSafe);
    setCourses(coursesSafe);
    setClasses(classesSafe);
  };

  const loadAll = async (statusFilter: string, showLoading = true) => {
    if (showLoading) setLoading(true);
    setError('');
    try {
      if (isEditorMode) {
        await Promise.all([loadTemplates(), loadOptions()]);
      } else {
        await Promise.all([
          loadTemplates(),
          loadInstances(statusFilter),
          loadAllInstancesForSignals(),
          loadOptions(),
        ]);
      }
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : 'Falha ao carregar módulo de contratos.',
      );
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  useEffect(() => {
    void loadAll(instanceStatusFilter, true);
  }, [token, isEditorMode]);

  useEffect(() => {
    if (!isEditorMode) return;
    const params = new URLSearchParams(window.location.search);
    const isNewTemplate = params.get('novo') === '1';
    if (isNewTemplate) {
      setSelectedTemplateId(null);
      setTemplateForm(defaultTemplateForm());
      return;
    }
    const templateId = params.get('templateId')?.trim() || '';
    if (templateId) {
      setSelectedTemplateId(templateId);
    } else {
      setSelectedTemplateId(null);
      setTemplateForm(defaultTemplateForm());
    }
  }, [isEditorMode]);

  useEffect(() => {
    if (!selectedTemplateId) return;
    if (templates.length === 0) return;

    const currentTemplate = templates.find((item) => item.id === selectedTemplateId);
    if (!currentTemplate) {
      setFormError('Modelo selecionado não foi encontrado.');
      return;
    }

    setTemplateForm({
      name: currentTemplate.name,
      description: currentTemplate.description || '',
      draftTitle: currentTemplate.draftTitle,
      draftHtmlContent: currentTemplate.draftHtmlContent,
    });
  }, [selectedTemplateId, templates]);

  useEffect(() => {
    if (isEditorMode) return;
    if (selectedTemplateId) return;
    if (!templates[0]?.id) return;
    setSelectedTemplateId(templates[0].id);
  }, [isEditorMode, selectedTemplateId, templates]);

  useEffect(() => {
    if (!selectedTemplate) {
      setAutoSendEnabled(false);
      setAutoSendAllCourses(true);
      setAutoSendCourseIds([]);
      setInstitutionSignerName('');
      setAutoSendError('');
      return;
    }
    setAutoSendEnabled(Boolean(selectedTemplate.autoSendEnabled));
    setAutoSendAllCourses(Boolean(selectedTemplate.autoSendAllCourses));
    setAutoSendCourseIds(
      Array.isArray(selectedTemplate.autoSendCourseIds)
        ? selectedTemplate.autoSendCourseIds
        : [],
    );
    setInstitutionSignerName(selectedTemplate.institutionSignedByName || '');
    setAutoSendError('');
  }, [selectedTemplate]);

  useEffect(() => {
    if (!institutionSignModalOpen) return;
    const raf = window.requestAnimationFrame(() => {
      resetSignatureCanvas();
    });
    return () => window.cancelAnimationFrame(raf);
  }, [institutionSignModalOpen, resetSignatureCanvas]);

  useEffect(() => {
    if (isEditorMode) return;
    void Promise.all([
      loadInstances(instanceStatusFilter),
      loadAllInstancesForSignals(),
    ]);
  }, [instanceStatusFilter, isEditorMode]);

  useEffect(() => {
    if (isEditorMode) return;
    const selectedSet = new Set(sendForm.templateIds);
    const validSelected = sendableTemplates
      .map((template) => template.id)
      .filter((id) => selectedSet.has(id));

    if (validSelected.length === sendForm.templateIds.length && validSelected.length > 0) {
      return;
    }

    if (
      selectedTemplateId &&
      sendableTemplates.some((template) => template.id === selectedTemplateId)
    ) {
      setSendForm((current) => ({ ...current, templateIds: [selectedTemplateId] }));
      return;
    }

    if (sendableTemplates.length > 0) {
      const firstTemplates = sendableTemplates
        .slice(0, Math.min(sendableTemplates.length, MIN_REQUIRED_CONTRACTS_PER_SEND))
        .map((item) => item.id);
      setSendForm((current) => ({ ...current, templateIds: firstTemplates }));
      return;
    }

    setSendForm((current) => ({ ...current, templateIds: [] }));
  }, [selectedTemplateId, sendableTemplates, sendForm.templateIds, isEditorMode]);

  const openEditorPage = (templateId?: string) => {
    const target = templateId
      ? `/editar-contrato?templateId=${encodeURIComponent(templateId)}`
      : '/editar-contrato?novo=1';
    window.location.href = target;
  };

  const openNewTemplate = () => {
    if (!isEditorMode) {
      openEditorPage();
      return;
    }
    setSelectedTemplateId(null);
    setTemplateForm(defaultTemplateForm());
    setFormError('');
    setFeedback('');
  };

  const pickTemplate = (template: ContractTemplate) => {
    setSelectedTemplateId(template.id);
    setTemplateForm({
      name: template.name,
      description: template.description || '',
      draftTitle: template.draftTitle,
      draftHtmlContent: template.draftHtmlContent,
    });
    setFormError('');
  };

  const applyBasePreset = (presetId: string) => {
    setTemplateForm(resolveBasePresetForm(presetId));
    setFormError('');
    setFeedback('');
  };

  const saveTemplate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError('');
    setFeedback('');
    setError('');

    const payload = {
      name: templateForm.name.trim(),
      description: templateForm.description.trim() || undefined,
      draftTitle: templateForm.draftTitle.trim(),
      draftHtmlContent: templateForm.draftHtmlContent.trim(),
    };

    if (!payload.name || !payload.draftTitle || !payload.draftHtmlContent) {
      setFormError('Preencha nome, título e conteúdo HTML do contrato.');
      return;
    }

    if (selectedTemplate && selectedTemplate.status.trim().toUpperCase() === 'PUBLISHED') {
      setFormError(
        'Modelos publicados aceitam apenas configuracao de envio automatico.',
      );
      return;
    }

    setTemplateSaving(true);
    try {
      if (selectedTemplateId) {
        await apiRequest<ContractTemplate>(token, `/contracts/templates/${selectedTemplateId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        setFeedback('Rascunho do modelo atualizado com sucesso.');
      } else {
        const created = await apiRequest<{ id: string }>(token, '/contracts/templates', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        setSelectedTemplateId(created.id);
        setFeedback('Modelo criado com sucesso.');
      }

      await loadTemplates();
      if (isEditorMode) {
        window.location.href = '/?secao=admin_contratos';
      }
    } catch (saveError) {
      setFormError(
        saveError instanceof Error
          ? saveError.message
          : 'Falha ao salvar o modelo de contrato.',
      );
    } finally {
      setTemplateSaving(false);
    }
  };

  const publishTemplate = async () => {
    if (!selectedTemplateId) {
      if (isEditorMode) setFormError('Selecione um modelo para publicar.');
      else setAutoSendError('Selecione um modelo para publicar.');
      return;
    }

    setFormError('');
    setAutoSendError('');
    setFeedback('');
    setError('');
    setTemplatePublishing(true);

    try {
      await apiRequest(token, `/contracts/templates/${selectedTemplateId}/publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: templateForm.draftTitle.trim(),
          htmlContent: templateForm.draftHtmlContent.trim(),
        }),
      });

      await Promise.all([
        loadTemplates(),
        loadInstances(instanceStatusFilter),
        loadAllInstancesForSignals(),
      ]);
      setFeedback('Versão do contrato publicada com sucesso.');
    } catch (publishError) {
      const message =
        publishError instanceof Error
          ? publishError.message
          : 'Falha ao publicar o modelo.';
      if (isEditorMode) setFormError(message);
      else setAutoSendError(message);
    } finally {
      setTemplatePublishing(false);
    }
  };

  const saveAutoSendSettings = async () => {
    if (!selectedTemplateId) {
      setAutoSendError('Selecione um modelo para configurar o envio automático.');
      return;
    }

    if (autoSendEnabled && !autoSendAllCourses && autoSendCourseIds.length === 0) {
      setAutoSendError('Selecione ao menos um curso ou marque a opção de todos os cursos.');
      return;
    }

    setAutoSendError('');
    setFeedback('');
    setError('');
    setAutoSendSaving(true);
    try {
      await apiRequest(token, `/contracts/templates/${selectedTemplateId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          autoSendEnabled,
          autoSendAllCourses,
          autoSendCourseIds: autoSendAllCourses ? [] : autoSendCourseIds,
        }),
      });

      await loadTemplates();
      setFeedback('Configuração de envio automático atualizada com sucesso.');
    } catch (saveError) {
      setAutoSendError(
        saveError instanceof Error
          ? saveError.message
          : 'Falha ao salvar configuração de envio automático.',
      );
    } finally {
      setAutoSendSaving(false);
    }
  };

  const sendContract = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSendError('');
    setFeedback('');
    setError('');

    if (!sendForm.studentId) {
      setSendError('Selecione o aluno para envio.');
      return;
    }

    const selectedTemplateIds = Array.from(new Set(sendForm.templateIds)).filter((id) =>
      sendableTemplates.some((template) => template.id === id),
    );

    if (selectedTemplateIds.length < MIN_REQUIRED_CONTRACTS_PER_SEND) {
      setSendError(
        `Selecione pelo menos ${MIN_REQUIRED_CONTRACTS_PER_SEND} modelos para envio conjunto.`,
      );
      return;
    }

    setSendingInstance(true);
    try {
      const signatureCodes: string[] = [];
      for (const templateId of selectedTemplateIds) {
        const templateName =
          sendableTemplates.find((template) => template.id === templateId)?.name ||
          templateId;
        const payload = {
          templateId,
          studentId: sendForm.studentId,
          enrollmentId: sendForm.enrollmentId.trim() || undefined,
          courseId: sendForm.courseId || undefined,
          classId: sendForm.classId || undefined,
          expiresInHours: toSafePositiveInteger(sendForm.expiresInHours, 72),
          sendEmail: sendForm.sendEmail,
        };
        try {
          const result = await apiRequest<{
            instanceId: string;
            signatureCode: string;
          }>(token, '/contracts/instances/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });
          signatureCodes.push(result.signatureCode);
        } catch (sendTemplateError) {
          const message =
            sendTemplateError instanceof Error
              ? sendTemplateError.message
              : 'Erro desconhecido.';
          throw new Error(`Falha ao enviar "${templateName}": ${message}`);
        }
      }

      await Promise.all([
        loadInstances(instanceStatusFilter),
        loadAllInstancesForSignals(),
      ]);
      setFeedback(
        `Foram enviados ${selectedTemplateIds.length} contratos. Códigos de assinatura: ${signatureCodes.join(', ')}.`,
      );
      setSendForm((current) => ({
        ...current,
        enrollmentId: '',
        expiresInHours: current.expiresInHours || '72',
      }));
    } catch (sendErr) {
      setSendError(
        sendErr instanceof Error ? sendErr.message : 'Falha ao enviar contratos.',
      );
    } finally {
      setSendingInstance(false);
    }
  };

  const openInstanceDetails = async (instanceId: string) => {
    setLoadingDetails(true);
    setDetailsOpen(true);
    setSelectedInstanceDetails(null);
    try {
      const details = await apiRequest<ContractInstanceDetails>(
        token,
        `/contracts/instances/${instanceId}`,
        undefined,
        { bypassCache: true },
      );
      setSelectedInstanceDetails(details);
    } catch (detailError) {
      setDetailsOpen(false);
      setError(
        detailError instanceof Error
          ? detailError.message
          : 'Falha ao carregar detalhes do contrato.',
      );
    } finally {
      setLoadingDetails(false);
    }
  };

  const downloadInstance = async (instanceId: string) => {
    setDownloadingInstanceId(instanceId);
    setError('');
    setFeedback('');
    try {
      const response = await fetch(
        `${API_BASE_URL}/contracts/instances/${instanceId}/download`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );

      if (!response.ok) {
        let message = `Falha ao baixar contrato (${response.status}).`;
        try {
          const payload = (await response.json()) as { message?: string | string[] };
          if (Array.isArray(payload.message)) {
            message = payload.message.join('\n');
          } else if (typeof payload.message === 'string') {
            message = payload.message;
          }
        } catch {
          // mantém mensagem padrão
        }
        throw new Error(message);
      }

      const blob = await response.blob();
      const disposition = response.headers.get('content-disposition') || '';
      const filenameMatch = disposition.match(/filename=\"?([^\";]+)\"?/i);
      const filename = filenameMatch?.[1] || `contrato-${instanceId}.html`;

      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(url);
    } catch (downloadError) {
      setError(
        downloadError instanceof Error
          ? downloadError.message
          : 'Falha ao baixar contrato.',
      );
    } finally {
      setDownloadingInstanceId((current) =>
        current === instanceId ? null : current,
      );
    }
  };

  const deleteInstance = async (instance: ContractInstanceItem) => {
    const shouldDelete = window.confirm(
      `Desea realmente apagar o contrato "${instance.template.name}" de ${instance.student.name}? Esta ação remove o contrato também da visão do aluno.`,
    );
    if (!shouldDelete) return;

    setDeletingInstanceId(instance.id);
    setError('');
    setFeedback('');

    try {
      await apiRequest<{ success: boolean }>(token, `/contracts/instances/${instance.id}`, {
        method: 'DELETE',
      });

      if (selectedInstanceDetails?.id === instance.id) {
        setDetailsOpen(false);
        setSelectedInstanceDetails(null);
      }

      await Promise.all([
        loadInstances(instanceStatusFilter),
        loadAllInstancesForSignals(),
      ]);
      setFeedback('Contrato apagado com sucesso.');
    } catch (deleteError) {
      setError(
        deleteError instanceof Error ? deleteError.message : 'Falha ao apagar contrato.',
      );
    } finally {
      setDeletingInstanceId((current) => (current === instance.id ? null : current));
    }
  };

  const signInstitutionInstance = async (instance: ContractInstanceItem) => {
    setSigningInstitutionInstanceId(instance.id);
    setError('');
    setFeedback('');

    try {
      await apiRequest(token, `/contracts/instances/${instance.id}/sign-institution`, {
        method: 'POST',
      });

      await Promise.all([
        loadInstances(instanceStatusFilter),
        loadAllInstancesForSignals(),
      ]);

      if (selectedInstanceDetails?.id === instance.id) {
        await openInstanceDetails(instance.id);
      }

      setFeedback('Assinatura institucional registrada com sucesso.');
    } catch (signError) {
      setError(
        signError instanceof Error
          ? signError.message
          : 'Falha ao registrar assinatura institucional.',
      );
    } finally {
      setSigningInstitutionInstanceId((current) =>
        current === instance.id ? null : current,
      );
    }
  };

  const deleteTemplate = async (template: ContractTemplate) => {
    const shouldDelete = window.confirm(
      `Deseja realmente apagar o modelo "${template.name}"? Esta ação também remove contratos enviados por este modelo.`,
    );
    if (!shouldDelete) return;

    setDeletingTemplateId(template.id);
    setError('');
    setFeedback('');

    try {
      await apiRequest<{
        success: boolean;
        deletedInstancesCount: number;
      }>(token, `/contracts/templates/${template.id}`, {
        method: 'DELETE',
      });

      setSelectedTemplateId((current) => (current === template.id ? null : current));
      await loadTemplates();
      if (!isEditorMode) {
        await Promise.all([
          loadInstances(instanceStatusFilter),
          loadAllInstancesForSignals(),
        ]);
      }

      setFeedback('Modelo apagado com sucesso.');
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : 'Falha ao apagar modelo.',
      );
    } finally {
      setDeletingTemplateId((current) => (current === template.id ? null : current));
    }
  };

  const pendingSignatureCountByTemplate = useMemo(() => {
    const counter = new Map<string, number>();

    for (const item of allInstances) {
      if (!hasAnySignaturePending(item)) continue;
      const templateId = item.template?.id;
      if (!templateId) continue;
      counter.set(templateId, (counter.get(templateId) ?? 0) + 1);
    }

    return counter;
  }, [allInstances]);

  const instancesCountByStatus = useMemo(() => {
    const counter = {
      total: instances.length,
      sent: 0,
      viewed: 0,
      pinVerified: 0,
      signed: 0,
      signedInstitutionPending: 0,
    };

    for (const item of instances) {
      const status = item.status.trim().toUpperCase();
      if (status === 'SENT') counter.sent += 1;
      if (status === 'VIEWED') counter.viewed += 1;
      if (status === 'PIN_VERIFIED') counter.pinVerified += 1;
      if (status === 'SIGNED') counter.signed += 1;
      if (hasInstitutionSignaturePending(item)) counter.signedInstitutionPending += 1;
    }

    return counter;
  }, [instances]);

  const pendingInstitutionInstancesForSelectedTemplate = useMemo(
    () =>
      allInstances.filter(
        (item) =>
          item.template?.id === selectedTemplateId && hasInstitutionSignaturePending(item),
      ),
    [allInstances, selectedTemplateId],
  );

  const openInstitutionTemplateSignModal = () => {
    if (!selectedTemplate) return;
    if (selectedTemplate.status.trim().toUpperCase() !== 'PUBLISHED') {
      setAutoSendError('Publique o modelo antes de registrar a assinatura da instituição.');
      return;
    }
    if (isTemplateInstitutionSigned(selectedTemplate)) {
      setFeedback('Este modelo já está assinado pela instituição.');
      return;
    }
    setInstitutionSignerNameDraft(institutionSignerName.trim());
    setInstitutionAcceptTermsDraft(false);
    setInstitutionSignModalOpen(true);
    setAutoSendError('');
    setError('');
    setFeedback('');
  };

  const signInstitutionForSelectedTemplate = async () => {
    if (!selectedTemplate) return;
    if (selectedTemplate.status.trim().toUpperCase() !== 'PUBLISHED') {
      setAutoSendError('Publique o modelo antes de registrar a assinatura da instituição.');
      return;
    }
    if (isTemplateInstitutionSigned(selectedTemplate)) {
      setFeedback('Este modelo já está assinado pela instituição.');
      setInstitutionSignModalOpen(false);
      return;
    }
    if (!institutionSignerNameDraft.trim()) {
      setAutoSendError('Informe o nome do responsável institucional para assinar.');
      return;
    }
    if (!institutionAcceptTermsDraft) {
      setAutoSendError('Confirme os termos de assinatura institucional antes de continuar.');
      return;
    }
    const signatureData = createSignatureDataUrl();
    if (!signatureData) {
      setAutoSendError('Desenhe a assinatura institucional antes de concluir.');
      return;
    }

    setSigningTemplateInstitution(true);
    setAutoSendError('');
    setError('');
    setFeedback('');
    try {
      await apiRequest(token, `/contracts/templates/${selectedTemplate.id}/sign-institution`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          signerName: institutionSignerNameDraft.trim(),
          acceptTerms: true,
          signatureData,
        }),
      });

      await loadTemplates();
      setInstitutionSignerName(institutionSignerNameDraft.trim());
      setInstitutionSignModalOpen(false);

      setFeedback(
        'Modelo assinado pela instituição com sucesso. Agora ele está liberado para envio ao aluno.',
      );
    } catch (signError) {
      setAutoSendError(
        signError instanceof Error
          ? signError.message
          : 'Falha ao assinar o modelo pela instituição.',
      );
    } finally {
      setSigningTemplateInstitution(false);
    }
  };

  return (
    <section className="native-page native-contracts">
      <header className="native-page-header">
        <h2>{isEditorMode ? 'Editor de contrato' : 'Contratos'}</h2>
        {isEditorMode ? (
          <p>
            Página dedicada para criar e editar modelos de contrato.
          </p>
        ) : (
          <p>
            Crie modelos, publique versões, envie contratos para assinatura do aluno e
            acompanhe o ciclo de assinatura com rastreabilidade.
          </p>
        )}
      </header>

      {!isEditorMode ? (
        <div className="native-kpi-grid native-kpi-grid-small">
          <article className="native-kpi-card">
            <span>Total de envios</span>
            <strong>{instancesCountByStatus.total}</strong>
            <small>{instancesCountByStatus.signed} assinados</small>
          </article>
          <article className="native-kpi-card">
            <span>Pendentes</span>
            <strong>
              {instancesCountByStatus.sent +
                instancesCountByStatus.viewed +
                instancesCountByStatus.pinVerified +
                instancesCountByStatus.signedInstitutionPending}
            </strong>
            <small>
              {instancesCountByStatus.sent} enviados | {instancesCountByStatus.viewed} visualizados
              {instancesCountByStatus.signedInstitutionPending > 0
                ? ` ⬢ ${instancesCountByStatus.signedInstitutionPending} instituição pendente`
                : ''}
            </small>
          </article>
        </div>
      ) : null}

      {loading ? <p className="native-info">Carregando contratos...</p> : null}
      {error ? <p className="native-error">{error}</p> : null}
      {feedback ? <p className="native-success">{feedback}</p> : null}

      <div className={`native-contracts-layout ${isEditorMode ? 'is-editor-page' : ''}`}>
        {!isEditorMode ? (
          <aside className="native-contracts-sidebar">
          <article className="native-panel">
            <header className="native-panel-header">
              <h3>Modelos</h3>
              <button type="button" onClick={openNewTemplate}>
                Novo
              </button>
            </header>

            <div className="native-contract-template-list">
              {templates.length === 0 ? (
                <p className="native-info">Nenhum modelo cadastrado.</p>
              ) : (
                templates.map((template) => (
                  <article
                    key={template.id}
                    className={`native-contract-template-item ${
                      selectedTemplateId === template.id ? 'is-active' : ''
                    }`}
                  >
                    <button
                      type="button"
                      className="native-contract-template-main"
                      onClick={() => pickTemplate(template)}
                    >
                    {(() => {
                      const hasPendingSignature =
                        (pendingSignatureCountByTemplate.get(template.id) ?? 0) > 0;
                      return (
                        <>
                    <div>
                      <strong>{template.name}</strong>
                      <small>
                        Versão {template.latestVersionNumber} ⬢ Atualizado em{' '}
                        {formatDateTime(template.updatedAt)}
                      </small>
                    </div>
                          <div className="native-contract-template-chips">
                            <span className={`native-status-chip ${templateStatusTone(template.status)}`}>
                              {templateStatusLabel(template.status)}
                            </span>
                            {isTemplateInstitutionSigned(template) ? (
                              <span className="native-status-chip is-success">Assinado</span>
                            ) : template.status.trim().toUpperCase() === 'PUBLISHED' ? (
                              <span className="native-status-chip is-danger">Pendente de assinatura</span>
                            ) : null}
                            {hasPendingSignature ? (
                              <span className="native-status-chip is-warning">
                                Assinatura pendente
                              </span>
                            ) : null}
                            {template.autoSendEnabled ? (
                              <span className="native-status-chip is-info">
                                Envio automático
                              </span>
                            ) : null}
                          </div>
                        </>
                      );
                    })()}
                    </button>
                    <button
                      type="button"
                      className="native-contract-template-delete"
                      aria-label={`Apagar modelo ${template.name}`}
                      title={
                        template.status.trim().toUpperCase() === 'PUBLISHED'
                          ? 'Apagar modelo publicado'
                          : 'Apagar modelo'
                      }
                      onClick={() => {
                        void deleteTemplate(template);
                      }}
                      disabled={deletingTemplateId === template.id}
                    >
                      <span className="material-symbols-outlined">
                        {deletingTemplateId === template.id ? 'hourglass_top' : 'delete'}
                      </span>
                    </button>
                  </article>
                ))
              )}
            </div>
          </article>
          </aside>
        ) : null}

        <div className="native-contracts-main">
          {isEditorMode ? (
            <article className="native-panel">
              <header className="native-panel-header">
                <h3>{isEditingTemplate ? 'Editar modelo' : 'Novo modelo de contrato'}</h3>
                <div className="native-modal-actions">
                  <button
                    type="button"
                    className="ghost"
                    onClick={() => {
                      window.location.href = '/?secao=admin_contratos';
                    }}
                  >
                    Voltar
                  </button>
                </div>
                {selectedTemplate ? (
                  <small>
                    {selectedTemplate.latestVersion
                      ? `\u00DAltima publica\u00E7\u00E3o: v${selectedTemplate.latestVersion.versionNumber} em ${formatDateTime(
                          selectedTemplate.latestVersion.publishedAt,
                        )}`
                      : 'Sem versão publicada'}
                  </small>
                ) : null}
              </header>

              <form className="native-form-grid native-contract-template-form" onSubmit={saveTemplate}>
                <label>
                  Nome interno do modelo
                  <input
                    value={templateForm.name}
                    onChange={(event) =>
                      setTemplateForm((current) => ({ ...current, name: event.target.value }))
                    }
                    placeholder="Ex: Contrato padrão de matrícula"
                    required
                  />
                </label>

                <label>
                  Título visível no contrato
                  <input
                    value={templateForm.draftTitle}
                    onChange={(event) =>
                      setTemplateForm((current) => ({
                        ...current,
                        draftTitle: event.target.value,
                      }))
                    }
                    placeholder="Ex: Contrato de Prestação de Serviços"
                    required
                  />
                </label>

                <label className="native-contract-span-all">
                  Descrição (opcional)
                  <input
                    value={templateForm.description}
                    onChange={(event) =>
                      setTemplateForm((current) => ({
                        ...current,
                        description: event.target.value,
                      }))
                    }
                    placeholder="Uso interno para diferenciar modelos"
                  />
                </label>

                <div className="native-contract-span-all">
                  <p className="native-contract-editor-label">Modelo base</p>
                  <div className="native-modal-actions">
                    {CONTRACT_BASE_PRESETS.map((preset) => (
                      <button
                        key={preset.id}
                        type="button"
                        className="ghost"
                        onClick={() => applyBasePreset(preset.id)}
                        disabled={selectedTemplate?.status.trim().toUpperCase() === 'ARCHIVED'}
                        title={preset.helperText}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="native-contract-span-all">
                  <p className="native-contract-editor-label">Documento do contrato</p>
                  <ContractWordEditor
                    value={templateForm.draftHtmlContent}
                    onChange={(nextHtml) =>
                      setTemplateForm((current) => ({
                        ...current,
                        draftHtmlContent: nextHtml,
                      }))
                    }
                    placeholders={CONTRACT_EDITOR_PLACEHOLDERS}
                    disabled={selectedTemplate?.status.trim().toUpperCase() === 'ARCHIVED'}
                  />
                </div>

                {formError ? <p className="native-error native-contract-span-all">{formError}</p> : null}

                <div className="native-modal-actions">
                  {isEditingTemplate ? (
                    <button
                      type="button"
                      className="ghost"
                      onClick={() => void publishTemplate()}
                      title={
                        isSelectedTemplatePublished
                          ? 'Modelo publicado: apenas envio automático pode ser alterado.'
                          : undefined
                      }
                      disabled={templatePublishing || !selectedTemplateId || isSelectedTemplatePublished}
                    >
                      {templatePublishing ? 'Publicando...' : 'Publicar versão'}
                    </button>
                  ) : null}
                  <button type="submit" disabled={templateSaving}>
                    {templateSaving
                      ? 'Salvando...'
                      : isEditingTemplate
                        ? 'Salvar rascunho'
                        : 'Criar modelo'}
                  </button>
                </div>
              </form>
            </article>
          ) : null}

          {!isEditorMode ? (
            <>
              <article className="native-panel native-contract-model-summary">
                <header className="native-panel-header">
                  <h3>Resumo do modelo selecionado</h3>
                  <div className="native-modal-actions">
                    <button
                      type="button"
                      className="ghost"
                      onClick={() => void publishTemplate()}
                      title={
                        isSelectedTemplatePublished
                          ? 'Modelo publicado: apenas envio automático pode ser alterado.'
                          : undefined
                      }
                      disabled={!selectedTemplateId || templatePublishing || isSelectedTemplatePublished}
                    >
                      {templatePublishing ? 'Publicando...' : 'Publicar nova versão'}
                    </button>
                    <button
                      type="button"
                      className="ghost"
                      onClick={() => openEditorPage(selectedTemplateId ?? undefined)}
                    >
                      Abrir editor
                    </button>
                  </div>
                </header>

                {selectedTemplate ? (
                  <div className="native-contract-model-summary-grid">
                    <article className="native-contract-model-summary-meta">
                      <div>
                        <strong>{selectedTemplate.name}</strong>
                        <small>
                          Versão {selectedTemplate.latestVersionNumber} ⬢ Atualizado em{' '}
                          {formatDateTime(selectedTemplate.updatedAt)}
                        </small>
                      </div>

                      <div className="native-contract-template-chips">
                        <span className={`native-status-chip ${templateStatusTone(selectedTemplate.status)}`}>
                          {templateStatusLabel(selectedTemplate.status)}
                        </span>
                        {isSelectedTemplateInstitutionSigned ? (
                          <span className="native-status-chip is-success">Assinado</span>
                        ) : null}
                        {selectedTemplate.autoSendEnabled ? (
                          <span className="native-status-chip is-info">Envio automático</span>
                        ) : (
                          <span className="native-status-chip is-neutral">Envio manual</span>
                        )}
                      </div>

                      <p className="native-info" style={{ margin: 0 }}>
                        {selectedTemplate.description || 'Sem descrição cadastrada para este modelo.'}
                      </p>
                      <p className="native-info" style={{ margin: 0 }}>
                        {isSelectedTemplateInstitutionSigned
                          ? `Assinado por ${selectedTemplate.institutionSignedByName || 'instituição'} em ${formatDateTime(selectedTemplate.institutionSignedAt)}`
                          : 'Modelo ainda não assinado pela instituição.'}
                      </p>

                      <div className="native-contract-quick-kpis">
                        <article>
                          <span>Envio automático</span>
                          <strong>{autoSendEnabled ? 'Ligado' : 'Desligado'}</strong>
                        </article>
                        <article>
                          <span>Escopo</span>
                          <strong>
                            {autoSendEnabled
                              ? autoSendAllCourses
                                ? 'Todos os cursos'
                                : `${autoSendCourseIds.length} curso(s)`
                              : 'Manual'}
                          </strong>
                        </article>
                        <article>
                          <span>Pendências</span>
                          <strong>
                            {pendingSignatureCountByTemplate.get(selectedTemplate.id) ?? 0}
                          </strong>
                        </article>
                        <article>
                          <span>Instituição pendente</span>
                          <strong>{pendingInstitutionInstancesForSelectedTemplate.length}</strong>
                        </article>
                      </div>

                      {autoSendEnabled && !autoSendAllCourses && selectedTemplateCourseNames.length > 0 ? (
                        <p className="native-info" style={{ margin: 0 }}>
                          Cursos vinculados: {selectedTemplateCourseNames.join(', ')}
                        </p>
                      ) : null}

                      {pendingInstitutionInstancesForSelectedTemplate.length > 0 ? (
                        <article className="native-panel" style={{ padding: '0.65rem' }}>
                          <header className="native-panel-header" style={{ marginBottom: '0.4rem' }}>
                            <h3 style={{ fontSize: '0.95rem' }}>Pendências da instituição</h3>
                          </header>
                          <div className="native-table-wrap">
                            <table className="native-table">
                              <thead>
                                <tr>
                                  <th>Aluno</th>
                                  <th>Status</th>
                                  <th>Enviado em</th>
                                  <th>Ação</th>
                                </tr>
                              </thead>
                              <tbody>
                                {pendingInstitutionInstancesForSelectedTemplate.map((item) => (
                                  <tr key={item.id}>
                                    <td>
                                      <strong>{item.student.name}</strong>
                                      <br />
                                      <small>{item.student.emailMasked}</small>
                                    </td>
                                    <td>
                                      <span className={`native-status-chip ${contractStatusTone(item.status)}`}>
                                        {contractStatusLabel(item.status)}
                                      </span>
                                    </td>
                                    <td>{formatDateTime(item.sentAt)}</td>
                                    <td>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          void signInstitutionInstance(item);
                                        }}
                                        disabled={signingInstitutionInstanceId === item.id}
                                      >
                                        {signingInstitutionInstanceId === item.id
                                          ? 'Assinando...'
                                          : 'Assinar instituição'}
                                      </button>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </article>
                      ) : null}

                      <div className="native-form-grid native-contract-send-form">
                        <label className="native-contract-span-all native-contract-send-checkbox">
                          <input
                            type="checkbox"
                            checked={autoSendEnabled}
                            onChange={(event) => setAutoSendEnabled(event.target.checked)}
                          />
                          <span>Envio automático ao concluir a matrícula</span>
                        </label>

                        {autoSendEnabled ? (
                          <>
                            <label>
                              Escopo do envio automático
                              <select
                                value={autoSendAllCourses ? 'ALL' : 'SPECIFIC'}
                                onChange={(event) => {
                                  const allCourses = event.target.value === 'ALL';
                                  setAutoSendAllCourses(allCourses);
                                  if (allCourses) setAutoSendCourseIds([]);
                                }}
                              >
                                <option value="ALL">Todos os cursos</option>
                                <option value="SPECIFIC">Cursos específicos</option>
                              </select>
                            </label>

                            {!autoSendAllCourses ? (
                              <label className="native-contract-span-all">
                                Cursos que receberão este contrato
                                <select
                                  multiple
                                  size={Math.min(Math.max(courses.length, 4), 10)}
                                  value={autoSendCourseIds}
                                  onChange={(event) => {
                                    const selected = Array.from(event.target.selectedOptions).map(
                                      (option) => option.value,
                                    );
                                    setAutoSendCourseIds(selected);
                                  }}
                                >
                                  {courses.map((course) => (
                                    <option key={course.id} value={course.id}>
                                      {course.name}
                                    </option>
                                  ))}
                                </select>
                              </label>
                            ) : null}
                          </>
                        ) : null}

                        {!isSelectedTemplateInstitutionSigned ? (
                          <p className="native-info native-contract-span-all">
                            A assinatura institucional do modelo &eacute; feita em um modal guiado com
                            valida&ccedil;&atilde;o e desenho da assinatura.
                          </p>
                        ) : null}

                        {autoSendError ? <p className="native-error native-contract-span-all">{autoSendError}</p> : null}

                        <div className="native-modal-actions native-contract-span-all">
                          <button type="button" onClick={() => void saveAutoSendSettings()} disabled={autoSendSaving}>
                            {autoSendSaving ? 'Salvando...' : 'Salvar envio automático'}
                          </button>
                          <button
                            type="button"
                            className="ghost"
                            onClick={openInstitutionTemplateSignModal}
                            disabled={
                              signingTemplateInstitution ||
                              !selectedTemplateId ||
                              !isSelectedTemplatePublished ||
                              isSelectedTemplateInstitutionSigned
                            }
                          >
                            {signingTemplateInstitution
                              ? 'Assinando modelo...'
                              : isSelectedTemplateInstitutionSigned
                                ? 'Modelo assinado'
                                : 'Assinar instituição (modelo)'}
                          </button>
                        </div>
                      </div>
                    </article>

                    <article className="native-panel native-contract-document-preview native-contract-model-preview">
                      <header className="native-panel-header">
                        <h3>Preview do documento</h3>
                      </header>
                      <iframe
                        title="Preview do modelo de contrato"
                        sandbox=""
                        srcDoc={buildContractPreviewSrcDoc(selectedTemplate.draftHtmlContent)}
                      />
                    </article>
                  </div>
                ) : (
                  <p className="native-info">Selecione um modelo na lista para ver resumo, preview e configurações rápidas.</p>
                )}
              </article>

              <article className={`native-panel native-contract-send-accordion ${sendAccordionOpen ? 'is-open' : ''}`}>
                <button
                  type="button"
                  className="native-contract-accordion-trigger"
                  onClick={() => setSendAccordionOpen((current) => !current)}
                  aria-expanded={sendAccordionOpen}
                >
                  <span>Enviar para assinatura</span>
                  <span className="material-symbols-outlined">
                    {sendAccordionOpen ? 'expand_less' : 'expand_more'}
                  </span>
                </button>

                {sendAccordionOpen ? (
                  <form className="native-form-grid native-contract-send-form" onSubmit={sendContract}>
                    <label className="native-contract-span-all">
                      Modelos publicados e assinados (envio conjunto obrigatório)
                      <select
                        multiple
                        size={Math.min(Math.max(sendableTemplates.length, 2), 8)}
                        value={sendForm.templateIds}
                        onChange={(event) => {
                          const selected = Array.from(event.target.selectedOptions).map(
                            (option) => option.value,
                          );
                          setSendForm((current) => ({
                            ...current,
                            templateIds: selected,
                          }));
                        }}
                      >
                        {sendableTemplates.map((template) => (
                          <option key={template.id} value={template.id}>
                            {template.name} (v{template.latestVersionNumber})
                          </option>
                        ))}
                      </select>
                    </label>

                    <div className="native-modal-actions native-contract-span-all">
                      <button
                        type="button"
                        className="ghost"
                        onClick={() =>
                          setSendForm((current) => ({
                            ...current,
                            templateIds: sendableTemplates.map((template) => template.id),
                          }))
                        }
                        disabled={sendableTemplates.length === 0}
                      >
                        Selecionar todos os modelos
                      </button>
                      <button
                        type="button"
                        className="ghost"
                        onClick={() =>
                          setSendForm((current) => ({
                            ...current,
                            templateIds: [],
                          }))
                        }
                      >
                        Limpar seleção
                      </button>
                    </div>

                    {sendableTemplates.length === 0 ? (
                      <p className="native-info native-contract-span-all">
                        Publique e assine ao menos um modelo para habilitar envios.
                      </p>
                    ) : null}
                    {sendableTemplates.length > 0 ? (
                      <p className="native-info native-contract-span-all">
                        Para liberar o restante da área do aluno, envie no mínimo{' '}
                        {MIN_REQUIRED_CONTRACTS_PER_SEND} contratos por matrícula (ex.: contrato
                        principal + termo de imagem/voz/nome).
                      </p>
                    ) : null}

                    <label>
                      Aluno
                      <select
                        value={sendForm.studentId}
                        onChange={(event) =>
                          setSendForm((current) => ({
                            ...current,
                            studentId: event.target.value,
                          }))
                        }
                        required
                      >
                        <option value="">Selecione</option>
                        {students.map((student) => (
                          <option key={student.id} value={student.id}>
                            {student.name} " {student.email}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label>
                      Curso (opcional)
                      <select
                        value={sendForm.courseId}
                        onChange={(event) =>
                          setSendForm((current) => ({
                            ...current,
                            courseId: event.target.value,
                          }))
                        }
                      >
                        <option value="">Sem vínculo</option>
                        {courses.map((course) => (
                          <option key={course.id} value={course.id}>
                            {course.name}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label>
                      Turma (opcional)
                      <select
                        value={sendForm.classId}
                        onChange={(event) =>
                          setSendForm((current) => ({
                            ...current,
                            classId: event.target.value,
                          }))
                        }
                      >
                        <option value="">Sem vínculo</option>
                        {classes.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.name}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label>
                      Matrícula (UUID opcional)
                      <input
                        value={sendForm.enrollmentId}
                        onChange={(event) =>
                          setSendForm((current) => ({
                            ...current,
                            enrollmentId: event.target.value,
                          }))
                        }
                        placeholder="Informe somente se precisar vincular"
                      />
                    </label>

                    <label>
                      Expiração do link (horas)
                      <input
                        type="number"
                        min={1}
                        max={168}
                        value={sendForm.expiresInHours}
                        onChange={(event) =>
                          setSendForm((current) => ({
                            ...current,
                            expiresInHours: event.target.value,
                          }))
                        }
                      />
                    </label>

                    <label className="native-contract-send-checkbox native-contract-span-all">
                      <input
                        type="checkbox"
                        checked={sendForm.sendEmail}
                        onChange={(event) =>
                          setSendForm((current) => ({
                            ...current,
                            sendEmail: event.target.checked,
                          }))
                        }
                      />
                      <span>Enviar convite por e-mail automaticamente</span>
                    </label>

                    {sendError ? <p className="native-error native-contract-span-all">{sendError}</p> : null}

                    <div className="native-modal-actions">
                      <button type="submit" disabled={sendingInstance}>
                        {sendingInstance ? 'Enviando...' : 'Enviar contrato'}
                      </button>
                    </div>
                  </form>
                ) : null}
              </article>
            </>
          ) : null}

          {!isEditorMode ? (
            <article className="native-panel">
            <header className="native-panel-header">
              <h3>Envios recentes</h3>
              <div className="native-contract-instance-filters">
                <select
                  value={instanceStatusFilter}
                  onChange={(event) => setInstanceStatusFilter(event.target.value)}
                >
                  <option value="all">Todos</option>
                  <option value="sent">Enviado</option>
                  <option value="viewed">Visualizado</option>
                  <option value="pin_verified">PIN validado</option>
                  <option value="signed">Assinado</option>
                  <option value="expired">Expirado</option>
                  <option value="archived">Arquivado</option>
                  <option value="canceled">Cancelado</option>
                </select>
                <button
                  type="button"
                  onClick={() =>
                    void Promise.all([
                      loadInstances(instanceStatusFilter),
                      loadAllInstancesForSignals(),
                    ])
                  }
                >
                  Atualizar
                </button>
              </div>
            </header>

            <div className="native-table-wrap">
              <table className="native-table">
                <thead>
                  <tr>
                    <th>Modelo</th>
                    <th>Aluno</th>
                    <th>Status</th>
                    <th>Enviado em</th>
                    <th>Assinado em</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {instances.length === 0 ? (
                    <tr>
                      <td colSpan={6}>
                        Nenhum envio encontrado. O botão "Assinar instituição" aparece quando o
                        contrato estiver assinado pelo aluno e pendente da instituição.
                      </td>
                    </tr>
                  ) : (
                    instances.map((instance) => (
                      <tr key={instance.id}>
                        <td>
                          <strong>{instance.template.name}</strong>
                          <br />
                          <small>{instance.templateVersion.title}</small>
                        </td>
                        <td>
                          <strong>{instance.student.name}</strong>
                          <br />
                          <small>{instance.student.emailMasked}</small>
                        </td>
                        <td>
                          <span className={`native-status-chip ${contractStatusTone(instance.status)}`}>
                            {contractStatusLabel(instance.status)}
                          </span>
                        </td>
                        <td>{formatDateTime(instance.sentAt)}</td>
                        <td>{formatDateTime(instance.signedAt)}</td>
                        <td>
                          <button
                            type="button"
                            onClick={() => {
                              void downloadInstance(instance.id);
                            }}
                            disabled={downloadingInstanceId === instance.id}
                          >
                            {downloadingInstanceId === instance.id
                              ? 'Baixando...'
                              : 'Baixar'}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              void openInstanceDetails(instance.id);
                            }}
                          >
                            Detalhes
                          </button>
                          {hasInstitutionSignaturePending(instance) ? (
                            <button
                              type="button"
                              onClick={() => {
                                void signInstitutionInstance(instance);
                              }}
                              disabled={signingInstitutionInstanceId === instance.id}
                            >
                              {signingInstitutionInstanceId === instance.id
                                ? 'Assinando instituição...'
                                : 'Assinar instituição'}
                            </button>
                          ) : null}
                          <button
                            type="button"
                            className="danger"
                            onClick={() => {
                              void deleteInstance(instance);
                            }}
                            disabled={deletingInstanceId === instance.id}
                          >
                            {deletingInstanceId === instance.id ? 'Apagando...' : 'Apagar'}
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            </article>
          ) : null}
        </div>
      </div>

      {!isEditorMode && institutionSignModalOpen && selectedTemplate ? (
        <div
          className="native-modal-backdrop"
          onClick={() => {
            if (signingTemplateInstitution) return;
            setInstitutionSignModalOpen(false);
          }}
        >
          <section
            className="native-modal native-modal-sm"
            onClick={(event) => event.stopPropagation()}
          >
            <header>
              <h3>Assinatura da institui&ccedil;&atilde;o</h3>
              <button
                type="button"
                onClick={() => {
                  if (signingTemplateInstitution) return;
                  setInstitutionSignModalOpen(false);
                }}
              >
                Fechar
              </button>
            </header>

            <div className="student-contract-step">
              <header>
                <span>Etapa 1</span>
                <h5>Valida&ccedil;&atilde;o do respons&aacute;vel</h5>
              </header>
              <p>Confirme quem est&aacute; assinando este modelo em nome da institui&ccedil;&atilde;o.</p>
              <input
                value={institutionSignerNameDraft}
                onChange={(event) => setInstitutionSignerNameDraft(event.target.value)}
                placeholder="Nome completo de quem assina"
                disabled={signingTemplateInstitution}
              />
              <label className="student-contract-accept">
                <input
                  type="checkbox"
                  checked={institutionAcceptTermsDraft}
                  onChange={(event) => setInstitutionAcceptTermsDraft(event.target.checked)}
                  disabled={signingTemplateInstitution}
                />
                <span>
                  Confirmo que estou autorizado(a) a assinar este modelo pela institui&ccedil;&atilde;o.</span>
              </label>
            </div>

            <div className="student-contract-step">
              <header>
                <span>Etapa 2</span>
                <h5>Desenhar assinatura</h5>
              </header>
              <p>Desenhe a assinatura institucional para concluir a valida&ccedil;&atilde;o do modelo.</p>

              <div className="student-contract-signature-canvas-wrap">
                <canvas
                  ref={signatureCanvasRef}
                  className="student-contract-signature-canvas"
                  style={{ touchAction: 'none' }}
                  onPointerDown={handleSignaturePointerDown}
                  onPointerMove={handleSignaturePointerMove}
                  onPointerUp={(event) => finishSignaturePointer(event.pointerId)}
                  onPointerLeave={(event) => finishSignaturePointer(event.pointerId)}
                  onPointerCancel={(event) => finishSignaturePointer(event.pointerId)}
                />
              </div>
              <div className="student-contract-signature-helper">
                <small>Use mouse ou toque para desenhar a assinatura.</small>
                <button
                  type="button"
                  onClick={resetSignatureCanvas}
                  disabled={!hasSignatureStroke || signingTemplateInstitution}
                >
                  Limpar assinatura
                </button>
              </div>
            </div>

            {autoSendError ? <p className="native-error">{autoSendError}</p> : null}

            <div className="native-modal-actions">
              <button
                type="button"
                className="ghost"
                onClick={() => setInstitutionSignModalOpen(false)}
                disabled={signingTemplateInstitution}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void signInstitutionForSelectedTemplate()}
                disabled={signingTemplateInstitution}
              >
                {signingTemplateInstitution ? 'Assinando...' : 'Confirmar assinatura institucional'}
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {!isEditorMode && detailsOpen ? (
        <div className="native-modal-backdrop" onClick={() => setDetailsOpen(false)}>
          <section className="native-modal native-contract-details-modal" onClick={(event) => event.stopPropagation()}>
            <header>
              <h3>Detalhes do contrato</h3>
              <button type="button" onClick={() => setDetailsOpen(false)}>
                Fechar
              </button>
            </header>

            {loadingDetails ? <p className="native-info">Carregando detalhes...</p> : null}

            {!loadingDetails && selectedInstanceDetails ? (
              <div className="native-contract-details-content">
                <div className="native-contract-details-meta">
                  <article>
                    <span>Status</span>
                    <strong>{contractStatusLabel(selectedInstanceDetails.status)}</strong>
                  </article>
                  <article>
                    <span>Aluno</span>
                    <strong>{selectedInstanceDetails.student.name}</strong>
                  </article>
                  <article>
                    <span>Código de assinatura</span>
                    <strong>{selectedInstanceDetails.signatureCode}</strong>
                  </article>
                  <article>
                    <span>Assinado em</span>
                    <strong>{formatDateTime(selectedInstanceDetails.signedAt)}</strong>
                  </article>
                  <article>
                    <span>Assinatura institucional</span>
                    <strong>
                      {selectedInstanceDetails.institutionSignedAt
                        ? formatDateTime(selectedInstanceDetails.institutionSignedAt)
                        : 'Pendente'}
                    </strong>
                    {selectedInstanceDetails.institutionSignedByName ? (
                      <small>{selectedInstanceDetails.institutionSignedByName}</small>
                    ) : null}
                  </article>
                </div>

                <article className="native-panel native-contract-document-preview">
                  <header className="native-panel-header">
                    <h3>{selectedInstanceDetails.snapshotTemplateTitle}</h3>
                  </header>
                  <iframe
                    title="Pré-visualização do contrato"
                    sandbox=""
                    srcDoc={buildContractPreviewSrcDoc(selectedInstanceDetails.documentHtml)}
                  />
                </article>

                <article className="native-panel">
                  <header className="native-panel-header">
                    <h3>Auditoria</h3>
                  </header>
                  {selectedInstanceDetails.auditLogs && selectedInstanceDetails.auditLogs.length > 0 ? (
                    <div className="native-contract-audit-list">
                      {selectedInstanceDetails.auditLogs.map((log) => (
                        <article key={log.id}>
                          <strong>{log.action}</strong>
                          <small>
                            {log.actorType} | {formatDateTime(log.createdAt)}
                          </small>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <p className="native-info">Sem trilha de auditoria disponível para seu perfil.</p>
                  )}
                </article>
              </div>
            ) : null}
          </section>
        </div>
      ) : null}
    </section>
  );
}
