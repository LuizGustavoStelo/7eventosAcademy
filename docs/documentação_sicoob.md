Menu
API de Cobrança Bancária V3

Visão Geral

Para aprimorar nossos serviços, atualizamos a API de Cobrança Bancária para a versão 3. As principais diferenças entre as versões 2 e 3 podem ser consultadas em: Novidades e Atualizações. Recomendamos que os cooperados criem novos aplicativos para utilizar a versão atualizada.

Esta API disponibiliza serviços para recebimento de valores referentes às vendas de produtos e serviços da sua empresa, por meio de boletos de cobrança, pagos em toda a rede bancária. Possui funcionalidades que auxiliam na gestão da carteira registrada, tornando viável todo o processo de acompanhamento, desde a inclusão de novos boletos, alteração de informações relevantes, protesto/negativação de títulos vencidos e não pagos, até a liquidação ou baixa do título.

Funcionalidades

Gerenciamento de Boletos
Alteração de informações de pagadores de boletos
Negativação de pagadores
Protesto de boletos
Movimentação

Especificação da API

Acesse a documentação técnica com todas as informações, clicando aqui.

Confira abaixo um vídeo tutorial de como você pode configurar as requisições no Postman. Você também pode fazer o download da nossa coleção da API de Cobrança Bancária V3 para o Postman.



 Faça download da coleção API Cobrança Bancária V3 para o Postman



Informações Importantes

Webhook

Sempre que o Sicoob recebe a confirmação da baixa operacional de um boleto, o sistema integrado envia automaticamente uma notificação para uma URL configurada, eliminando a necessidade de consultas frequentes para verificar a situação da movimentação de um boleto.

POST /Cadastrar Webhook

Realiza o cadastro de uma URL para receber as notificações automáticas das movimentações. Para isso, é necessário informar o código do movimento, o código do período do movimento e o e-mail. Um idWebhook é gerado para consulta do webhook cadastrado.

Além da mensagem de notificação pagamento (baixa operacional), o sistema também envia uma notificação de validação da URL do webhook sempre que ocorre:

O cadastro de um novo webhook

A alteração da URL do webhook

A reativação de um webhook

Exemplo JSON da notificação de validação da URL do webhook:

{ "idWebhook": 990,
"validacaoWebhook": true }

url
Deve ser https.

Porta:
443

codigoTipoMovimento 7 – Pagamento (baixa operacional)

codigoPeriodoMovimento 1 – Movimento Atual (D0)

idWebhook Identificador único do webhook.

validacaoWebhook Indica se a notificação é uma validação da URL do webhook

GET /Consultar Webhooks Cadastrados

Consulta realizada a partir do idWebhook e codigoTipoMovimento, mostrando informações detalhadas sobre o webhook cadastrado.

GET /Consultar Solicitações de um Webhook

Consulta as solicitações de notificação para um webhook com base na data da solicitação informada.

É necessário informar a dataSolicitacao, pagina e o codigoSolicitacaoSituacao.

codigoSolicitacaoSituacao

3 – Enviado com sucesso
6 – Erro no envio

Observação:
A baixa operacional não se refere à liquidação final, mas sim do registro da intenção de pagamento realizada.

Como o Sicoob avalia os critérios para garantir a aprovação do webhook

Durante o cadastro da URL de webhook para recebimento das notificações da API de Cobrança Bancária via Open Banking, o sistema realiza uma validação automatizada da URL fornecida.

Importante:
Em todas as verificações, tanto no cadastro quanto no envio das notificações, a URL só será aceita se o servidor responder com um dos seguintes códigos de status HTTP:

200 OK
201 Created
204 No Content

Respostas com outros códigos, como 202 Accepted ou 302 Found (redirecionamento), resultam em
falha na validação
do webhook.

Recomendação:
Certifique-se de que a URL cadastrada responda diretamente com um status HTTP 200, 201 ou 204 no momento da validação inicial.
Evite redirecionamentos ou respostas assíncronas para garantir o sucesso no cadastro do webhook.

Exemplo de webhook recebido:

{
"idWebhook": 214,
"tipoMovimento": 7,
"dados": {
"numeroIdentificadorBaixa": "2024102000741150823",
"codigoBarrasBoleto": "75692868200000405001434201006355000002443003",
"codigoBarrasBaixa": "75692868200000405001434201006355000002443003",
"nossoNumero": "0000002443",
"seuNumero": "00-03",
"codigoBancoRecebedor": "756",
"codigoAgenciaRecebedora": 3069,
"numeroCliente": 63550,
"cpfCnpjBeneficiario": "00500754977",
"codigoTipoPessoaPagador": "F",
"nomePagador": "Amanda",
"cpfCnpjPagador": "09992004959",
"nomeFantasiaPagador": "Amanda",
"codigoTipoPessoaPortador": "F",
"nomePortador": "João",
"cpfCnpjPortador": "09197004979",
"valorBoleto": 405,
"valorPagamento": 407.41,
"codigoCanalPagamento": 3,
"codigoMotivoCancelamento": 2,
"dataEmissao": "2021-04-19",
"dataVencimento": "2021-07-15",
"dataLimitePagamento": "2022-01-10",
"dataHoraSituacaoBaixa": "2021-07-22T13:45:33.000Z",
"baixaRealizadaEmContigencia": false,
"cancelamentoBaixa": false }
}

Atenção nas datas e horários:

Todos os campos de data e hora retornados pela API seguem o padrão UTC (Tempo Universal Coordenado), indicado pela letra "Z" ao final do valor (exemplo: 2025-06-06T00:15:00Z).

Caso o seu sistema utilize o horário oficial de Brasília (UTC-3) ou outro fuso horário, é necessário realizar a conversão de fuso horário ao processar essas informações, para que as datas refletidas nas análises e conciliações estejam de acordo com o horário local.

