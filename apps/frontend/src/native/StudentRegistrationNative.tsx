import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { API_BASE_URL } from './api';
import { toPtBrApiMessage } from '../errorMessages';

type StudentRegistrationNativeProps = {
  embedded: boolean;
};

type CourseCatalogItem = {
  id: string;
  name: string;
  description?: string | null;
  workloadHours?: number | null;
  category?: string | null;
  coordinator?: string | null;
  paymentModel?: string | null;
  installmentMonths?: number | null;
  installmentValue?: number | null;
  paymentOptions?: Array<{
    method?: string | null;
    type?: string | null;
    totalAmount?: number | null;
    installmentCount?: number | null;
    installmentAmount?: number | null;
    isPromotional?: boolean | null;
    promotionalSlots?: number | null;
    active?: boolean | null;
  }> | null;
  modality?: string | null;
  status?: string | null;
  bannerUrl?: string | null;
};

type RegistrationPayload = {
  name: string;
  email: string;
  password: string;
  documentCpf: string;
  documentRg: string;
  issuingAuthority: string;
  phone: string;
  birthDate: string;
  birthCity: string;
  maritalStatus: string;
  address: string;
  zipCode: string;
  fatherName: string;
  motherName: string;
  graduation: string;
  graduationConclusionYear: number;
  companyName: string;
  jobTitle: string;
  street?: string;
  courseIds?: string[];
};

type PasswordStrength = {
  label: string;
  toneClass: string;
  score: number;
};

const steps = [
  { title: 'Identificação', description: 'Dados pessoais e documentação' },
  { title: 'Formação', description: 'Filiação e graduação' },
  { title: 'Profissional', description: 'Empresa, cargo e acesso' },
  { title: 'Matrícula', description: 'Endereço e curso no IES' },
];

const maritalStatusOptions = [
  { value: 'solteiro', label: 'Solteiro(a)' },
  { value: 'casado', label: 'Casado(a)' },
  { value: 'divorciado', label: 'Divorciado(a)' },
  { value: 'viuvo', label: 'Viúvo(a)' },
  { value: 'uniao_estavel', label: 'União estável' },
];

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i;
const onlyDigits = (value: string) => value.replace(/\D/g, '');

const currencyFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

const sleep = (ms: number) =>
  new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });

function normalizeTextInput(value: string) {
  return value.replace(/\s{2,}/g, ' ').trimStart();
}

function normalizeNameInput(value: string) {
  return normalizeTextInput(value).replace(/[^\p{L}\s]/gu, '');
}

function isValidPersonName(value: string) {
  const normalized = value.trim();
  if (normalized.length < 3) return false;
  return /^[\p{L}]+(?:\s+[\p{L}]+)+$/u.test(normalized);
}

function formatCpf(value: string) {
  const digits = onlyDigits(value).slice(0, 11);
  return digits
    .replace(/^(\d{3})(\d)/, '$1.$2')
    .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1-$2');
}

function formatRg(value: string) {
  const digits = onlyDigits(value).slice(0, 9);
  return digits
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1-$2');
}

function formatPhone(value: string) {
  const digits = onlyDigits(value).slice(0, 11);
  if (digits.length <= 10) {
    return digits
      .replace(/^(\d{2})(\d)/, '($1) $2')
      .replace(/(\d{4})(\d)/, '$1-$2');
  }

  return digits
    .replace(/^(\d{2})(\d)/, '($1) $2')
    .replace(/(\d{5})(\d)/, '$1-$2');
}

function formatZipCode(value: string) {
  const digits = onlyDigits(value).slice(0, 8);
  return digits.replace(/^(\d{5})(\d)/, '$1-$2');
}

