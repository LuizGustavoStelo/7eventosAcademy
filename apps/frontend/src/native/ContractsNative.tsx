import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { API_BASE_URL, apiRequest } from './api';
import { ContractWordEditor, type ContractPlaceholder } from './ContractWordEditor';

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
  updatedAt: string;
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
  templateId: string;
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

const DEFAULT_TEMPLATE_HTML = `<section style="font-family:Arial,sans-serif;font-size:12px;line-height:1.45;color:#111827;">
  <h2 style="margin:0 0 4px;font-size:16px;text-align:center;">INSTRUMENTO PARTICULAR DE CONTRATO DE PRESTAÇÃO DE SERVIÇOS EDUCACIONAIS</h2>
  <p style="margin:0 0 16px;text-align:center;">
    Pós-graduação: <strong>{{curso_nome}}</strong>
  </p>
  <p style="margin:0 0 16px;text-align:center;font-size:11px;color:#4b5563;">
    {{contratada_nome}} - CNPJ {{contratada_cnpj}} - {{contratada_endereco}}
  </p>

  <h3 style="margin:0 0 8px;font-size:13px;">1. Identificação do(a) contratante</h3>
  <table style="width:100%;border-collapse:collapse;font-size:12px;">
    <tbody>
      <tr>
        <td style="border:1px solid #d1d5db;padding:6px;"><strong>Aluno(a)</strong><br />{{aluno_nome}}</td>
        <td style="border:1px solid #d1d5db;padding:6px;"><strong>E-mail</strong><br />{{aluno_email}}</td>
      </tr>
      <tr>
        <td style="border:1px solid #d1d5db;padding:6px;"><strong>CPF</strong><br />{{aluno_cpf}}</td>
        <td style="border:1px solid #d1d5db;padding:6px;"><strong>RG / Órgão</strong><br />{{aluno_rg}} - {{aluno_orgao_expedidor}}</td>
      </tr>
      <tr>
        <td style="border:1px solid #d1d5db;padding:6px;"><strong>Data de nascimento</strong><br />{{aluno_data_nascimento}}</td>
        <td style="border:1px solid #d1d5db;padding:6px;"><strong>Telefone</strong><br />{{aluno_telefone}}</td>
      </tr>
      <tr>
        <td style="border:1px solid #d1d5db;padding:6px;"><strong>Pai</strong><br />{{aluno_nome_pai}}</td>
        <td style="border:1px solid #d1d5db;padding:6px;"><strong>Mãe</strong><br />{{aluno_nome_mae}}</td>
      </tr>
      <tr>
        <td colspan="2" style="border:1px solid #d1d5db;padding:6px;"><strong>Endereço</strong><br />{{aluno_endereco}}, {{aluno_numero_endereco}} - CEP {{aluno_cep}} - {{aluno_cidade_nascimento}}</td>
      </tr>
      <tr>
        <td style="border:1px solid #d1d5db;padding:6px;"><strong>Graduação</strong><br />{{aluno_graduacao}}</td>
        <td style="border:1px solid #d1d5db;padding:6px;"><strong>Ano de conclusão</strong><br />{{aluno_ano_conclusao_graduacao}}</td>
      </tr>
      <tr>
        <td style="border:1px solid #d1d5db;padding:6px;"><strong>Empresa</strong><br />{{aluno_empresa}}</td>
        <td style="border:1px solid #d1d5db;padding:6px;"><strong>Cargo</strong><br />{{aluno_cargo}}</td>
      </tr>
    </tbody>
  </table>

  <h3 style="margin:16px 0 8px;font-size:13px;">2. Cláusulas e condições</h3>
  <p style="margin:0 0 8px;">
    O presente INSTRUMENTO PARTICULAR DE CONTRATO DE PRESTAÇÃO DE SERVIÇOS EDUCACIONAIS,
    em específico para desenvolvimento de curso de Pós-Graduação Lato Sensu, é celebrado
    entre o(a) CONTRATANTE e a CONTRATADA {{contratada_nome}}, observando-se a legislação
    educacional e consumerista aplicável.
  </p>
  <p style="margin:0 0 8px;"><strong>CLÁUSULA PRIMEIRA:</strong> O presente contrato tem como objeto a prestação de serviços educacionais pela CONTRATADA ao CONTRATANTE, durante o desenvolvimento do curso <strong>{{curso_nome}}</strong>, turma <strong>{{turma_nome}}</strong>, nos períodos de sua ocorrência e prazos definidos em calendário e cronograma acadêmico.</p>
  <p style="margin:0 0 8px;"><strong>CLÁUSULA SEGUNDA:</strong> A CONTRATADA assegura ao CONTRATANTE/BENEFICIÁRIO vaga no corpo discente, ministrando aulas e demais atividades escolares, cujo planejamento pedagógico atende à legislação vigente.</p>
  <p style="margin:0 0 8px;"><strong>CLÁUSULA TERCEIRA:</strong> A CONTRATADA resguarda-se no direito de alterar estrutura curricular, ementas e organização acadêmica, visando adequação às demandas pedagógicas e de mercado.</p>
  <p style="margin:0 0 8px;"><strong>CLÁUSULA QUARTA:</strong> Os serviços contratados referem-se aos procedimentos relativos ao currículo do curso constante na matrícula, integrante deste contrato. Excluem-se serviços facultativos e de caráter pessoal do CONTRATANTE/BENEFICIÁRIO, como emissão de documentos extraordinários e outros não condizentes com a prática acadêmica regular.</p>
  <p style="margin:0 0 6px;"><strong>§ 1º</strong> - As aulas serão ministradas em salas, laboratórios, ambientes virtuais ou locais indicados pela CONTRATADA, conforme natureza dos conteúdos, saídas de campo e técnicas pedagógicas necessárias.</p>
  <p style="margin:0 0 6px;"><strong>§ 2º</strong> - Reserva-se à CONTRATADA, até 5 (cinco) dias antes do início de cada turma, o direito de cancelar turma com número insuficiente de alunos, assegurando ao CONTRATANTE realocação em turma equivalente, quando disponível.</p>
  <p style="margin:0 0 8px;"><strong>§ 3º</strong> - É de exclusiva competência da CONTRATADA a orientação técnica e pedagógica decorrente da prestação dos serviços educacionais.</p>
  <p style="margin:0 0 8px;"><strong>CLÁUSULA QUINTA:</strong> Em contrapartida aos serviços prestados pela CONTRATADA, o(a) CONTRATANTE pagará os valores e parcelas descritos na seção financeira deste instrumento.</p>
  <p style="margin:10px 0 6px;"><strong>§ 2º</strong> - Através da Modalidade de Pós Graduação MODULAR, o aluno terá a RENOVAÇÃO DE MATRÍCULA automática a cada 03 (três módulos), desde que atenda os seguintes critérios:</p>
  <ul style="margin:0 0 10px 18px;padding:0;">
    <li style="margin:0 0 4px;">Ter assinado o Contrato de Prestações de Serviços Educacionais ORIGINÁRIO e apresentado toda a documentação necessária;</li>
    <li style="margin:0 0 4px;">Estar totalmente adimplente em suas mensalidades até o mês precedente ao da renovação de matrícula;</li>
    <li style="margin:0 0 4px;">Caso a situação financeira esteja satisfatória, o CONTRATANTE não precisará efetuar qualquer procedimento, pois sua rematrícula estará assegurada;</li>
    <li style="margin:0 0 4px;">Na vigência de alguma pendência, a matrícula só poderá ser renovada se o CONTRATANTE obtiver a liberação no Departamento Financeiro da CONTRATADA;</li>
    <li style="margin:0 0 4px;">A realização dos módulos seguintes ao módulo realizado só poderá ocorrer mediante cumprimento dos encargos pedagógicos e financeiros do módulo anterior, conforme previsão de disciplinas.</li>
  </ul>
  <p style="margin:0 0 8px;"><strong>§ 3º</strong> - Os pagamentos das parcelas deverão ser efetuados até a data do vencimento prevista, nos locais indicados pela CONTRATADA. A primeira parcela será cobrada no ato da matrícula.</p>
  <p style="margin:0 0 6px;"><strong>§ 4º</strong> - A CONTRATADA poderá conceder descontos para pagamento dentro da data de pontualidade, sem obrigação de prorrogação ou alteração de datas.</p>
  <p style="margin:0 0 6px;"><strong>§ 5º</strong> - O não pagamento no prazo firmado poderá acarretar perda de descontos promocionais.</p>
  <p style="margin:0 0 8px;"><strong>§ 6º</strong> - O não recebimento de boleto não isenta o CONTRATANTE do pagamento no vencimento, devendo buscar segunda via nos canais oficiais da CONTRATADA.</p>
  <p style="margin:0 0 8px;"><strong>CLÁUSULA SEXTA:</strong> Em caso de inadimplência, incidirão multa e juros conforme legislação e políticas financeiras da CONTRATADA, podendo haver cobrança administrativa e/ou judicial, observadas as regras legais vigentes.</p>
  <p style="margin:0 0 8px;"><strong>CLÁUSULA SÉTIMA - CANCELAMENTO/RESCISÃO:</strong> A rescisão por iniciativa do CONTRATANTE deverá ser formalizada por escrito, com antecedência mínima exigida pela instituição e regularização das obrigações financeiras vencidas e vincendas previstas contratualmente.</p>
  <p style="margin:0 0 8px;"><strong>CLÁUSULA OITAVA:</strong> A CONTRATADA não se responsabiliza pela guarda de objetos pessoais, documentos, valores ou veículos do CONTRATANTE, salvo nos casos legalmente comprovados de responsabilidade direta.</p>
  <p style="margin:0 0 8px;"><strong>CLÁUSULA NONA:</strong> O abandono de aulas sem formalização de cancelamento não extingue obrigações financeiras e acadêmicas previstas neste contrato e no regulamento institucional.</p>
  <p style="margin:0 0 8px;"><strong>CLÁUSULA DÉCIMA:</strong> O CONTRATANTE deverá cumprir frequência mínima e critérios de aproveitamento acadêmico para certificação, conforme normas do curso e exigências legais.</p>
  <p style="margin:0 0 8px;"><strong>CLÁUSULA DÉCIMA PRIMEIRA:</strong> O prazo de entrega de TCC/Artigo e regras de reposição de módulos observarão manual acadêmico e regulamento vigente da CONTRATADA.</p>
  <p style="margin:0 0 8px;"><strong>CLÁUSULA DÉCIMA SEGUNDA:</strong> O CONTRATANTE autoriza, de forma gratuita e nos limites legais, o uso de imagem para fins institucionais e publicitários da CONTRATADA.</p>
  <p style="margin:0 0 8px;"><strong>CLÁUSULA DÉCIMA TERCEIRA:</strong> O CONTRATANTE compromete-se a manter dados cadastrais atualizados, inclusive endereço e telefones, sob pena de validade das comunicações enviadas aos dados constantes em cadastro.</p>
  <p style="margin:0 0 8px;"><strong>CLÁUSULA DÉCIMA QUARTA:</strong> Danos causados pelo CONTRATANTE a instalações, mobiliários ou equipamentos da CONTRATADA deverão ser ressarcidos.</p>
  <p style="margin:0 0 8px;"><strong>CLÁUSULA DÉCIMA QUINTA:</strong> A renovação de vínculo acadêmico poderá ser recusada em caso de descumprimento de obrigações contratuais, acadêmicas ou financeiras.</p>
  <p style="margin:0 0 8px;"><strong>CLÁUSULA DÉCIMA SEXTA:</strong> A apresentação de trabalho final e emissão de documentos acadêmicos podem exigir regularidade financeira do CONTRATANTE.</p>
  <p style="margin:0 0 8px;"><strong>CLÁUSULA DÉCIMA SÉTIMA:</strong> A CONTRATADA não responde por serviços de estacionamento, vigilância ou guarda de veículos, cabendo responsabilidade ao proprietário/condutor.</p>
  <p style="margin:0 0 8px;"><strong>CLÁUSULA DÉCIMA OITAVA:</strong> As partes reconhecem plena validade das cláusulas pactuadas neste instrumento.</p>
  <p style="margin:0 0 8px;"><strong>CLÁUSULA DÉCIMA NONA:</strong> O contrato extingue-se com o cumprimento dos créditos/módulos do curso, observadas as exigências de conclusão e certificação.</p>
  <p style="margin:0 0 8px;"><strong>CLÁUSULA VIGÉSIMA:</strong> As partes atribuem ao presente contrato eficácia jurídica plena para todos os fins legais cabíveis.</p>
  <p style="margin:0 0 8px;"><strong>CLÁUSULA VIGÉSIMA PRIMEIRA:</strong> Casos omissos poderão ser tratados entre o aluno e os setores competentes da CONTRATADA.</p>
  <p style="margin:0 0 8px;"><strong>CLÁUSULA VIGÉSIMA SEGUNDA:</strong> As informações cadastrais e documentais do preâmbulo são de inteira responsabilidade do CONTRATANTE.</p>
  <p style="margin:0 0 8px;"><strong>CLÁUSULA VIGÉSIMA TERCEIRA:</strong> Havendo convenção arbitral aplicável, controvérsias patrimoniais disponíveis poderão ser resolvidas em câmara de mediação/conciliação/arbitragem, conforme legislação vigente.</p>
  <p style="margin:0 0 8px;"><strong>CLÁUSULA VIGÉSIMA QUARTA - DO FORO:</strong> Fica eleito o foro de <strong>{{contrato_foro}}</strong> para dirimir conflitos não submetidos à arbitragem.</p>

  <div data-contract-page-break="true" style="page-break-after: always;"></div>

  <h3 style="margin:16px 0 8px;font-size:13px;">3. Condições financeiras</h3>
  <p style="margin:0 0 8px;">
    Matrícula vinculada ao ID <strong>{{matricula_id}}</strong>. Total de parcelas: <strong>{{financeiro_parcelas_total}}</strong>.
  </p>
  <table style="width:100%;border-collapse:collapse;font-size:12px;margin:0 0 10px;">
    <tbody>
      <tr>
        <td style="border:1px solid #d1d5db;padding:6px;"><strong>Forma de pagamento</strong><br />{{financeiro_forma_pagamento}}</td>
        <td style="border:1px solid #d1d5db;padding:6px;"><strong>Valor total</strong><br />{{financeiro_valor_total}}</td>
      </tr>
      <tr>
        <td style="border:1px solid #d1d5db;padding:6px;"><strong>Taxa de matrícula</strong><br />{{financeiro_taxa_matricula}}</td>
        <td style="border:1px solid #d1d5db;padding:6px;"><strong>Valor da parcela</strong><br />{{financeiro_valor_parcela}}</td>
      </tr>
      <tr>
        <td colspan="2" style="border:1px solid #d1d5db;padding:6px;"><strong>Resumo de formas e valores</strong><br />{{financeiro_formas_valores_resumo}}</td>
      </tr>
    </tbody>
  </table>
  <div style="margin:0 0 10px;">
    {{{financeiro_parcelas_tabela_html}}}
  </div>

  <h3 style="margin:16px 0 8px;font-size:13px;">4. Assinaturas</h3>
  <p style="margin:0 0 24px;">
    {{contrato_cidade_assinatura}}, {{contrato_data_emissao_extenso}}.
  </p>

  <table style="width:100%;border-collapse:collapse;font-size:12px;">
    <tbody>
      <tr>
        <td style="width:50%;padding:8px 12px 8px 0;vertical-align:top;">
          <div style="border-top:1px solid #111827;padding-top:6px;">
            ALUNO(A) - CONTRATANTE/BENEFICIÁRIO<br />
            Nome: {{aluno_nome}}<br />
            CPF: {{aluno_cpf}}
          </div>
        </td>
        <td style="width:50%;padding:8px 0 8px 12px;vertical-align:top;">
          <div style="border-top:1px solid #111827;padding-top:6px;">
            CONTRATADA<br />
            {{contratada_nome}}
          </div>
        </td>
      </tr>
      <tr>
        <td style="padding:24px 12px 8px 0;vertical-align:top;">
          <div style="border-top:1px solid #111827;padding-top:6px;">
            Testemunha 1 - Nome:<br />
            CPF:
          </div>
        </td>
        <td style="padding:24px 0 8px 12px;vertical-align:top;">
          <div style="border-top:1px solid #111827;padding-top:6px;">
            Testemunha 2 - Nome:<br />
            CPF:
          </div>
        </td>
      </tr>
    </tbody>
  </table>

  <p style="margin:16px 0 0;font-size:11px;color:#4b5563;">
    Código de assinatura eletrônica: <strong>{{codigo_assinatura}}</strong>
  </p>
</section>`;