Movimentações

A funcionalidade de movimentações permite que o beneficiário acompanhe os eventos ocorridos na carteira de cobrança registrada, como liquidações, baixas, alterações e demais ocorrências relacionadas aos boletos emitidos.

Por meio dessa funcionalidade, é possível solicitar a geração dos arquivos de movimentação (JSON) para um determinado período, acompanhar o status da solicitação e, ao final, realizar o download do(s) arquivo(s) gerado(s). Esses arquivos contêm os registros consolidados das movimentações da carteira e são fundamentais para conciliação e controle financeiro.

Abaixo, estão descritas as principais movimentações disponíveis no arquivo gerado

Entrada (ENTR)

Refere-se ao registro de novos boletos no sistema de cobrança. Essa movimentação corresponde à sigla ENTR e contém os dados completos do boleto, como identificação, valor, vencimento e código de barras. Representa o início do ciclo de vida do título.

Prorrogação (PROR)

Utilizado quando o cedente solicita a alteração da data de vencimento de um boleto. A movimentação de sigla PROR inclui a nova data de vencimento e a anterior, permitindo o controle histórico da alteração.

A Vencer (AVENC)

Lista boletos já registrados cuja data de vencimento ainda não foi atingida. Representada pela sigla AVENC, essa movimentação auxilia na conciliação e controle de contas a receber antes do vencimento.

Vencido (VENC)

Inclui boletos com data de vencimento ultrapassada e ainda não pagos. Essa movimentação, identificada pela sigla VENC, apresenta os valores atualizados com encargos por atraso, como juros, multa e correção, se aplicáveis.

Liquidação (LIQUI)

Indica que o boleto foi efetivamente pago. A movimentação de sigla LIQUI informa a data de pagamento, o valor recebido, a forma de liquidação (Pix, caixa, compensação etc.), além de descontos ou tarifas aplicadas.

Baixa (BAIX)

Refere-se ao encerramento do boleto sem pagamento, seja por solicitação do cedente, prazo expirado ou outro motivo. A movimentação BAIX informa a data e o motivo da baixa do título.

Operação de Crédito (OCRED)

Representa a antecipação de valores por parte da cooperativa com base em boletos emitidos, antes da liquidação. Essa movimentação é identificada pela sigla OCRED e pode trazer no campo tipoCarteiraOpCredito a indicação do tipo de operação de crédito realizada na carteira, conforme determinada parametrização.

Importante:

As consultas estão limitadas a qualquer período de 2 dias dentro de 1 ano corrido até a data da solicitação.
Após a solicitação da movimentação, os arquivos gerados ficam disponíveis por 30 dias para download.

Rate Limit API Cobrança Bancária:

Endpoints de Movimentações (Solicitar, Consultar e Download).
10 por segundo

GET Consultar boleto.
20 por segundo

GET Pagadores, Emissão de segunda via, Baixa de boleto e Consulta de faixas de nosso número disponíveis.
10 por segundo

POST Incluir Boletos.
5 por segundo

PATCH Alterar dados de um boleto.
5 por segundo

Demais endpoints.
20 por segundo

Propriedades Opcionais

A API Cobrança Bancária V3 não permite o envio de requisições com propriedades opcionais com valores vazios ou nulos, caso o integrador opte por não utilizar alguma propriedade que seja opcional, a propriedade deve ser ignorada no envio das requisições, caso contrario, a API poderá devolver um erro negocial (erros http da ordem 400).

Atenção para o Campo "numeroContratoCobranca"

O campo "numeroContratoCobranca" não é necessário no corpo da requisição para o cadastro de um boleto.

Observação:
Caso este campo seja preenchido incorretamente, a API retornará o erro:
"Número do contrato de cobrança inválido".

Este campo representa o número do contrato secundário de cobrança do cooperado com a cooperativa. Ele corresponde ao código do cliente no portal de atendimentos da cooperativa. No entanto, seu uso não é necessário para a realizar a integração. O campo só deve ser preenchido em casos muito específicos, quando houver uma orientação expressa para utilizá-lo.

Lista de escopos da API Cobrança Bancária V3

boletos_inclusao

boletos_consulta

boletos_alteracao

webhooks_alteracao

webhooks_consulta

webhooks_inclusao

TERMOS DE USO
AVISO DE PRIVACIDADE E TRATAMENTO DE DADOS
CONTATO/SUPORTE
Fale com a Alice

Catálogo de APIs
Documentação
Empresas parceiras
Sandbox
Meus aplicativos
Sair
KL
FAQ
APIs do Sicoob
Códigos de resposta HTTP
Suporte
APIs
Cobrança Bancária V3
Cobrança Bancária Pagamentos
Conta Corrente
Convênios Pagamentos
Investimentos - RDC
Open Finance - Iniciação de Pagamento
Pix Pagamentos
Poupança
Pix Recebimentos
SPB Transferências
Segurança
Novidades e Atualizações
Dificuldades frequentes
Sandbox
Pix no TEF
API Cobrança Bancária Pagamentos

Visão Geral

A API disponibiliza serviços para o pagamento de boletos (incluindo VLB superior), consulta de pagamentos e comprovantes e cancelamento de agendamentos, proporcionando uma gestão ágil e eficiente da carteira de cobrança.

Rate Limit API Cobrança Bancária Pagamentos: 2 por segundo.

Funcionalidades

Pagamentos de boletos

Consulta para pagamentos de boletos

Alteração para pagamentos de boletos

Especificação da API

Acesse a documentação técnica com todas as informações, clicando aqui.

Confira abaixo um vídeo tutorial de como você pode configurar as requisições no Postman. Você também pode fazer o download da nossa coleção da API Cobrança Bancária Pagamentos para o Postman.

Passo a passo para Consulta Boleto (GET)



 Faça download da coleção API Cobrança Bancária Pagamentos

