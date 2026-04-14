export type ContractBasePresetForm = {
  name: string;
  description: string;
  draftTitle: string;
  draftHtmlContent: string;
};

export type ContractBasePreset = {
  id: string;
  label: string;
  helperText: string;
  form: ContractBasePresetForm;
};

export const SERVICE_CONTRACT_TEMPLATE_HTML = `<section style="font-family:Arial,sans-serif;color:#111827;">
  <div style="max-width:794px;min-height:1123px;margin:0 auto;padding:24px 56px;box-sizing:border-box;background:#fff;">
    <p style="margin:0 0 14px;font-size:11px;color:#4b5563;text-align:center;">+55 (67) 99940-8110 | www.ipesk.com.br | contato@ipesk.com.br</p>
    <h2 style="margin:0 0 6px;font-size:16px;text-align:center;">INSTRUMENTO PARTICULAR DE CONTRATO DE PRESTA&Ccedil;&Atilde;O DE SERVI&Ccedil;OS EDUCACIONAIS</h2>
    <p style="margin:0 0 16px;text-align:center;">P&oacute;s-gradua&ccedil;&atilde;o: <strong>{{curso_nome}}</strong></p>

    <h3 style="margin:0 0 8px;font-size:13px;">1. Identifica&ccedil;&atilde;o do(a) contratante</h3>
    <p style="margin:0 0 8px;font-size:12px;"><strong>CONTRATADA:</strong> {{contratada_nome}} - CNPJ {{contratada_cnpj}}, com endere&ccedil;o em {{contratada_endereco}}.</p>
    <p style="margin:0 0 12px;font-size:12px;"><strong>CONTRATANTE:</strong> aluno(a) identificado(a) na ficha de matr&iacute;cula integrada a este instrumento.</p>
    <table style="width:100%;border-collapse:collapse;font-size:12px;margin:0 0 14px;"><tbody>
      <tr><td style="border:1px solid #d1d5db;padding:6px;"><strong>Aluno(a)</strong><br />{{aluno_nome}}</td><td style="border:1px solid #d1d5db;padding:6px;"><strong>E-mail</strong><br />{{aluno_email}}</td></tr>
      <tr><td style="border:1px solid #d1d5db;padding:6px;"><strong>CPF</strong><br />{{aluno_cpf}}</td><td style="border:1px solid #d1d5db;padding:6px;"><strong>RG / &Oacute;rg&atilde;o</strong><br />{{aluno_rg}} - {{aluno_orgao_expedidor}}</td></tr>
      <tr><td style="border:1px solid #d1d5db;padding:6px;"><strong>Data de nascimento</strong><br />{{aluno_data_nascimento}}</td><td style="border:1px solid #d1d5db;padding:6px;"><strong>Telefone</strong><br />{{aluno_telefone}}</td></tr>
      <tr><td style="border:1px solid #d1d5db;padding:6px;"><strong>Estado civil</strong><br />{{aluno_estado_civil}}</td><td style="border:1px solid #d1d5db;padding:6px;"><strong>Cidade de nascimento</strong><br />{{aluno_cidade_nascimento}}</td></tr>
      <tr><td style="border:1px solid #d1d5db;padding:6px;"><strong>Pai</strong><br />{{aluno_nome_pai}}</td><td style="border:1px solid #d1d5db;padding:6px;"><strong>M&atilde;e</strong><br />{{aluno_nome_mae}}</td></tr>
      <tr><td colspan="2" style="border:1px solid #d1d5db;padding:6px;"><strong>Endere&ccedil;o</strong><br />{{aluno_endereco}}, {{aluno_numero_endereco}} - CEP {{aluno_cep}}</td></tr>
      <tr><td style="border:1px solid #d1d5db;padding:6px;"><strong>Gradua&ccedil;&atilde;o</strong><br />{{aluno_graduacao}}</td><td style="border:1px solid #d1d5db;padding:6px;"><strong>Ano de conclus&atilde;o</strong><br />{{aluno_ano_conclusao_graduacao}}</td></tr>
      <tr><td style="border:1px solid #d1d5db;padding:6px;"><strong>Empresa</strong><br />{{aluno_empresa}}</td><td style="border:1px solid #d1d5db;padding:6px;"><strong>Cargo</strong><br />{{aluno_cargo}}</td></tr>
    </tbody></table>

    <p style="margin:0 0 8px;font-size:12px;">Contrato de servi&ccedil;os educacionais para o curso <strong>{{curso_nome}}</strong> (Lato Sensu), regido pela legisla&ccedil;&atilde;o civil, educacional e consumerista aplic&aacute;vel.</p>

    <h3 style="margin:12px 0 6px;font-size:13px;">CL&Aacute;USULA PRIMEIRA - OBJETO</h3>
    <p style="margin:0 0 8px;font-size:12px;">Presta&ccedil;&atilde;o de servi&ccedil;os educacionais no curso {{curso_nome}}, turma {{turma_nome}}, conforme calend&aacute;rio e cronograma acad&ecirc;mico.</p>
    <h3 style="margin:12px 0 6px;font-size:13px;">CL&Aacute;USULA SEGUNDA - PRESTA&Ccedil;&Atilde;O DOS SERVI&Ccedil;OS</h3>
    <p style="margin:0 0 8px;font-size:12px;">A CONTRATADA assegura vaga e execu&ccedil;&atilde;o das atividades acad&ecirc;micas em conformidade com a legisla&ccedil;&atilde;o vigente, inclusive em formato presencial, h&iacute;brido ou online.</p>
    <h3 style="margin:12px 0 6px;font-size:13px;">CL&Aacute;USULA TERCEIRA - ALTERA&Ccedil;&Otilde;ES ACAD&Ecirc;MICAS</h3>
    <p style="margin:0 0 8px;font-size:12px;">Ajustes de grade, cronograma e metodologia s&atilde;o permitidos sem preju&iacute;zo acad&ecirc;mico, mantendo carga hor&aacute;ria total e sem custo adicional n&atilde;o acordado.</p>
    <h3 style="margin:12px 0 6px;font-size:13px;">CL&Aacute;USULA QUARTA - SERVI&Ccedil;OS INCLU&Iacute;DOS E EXCLU&Iacute;DOS</h3>
    <p style="margin:0 0 8px;font-size:12px;">O contrato cobre o curr&iacute;culo regular previsto na matr&iacute;cula. Servi&ccedil;os facultativos/pessoais n&atilde;o est&atilde;o inclu&iacute;dos.</p>
    <h3 style="margin:12px 0 6px;font-size:13px;">CL&Aacute;USULA QUINTA - CANCELAMENTO DE TURMA</h3>
    <p style="margin:0 0 8px;font-size:12px;">Em cancelamento/adiamento por motivo justificado, o CONTRATANTE poder&aacute; optar por transfer&ecirc;ncia para curso equivalente ou restitui&ccedil;&atilde;o integral.</p>
  </div>

  <div data-contract-page-break="true" style="page-break-after: always;"></div>

  <div style="max-width:794px;min-height:1123px;margin:0 auto;padding:24px 56px;box-sizing:border-box;background:#fff;">
    <h3 style="margin:0 0 8px;font-size:13px;">CL&Aacute;USULA SEXTA - VALORES E PAGAMENTO</h3>
    <p style="margin:0 0 8px;font-size:12px;">O CONTRATANTE declara ci&ecirc;ncia de valores, parcelas, vencimentos e condi&ccedil;&otilde;es comerciais da matr&iacute;cula.</p>
    <table style="width:100%;border-collapse:collapse;font-size:12px;margin:0 0 10px;"><tbody>
      <tr><td style="border:1px solid #d1d5db;padding:6px;"><strong>Matr&iacute;cula</strong><br />{{matricula_id}}</td><td style="border:1px solid #d1d5db;padding:6px;"><strong>Quantidade de parcelas</strong><br />{{financeiro_parcelas_total}}</td></tr>
      <tr><td style="border:1px solid #d1d5db;padding:6px;"><strong>Forma de pagamento</strong><br />{{financeiro_forma_pagamento}}</td><td style="border:1px solid #d1d5db;padding:6px;"><strong>Valor total</strong><br />{{financeiro_valor_total}}</td></tr>
      <tr><td style="border:1px solid #d1d5db;padding:6px;"><strong>Taxa de matr&iacute;cula</strong><br />{{financeiro_taxa_matricula}}</td><td style="border:1px solid #d1d5db;padding:6px;"><strong>Valor da parcela</strong><br />{{financeiro_valor_parcela}}</td></tr>
      <tr><td colspan="2" style="border:1px solid #d1d5db;padding:6px;"><strong>Resumo</strong><br />{{financeiro_formas_valores_resumo}}</td></tr>
    </tbody></table>
    <div style="margin:0 0 12px;">{{{financeiro_parcelas_tabela_html}}}</div>
    <p style="margin:0 0 8px;font-size:12px;"><strong>&sect; 1&ordm;</strong> - Na modalidade modular, a renova&ccedil;&atilde;o autom&aacute;tica a cada 3 m&oacute;dulos exige contrato origin&aacute;rio assinado, adimpl&ecirc;ncia e cumprimento acad&ecirc;mico.</p>
    <p style="margin:0 0 8px;font-size:12px;"><strong>&sect; 2&ordm;</strong> - Pagamentos at&eacute; o vencimento; n&atilde;o recebimento de boleto n&atilde;o isenta pagamento.</p>
    <p style="margin:0 0 8px;font-size:12px;"><strong>&sect; 3&ordm; ao &sect; 6&ordm;</strong> - Regras de desconto, pontualidade e segunda via de cobran&ccedil;a conforme pol&iacute;tica financeira da CONTRATADA.</p>

    <h3 style="margin:12px 0 6px;font-size:13px;">CL&Aacute;USULA S&Eacute;TIMA - MORA E INADIMPLEMENTO</h3>
    <p style="margin:0 0 8px;font-size:12px;">Incid&ecirc;ncia de multa e juros legais, com possibilidade de cobran&ccedil;a administrativa/judicial e notifica&ccedil;&atilde;o pr&eacute;via para prote&ccedil;&atilde;o ao cr&eacute;dito.</p>
    <h3 style="margin:12px 0 6px;font-size:13px;">CL&Aacute;USULA OITAVA - REAJUSTE</h3>
    <p style="margin:0 0 8px;font-size:12px;">Reajuste anual por &iacute;ndice oficial, conforme legisla&ccedil;&atilde;o vigente.</p>
    <h3 style="margin:12px 0 6px;font-size:13px;">CL&Aacute;USULA NONA - RESPONSABILIDADE POR BENS</h3>
    <p style="margin:0 0 8px;font-size:12px;">A CONTRATADA n&atilde;o responde por guarda de bens pessoais e ve&iacute;culos, salvo culpa comprovada.</p>
  </div>

  <div data-contract-page-break="true" style="page-break-after: always;"></div>

  <div style="max-width:794px;min-height:1123px;margin:0 auto;padding:24px 56px;box-sizing:border-box;background:#fff;">
    <h3 style="margin:0 0 8px;font-size:13px;">CL&Aacute;USULA D&Eacute;CIMA - RESCIS&Atilde;O</h3>
    <p style="margin:0 0 8px;font-size:12px;">Rescis&atilde;o por iniciativa do CONTRATANTE com solicita&ccedil;&atilde;o formal e anteced&ecirc;ncia m&iacute;nima; aplica&ccedil;&atilde;o de valores proporcionais e multa contratual quando cab&iacute;vel.</p>
    <h3 style="margin:12px 0 6px;font-size:13px;">CL&Aacute;USULA D&Eacute;CIMA PRIMEIRA - FREQU&Ecirc;NCIA E APROVA&Ccedil;&Atilde;O</h3>
    <p style="margin:0 0 8px;font-size:12px;">Cumprimento de carga hor&aacute;ria m&iacute;nima e crit&eacute;rios de aproveitamento acad&ecirc;mico (incluindo reposi&ccedil;&atilde;o de m&oacute;dulos e taxa quando aplic&aacute;vel).</p>
    <h3 style="margin:12px 0 6px;font-size:13px;">CL&Aacute;USULA D&Eacute;CIMA SEGUNDA - CERTIFICA&Ccedil;&Atilde;O</h3>
    <p style="margin:0 0 8px;font-size:12px;">Emiss&atilde;o do certificado condicionada ao cumprimento acad&ecirc;mico e quita&ccedil;&atilde;o financeira integral.</p>
    <h3 style="margin:12px 0 6px;font-size:13px;">CL&Aacute;USULA D&Eacute;CIMA TERCEIRA - DADOS PESSOAIS (LGPD)</h3>
    <p style="margin:0 0 8px;font-size:12px;">Tratamento de dados conforme LGPD; uso de imagem/voz/nome depende de termo espec&iacute;fico de autoriza&ccedil;&atilde;o, com possibilidade de revoga&ccedil;&atilde;o sem efeito retroativo sobre material j&aacute; publicado.</p>
    <h3 style="margin:12px 0 6px;font-size:13px;">CL&Aacute;USULA D&Eacute;CIMA QUARTA - COMUNICA&Ccedil;&Atilde;O</h3>
    <p style="margin:0 0 8px;font-size:12px;">Dever de atualiza&ccedil;&atilde;o cadastral e validade de comunica&ccedil;&otilde;es enviadas por canais institucionais.</p>
  </div>

  <div data-contract-page-break="true" style="page-break-after: always;"></div>

  <div style="max-width:794px;min-height:1123px;margin:0 auto;padding:24px 56px;box-sizing:border-box;background:#fff;">
    <h3 style="margin:0 0 8px;font-size:13px;">CL&Aacute;USULA D&Eacute;CIMA QUINTA - DOS IM&Oacute;VEIS, EQUIPAMENTOS E INFRAESTRUTURA DE TERCEIROS</h3>
    <p style="margin:0 0 8px;font-size:12px;">A CONTRATADA pode utilizar infraestrutura de terceiros, mantendo responsabilidade operacional e continuidade do servi&ccedil;o sem preju&iacute;zo acad&ecirc;mico.</p>
    <h3 style="margin:12px 0 6px;font-size:13px;">CL&Aacute;USULA D&Eacute;CIMA SEXTA - DANOS</h3>
    <p style="margin:0 0 8px;font-size:12px;">Danos causados pelo CONTRATANTE ao patrim&ocirc;nio da CONTRATADA e de terceiros devem ser ressarcidos.</p>
    <h3 style="margin:12px 0 6px;font-size:13px;">CL&Aacute;USULA D&Eacute;CIMA S&Eacute;TIMA - PROPRIEDADE INTELECTUAL</h3>
    <p style="margin:0 0 8px;font-size:12px;">Materiais, grava&ccedil;&otilde;es, plataformas e conte&uacute;dos s&atilde;o protegidos e n&atilde;o podem ser reproduzidos sem autoriza&ccedil;&atilde;o.</p>
    <h3 style="margin:12px 0 6px;font-size:13px;">CL&Aacute;USULA D&Eacute;CIMA OITAVA - CONCLUS&Atilde;O DO CURSO</h3>
    <p style="margin:0 0 8px;font-size:12px;">Extin&ccedil;&atilde;o do contrato ao final dos cr&eacute;ditos/m&oacute;dulos/cursos, observados os procedimentos acad&ecirc;micos finais.</p>
    <h3 style="margin:12px 0 6px;font-size:13px;">CL&Aacute;USULA D&Eacute;CIMA NONA - SOLU&Ccedil;&Atilde;O DE CONFLITOS</h3>
    <p style="margin:0 0 8px;font-size:12px;">Tentativa de solu&ccedil;&atilde;o consensual por media&ccedil;&atilde;o e possibilidade de arbitragem nos termos legais, com foro subsidi&aacute;rio em {{contrato_foro}} quando aplic&aacute;vel.</p>
    <h3 style="margin:12px 0 6px;font-size:13px;">CL&Aacute;USULA VIG&Eacute;SIMA - DO FORO</h3>
    <p style="margin:0 0 8px;font-size:12px;">Aplic&aacute;vel conforme regras da cl&aacute;usula de solu&ccedil;&atilde;o de conflitos.</p>
    <h3 style="margin:12px 0 6px;font-size:13px;">CL&Aacute;USULA VIG&Eacute;SIMA PRIMEIRA - DISPOSI&Ccedil;&Otilde;ES FINAIS</h3>
    <p style="margin:0 0 8px;font-size:12px;">Assinatura f&iacute;sica ou eletr&ocirc;nica com os mesmos efeitos legais.</p>

    <h3 style="margin:16px 0 8px;font-size:13px;text-align:center;">Assinaturas</h3>
    <p style="margin:0 0 20px;text-align:center;">{{contrato_cidade_assinatura}}, {{contrato_data_emissao_extenso}}.</p>
    <table style="width:100%;border-collapse:collapse;font-size:12px;"><tbody>
      <tr><td style="width:50%;padding:8px 12px 8px 0;vertical-align:top;"><div style="border-top:1px solid #111827;padding-top:6px;">CONTRATANTE<br />Nome: {{aluno_nome}}<br />CPF: {{aluno_cpf}}</div></td><td style="width:50%;padding:8px 0 8px 12px;vertical-align:top;"><div style="border-top:1px solid #111827;padding-top:6px;">CONTRATADA<br />{{contratada_nome}}<br />CNPJ: {{contratada_cnpj}}</div></td></tr>
      <tr><td style="padding:30px 12px 8px 0;vertical-align:top;"><div style="border-top:1px solid #111827;padding-top:6px;">TESTEMUNHA 1</div></td><td style="padding:30px 0 8px 12px;vertical-align:top;"><div style="border-top:1px solid #111827;padding-top:6px;">TESTEMUNHA 2</div></td></tr>
    </tbody></table>
    <p style="margin:16px 0 0;font-size:11px;color:#4b5563;">C&oacute;digo de assinatura eletr&ocirc;nica: <strong>{{codigo_assinatura}}</strong></p>
    <p style="margin:4px 0 0;font-size:11px;color:#4b5563;">Emitido em {{contrato_datahora_emissao}}.</p>
  </div>
</section>`;