const CONTRACT_EDITOR_PLACEHOLDERS: ContractPlaceholder[] = [
  { id: 'aluno_nome', label: 'Aluno: nome', token: '{{aluno_nome}}' },
  { id: 'aluno_email', label: 'Aluno: e-mail', token: '{{aluno_email}}' },
  { id: 'aluno_documento', label: 'Aluno: documento (CPF)', token: '{{aluno_documento}}' },
  { id: 'aluno_cpf', label: 'Aluno: CPF', token: '{{aluno_cpf}}' },
  { id: 'aluno_rg', label: 'Aluno: RG', token: '{{aluno_rg}}' },
  {
    id: 'aluno_orgao_expedidor',
    label: 'Aluno: órgão expedidor',
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

function defaultTemplateForm(): TemplateFormState {
  return {
    name: '',
    description: '',
    draftTitle: 'Contrato Educacional',
    draftHtmlContent: DEFAULT_TEMPLATE_HTML,
  };
}

function defaultSendForm(): SendFormState {
  return {
    templateId: '',
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

function toSafePositiveInteger(value: string, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  const normalized = Math.trunc(parsed);
  return normalized > 0 ? normalized : fallback;
}

export function ContractsNative({ token, mode = 'hub' }: ContractsNativeProps) {
  const isEditorMode = mode === 'editor';
  const [templates, setTemplates] = useState<ContractTemplate[]>([]);
  const [instances, setInstances] = useState<ContractInstanceItem[]>([]);
  const [students, setStudents] = useState<StudentOption[]>([]);
  const [courses, setCourses] = useState<CourseOption[]>([]);
  const [classes, setClasses] = useState<ClassOption[]>([]);

  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [templateForm, setTemplateForm] = useState<TemplateFormState>(() => defaultTemplateForm());
  const [sendForm, setSendForm] = useState<SendFormState>(() => defaultSendForm());
  const [instanceStatusFilter, setInstanceStatusFilter] = useState('all');

  const [loading, setLoading] = useState(true);
  const [templateSaving, setTemplateSaving] = useState(false);
  const [templatePublishing, setTemplatePublishing] = useState(false);
  const [sendingInstance, setSendingInstance] = useState(false);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [downloadingInstanceId, setDownloadingInstanceId] = useState<string | null>(
    null,
  );
  const [deletingInstanceId, setDeletingInstanceId] = useState<string | null>(null);

  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');
  const [formError, setFormError] = useState('');
  const [sendError, setSendError] = useState('');

  const [detailsOpen, setDetailsOpen] = useState(false);
  const [selectedInstanceDetails, setSelectedInstanceDetails] =
    useState<ContractInstanceDetails | null>(null);

  const selectedTemplate = useMemo(
    () => templates.find((item) => item.id === selectedTemplateId) ?? null,
    [templates, selectedTemplateId],
  );

  const sendableTemplates = useMemo(
    () =>
      templates.filter(
        (item) =>
          item.status.trim().toUpperCase() === 'PUBLISHED' &&
          Number(item.latestVersionNumber || 0) > 0,
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
        await loadTemplates();
      } else {
        await Promise.all([loadTemplates(), loadInstances(statusFilter), loadOptions()]);
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

    const currentTemplate = templates.find((item) => item.id === selectedTemplateId);
    if (!currentTemplate) {
      setSelectedTemplateId(null);
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
    void loadInstances(instanceStatusFilter);
  }, [instanceStatusFilter, isEditorMode]);

  useEffect(() => {
    if (isEditorMode) return;
    if (
      sendForm.templateId &&
      sendableTemplates.some((template) => template.id === sendForm.templateId)
    ) {
      return;
    }
    if (
      selectedTemplateId &&
      sendableTemplates.some((template) => template.id === selectedTemplateId)
    ) {
      setSendForm((current) => ({ ...current, templateId: selectedTemplateId }));
      return;
    }
    if (sendableTemplates[0]?.id) {
      setSendForm((current) => ({ ...current, templateId: sendableTemplates[0].id }));
      return;
    }
    setSendForm((current) => ({ ...current, templateId: '' }));
  }, [selectedTemplateId, sendableTemplates, sendForm.templateId, isEditorMode]);

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
    if (!isEditorMode) {
      openEditorPage(template.id);
      return;
    }
    setSelectedTemplateId(template.id);
    setTemplateForm({
      name: template.name,
      description: template.description || '',
      draftTitle: template.draftTitle,
      draftHtmlContent: template.draftHtmlContent,
    });
    setFormError('');
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
        'Modelos publicados não aceitam edição direta. Use "Publicar versão" para atualizar conteúdo.',
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
      setFormError('Selecione um modelo para publicar.');
      return;
    }

    setFormError('');
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

      await Promise.all([loadTemplates(), loadInstances(instanceStatusFilter)]);
      setFeedback('Versão do contrato publicada com sucesso.');
    } catch (publishError) {
      setFormError(
        publishError instanceof Error
          ? publishError.message
          : 'Falha ao publicar o modelo.',
      );
    } finally {
      setTemplatePublishing(false);
    }
  };

  const sendContract = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSendError('');
    setFeedback('');
    setError('');

    if (!sendForm.templateId || !sendForm.studentId) {
      setSendError('Selecione o modelo e o aluno para envio.');
      return;
    }

    const payload = {
      templateId: sendForm.templateId,
      studentId: sendForm.studentId,
      enrollmentId: sendForm.enrollmentId.trim() || undefined,
      courseId: sendForm.courseId || undefined,
      classId: sendForm.classId || undefined,
      expiresInHours: toSafePositiveInteger(sendForm.expiresInHours, 72),
      sendEmail: sendForm.sendEmail,
    };

    setSendingInstance(true);
    try {
      const result = await apiRequest<{
        instanceId: string;
        signatureCode: string;
      }>(token, '/contracts/instances/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      await loadInstances(instanceStatusFilter);
      setFeedback(
        `Contrato enviado com sucesso. Código de assinatura: ${result.signatureCode}.`,
      );
      setSendForm((current) => ({
        ...current,
        enrollmentId: '',
        expiresInHours: current.expiresInHours || '72',
      }));
    } catch (sendErr) {
      setSendError(
        sendErr instanceof Error ? sendErr.message : 'Falha ao enviar contrato.',
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
      `Deseja realmente apagar o contrato "${instance.template.name}" de ${instance.student.name}? Esta ação remove o contrato também da visão do aluno.`,
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

      await loadInstances(instanceStatusFilter);
      setFeedback('Contrato apagado com sucesso.');
    } catch (deleteError) {
      setError(
        deleteError instanceof Error ? deleteError.message : 'Falha ao apagar contrato.',
      );
    } finally {
      setDeletingInstanceId((current) => (current === instance.id ? null : current));
    }
  };

  const instancesCountByStatus = useMemo(() => {
    const counter = {
      total: instances.length,
      sent: 0,
      viewed: 0,
      pinVerified: 0,
      signed: 0,
    };

    for (const item of instances) {
      const status = item.status.trim().toUpperCase();
      if (status === 'SENT') counter.sent += 1;
      if (status === 'VIEWED') counter.viewed += 1;
      if (status === 'PIN_VERIFIED') counter.pinVerified += 1;
      if (status === 'SIGNED') counter.signed += 1;
    }

    return counter;
  }, [instances]);

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
              {instancesCountByStatus.sent + instancesCountByStatus.viewed + instancesCountByStatus.pinVerified}
            </strong>
            <small>
              {instancesCountByStatus.sent} enviados • {instancesCountByStatus.viewed} visualizados
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
                  <button
                    key={template.id}
                    type="button"
                    className={`native-contract-template-item ${
                      selectedTemplateId === template.id ? 'is-active' : ''
                    }`}
                    onClick={() => pickTemplate(template)}
                  >
                    <div>
                      <strong>{template.name}</strong>
                      <small>
                        Versão {template.latestVersionNumber} • Atualizado em{' '}
                        {formatDateTime(template.updatedAt)}
                      </small>
                    </div>
                    <span className={`native-status-chip ${templateStatusTone(template.status)}`}>
                      {templateStatusLabel(template.status)}
                    </span>
                  </button>
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
                <h3>{selectedTemplate ? 'Editar modelo' : 'Novo modelo de contrato'}</h3>
                <div className="native-modal-actions">
                  <button
                    type="button"
                    className="ghost"
                    onClick={() => {
                      window.location.href = '/';
                    }}
                  >
                    Voltar
                  </button>
                </div>
                {selectedTemplate ? (
                  <small>
                    {selectedTemplate.latestVersion
                      ? `Última publicação: v${selectedTemplate.latestVersion.versionNumber} em ${formatDateTime(
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
                  {selectedTemplate ? (
                    <button
                      type="button"
                      className="ghost"
                      onClick={() => void publishTemplate()}
                      disabled={templatePublishing}
                    >
                      {templatePublishing ? 'Publicando...' : 'Publicar versão'}
                    </button>
                  ) : null}
                  <button type="submit" disabled={templateSaving}>
                    {templateSaving
                      ? 'Salvando...'
                      : selectedTemplate
                        ? 'Salvar rascunho'
                        : 'Criar modelo'}
                  </button>
                </div>
              </form>
            </article>
          ) : null}

          {!isEditorMode ? (
            <article className="native-panel">
            <header className="native-panel-header">
              <h3>Enviar para assinatura</h3>
              <button
                type="button"
                className="ghost"
                onClick={() => {
                  openEditorPage(selectedTemplateId ?? undefined);
                }}
              >
                Abrir editor
              </button>
            </header>

            <form className="native-form-grid native-contract-send-form" onSubmit={sendContract}>
              <label>
                Modelo publicado
                <select
                  value={sendForm.templateId}
                  onChange={(event) =>
                    setSendForm((current) => ({
                      ...current,
                      templateId: event.target.value,
                    }))
                  }
                  required
                >
                  <option value="">Selecione</option>
                  {sendableTemplates.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.name} (v{template.latestVersionNumber})
                    </option>
                  ))}
                </select>
              </label>

              {sendableTemplates.length === 0 ? (
                <p className="native-info native-contract-span-all">
                  Publique ao menos um modelo para habilitar envios.
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
                      {student.name} • {student.email}
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
            </article>
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
                <button type="button" onClick={() => void loadInstances(instanceStatusFilter)}>
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
                      <td colSpan={6}>Nenhum envio encontrado.</td>
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
                </div>

                <article className="native-panel native-contract-document-preview">
                  <header className="native-panel-header">
                    <h3>{selectedInstanceDetails.snapshotTemplateTitle}</h3>
                  </header>
                  <iframe
                    title="Pré-visualização do contrato"
                    sandbox=""
                    srcDoc={selectedInstanceDetails.documentHtml}
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
                            {log.actorType} • {formatDateTime(log.createdAt)}
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