Lista de escopos da API

pagamentos_alteracao: Escopo de alteração para pagamentos de boletos

pagamentos_consulta: Escopo de consulta para pagamentos de boletos

pagamentos_inclusao: Escopo de inclusão para pagamentos de boletos



Identificação de Erros de Negócio

Códigos e Mensagens

10000
Não foi possível obter o retorno da consulta à Núclea: [motivo da rejeição].

10001
Não foi possível obter os dados na base: [motivo da rejeição].

10002
A data de pagamento deve ser dia útil.

10003
Pagamento não permitido - Boleto divergente do encontrado na base centralizada, o pagador deverá verificar com seu beneficiário novas condições para pagamento.

10004
Erro interno.

10005
PROCESSO DE CONSULTA À BASE CENTRALIZADA DA CIP ESTÁ EM CONTINGÊNCIA. Valor máximo permitido para recebimento em contingência é R$ 5.000,00.

10006
PROCESSO DE CONSULTA À BASE CENTRALIZADA DA CIP ESTÁ EM CONTINGÊNCIA. Não é possível agendar títulos de instituição financeiras não bancárias (banco 988). Tente novamente mais tarde.

10007
PROCESSO DE CONSULTA À BASE CENTRALIZADA DA CIP ESTÁ EM CONTINGÊNCIA. Não é possível agendar títulos em moeda estrangeira. Tente novamente mais tarde.

10008
PROCESSO DE CONSULTA À BASE CENTRALIZADA DA CIP ESTÁ EM CONTINGÊNCIA. Não é possível agendar pagamento de títulos vencidos. Tente novamente mais tarde.

10009
Não foi possível realizar a consulta do boleto na base centralizada. Tente novamente.

10010
Cliente [número do cliente] não está ativo para pagamento (conta: [número da conta], cooperativa: [número da cooperativa]).

10011
Não é permitido realizar agendamento neste canal.

10012
Pagamento bloqueado - processo de consolidação de provisionamento não finalizado.

10013
Saldo insuficiente para o lançamento.

10014
Boleto já recebido nesta data.

10015
O boleto não poderá ser recebido, pois encontra-se liquidado em [data da liquidação]. O pagador deverá verificar com seu beneficiário novas condições para pagamento.

10016
O boleto não poderá ser recebido, pois encontra-se baixado em [data da baixa]. O pagador deverá verificar com seu beneficiário novas condições para pagamento.

10017
Boleto possui bloqueio de pagamento: [mensagem].

10018
Pagamento não permitido - O valor do boleto é menor que o mínimo permitido ([valor mínimo]).

10019
Pagamento não permitido - O valor do boleto é maior que o máximo permitido ([valor máximo]).

10020
O boleto não poderá ser recebido, pois encontra-se com instrução de protesto em [data do protesto]. O pagador deverá verificar com seu beneficiário novas condições para pagamento.

10021
O boleto não poderá ser recebido, pois encontra-se com instrução de protesto. O pagador deverá verificar com seu beneficiário novas condições para pagamento.

10022
Não foi possível obter os dados na base: [motivo da rejeição].

10023
O valor do boleto foi alterado. Valor na data do agendamento: [valor original]. Valor na data de pagamento: [valor alterado].

10024
Não foi possível efetuar lançamento: [motivo da rejeição].

10025
Não foi possível excluir lançamento: [motivo da rejeição].

10026
Não foi possível excluir lançamento: [motivo da rejeição].

10027
Não foi possível efetuar lançamento: [motivo da rejeição].

10028
Não foi possível efetuar lançamento: [motivo da rejeição].

10029
Não foi possível efetuar lançamento: [motivo da rejeição].

10030
Não foi possível efetuar lançamento: [motivo da rejeição].

10031
Não foi possível efetuar estorno: [motivo da rejeição].

10032
Pagamento não autorizado - Valor divergente ao informado pelo beneficiário, o pagador deverá verificar com o beneficiário novas condições de pagamento.

10033
A soma do valor de pagamento está incorreta. O valor deve ser [valor nominal calculado com descontos e encargos].

10034
O valor de pagamento deve ser maior que zero.

10035
A data de pagamento deve ser maior ou igual a data atual.

10036
Horário limite ultrapassado para pagamento no dia.

TERMOS DE USO
-
AVISO DE PRIVACIDADE E TRATAMENTO DE DADOS
-
CONTATO/SUPORTE
Fale com a Alice

Catálogo de APIs
Documentação
Empresas parceiras
Sandbox
Meus aplicativos
Sair
KL
FAQ
APIs do Sicoob
Códigos de resposta HTTP
Suporte
APIs
Cobrança Bancária V3
Cobrança Bancária Pagamentos
Conta Corrente
Convênios Pagamentos
Investimentos - RDC
Open Finance - Iniciação de Pagamento
Pix Pagamentos
Poupança
Pix Recebimentos
SPB Transferências
Segurança
Novidades e Atualizações
Dificuldades frequentes
Sandbox
Pix no TEF
API Conta-Corrente

Visão Geral

A API de Conta Corrente permite o acesso aos dados da conta-corrente do cooperado como Saldo, Extrato e a funcionalidade de transferência entre contas. Essas funcionalidades auxiliam na gestão e no processo de acompanhamento dos dados.

Rate Limit API Conta Corrente: 2 por segundo.

Funcionalidades

Consulta de Extrato;
Consulta de Saldo;
Transferência entre contas.

Especificação da API

Acesse a documentação técnica com todas as informações, clicando aqui.

Confira abaixo um vídeo tutorial de como você pode configurar as requisições no Postman. Você também pode fazer o download da nossa coleção da API de Conta-Corrente para o Postman.

Passo a passo para a Transferência entre contas (POST)


 Faça download da coleção API Conta-Corrente para o Postman





Lista de escopos da API