export const IMAGE_AUTHORIZATION_TEMPLATE_HTML = `<section style="font-family:Arial,sans-serif;color:#111827;">
  <div style="max-width:794px;min-height:1123px;margin:0 auto;padding:24px 56px;box-sizing:border-box;background:#fff;">
    <p style="margin:0 0 14px;font-size:11px;color:#4b5563;text-align:center;">+55 (67) 99940-8110 | www.ipesk.com.br | contato@ipesk.com.br</p>
    <h2 style="margin:0 0 14px;font-size:16px;text-align:center;">TERMO DE AUTORIZA&Ccedil;&Atilde;O DE USO DE IMAGEM, VOZ E NOME</h2>
    <p style="margin:0 0 8px;"><strong>AUTORIZANTE (CONTRATANTE):</strong> {{aluno_nome}}</p>
    <p style="margin:0 0 8px;"><strong>CPF:</strong> {{aluno_cpf}}</p>
    <p style="margin:0 0 16px;"><strong>AUTORIZADA:</strong> {{contratada_nome}} - CNPJ {{contratada_cnpj}}.</p>
    <h3 style="margin:0 0 6px;font-size:13px;">1. OBJETO</h3>
    <p style="margin:0 0 8px;">Autoriza&ccedil;&atilde;o de uso de imagem, voz e nome em atividades acad&ecirc;micas, institucionais e eventos.</p>
    <h3 style="margin:0 0 6px;font-size:13px;">2. FINALIDADE</h3>
    <p style="margin:0 0 8px;">Uso para divulga&ccedil;&atilde;o institucional, materiais promocionais, redes sociais, conte&uacute;do educacional/cient&iacute;fico e comunica&ccedil;&atilde;o.</p>
    <h3 style="margin:0 0 6px;font-size:13px;">3. FORMA DE UTILIZA&Ccedil;&Atilde;O</h3>
    <p style="margin:0 0 8px;">Aplica-se a fotografias, v&iacute;deos, grava&ccedil;&otilde;es de aula, lives e materiais impressos/digitais.</p>
    <h3 style="margin:0 0 6px;font-size:13px;">4. GRATUIDADE</h3>
    <p style="margin:0 0 8px;">A autoriza&ccedil;&atilde;o &eacute; gratuita, sem remunera&ccedil;&atilde;o ou indeniza&ccedil;&atilde;o.</p>
    <h3 style="margin:0 0 6px;font-size:13px;">5. PRAZO</h3>
    <p style="margin:0 0 8px;">Prazo indeterminado.</p>
    <h3 style="margin:0 0 6px;font-size:13px;">6. REVOGA&Ccedil;&Atilde;O</h3>
    <p style="margin:0 0 8px;">Revoga&ccedil;&atilde;o por solicita&ccedil;&atilde;o formal escrita, sem afetar materiais j&aacute; produzidos/publicados.</p>
    <h3 style="margin:0 0 6px;font-size:13px;">7. PROTE&Ccedil;&Atilde;O DE DADOS</h3>
    <p style="margin:0 0 8px;">Tratamento de dados conforme LGPD.</p>
    <h3 style="margin:0 0 6px;font-size:13px;">8. DISPOSI&Ccedil;&Otilde;ES FINAIS</h3>
    <p style="margin:0 0 8px;">O AUTORIZANTE declara leitura e concord&acirc;ncia integral com este termo.</p>
    <p style="margin:16px 0 24px;text-align:center;">{{contrato_cidade_assinatura}}, {{contrato_data_emissao_extenso}}.</p>
    <table style="width:100%;border-collapse:collapse;font-size:12px;"><tbody>
      <tr><td style="width:50%;padding:8px 12px 8px 0;vertical-align:top;"><div style="border-top:1px solid #111827;padding-top:6px;">AUTORIZANTE<br />{{aluno_nome}}<br />CPF: {{aluno_cpf}}</div></td><td style="width:50%;padding:8px 0 8px 12px;vertical-align:top;"><div style="border-top:1px solid #111827;padding-top:6px;">AUTORIZADA<br />{{contratada_nome}}<br />CNPJ: {{contratada_cnpj}}</div></td></tr>
      <tr><td style="padding:30px 12px 8px 0;vertical-align:top;"><div style="border-top:1px solid #111827;padding-top:6px;">TESTEMUNHA 1</div></td><td style="padding:30px 0 8px 12px;vertical-align:top;"><div style="border-top:1px solid #111827;padding-top:6px;">TESTEMUNHA 2</div></td></tr>
    </tbody></table>
    <p style="margin:16px 0 0;font-size:11px;color:#4b5563;">C&oacute;digo de assinatura eletr&ocirc;nica: <strong>{{codigo_assinatura}}</strong></p>
    <p style="margin:4px 0 0;font-size:11px;color:#4b5563;">Emitido em {{contrato_datahora_emissao}}.</p>
  </div>
</section>`;

