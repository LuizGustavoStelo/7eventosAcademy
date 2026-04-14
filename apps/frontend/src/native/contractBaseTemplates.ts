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
    <p style="margin:0 0 14px;font-size:12px;">
      <strong>CONTRATADA:</strong> {{contratada_nome}} - CNPJ {{contratada_cnpj}}, com endere&ccedil;o em {{contratada_endereco}}.
    </p>
    <p style="margin:0 0 16px;font-size:12px;">
      <strong>CONTRATANTE:</strong> aluno(a) devidamente identificado(a) no formul&aacute;rio de matr&iacute;cula que integra este instrumento.
    </p>

    <h3 style="margin:0 0 8px;font-size:13px;">1. Identifica&ccedil;&atilde;o do(a) contratante</h3>
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

    <h3 style="margin:0 0 8px;font-size:13px;">2. Cl&aacute;usulas e condi&ccedil;&otilde;es</h3>
    <p style="margin:0 0 8px;"><strong>CL&Aacute;USULA PRIMEIRA - OBJETO:</strong> presta&ccedil;&atilde;o de servi&ccedil;os educacionais no curso <strong>{{curso_nome}}</strong>, turma <strong>{{turma_nome}}</strong>, conforme calend&aacute;rio acad&ecirc;mico.</p>
    <p style="margin:0 0 8px;"><strong>CL&Aacute;USULA SEGUNDA - PRESTA&Ccedil;&Atilde;O DOS SERVI&Ccedil;OS:</strong> a CONTRATADA assegura vaga e execu&ccedil;&atilde;o das atividades acad&ecirc;micas em conformidade com a legisla&ccedil;&atilde;o vigente.</p>
    <p style="margin:0 0 8px;"><strong>Par&aacute;grafo &uacute;nico:</strong> as aulas podem ocorrer de forma presencial, h&iacute;brida ou on-line, conforme planejamento acad&ecirc;mico.</p>
    <p style="margin:0 0 8px;"><strong>CL&Aacute;USULA TERCEIRA - ALTERA&Ccedil;&Otilde;ES ACAD&Ecirc;MICAS:</strong> a CONTRATADA poder&aacute; ajustar grade curricular, cronograma e metodologia, sem preju&iacute;zo acad&ecirc;mico, mantendo carga hor&aacute;ria total e sem custos adicionais n&atilde;o acordados.</p>
    <p style="margin:0 0 8px;"><strong>CL&Aacute;USULA QUARTA - SERVI&Ccedil;OS INCLU&Iacute;DOS E EXCLU&Iacute;DOS:</strong> este contrato cobre o curr&iacute;culo regular do curso. Servi&ccedil;os facultativos e demandas pessoais (declara&ccedil;&otilde;es, certid&otilde;es e similares) n&atilde;o est&atilde;o inclu&iacute;dos.</p>
    <p style="margin:0 0 8px;"><strong>CL&Aacute;USULA QUINTA - CANCELAMENTO DE TURMA:</strong> em caso de cancelamento/adiamento por motivo justific&aacute;vel, o CONTRATANTE poder&aacute; optar por transfer&ecirc;ncia para curso equivalente ou restitui&ccedil;&atilde;o integral em at&eacute; 30 dias.</p>
  </div>

  <div data-contract-page-break="true" style="page-break-after: always;"></div>

  <div style="max-width:794px;min-height:1123px;margin:0 auto;padding:24px 56px;box-sizing:border-box;background:#fff;">
    <h3 style="margin:0 0 8px;font-size:13px;">3. Valores e pagamento</h3>
    <p style="margin:0 0 8px;">Matr&iacute;cula vinculada ao ID <strong>{{matricula_id}}</strong>.</p>
    <table style="width:100%;border-collapse:collapse;font-size:12px;margin:0 0 10px;"><tbody>
      <tr><td style="border:1px solid #d1d5db;padding:6px;"><strong>Forma de pagamento</strong><br />{{financeiro_forma_pagamento}}</td><td style="border:1px solid #d1d5db;padding:6px;"><strong>Valor total</strong><br />{{financeiro_valor_total}}</td></tr>
      <tr><td style="border:1px solid #d1d5db;padding:6px;"><strong>Taxa de matr&iacute;cula</strong><br />{{financeiro_taxa_matricula}}</td><td style="border:1px solid #d1d5db;padding:6px;"><strong>Valor da parcela</strong><br />{{financeiro_valor_parcela}}</td></tr>
      <tr><td colspan="2" style="border:1px solid #d1d5db;padding:6px;"><strong>Resumo de formas e valores</strong><br />{{financeiro_formas_valores_resumo}}</td></tr>
    </tbody></table>
    <div style="margin:0 0 10px;">{{{financeiro_parcelas_tabela_html}}}</div>

    <p style="margin:0 0 8px;"><strong>CL&Aacute;USULA SEXTA - CONDI&Ccedil;&Otilde;ES FINANCEIRAS:</strong> o CONTRATANTE declara ci&ecirc;ncia do valor total, n&uacute;mero de parcelas, vencimentos e condi&ccedil;&otilde;es comerciais pactuadas.</p>
    <p style="margin:0 0 8px;"><strong>&sect; 1&ordm;:</strong> na modalidade modular, a renova&ccedil;&atilde;o autom&aacute;tica da matr&iacute;cula a cada 3 m&oacute;dulos exige adimpl&ecirc;ncia e cumprimento acad&ecirc;mico.</p>
    <ul style="margin:0 0 10px 18px;padding:0;font-size:12px;">
      <li style="margin:0 0 4px;">assinatura do contrato origin&aacute;rio e documenta&ccedil;&atilde;o completa;</li>
      <li style="margin:0 0 4px;">adimpl&ecirc;ncia at&eacute; o m&ecirc;s anterior &agrave; renova&ccedil;&atilde;o;</li>
      <li style="margin:0 0 4px;">pend&ecirc;ncias exigem libera&ccedil;&atilde;o do departamento financeiro;</li>
      <li style="margin:0 0 4px;">m&oacute;dulos seguintes dependem do cumprimento pedag&oacute;gico e financeiro do m&oacute;dulo anterior.</li>
    </ul>
    <p style="margin:0 0 8px;"><strong>&sect; 2&ordm;:</strong> pagamentos devem ocorrer na data pactuada. O n&atilde;o recebimento de boleto n&atilde;o isenta pagamento.</p>
    <p style="margin:0 0 8px;"><strong>CL&Aacute;USULA S&Eacute;TIMA - MORA E INADIMPLEMENTO:</strong> incid&ecirc;ncia de multa de 2% e juros de 1% ao m&ecirc;s pro rata die, sem preju&iacute;zo de cobran&ccedil;a administrativa/judicial nos termos legais.</p>
    <p style="margin:0 0 8px;"><strong>CL&Aacute;USULA OITAVA - REAJUSTE:</strong> os valores poder&atilde;o ser reajustados anualmente por &iacute;ndice oficial admitido em lei.</p>
    <p style="margin:0 0 8px;"><strong>CL&Aacute;USULA NONA - RESPONSABILIDADE POR BENS:</strong> a CONTRATADA n&atilde;o responde por extravio/dano de bens pessoais ou ve&iacute;culos, salvo culpa comprovada.</p>
    <p style="margin:0 0 8px;"><strong>CL&Aacute;USULA D&Eacute;CIMA - RESCIS&Atilde;O:</strong> o pedido de rescis&atilde;o pelo CONTRATANTE deve ser formalizado por escrito com anteced&ecirc;ncia m&iacute;nima de 30 dias.</p>
  </div>

  <div data-contract-page-break="true" style="page-break-after: always;"></div>

  <div style="max-width:794px;min-height:1123px;margin:0 auto;padding:24px 56px;box-sizing:border-box;background:#fff;">
    <h3 style="margin:0 0 8px;font-size:13px;">4. Cl&aacute;usulas complementares e assinatura</h3>
    <p style="margin:0 0 8px;"><strong>CL&Aacute;USULA D&Eacute;CIMA PRIMEIRA - FREQU&Ecirc;NCIA E APROVA&Ccedil;&Atilde;O:</strong> o aluno deve cumprir carga hor&aacute;ria m&iacute;nima e requisitos de aproveitamento acad&ecirc;mico para certifica&ccedil;&atilde;o.</p>
    <p style="margin:0 0 8px;"><strong>CL&Aacute;USULA D&Eacute;CIMA SEGUNDA - CERTIFICA&Ccedil;&Atilde;O:</strong> a emiss&atilde;o do certificado depende do cumprimento acad&ecirc;mico e da quita&ccedil;&atilde;o integral das obriga&ccedil;&otilde;es financeiras.</p>
    <p style="margin:0 0 8px;"><strong>CL&Aacute;USULA D&Eacute;CIMA TERCEIRA - DADOS PESSOAIS (LGPD):</strong> o tratamento de dados observar&aacute; a legisla&ccedil;&atilde;o vigente.</p>
    <p style="margin:0 0 8px;"><strong>&sect; 1&ordm;:</strong> a CONTRATADA atua como controladora para finalidades educacionais e administrativas.</p>
    <p style="margin:0 0 8px;"><strong>&sect; 2&ordm;:</strong> o uso de imagem, voz e nome depende de autoriza&ccedil;&atilde;o expressa em termo pr&oacute;prio.</p>
    <p style="margin:0 0 8px;"><strong>&sect; 3&ordm;:</strong> o termo de autoriza&ccedil;&atilde;o pode ser revogado a qualquer tempo, respeitados materiais j&aacute; produzidos/publicados.</p>
    <p style="margin:0 0 8px;"><strong>CL&Aacute;USULA D&Eacute;CIMA QUARTA - COMUNICA&Ccedil;&Atilde;O:</strong> o CONTRATANTE deve manter dados cadastrais atualizados.</p>
    <p style="margin:0 0 8px;"><strong>CL&Aacute;USULA D&Eacute;CIMA QUINTA - INFRAESTRUTURA DE TERCEIROS:</strong> a CONTRATADA pode utilizar estruturas e plataformas de terceiros para garantir execu&ccedil;&atilde;o do curso.</p>
    <p style="margin:0 0 8px;"><strong>CL&Aacute;USULA D&Eacute;CIMA SEXTA - DANOS:</strong> danos causados pelo CONTRATANTE ao patrim&ocirc;nio da CONTRATADA ou de terceiros devem ser ressarcidos.</p>
    <p style="margin:0 0 8px;"><strong>CL&Aacute;USULA D&Eacute;CIMA S&Eacute;TIMA - PROPRIEDADE INTELECTUAL:</strong> materiais did&aacute;ticos e conte&uacute;dos n&atilde;o podem ser reproduzidos sem autoriza&ccedil;&atilde;o.</p>
    <p style="margin:0 0 8px;"><strong>CL&Aacute;USULA D&Eacute;CIMA OITAVA - CONCLUS&Atilde;O:</strong> o contrato extingue-se ao final dos cr&eacute;ditos/m&oacute;dulos, observadas as exig&ecirc;ncias institucionais.</p>
    <p style="margin:0 0 8px;"><strong>CL&Aacute;USULA D&Eacute;CIMA NONA - SOLU&Ccedil;&Atilde;O DE CONFLITOS:</strong> prioriza-se solu&ccedil;&atilde;o consensual; havendo arbitragem, aplicar-se-&aacute; a legisla&ccedil;&atilde;o pertinente.</p>
    <p style="margin:0 0 8px;"><strong>CL&Aacute;USULA VIG&Eacute;SIMA - FORO:</strong> fica eleito o foro de <strong>{{contrato_foro}}</strong>, observado o disposto na cl&aacute;usula de solu&ccedil;&atilde;o de conflitos.</p>
    <p style="margin:0 0 8px;"><strong>CL&Aacute;USULA VIG&Eacute;SIMA PRIMEIRA - DISPOSI&Ccedil;&Otilde;ES FINAIS:</strong> assinatura f&iacute;sica ou eletr&ocirc;nica possui a mesma efic&aacute;cia jur&iacute;dica.</p>

    <h3 style="margin:16px 0 8px;font-size:13px;text-align:center;">Assinaturas</h3>
    <p style="margin:0 0 20px;text-align:center;">{{contrato_cidade_assinatura}}, {{contrato_data_emissao_extenso}}.</p>
    <table style="width:100%;border-collapse:collapse;font-size:12px;"><tbody>
      <tr>
        <td style="width:50%;padding:8px 12px 8px 0;vertical-align:top;">
          <div style="border-top:1px solid #111827;padding-top:6px;">CONTRATANTE<br />Nome: {{aluno_nome}}<br />CPF: {{aluno_cpf}}</div>
        </td>
        <td style="width:50%;padding:8px 0 8px 12px;vertical-align:top;">
          <div style="border-top:1px solid #111827;padding-top:6px;">CONTRATADA<br />{{contratada_nome}}<br />CNPJ: {{contratada_cnpj}}</div>
        </td>
      </tr>
    </tbody></table>
    <p style="margin:16px 0 0;font-size:11px;color:#4b5563;">C&oacute;digo de assinatura eletr&ocirc;nica: <strong>{{codigo_assinatura}}</strong></p>
  </div>