cco_consulta

cco_transferencias

openid




TERMOS DE USO
-
AVISO DE PRIVACIDADE E TRATAMENTO DE DADOS
-
CONTATO/SUPORTE
Fale com a Alice

Catálogo de APIs
Documentação
Empresas parceiras
Sandbox
Meus aplicativos
Sair
KL
FAQ
APIs do Sicoob
Códigos de resposta HTTP
Suporte
APIs
Cobrança Bancária V3
Cobrança Bancária Pagamentos
Conta Corrente
Convênios Pagamentos
Investimentos - RDC
Open Finance - Iniciação de Pagamento
Pix Pagamentos
Poupança
Pix Recebimentos
SPB Transferências
Segurança
Novidades e Atualizações
Dificuldades frequentes
Sandbox
Pix no TEF
API Pix Pagamentos

Visão Geral

A API de Pix Pagamentos proporciona diversos serviços relacionados ao sistema de pagamento instantâneo Pix. Esses serviços incluem a consulta de pagamentos Pix, a realização de pagamentos Pix, a configuração do Webhook Pix para receber notificações, a exibição de informações sobre o Webhook Pix e a possibilidade de cancelar o Webhook Pix. Essa API permite que desenvolvedores integrem funcionalidades do Pix em seus aplicativos, facilitando a interação e gestão de transações financeiras instantâneas.

Rate Limit API Pagamentos Pix: 1 por segundo.

Funcionalidades

Consulta de pagamentos Pix;
Iniciação e efetivação de pagamentos Pix;
Webhook.

Especificação da API

Acesse a documentação técnica com todas as informações, clicando aqui.

Confira abaixo um vídeo tutorial de como você pode configurar as requisições no Postman. Você também pode fazer o download da nossa coleção da API de Pix Pagamentos para o Postman.

Passo a passo para Recuperar Pagamento (GET)



 Faça download da coleção API Pix Pagamentos

Informações Importantes

Webhook

A API Pix Pagamentos permite a configuração de um Webhook para envio automático de notificações sempre que um pagamento Pix for realizado com sucesso.

Assim como na API Pix Recebimentos, é necessário cadastrar previamente a URL do Webhook para que os eventos sejam entregues corretamente. O endpoint da aplicação integradora deve estar apto a receber requisições HTTP do tipo POST.

Exemplo de webhook recebido:

{
"id": "1234567890",
"estado": "FINALIZADO_SUCESSO",
"valor": "150.00"
}

Descrição dos campos:

id: Identificador único do lançamento do pagamento.

estado: Estado atual da transação. Pode conter valores como FINALIZADO_SUCESSO ou FINALIZADO_REJEICAO.

valor: Valor total da transação Pix efetuada.

A aplicação que receberá os eventos deve estar configurada para responder rapidamente à chamada HTTP POST. Em caso de falha, a plataforma pode aplicar estratégias de reenvio ou descarte, conforme a política da instituição.

Importante:
O envio das notificações respeita o limite de 1 requisição por segundo (Rate Limit). Endpoints instáveis podem impactar o recebimento contínuo dos eventos.

Lista de escopos da API

pixpagamentos_escrita

pixpagamentos_webhook

pixpagamentos_consulta

TERMOS DE USO
-
AVISO DE PRIVACIDADE E TRATAMENTO DE DADOS
-
CONTATO/SUPORTE
Fale com a Alice

Catálogo de APIs
Documentação
Empresas parceiras
Sandbox
Meus aplicativos
Sair
KL
FAQ
APIs do Sicoob
Códigos de resposta HTTP
Suporte
APIs
Cobrança Bancária V3
Cobrança Bancária Pagamentos
Conta Corrente
Convênios Pagamentos
Investimentos - RDC
Open Finance - Iniciação de Pagamento
Pix Pagamentos
Poupança
Pix Recebimentos
SPB Transferências
Segurança
Novidades e Atualizações
Dificuldades frequentes
Sandbox
Pix no TEF
API Pix

Visão Geral

API Pix permite que o usuário recebedor possa automatizar serviços de pagamentos com o Sicoob, a fim de receber e gerenciar transações Pix. O usuário recebedor poderá, no contexto do arranjo Pix, gerar cobrança, verificar Pix recebidos, fazer devolução e conciliação. Importante ressaltar que a API Pix é normatizada pelo Bacen, sendo que suas funcionalidades, as formas de iniciação do Pix, bem como as regras de segurança especificados nessa documentação segue de forma fidedigna as orientações estabelecidas pelo Banco Central do Brasil.

Funcionalidades

Gerenciamento de cobranças com pagamento imediato (Cob)
Gerenciamento de Pix Recebidos (Pix)
Gerenciamento de Cobranças para pagamento com vencimento (CobV)
Gerenciamento de lote de Cobranças para pagamento com vencimento (LoteCovV)
Gerenciamento de Notificações (Webhook)

Especificação da API

Acesse a documentação técnica com todas as informações, clicando aqui.

Confira abaixo vídeos de como você pode configurar as requisições no Postman. Você também pode fazer o download da nossa coleção da API de Pix para o Postman.

Passo a passo Criar Cobrança Imediata Pix (POST)




 Faça download da coleção API Pix para o Postman



Informações Importantes

Rate Limit
API Pix: 50 por segundo.

Cadastro de URL de Webhook
PUT /webhook/{chave}

Para cadastrar uma URL de Webhook é necessário que o endpoint destino dos pushes esteja conforme as convenções mais recentes de configuração desse tipo de arquitetura. Nesse caso, é esperado que, no lado do integrador, o endpoint desenvolvido seja do tipo POST e sempre contenha o path pós-fixo /pix.

Observações:

1 - No Endpoint de cadastro da URL de Webhook, o integrador deve cadastrar a URL sem o path /pix. Ao enviar esta requisição, nossa estrutura adicionará automaticamente o path pós-fixo /pix ao endereço enviado.