export const DEFAULT_CONTRACT_BASE_PRESET_ID = 'service_contract_2026';

export const CONTRACT_BASE_PRESETS: ContractBasePreset[] = [
  {
    id: DEFAULT_CONTRACT_BASE_PRESET_ID,
    label: 'Contrato de presta\u00e7\u00e3o',
    helperText: 'Modelo principal atualizado com as cl\u00e1usulas do novo contrato.',
    form: {
      name: 'Contrato de Presta\u00e7\u00e3o de Servi\u00e7os Educacionais',
      description: 'Modelo principal de matr\u00edcula e execu\u00e7\u00e3o acad\u00eamica.',
      draftTitle: 'Contrato de Presta\u00e7\u00e3o de Servi\u00e7os Educacionais',
      draftHtmlContent: SERVICE_CONTRACT_TEMPLATE_HTML,
    },
  },
  {
    id: 'image_voice_name_authorization_2026',
    label: 'Termo de imagem, voz e nome',
    helperText: 'Termo completo de autoriza\u00e7\u00e3o de uso de imagem, voz e nome.',
    form: {
      name: 'Termo de autoriza\u00e7\u00e3o de uso de imagem, voz e nome',
      description: 'Autoriza\u00e7\u00e3o LGPD para uso de imagem, voz e nome.',
      draftTitle: 'Termo de Autoriza\u00e7\u00e3o de Uso de Imagem, Voz e Nome',
      draftHtmlContent: IMAGE_AUTHORIZATION_TEMPLATE_HTML,
    },
  },
];