</section>`;

export const IMAGE_AUTHORIZATION_TEMPLATE_HTML = `<section style="font-family:Arial,sans-serif;color:#111827;">
  <div style="max-width:794px;min-height:1123px;margin:0 auto;padding:24px 56px;box-sizing:border-box;background:#fff;">
    <p style="margin:0 0 14px;font-size:11px;color:#4b5563;text-align:center;">+55 (67) 99940-8110 | www.ipesk.com.br | contato@ipesk.com.br</p>
    <h2 style="margin:0 0 14px;font-size:16px;text-align:center;">TERMO DE AUTORIZA&Ccedil;&Atilde;O DE USO DE IMAGEM, VOZ E NOME</h2>

    <p style="margin:0 0 8px;"><strong>AUTORIZANTE (CONTRATANTE):</strong> {{aluno_nome}}</p>
    <p style="margin:0 0 8px;"><strong>CPF:</strong> {{aluno_cpf}}</p>
    <p style="margin:0 0 16px;"><strong>AUTORIZADA:</strong> {{contratada_nome}} - CNPJ {{contratada_cnpj}}.</p>

    <h3 style="margin:0 0 6px;font-size:13px;">1. Objeto</h3>
    <p style="margin:0 0 8px;">Autoriza&ccedil;&atilde;o para uso de imagem, voz e nome do AUTORIZANTE, captados em atividades acad&ecirc;micas, institucionais ou eventos promovidos pela AUTORIZADA.</p>

    <h3 style="margin:0 0 6px;font-size:13px;">2. Finalidade</h3>
    <p style="margin:0 0 6px;">A autoriza&ccedil;&atilde;o &eacute; livre, informada e inequ&iacute;voca para:</p>
    <ul style="margin:0 0 10px 18px;padding:0;font-size:12px;">
      <li style="margin:0 0 4px;">divulga&ccedil;&atilde;o institucional;</li>
      <li style="margin:0 0 4px;">materiais publicit&aacute;rios e promocionais;</li>
      <li style="margin:0 0 4px;">redes sociais e plataformas digitais;</li>
      <li style="margin:0 0 4px;">conte&uacute;dos educacionais e cient&iacute;ficos;</li>
      <li style="margin:0 0 4px;">campanhas de marketing e comunica&ccedil;&atilde;o.</li>
    </ul>

    <h3 style="margin:0 0 6px;font-size:13px;">3. Forma de utiliza&ccedil;&atilde;o</h3>
    <p style="margin:0 0 6px;">A utiliza&ccedil;&atilde;o poder&aacute; ocorrer em quaisquer meios de comunica&ccedil;&atilde;o, incluindo:</p>
    <ul style="margin:0 0 10px 18px;padding:0;font-size:12px;">
      <li style="margin:0 0 4px;">fotografias;</li>
      <li style="margin:0 0 4px;">v&iacute;deos;</li>
      <li style="margin:0 0 4px;">grava&ccedil;&otilde;es de aulas;</li>
      <li style="margin:0 0 4px;">transmiss&otilde;es ao vivo (lives);</li>
      <li style="margin:0 0 4px;">materiais impressos e digitais.</li>
    </ul>

    <h3 style="margin:0 0 6px;font-size:13px;">4. Gratuidade</h3>
    <p style="margin:0 0 8px;">A autoriza&ccedil;&atilde;o &eacute; concedida de forma gratuita, sem direito a remunera&ccedil;&atilde;o ou indeniza&ccedil;&atilde;o.</p>

    <h3 style="margin:0 0 6px;font-size:13px;">5. Prazo</h3>
    <p style="margin:0 0 8px;">A autoriza&ccedil;&atilde;o &eacute; concedida por prazo indeterminado.</p>

    <h3 style="margin:0 0 6px;font-size:13px;">6. Revoga&ccedil;&atilde;o</h3>
    <p style="margin:0 0 8px;">O AUTORIZANTE poder&aacute; revogar este termo a qualquer momento, por solicita&ccedil;&atilde;o formal escrita, sem efeito retroativo para materiais j&aacute; produzidos/publicados.</p>

    <h3 style="margin:0 0 6px;font-size:13px;">7. Prote&ccedil;&atilde;o de dados</h3>
    <p style="margin:0 0 8px;">O tratamento de dados observar&aacute; a LGPD e demais normas aplic&aacute;veis, cabendo &agrave; AUTORIZADA a guarda e uso adequado das informa&ccedil;&otilde;es.</p>

    <h3 style="margin:0 0 6px;font-size:13px;">8. Disposi&ccedil;&otilde;es finais</h3>
    <p style="margin:0 0 8px;">O AUTORIZANTE declara que leu e compreendeu integralmente este termo, concordando com suas condi&ccedil;&otilde;es.</p>

    <p style="margin:16px 0 24px;text-align:center;">{{contrato_cidade_assinatura}}, {{contrato_data_emissao_extenso}}.</p>
    <table style="width:100%;border-collapse:collapse;font-size:12px;"><tbody>
      <tr>
        <td style="width:50%;padding:8px 12px 8px 0;vertical-align:top;">
          <div style="border-top:1px solid #111827;padding-top:6px;">AUTORIZANTE<br />{{aluno_nome}}<br />CPF: {{aluno_cpf}}</div>
        </td>
        <td style="width:50%;padding:8px 0 8px 12px;vertical-align:top;">
          <div style="border-top:1px solid #111827;padding-top:6px;">AUTORIZADA<br />{{contratada_nome}}<br />CNPJ: {{contratada_cnpj}}</div>
        </td>
      </tr>
    </tbody></table>

    <p style="margin:16px 0 0;font-size:11px;color:#4b5563;">C&oacute;digo de assinatura eletr&ocirc;nica: <strong>{{codigo_assinatura}}</strong></p>
  </div>
</section>`;

export const DEFAULT_CONTRACT_BASE_PRESET_ID = 'service_contract_2026';

export const CONTRACT_BASE_PRESETS: ContractBasePreset[] = [
  {
    id: DEFAULT_CONTRACT_BASE_PRESET_ID,
    label: 'Contrato de prestação',
    helperText: 'Modelo principal atualizado para serviços educacionais.',
    form: {
      name: 'Contrato de Prestação de Serviços Educacionais',
      description: 'Modelo principal de matrícula e execução acadêmica.',
      draftTitle: 'Contrato de Prestação de Serviços Educacionais',
      draftHtmlContent: SERVICE_CONTRACT_TEMPLATE_HTML,
    },
  },
  {
    id: 'image_voice_name_authorization_2026',
    label: 'Termo de imagem, voz e nome',
    helperText: 'Autorização específica de uso de imagem, voz e nome.',
    form: {
      name: 'Termo de autorização de uso de imagem, voz e nome',
      description: 'Autorização LGPD para uso de imagem, voz e nome.',
      draftTitle: 'Termo de Autorização de Uso de Imagem, Voz e Nome',
      draftHtmlContent: IMAGE_AUTHORIZATION_TEMPLATE_HTML,
    },
  },
];