Exemplo:
URL cadastrada: "https://api.seuapp.com.br/webhook/sicoob/"

URL desenvolvida:"https://api.seuapp.com.br/webhook/sicoob/pix"

2 - Se o integrador necessitar de segurança adicional nos pushes enviados, poderá configurar uma whitelist de blocos de IPs que dispararão as notificações de PIX, ou solicitar autenticação mTLS mediante configuração realizada por nossa equipe técnica. Entre em contato com nosso Suporte em qualquer dúvida.

Exemplo de webhook recebido:

{
  "pix": [
    {
      "endToEndId": "E1111111111111111111111111111111",
      "txid": "111111111111111111111111111111111",
      "valor": "66.97",
      "horario": "2022-05-27T21:13:17.908Z",
      "devolucoes": []
    }
  ]
}

Pix Cobrança

O Pix Cobrança é uma maneira que o usuário recebedor do Pix tem para gerenciar e receber com mais facilidade as cobranças relacionadas a:

Pagamentos imediatos, feitos no momento da cobrança por um QR Code em pontos de vendas físicos ou comércio eletrônico, por exemplo.

Pagamentos com vencimentos, realizados em data futura, que podem incluir outras informações como juros, multas, outros acréscimos, descontos e outros abatimentos semelhante ao boleto (em breve).

Chave Pix

A chave Pix é um apelido utilizado para identificar sua conta. Ela representa o endereço da sua conta transacional no Pix perante o Banco Central. Elas podem ser: CPF/CNPJ, E-mail, número de telefone celular ou Chave aleatória.

QR Code

Através do QR Code, sua empresa poderá gerar e compartilhar com seus clientes a imagem ou a URL através do Pix Copia e Cola. Existem dois tipos:

QR Code Estático: Possui quatro opções de configurações. A primeira, trata-se da configuração da chave Pix perante o Banco Central realizada em algum dos nossos canais de atendimento. As demais são opcionais: identificador da transação, campo de texto livre e valor do pagamento.

QR Code Dinâmico: Possui mais abrangência de funcionalidades, tais como, conciliação via identificador da transação, configuração de valor e de campos livres estruturados. O QR Code dinâmico também deve ser configurado para apresentar uma chave Pix, e em sua estrutura interna, é configurado com uma URL acessada no momento de sua leitura. Essa funcionalidade abre diversas possibilidades de uso, dado que as informações contidas na URL podem variar em função de diversos parâmetros. O QR Code dinâmico contém somente as informações básicas do usuário recebedor, as demais informações é obtida em um webservice do PSP do recebedor, com base nessa URL.

Ambos servem para receber um ou mais Pix e podem ser gerados pela instituição financeira ou de pagamento em que se possui conta. Podem ser disponibilizados em papel ou em meio eletrônico. Ambos foram normatizados pelo Bacen através do BR Code. O QR Code estático permitirá receber pagamentos sem precisar cadastrar um valor fixo, o que permitirá ao devedor informar o valor no momento em que for realizado o pagamento, lembrando que este tipo não possui data de vencimento ou expiração e não faz parte da API Pix para emissão, apenas consulta. O QR Code dinâmico apresentará as informações específicas daquela transação, como data de vencimento ou expiração, valor e multa, ideal para transações únicas.

Requisitos de Segurança obrigatórios

O Banco Central definiu os requisitos obrigatórios de segurança a serem seguidos pelos PSPs na disponibilização da API Pix. Abaixo os requisitos que impactam diretamente na integração entre cliente e Sicoob (PSP) são:

A conexão à API deve ser criptografada utilizando o protocolo TLS versão 1.2 ou superior, permitindo apenas cipher suites que atendam ao requisito de forward secrecy.

O PSP deve implementar o framework OAuth 2.0 (RFC 6749) com TLS mútuo (mTLS – RFC 8705) para autenticação na API, conforme especificações abaixo:

Os certificados digitais dos clientes da API devem ser emitidos por ACs externas e devem obedecer ao padrão internacional x.509. O Sicoob não aceita certificados auto-assinados pelo cliente para o ambiente de produção.

O Authorization Server do Sicoob implementa a técnica de vinculação do certificado do cliente aos access tokens emitidos ('Client Certificate-Bound Tokens'), conforme seção 3 da RFC 8705.

O Resource Server do Sicoob confirmará que o thumbprint do certificado associado ao access token apresentado pelo cliente é o mesmo do utilizado na autenticação TLS (proof-of-possession).

O fluxo OAuth a ser utilizado é o 'Client Credentials Flow'.

Os escopos OAuth serão definidos na especificação Open API 3.0 da API Pix e permitirão associar diferentes perfis de autorização ao software cliente.

Para a funcionalidade de webhooks, as notificações oriundas do Sicoob ao usuário recebedor trafegarão utilizando um canal mTLS.

Processos adicionais de segurança do Sicoob

O Banco Central entende que os PSPs poderão adotar processos, tecnologias e soluções de segurança para a API que mais acharem apropriados, desde que sejam atendidos os requisitos obrigatórios de segurança. Segue abaixo as recomendações do Bacen que poderão adotadas pelos Sicoob que impactam o cliente:

Assegurar a segurança do desenvolvimento do software cliente da API, mesmo que desenvolvido por terceiros. Sugere-se que o PSP institua e mantenha processo de homologação dos softwares clientes, estabelecendo critérios mínimos de segurança para que eles sejam autorizados a interagir com a API. Nesse caso, a API deve negar tentativas de comunicação de clientes não homologados.

Definir uma política de troca periódica do certificado, senha e outros aplicativos utilizadas no acesso à API;

Validar a segurança do ambiente computacional dos usuários nos aspectos de infraestrutura, implementação e configuração do software cliente da API;