function formatBirthDate(value: string) {
  const digits = onlyDigits(value).slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

function formatGraduationYear(value: string) {
  return onlyDigits(value).slice(0, 4);
}
function birthDateToIso(value: string) {
  const digits = onlyDigits(value);
  if (digits.length !== 8) return '';

  const day = Number(digits.slice(0, 2));
  const month = Number(digits.slice(2, 4));
  const year = Number(digits.slice(4, 8));
  if (year < 1900) return '';

  const parsed = new Date(year, month - 1, day);
  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== month - 1 ||
    parsed.getDate() !== day
  ) {
    return '';
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (parsed > today) return '';

  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function isValidBirthDate(value: string) {
  return Boolean(birthDateToIso(value));
}

function isValidCpf(value: string) {
  const cpf = onlyDigits(value);
  if (cpf.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(cpf)) return false;

  const calcDigit = (base: string, factor: number) => {
    let total = 0;
    for (let index = 0; index < base.length; index += 1) {
      total += Number(base[index]) * (factor - index);
    }
    const remainder = (total * 10) % 11;
    return remainder === 10 ? 0 : remainder;
  };

  const firstDigit = calcDigit(cpf.slice(0, 9), 10);
  const secondDigit = calcDigit(cpf.slice(0, 10), 11);
  return firstDigit === Number(cpf[9]) && secondDigit === Number(cpf[10]);
}

function isValidRg(value: string) {
  const rg = onlyDigits(value);
  return rg.length >= 7 && rg.length <= 9;
}

function isValidPhone(value: string) {
  const phoneDigits = onlyDigits(value);
  if (phoneDigits.length < 10 || phoneDigits.length > 11) return false;
  if (/^(\d)\1+$/.test(phoneDigits)) return false;
  return true;
}

function isValidZipCode(value: string) {
  return onlyDigits(value).length === 8;
}

function isValidGraduationConclusionYear(value: string) {
  const digits = onlyDigits(value);
  if (digits.length !== 4) return false;
  const year = Number(digits);
  const currentYear = new Date().getFullYear();
  return year >= 1900 && year <= currentYear;
}

function passwordStrength(password: string): PasswordStrength {
  if (!password) {
    return { label: 'Fraca', toneClass: 'is-weak', score: 0 };
  }

  let score = 0;
  if (password.length >= 8) score += 1;
  if (password.length >= 12) score += 1;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score += 1;
  if (/\d/.test(password)) score += 1;
  if (/[^A-Za-z0-9]/.test(password)) score += 1;

  if (score >= 5) return { label: 'Forte', toneClass: 'is-strong', score };
  if (score >= 3) return { label: 'Média', toneClass: 'is-medium', score };
  return { label: 'Fraca', toneClass: 'is-weak', score };
}

function modalityLabel(value?: string | null) {
  const normalized = String(value || '').toUpperCase();
  if (normalized === 'PRESENTIAL' || normalized === 'PRESENCIAL') return 'Presencial';
  if (normalized === 'HYBRID') return 'Híbrido';
  if (normalized === 'EAD') return 'EAD';
  return 'Não informado';
}

function installmentLabel(course: CourseCatalogItem) {
  const paymentOptions = Array.isArray(course.paymentOptions)
    ? course.paymentOptions.filter((option) => option?.active !== false)
    : [];
  if (paymentOptions.length > 0) {
    const firstOption = paymentOptions[0];
    const method = String(firstOption.method || '').toUpperCase();
    const methodLabel =
      method === 'BANK_SLIP'
        ? 'Boleto'
        : method === 'CREDIT_CARD'
          ? 'Cartão'
          : 'Pix';
    const type = String(firstOption.type || '').toUpperCase();
    const promoSuffix = firstOption.isPromotional
      ? firstOption.promotionalSlots
        ? ' (promo ' + String(firstOption.promotionalSlots) + ' primeiros)'
        : ' (promoção)'
      : '';
    if (type === 'INSTALLMENTS') {
      const count = Number(firstOption.installmentCount || 0) || 1;
      const installmentAmount =
        Number(firstOption.installmentAmount || 0) ||
        (Number(firstOption.totalAmount || 0) > 0
          ? Number(firstOption.totalAmount || 0) / count
          : 0);
      return methodLabel + ' ' + count + 'x de ' + currencyFormatter.format(installmentAmount) + promoSuffix;
    }

    return methodLabel + ' à vista ' + currencyFormatter.format(Number(firstOption.totalAmount || 0)) + promoSuffix;
  }

  const paymentModel = String(course.paymentModel || '').toUpperCase();
  if (paymentModel !== 'INSTALLMENTS') {
    return 'Pagamento à vista';
  }

  const months = Number(course.installmentMonths || 0);
  const installmentValue = Number(course.installmentValue || 0);
  if (months > 0 && installmentValue > 0) {
    return months + 'x de ' + currencyFormatter.format(installmentValue);
  }

  return 'Pagamento parcelado';
}

async function requestWithRetry(input: string, init?: RequestInit) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await fetch(input, init);
    if (response.status === 429 && attempt === 0) {
      const retryAfter = Number(response.headers.get('retry-after') ?? '');
      const retryDelayMs =
        Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 900;
      await sleep(retryDelayMs);
      continue;
    }

    return response;
  }

  throw new Error('Limite de requisições atingido temporariamente.');
}

