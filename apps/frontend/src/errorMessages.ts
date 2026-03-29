const FIELD_LABELS: Record<string, string> = {
  password: 'Senha',
  email: 'E-mail',
  name: 'Nome',
  documentCpf: 'CPF',
  phone: 'Telefone',
  birthDate: 'Data de nascimento',
  zipCode: 'CEP',
  street: 'Rua',
  streetNumber: 'Número',
  neighborhood: 'Bairro',
  city: 'Cidade',
  state: 'Estado',
  courseIds: 'Cursos',
};

const directMap: Record<string, string> = {
  Unauthorized: 'Credenciais inválidas.',
  'Unauthorized.': 'Credenciais inválidas.',
  Forbidden: 'Acesso negado.',
  'Not Found': 'Recurso não encontrado.',
  'Internal server error': 'Erro interno do servidor.',
};

function fieldLabel(rawField: string) {
  return FIELD_LABELS[rawField] ?? rawField;
}

function translateClassValidatorMessage(message: string) {
  const trimmed = message.trim();
  if (!trimmed) return trimmed;

  if (directMap[trimmed]) return directMap[trimmed];

  let translated = trimmed;

  translated = translated.replace(
    /^([a-zA-Z0-9_.-]+) must be longer than or equal to (\d+) characters$/i,
    (_, field, min) => `${fieldLabel(field)} deve ter no mínimo ${min} caracteres.`,
  );
  translated = translated.replace(
    /^([a-zA-Z0-9_.-]+) must be shorter than or equal to (\d+) characters$/i,
    (_, field, max) => `${fieldLabel(field)} deve ter no máximo ${max} caracteres.`,
  );
  translated = translated.replace(
    /^([a-zA-Z0-9_.-]+) must be a string$/i,
    (_, field) => `${fieldLabel(field)} deve ser um texto válido.`,
  );
  translated = translated.replace(
    /^([a-zA-Z0-9_.-]+) must be an email$/i,
    (_, field) => `${fieldLabel(field)} deve ser um e-mail válido.`,
  );
  translated = translated.replace(
    /^([a-zA-Z0-9_.-]+) must be a UUID$/i,
    (_, field) => `${fieldLabel(field)} deve ser um identificador válido.`,
  );
  translated = translated.replace(
    /^([a-zA-Z0-9_.-]+) must be a UUID v4$/i,
    (_, field) => `${fieldLabel(field)} deve ser um identificador válido.`,
  );
  translated = translated.replace(
    /^([a-zA-Z0-9_.-]+) must be a valid ISO 8601 date string$/i,
    (_, field) => `${fieldLabel(field)} deve ser uma data válida.`,
  );
  translated = translated.replace(
    /^([a-zA-Z0-9_.-]+) should not be empty$/i,
    (_, field) => `${fieldLabel(field)} é obrigatório.`,
  );
  translated = translated.replace(
    /^([a-zA-Z0-9_.-]+) must be an array$/i,
    (_, field) => `${fieldLabel(field)} deve ser uma lista válida.`,
  );
  translated = translated.replace(
    /^([a-zA-Z0-9_.-]+) should not be null or undefined$/i,
    (_, field) => `${fieldLabel(field)} é obrigatório.`,
  );

  return translated;
}

export function toPtBrApiMessage(input: string | string[] | undefined, fallback: string) {
  if (!input) return fallback;

  const messages = Array.isArray(input) ? input : [input];
  const translated = messages
    .map((item) => translateClassValidatorMessage(String(item)))
    .filter(Boolean);

  if (translated.length === 0) return fallback;
  return translated.join(' ');
}