Exigir que as empresas e instituições que utilizem a API tenham uma Política de Segurança da Informação formalmente instituída.

Lista de escopos da API

cob.write: Permissão para alteração de cobranças imediatas

cob.read: Permissão para consulta de cobranças imediatas

cobv.write: Permissão para alteração de cobranças com vencimento

cobv.read: Permissão para consulta de cobranças com vencimento

lotecobv.write: Permissão para alteração de lotes de cobranças com vencimento

lotecobv.read: Permissão para consulta de lotes de cobranças com vencimento

pix.write: Permissão para alteração de Pix

pix.read: Permissão para consulta de Pix

webhook.read: Permissão para consulta do webhook

webhook.write: Permissão para alteração do webhook

payloadlocation.write: Permissão para alteração de payloads

payloadlocation.read: Permissão para consulta de payloads




TERMOS DE USO
-
AVISO DE PRIVACIDADE E TRATAMENTO DE DADOS
-
CONTATO/SUPORTE
Fale com a Alice

Catálogo de APIs
Documentação
Empresas parceiras
Sandbox
Meus aplicativos
Sair
KL
FAQ
APIs do Sicoob
Códigos de resposta HTTP
Suporte
APIs
Cobrança Bancária V3
Cobrança Bancária Pagamentos
Conta Corrente
Convênios Pagamentos
Investimentos - RDC
Open Finance - Iniciação de Pagamento
Pix Pagamentos
Poupança
Pix Recebimentos
SPB Transferências
Segurança
Novidades e Atualizações
Dificuldades frequentes
Sandbox
Pix no TEF
API SPB Transferências

Visão Geral

A API SPB Transferências possibilita a automação e integração de funcionalidades de TED em sistemas, simplificando o processo de gestão e acompanhamento de transferências eletrônicas. Essa API fornece serviços relacionados ao envio de Transferência Eletrônica Disponível (TED). Os principais recursos incluem a capacidade de realizar o envio de uma TED e a opção de consultar informações sobre uma TED usando o número de controle IF (Identificador da Transferência) e o código de agendamento associado à transação.

Rate Limit API SPB Transferências: 2 por segundo.

Funcionalidades

Envio de TED;
Consulta de TED.

Especificação da API

Acesse a documentação técnica com todas as informações, clicando aqui.

Confira abaixo um vídeo tutorial de como você pode configurar as requisições no Postman. Você também pode fazer o download da nossa coleção da API SPB Transferências para o Postman.

Passo a passo para Consulta de Agendamento (GET)


 Faça download da coleção API SPB para o Postman





Lista de escopos da API

spb_escrita

spb_consulta

openid

TERMOS DE USO
-
AVISO DE PRIVACIDADE E TRATAMENTO DE DADOS
-
CONTATO/SUPORTE
Fale com a Alice

Catálogo de APIs
Documentação
Empresas parceiras
Sandbox
Meus aplicativos
Sair
KL
FAQ
APIs do Sicoob
Códigos de resposta HTTP
Suporte
APIs
Segurança
Padrões de segurança
Certificado digital
Autenticação
Autorização para Criação de Aplicativo PJ
Rate Limit: Limite de requisições por segundo
Novidades e Atualizações
Dificuldades frequentes
Sandbox
Pix no TEF
Padrões de segurança

As APIs do Sicoob aplicam padrões de segurança necessários para transações bancárias. Veja a seguir uma visão geral de nossos padrões de segurança.

Autorização – o OAuth 2.0

As APIs do Sicoob utilizam o padrão de autorização OAuth 2.0 client credentials para autenticação e autorização, especificado na RFC 6749. Através do padrão OAuth, o cliente não fornece seus aplicativos fora do ambiente Sicoob, de forma que os aplicativos de terceiros não terão acesso às informações de autenticação.

O fluxo de concessão de credenciais de cliente do OAuth 2.0 permite que o aplicativo use as próprias credenciais para se autenticar na API. As permissões são concedidas pelo aplicativo através da geração de um ID do cliente (Client ID) e certificado digital. Quando o aplicativo apresenta um token para acesso a uma API, esta impõe que o próprio aplicativo tenha autorização para executar uma ação, já que não há nenhum usuário envolvido na autenticação.

Protocolo HTTPS

O HTTPS é um protocolo para comunicação seguro que vem sendo amplamente utilizado na internet há muitos anos. As APIs do Sicoob utilizam o protocolo HTTPS para as comunicações de clientes e nossos serviços. Com isso, a troca de informações é segura, pois é feita por meio de criptografia de dados de ponta a ponta. Isso garante a privacidade dos dados sob um protocolo seguro.

Protocolo TLS e o mTLS (TLS mútuo)

O TLS é utilizado para as comunicações de nossas APIs promovendo a criptografia que garante a confidencialidade e integridade da conexão, e também garante autenticação quando certificados digitais são apresentados pelo cliente e/ou servidor. Algumas de nossas APIs utilizam o TLS mútuo (mTLS - da RF8705).

Certificados Digitais

As APIs do Sicoob cujo fluxo de autenticação é client credentials, utilizam certificados digitais garantindo mais proteção à comunicação, autenticação e integridade na utilização de nossos serviços. Os certificados digitais devem ser emitidos por ACs (Autorizações Certificadoras) ICP Brasil, do tipo A1 e-CNPJ ou e-CPF emitido para o cooperado, obedecendo ao padrão internacional x.509. Quando um certificado é assinado por uma autoridade de certificação confiável, quem possuir o certificado pode contar com a chave pública que ele contém para estabelecer uma comunicação segura com a outra parte. O padrão internacional x.509 provê a especificação para certificados de chave pública e proporciona uma solução de segurança mais completa, assegurando a identidade de todas as partes envolvidas em uma integração.