async function readError(response: Response) {
  try {
    const payload = (await response.json()) as { message?: string | string[] };
    return toPtBrApiMessage(payload.message, 'Não foi possível concluir o cadastro.');
  } catch {
    // ignore
  }
  return 'Não foi possível concluir o cadastro.';
}
export function StudentRegistrationNative({ embedded }: StudentRegistrationNativeProps) {
  const [loading, setLoading] = useState(false);
  const [coursesLoading, setCoursesLoading] = useState(false);
  const [codeLoading, setCodeLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [codeError, setCodeError] = useState('');
  const [coursesError, setCoursesError] = useState('');
  const [currentStep, setCurrentStep] = useState(0);

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [documentCpf, setDocumentCpf] = useState('');
  const [documentRg, setDocumentRg] = useState('');
  const [issuingAuthority, setIssuingAuthority] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [birthCity, setBirthCity] = useState('');
  const [maritalStatus, setMaritalStatus] = useState('');

  const [fatherName, setFatherName] = useState('');
  const [motherName, setMotherName] = useState('');
  const [graduation, setGraduation] = useState('');
  const [graduationConclusionYear, setGraduationConclusionYear] = useState('');

  const [companyName, setCompanyName] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [zipCode, setZipCode] = useState('');
  const [address, setAddress] = useState('');
  const [selectedCourseId, setSelectedCourseId] = useState('');

  const [pendingVerificationEmail, setPendingVerificationEmail] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [courses, setCourses] = useState<CourseCatalogItem[]>([]);

  const strength = useMemo(() => passwordStrength(password), [password]);
  const isFinalStep = currentStep === steps.length - 1;

  const loadCourses = async () => {
    setCoursesLoading(true);
    setCoursesError('');
    try {
      const response = await requestWithRetry(`${API_BASE_URL}/mis/v1/public/cursos`);
      if (!response.ok) throw new Error(await readError(response));

      const payload = (await response.json()) as CourseCatalogItem[];
      const onlyActive = Array.isArray(payload)
        ? payload.filter((item) => String(item.status || '').toUpperCase() === 'ACTIVE')
        : [];
      setCourses(onlyActive);
    } catch (coursesLoadError) {
      setCoursesError(
        coursesLoadError instanceof Error
          ? coursesLoadError.message
          : 'Não foi possível carregar os cursos.',
      );
    } finally {
      setCoursesLoading(false);
    }
  };

  useEffect(() => {
    void loadCourses();
  }, []);

  const buildPortalLink = () => {
    const params = new URLSearchParams();
    params.set('embed', '1');
    params.set('app', 'student');
    return `/area-do-aluno/?${params.toString()}`;
  };

  const validateStepOne = () => {
    if (!name.trim() || name.trim().length < 3) return 'Informe seu nome completo.';
    if (!isValidPersonName(name)) return 'O nome deve conter nome e sobrenome, usando apenas letras.';
    if (!isValidPhone(phone)) return 'Informe um telefone válido com DDD.';
    if (!emailRegex.test(email.trim())) return 'Informe um e-mail válido.';
    if (!isValidCpf(documentCpf)) return 'Informe um CPF válido.';
    if (!isValidRg(documentRg)) return 'Informe um RG válido.';
    if (!issuingAuthority.trim()) return 'Informe o órgão expedidor do RG.';
    if (!isValidBirthDate(birthDate)) return 'Informe uma data de nascimento válida no formato DD/MM/AAAA.';
    if (!birthCity.trim()) return 'Informe a cidade em que nasceu.';
    if (!maritalStatus) return 'Selecione o estado civil.';
    return '';
  };

  const validateStepTwo = () => {
    if (!fatherName.trim() || !isValidPersonName(fatherName)) return 'Informe o nome completo do pai.';
    if (!motherName.trim() || !isValidPersonName(motherName)) return 'Informe o nome completo da mãe.';
    if (!graduation.trim()) return 'Informe sua graduação.';
    if (!isValidGraduationConclusionYear(graduationConclusionYear)) return 'Informe um ano de conclusão da graduação válido.';
    return '';
  };

  const validateStepThree = () => {
    if (!companyName.trim()) return 'Informe a empresa onde trabalha.';
    if (!jobTitle.trim()) return 'Informe o cargo.';
    if (password.length < 8) return 'A senha deve ter pelo menos 8 caracteres.';
    if (strength.score < 3) return 'Use uma senha pelo menos média (misture letras, números e símbolos).';
    if (!confirmPassword) return 'Confirme sua senha para continuar.';
    if (password !== confirmPassword) return 'A confirmação de senha não confere.';
    return '';
  };

  const validateStepFour = () => {
    if (!isValidZipCode(zipCode)) return 'Informe um CEP válido com 8 dígitos.';
    if (!address.trim()) return 'Informe o endereço completo.';
    if (coursesLoading) return 'Aguarde o carregamento dos cursos.';
    if (!selectedCourseId) return 'Selecione um curso para concluir o cadastro.';
    return '';
  };

  const goToNextStep = async () => {
    await Promise.resolve();
    setError('');
    const validation =
      currentStep === 0
        ? validateStepOne()
        : currentStep === 1
          ? validateStepTwo()
          : currentStep === 2
            ? validateStepThree()
            : '';

    if (validation) {
      setError(validation);
      return;
    }

    setCurrentStep((previous) => Math.min(previous + 1, steps.length - 1));
  };

  const goToPreviousStep = () => {
    setError('');
    setCurrentStep((previous) => Math.max(previous - 1, 0));
  };

  const resetForm = () => {
    setName('');
    setPhone('');
    setEmail('');
    setDocumentCpf('');
    setDocumentRg('');
    setIssuingAuthority('');
    setBirthDate('');
    setBirthCity('');
    setMaritalStatus('');
    setFatherName('');
    setMotherName('');
    setGraduation('');
    setGraduationConclusionYear('');
    setCompanyName('');
    setJobTitle('');
    setPassword('');
    setConfirmPassword('');
    setZipCode('');
    setAddress('');
    setSelectedCourseId('');
    setCurrentStep(0);
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setSuccess('');
    setCodeError('');

    const allValidations = [validateStepOne(), validateStepTwo(), validateStepThree(), validateStepFour()].filter(Boolean);
    if (allValidations.length > 0) {
      setError(allValidations[0] || 'Revise os campos obrigatórios.');
      return;
    }

    const payload: RegistrationPayload = {
      name: name.trim().replace(/\s{2,}/g, ' '),
      phone: onlyDigits(phone),
      email: email.trim().toLowerCase(),
      documentCpf: onlyDigits(documentCpf),
      documentRg: onlyDigits(documentRg),
      issuingAuthority: issuingAuthority.trim(),
      birthDate: birthDateToIso(birthDate),
      birthCity: birthCity.trim(),
      maritalStatus,
      address: address.trim(),
      zipCode: onlyDigits(zipCode),
      fatherName: fatherName.trim().replace(/\s{2,}/g, ' '),
      motherName: motherName.trim().replace(/\s{2,}/g, ' '),
      graduation: graduation.trim(),
      graduationConclusionYear: Number(onlyDigits(graduationConclusionYear)),
      companyName: companyName.trim(),
      jobTitle: jobTitle.trim(),
      password,
      street: address.trim(),
      courseIds: selectedCourseId ? [selectedCourseId] : undefined,
    };

    setLoading(true);
    try {
      const response = await requestWithRetry(`${API_BASE_URL}/mis/v1/public/cadastros`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) throw new Error(await readError(response));
      setPendingVerificationEmail(payload.email);
      setVerificationCode('');
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Não foi possível concluir o cadastro.');
    } finally {
      setLoading(false);
    }
  };

  const confirmVerificationCode = async () => {
    setCodeError('');
    if (!pendingVerificationEmail) return;

    const code = verificationCode.trim();
    if (code.length !== 6) {
      setCodeError('Digite o código de 6 dígitos enviado para o seu e-mail.');
      return;
    }

    setCodeLoading(true);
    try {
      const response = await requestWithRetry(`${API_BASE_URL}/auth/verify-email-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: pendingVerificationEmail, code }),
      });

      if (!response.ok) throw new Error(await readError(response));

      setPendingVerificationEmail('');
      setVerificationCode('');
      setSuccess('Cadastro realizado com sucesso. Seu e-mail foi confirmado.');
      resetForm();
    } catch (confirmError) {
      setCodeError(confirmError instanceof Error ? confirmError.message : 'Não foi possível confirmar o código.');
    } finally {
      setCodeLoading(false);
    }
  };
  return (
    <section className={`native-student-register ${embedded ? 'is-embedded' : ''}`}>
      <article className="native-student-register-card">
        <header>
          <h1>Formulário de matrícula</h1>
          <p>Preencha cada etapa com aten??o para concluir seu cadastro de aluno.</p>
        </header>

        {error ? <p className="native-error">{error}</p> : null}

        <ol className="native-student-register-stepper" aria-label="Etapas do cadastro">
          {steps.map((step, index) => {
            const stateClass =
              index === currentStep
                ? 'is-active'
                : index < currentStep
                  ? 'is-done'
                  : 'is-pending';
            const allowStepSelection = index <= currentStep;

            return (
              <li key={step.title} className={`native-student-register-step ${stateClass}`}>
                <button
                  type="button"
                  onClick={() => {
                    if (!allowStepSelection) return;
                    setCurrentStep(index);
                    setError('');
                  }}
                  disabled={!allowStepSelection || loading}
                >
                  <span>{index + 1}</span>
                  <div>
                    <strong>{step.title}</strong>
                    <small>{step.description}</small>
                  </div>
                </button>
              </li>
            );
          })}
        </ol>

        <form className="native-form-grid native-student-register-form" onSubmit={submit} noValidate>
          {currentStep === 0 ? (
            <>
              <label>
                Nome completo *
                <input
                  type="text"
                  value={name}
                  onChange={(event) => setName(normalizeNameInput(event.target.value))}
                  onBlur={() => setName((current) => current.trim().replace(/\s{2,}/g, ' '))}
                  disabled={loading}
                  autoComplete="name"
                />
              </label>

              <label>
                Telefone *
                <input
                  type="tel"
                  value={phone}
                  onChange={(event) => setPhone(formatPhone(event.target.value))}
                  disabled={loading}
                  inputMode="numeric"
                  placeholder="(00) 00000-0000"
                />
              </label>

              <label>
                E-mail *
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  disabled={loading}
                  autoComplete="email"
                />
              </label>

              <label>
                CPF *
                <input
                  type="text"
                  value={documentCpf}
                  onChange={(event) => setDocumentCpf(formatCpf(event.target.value))}
                  disabled={loading}
                  inputMode="numeric"
                  placeholder="000.000.000-00"
                />
              </label>

              <label>
                RG *
                <input
                  type="text"
                  value={documentRg}
                  onChange={(event) => setDocumentRg(formatRg(event.target.value))}
                  disabled={loading}
                  inputMode="numeric"
                  placeholder="00.000.000-0"
                />
              </label>

              <label>
                Ã“rg?o expedidor *
                <input
                  type="text"
                  value={issuingAuthority}
                  onChange={(event) => setIssuingAuthority(normalizeTextInput(event.target.value).toUpperCase())}
                  disabled={loading}
                  placeholder="Ex.: SSP"
                />
              </label>

              <label>
                Data de nascimento *
                <input
                  type="text"
                  value={birthDate}
                  onChange={(event) => setBirthDate(formatBirthDate(event.target.value))}
                  disabled={loading}
                  inputMode="numeric"
                  autoComplete="bday"
                  placeholder="DD/MM/AAAA"
                  maxLength={10}
                />
              </label>

              <label>
                Cidade que nasceu *
                <input
                  type="text"
                  value={birthCity}
                  onChange={(event) => setBirthCity(normalizeTextInput(event.target.value))}
                  disabled={loading}
                />
              </label>

              <label>
                Estado civil *
                <select
                  value={maritalStatus}
                  onChange={(event) => setMaritalStatus(event.target.value)}
                  disabled={loading}
                >
                  <option value="">Selecione</option>
                  {maritalStatusOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </>
          ) : null}

          {currentStep === 1 ? (
            <>
              <label>
                Nome do pai *
                <input
                  type="text"
                  value={fatherName}
                  onChange={(event) => setFatherName(normalizeNameInput(event.target.value))}
                  onBlur={() => setFatherName((current) => current.trim().replace(/\s{2,}/g, ' '))}
                  disabled={loading}
                />
              </label>

              <label>
                Nome da mãe *
                <input
                  type="text"
                  value={motherName}
                  onChange={(event) => setMotherName(normalizeNameInput(event.target.value))}
                  onBlur={() => setMotherName((current) => current.trim().replace(/\s{2,}/g, ' '))}
                  disabled={loading}
                />
              </label>

              <label>
                Gradua??o *
                <input
                  type="text"
                  value={graduation}
                  onChange={(event) => setGraduation(normalizeTextInput(event.target.value))}
                  disabled={loading}
                  placeholder="Ex.: Administração"
                />
              </label>

              <label>
                Ano de conclusão da graduação *
                <input
                  type="text"
                  value={graduationConclusionYear}
                  onChange={(event) => setGraduationConclusionYear(formatGraduationYear(event.target.value))}
                  disabled={loading}
                  inputMode="numeric"
                  placeholder="AAAA"
                  maxLength={4}
                />
              </label>
            </>
          ) : null}
          {currentStep === 2 ? (
            <>
              <label>
                Empresa onde trabalha *
                <input
                  type="text"
                  value={companyName}
                  onChange={(event) => setCompanyName(normalizeTextInput(event.target.value))}
                  disabled={loading}
                />
              </label>

              <label>
                Cargo *
                <input
                  type="text"
                  value={jobTitle}
                  onChange={(event) => setJobTitle(normalizeTextInput(event.target.value))}
                  disabled={loading}
                />
              </label>

              <label>
                Senha de acesso *
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  disabled={loading}
                  autoComplete="new-password"
                />
                {password ? (
                  <small className={`native-student-password-strength ${strength.toneClass}`}>
                    Força da senha: {strength.label}
                  </small>
                ) : null}
              </label>

              <label>
                Confirmar senha *
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  disabled={loading}
                  autoComplete="new-password"
                />
              </label>
            </>
          ) : null}

          {currentStep === 3 ? (
            <>
              <label>
                CEP *
                <input
                  type="text"
                  value={zipCode}
                  onChange={(event) => setZipCode(formatZipCode(event.target.value))}
                  disabled={loading}
                  inputMode="numeric"
                  placeholder="00000-000"
                />
              </label>

              <label className="full">
                Endereço *
                <input
                  type="text"
                  value={address}
                  onChange={(event) => setAddress(normalizeTextInput(event.target.value))}
                  disabled={loading}
                  placeholder="Rua, número, bairro e complemento"
                />
              </label>

              <section className="native-student-register-courses full" aria-label="Escolha do curso">
                <header className="native-student-register-courses-header">
                  <h3>Curso no IES</h3>
                  <p>Selecione o curso para finalizar sua matrícula.</p>
                </header>

                {coursesLoading ? <p className="native-info">Carregando cursos...</p> : null}

                {!coursesLoading && coursesError ? (
                  <div className="native-public-course-empty">
                    <p>{coursesError}</p>
                    <button type="button" onClick={() => void loadCourses()} disabled={loading}>
                      Tentar novamente
                    </button>
                  </div>
                ) : null}

                {!coursesLoading && !coursesError && courses.length === 0 ? (
                  <div className="native-public-course-empty">
                    <p>Nenhum curso disponível no momento.</p>
                  </div>
                ) : null}

                {!coursesLoading && !coursesError && courses.length > 0 ? (
                  <div className="native-public-course-grid">
                    {courses.map((course) => {
                      const selected = selectedCourseId === course.id;
                      return (
                        <button
                          key={course.id}
                          type="button"
                          className={`native-public-course-card ${selected ? 'is-selected' : ''}`}
                          onClick={() => setSelectedCourseId(course.id)}
                          disabled={loading}
                        >
                          {course.bannerUrl ? (
                            <img src={course.bannerUrl} alt={`Banner do curso ${course.name}`} />
                          ) : (
                            <div className="native-public-course-banner-fallback">
                              <span>{course.name}</span>
                            </div>
                          )}
                          <div className="native-public-course-content">
                            <header>
                              <h4>{course.name}</h4>
                              <span>{modalityLabel(course.modality)}</span>
                            </header>
                            <p>{course.description || 'Curso acadêmico profissional.'}</p>
                            <dl>
                              <div>
                                <dt>Carga horária</dt>
                                <dd>{course.workloadHours ? `${course.workloadHours}h` : 'Não informada'}</dd>
                              </div>
                              <div>
                                <dt>Categoria</dt>
                                <dd>{course.category || 'Não informada'}</dd>
                              </div>
                              <div>
                                <dt>Professor</dt>
                                <dd>{course.coordinator || 'Não informado'}</dd>
                              </div>
                              <div>
                                <dt>Pagamento</dt>
                                <dd>{installmentLabel(course)}</dd>
                              </div>
                            </dl>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                ) : null}
              </section>
            </>
          ) : null}

          <div className="native-student-register-actions full">
            {currentStep > 0 ? (
              <button type="button" className="ghost" onClick={goToPreviousStep} disabled={loading}>
                Voltar etapa
              </button>
            ) : (
              <span />
            )}

            {isFinalStep ? (
              <button
                type="submit"
                disabled={loading || coursesLoading || codeLoading || Boolean(pendingVerificationEmail) || Boolean(success)}
              >
                {loading ? 'Concluindo cadastro...' : 'Finalizar matrícula e criar acesso'}
              </button>
            ) : (
              <button type="button" onClick={() => void goToNextStep()} disabled={loading}>
                Continuar
              </button>
            )}
          </div>
        </form>
      </article>

      {pendingVerificationEmail ? (
        <div className="native-student-register-modal-backdrop" role="presentation">
          <div className="native-student-register-modal" role="dialog" aria-modal="true" aria-labelledby="student-register-confirm-title">
            <h3 id="student-register-confirm-title">Confirme seu e-mail</h3>
            <p>
              Digite o código de 6 dígitos enviado para <strong>{pendingVerificationEmail}</strong>.
            </p>
            <label>
              C?digo de confirmação
              <input
                type="text"
                value={verificationCode}
                onChange={(event) => setVerificationCode(event.target.value.replace(/\D+/g, '').slice(0, 6))}
                inputMode="numeric"
                placeholder="000000"
                autoFocus
              />
            </label>
            {codeError ? <p className="native-error">{codeError}</p> : null}
            <button type="button" onClick={() => void confirmVerificationCode()} disabled={codeLoading}>
              {codeLoading ? 'Confirmando código...' : 'Confirmar código'}
            </button>
          </div>
        </div>
      ) : null}

      {success ? (
        <div className="native-student-register-modal-backdrop" role="presentation">
          <div className="native-student-register-modal" role="dialog" aria-modal="true" aria-labelledby="student-register-success-title">
            <h3 id="student-register-success-title">Cadastro concluído</h3>
            <p>{success}</p>
            <a className="native-student-register-login-link" href={buildPortalLink()}>
              Ir para login
            </a>
          </div>
        </div>
      ) : null}
    </section>
  );
}