TERMOS DE USO
-
AVISO DE PRIVACIDADE E TRATAMENTO DE DADOS
-
CONTATO/SUPORTE
Fale com a Alice


Catálogo de APIs
Documentação
Empresas parceiras
Sandbox
Meus aplicativos
Sair
KL
FAQ
APIs do Sicoob
Códigos de resposta HTTP
Suporte
APIs
Segurança
Padrões de segurança
Certificado digital
Autenticação
Autorização para Criação de Aplicativo PJ
Rate Limit: Limite de requisições por segundo
Novidades e Atualizações
Dificuldades frequentes
Sandbox
Pix no TEF
Certificado digital
Requisitos

O fluxo de autenticação utilizado pelas APIs do Sicoob requer a utilização de certificado digital emitido por uma entidade certificadora ICP Brasil e deve ser emitido para o CNPJ do cooperado, quando PJ (Pessoa Jurídica) e para CPF do cooperado quando PF (Pessoa Física).

Para estabelecer o mTLS, o certificado digital deve ser do tipo A1 e-CPF ou e-CNPJ e conter no campo: Uso Avançado da Chave o atributo: Autenticação de Cliente (1.3.6.1.5.5.7.3.2).

Chaves

O certificado digital é formado por um par de chaves assimétricas, que inclui uma chave privada e uma chave pública. A chave pública pode ser compartilhada com qualquer parceiro e deve ser vinculada no momento da geração do aplicativo no Portal Developers, para ser realizada a configuração na ferramenta que estabelece a conexão entre o cooperado e o Sicoob. A chave privada deve ser sempre de conhecimento exclusivo do cooperado e nunca deve ser repassado para o Sicoob ou qualquer outra pessoa que não seja de confiança.

Atenção!! É importante destacar que o Sicoob não envia e-mail, SMS, mensagem ou qualquer outra forma de comunicação solicitando o envio da chave privada. Sugerimos que mantenha a chave privada armazenada de forma segura. Se o desenvolvedor ou cooperado encaminhar a sua chave privada para o Sicoob, nós iremos solicitar que seja gerado um novo par de chaves. Se isso acontecer, é provável que o cooperado tenha que pagar novamente pelo certificado junto à autoridade certificadora de sua escolha.

Responsabilidade do Cooperado quanto ao Uso de Certificados

Para garantir a segurança, confiabilidade e integridade no acesso às APIs disponibilizadas, é responsabilidade do cooperado:

Manter o certificado digital válido e atualizado em seu ambiente;
Utilizar o certificado corretamente em todas as requisições, incluindo:
a geração do token de autenticação;
o consumo das APIs protegidas.

O uso de certificado vencido, inválido ou incorreto poderá resultar em falhas de autenticação e autorização, como erro 403, impedindo o acesso às APIs.

Reforçamos que a atualização do certificado deve ser realizada sempre antes da expiração, garantindo conformidade com as práticas de segurança da instituição.

Como eu exporto o certificado para gerar o aplicativo?

Para que a criação do aplicativo seja bem sucedida, deve-se inserir somente a chave pública do certificado no formato .PEM, .CRT ou .CER, caso o seu certificado esteja no formato .PFX siga o tutorial abaixo.

Este tutorial visa orientar e disponibilizar sugestões de endereços para realizar o download dos arquivos, não sendo obrigatório seguir este modelo ou se utilizar unicamente deste cenário para extração da chave pública. Esse processo é utilizado no sistema operacional Windows.

As ações abaixo descrevem o procedimento para realizar a exportação da chave pública usando a ferramenta OpenSSL. É possível utilizar essa ferramenta nos sistemas operacionais Windows, Linux, MacOs, entretanto as telas abaixo foram extraídas a partir do Windows.

1) Realize o download e a instalação do openssl.

a. Clique em https://gnuwin32.sourceforge.net/packages/openssl.htm e realize o download do arquivo zip Binaries, em seguida defina a pasta que armazenará o arquivo binário.

2) Faça a extração do pacote zip na pasta de sua preferência.

3) Dentro da pasta bin, crie uma pasta chamada “cert” e adicione o certificado digital dentro dessa pasta.

4) Ainda dentro da pasta bin, digite “CMD” na barra de endereços.

5) Via prompt de comando digite o comando abaixo:

openssl pkcs12 -in cert\nomeCertificado.pfx -nokeys -out cert\nomeCertificado.pem

6) O arquivo ‘.pem’ gerado deverá ser vinculado durante o processo de geração dos aplicativos no Portal Developers.

Como eu sei se estou vinculando somente a chave pública?

Antes de vincular o arquivo, abra em um bloco de notas e valide se o certificado contém somente a seguinte informação:


-----BEGIN CERTIFICATE-----MIIHPjCCBSagAwIBAgIIaEshCShhC1wwDQYJKoZIhv...-----END CERTIFICATE-----


Atenção: Em alguns casos o arquivo com extensão .pem contém a chave privada que deve ser removida.

Para identificar se o certificado contém a chave privada, é necessário observar se dentro do arquivo contém a seguinte informação:


-----BEGIN RSA PRIVATE KEY-----MIIEpAIBAAKCAQEAwn4EKwte4Cheid9/WhvzZWbZqxI...-----END RSA PRIVATE KEY-----

TERMOS DE USO
-
AVISO DE PRIVACIDADE E TRATAMENTO DE DADOS
-
CONTATO/SUPORTE
Fale com a Alice

Catálogo de APIs
Documentação
Empresas parceiras
Sandbox
Meus aplicativos
Sair
KL
FAQ
APIs do Sicoob
Códigos de resposta HTTP
Suporte
APIs
Segurança
Padrões de segurança
Certificado digital
Autenticação
Autorização para Criação de Aplicativo PJ
Rate Limit: Limite de requisições por segundo
Novidades e Atualizações
Dificuldades frequentes
Sandbox
Pix no TEF
Autenticação

O fluxo de autenticação Client Credentials pode ser acessado pela URL abaixo:

Geração do token:
https://auth.sicoob.com.br/auth/realms/cooperado/protocol/openid-connect/token

Você poderá visualizar o passo a passo de geração de token via Postman no vídeo disponibilizado no link a seguir.





Em seguida, após a obtenção do token válido, o consumo das APIs pode ser realizado normalmente.

Para mais informações sobre o consumo das APIs acesse o menu APIs.

TERMOS DE USO
-
AVISO DE PRIVACIDADE E TRATAMENTO DE DADOS
-
CONTATO/SUPORTE
Fale com a Alice

Catálogo de APIs
Documentação
Empresas parceiras
Sandbox
Meus aplicativos
Sair
KL
FAQ
APIs do Sicoob
Códigos de resposta HTTP
Suporte
APIs
Segurança
Novidades e Atualizações
Dificuldades frequentes
Sandbox
Pix no TEF
Sandbox

O ambiente de Sandbox foi criado especificamente para desenvolvedores que desejam testar as APIs do Sicoob. Esse ambiente é uma cópia do ambiente de produção, mas com a diferença de que os dados retornados são simulados (mocks). A documentação completa de todos os endpoints está disponível para consulta em nosso Catálogo de APIs.

Para começar a utilizar o ambiente de testes de nossas APIs, siga os passos:

1) Acesse suas credenciais de teste:
Antes de começar a utilizar o ambiente de sandbox, é necessário obter suas credenciais de teste. Elas estão disponíveis após o registro no nosso portal, em Sandbox. Vale ressaltar que esse Client ID não é válido para o ambiente de produção.

2) Autenticação:
É necessário fornecer no Header Authorization das requisições o Access token fornecido em Sandbox.

3) Endpoints:
Confira o endpoint da API que deseja testar.

Endereços de Sandbox

API Cobrança Bancária:
https://sandbox.sicoob.com.br/sicoob/sandbox/cobranca-bancaria/v3

API Cobrança Bancária Pagamentos:
https://sandbox.sicoob.com.br/sicoob/sandbox/cobranca-bancaria-pagamentos/v3

API Conta Corrente:
https://sandbox.sicoob.com.br/sicoob/sandbox/conta-corrente/v4

API Convênios Pagamentos:
https://sandbox.sicoob.com.br/sicoob/sandbox/convenios-pagamentos/v2

API Investimentos - RDC:
https://sandbox.sicoob.com.br/sicoob/sandbox/investimentos/v2

API Open Finance - Iniciação de Pagamento:
https://sandbox.sicoob.com.br/sicoob/sandbox/payments/v2/itp

API Pix Pagamentos:
https://sandbox.sicoob.com.br/sicoob/sandbox/pix-pagamentos/v2

API Pix Recebimentos:
https://sandbox.sicoob.com.br/sicoob/sandbox/pix/api/v2

API Poupança:
https://sandbox.sicoob.com.br/sicoob/sandbox/poupanca/v3

API SPB Transferências:
https://sandbox.sicoob.com.br/sicoob/sandbox/spb/v2

Exemplos de requisição

Consultar Cobrança Imediata PIX

curl --location --request GET 'https://sandbox.sicoob.com.br/sicoob/sandbox/pix/api/v2/cob/:TXID' \
--header 'Authorization: Bearer {{Access Token}}' \
--header 'client_id: {{client_id}}' \
--header 'Accept: application/json' \
--header 'Content-Type: application/json'


Obs: O TXID é um path param que deve ser preenchido com o identificador único do QR Code. Ele deve conter de 27 a 36 caracteres.

Consultar Boleto

curl --location -g --request GET 'https://sandbox.sicoob.com.br/sicoob/sandbox/cobranca-bancaria/v3/boletos?numeroContrato={{numContrato}}&modalidade=1&nossoNumero=integer' \
--header 'Authorization: Bearer {{Access Token}}' \
--header 'client_id: {{client_id}}' \
--header 'Accept: application/json' \
--header 'Content-Type: application/json'


Obs: Os Headers seguirão um padrão para todas as APIs.

TERMOS DE USO
-
AVISO DE PRIVACIDADE E TRATAMENTO DE DADOS
-
CONTATO/SUPORTE
Fale com a Alice

Catálogo de APIs
Documentação
Empresas parceiras
Sandbox
Meus aplicativos
Sair
KL
FAQ
APIs do Sicoob
Códigos de resposta HTTP
Suporte
APIs
Segurança
Novidades e Atualizações
Dificuldades frequentes
Sandbox
Pix no TEF
Códigos de resposta HTTP
Entenda os principais códigos de retorno de nossas APIs.
Sucesso

Tipo Descrição

200 OK Requisição com Sucesso

201 Created Recurso criado

202 Accepted Iniciado com sucesso

204 No Content Registro excluído

207 Multi-Status Significa que a requisição de vários itens foi bem sucedida, porém é preciso verificar no corpo da requisição se há alguma restrição para algum item da lista

Erro na Requisição

Tipo Descrição

400 Bad Request Erro na requisição

401 Unauthorized Cabeçalho de autenticação inválido

403 Forbidden Token incorreto ou segurança violada

404 Not Found O recurso solicitado não existe

405 Not Allowed Método do recurso não suportado

406 Not Accepted Tipo de mídia não permitido

415 Unsupported Media Type Payload não suportado

429 Too Many Requests Muitas solicitações

Erro no Servidor

Tipo Descrição

500 Internal Server Error Erro no gateway

503 Service Unavailable Serviço nao disponível

504 Gateway timeout Servidor não respondeu

TERMOS DE USO
-
AVISO DE PRIVACIDADE E TRATAMENTO DE DADOS
-
CONTATO/SUPORTE
Fale com a Alice
