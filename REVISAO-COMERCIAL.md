# Revisão do ambiente comercial — 07/09/2026

## Fluxo vigente após esclarecimento do usuário

Esta definição substitui o fluxo de aceite de contraproposta descrito nas seções históricas abaixo.

- Contraproposta é uma simulação local, sem gravação no Firebase, sem aceitar/recusar e sem modificar a proposta. Pode ser ajustada ou recriada para cada interação. A página oferece impressão/PDF e apresenta unidade, cliente, corretor, quantidades, vencimentos, valores unitários, subtotais e total. A simulação se perde ao fechar ou recarregar; o aviso aparece no formulário.
- O botão **Editar proposta** abre o editor da condição financeira existente. O salvamento altera `condicaoProposta`, preserva a primeira versão em `condicaoOriginal`, registra a composição anterior/nova em histórico imutável e incrementa `financeiroRevisao`. `condicaoVigente`, se existir de uma versão anterior do sistema, é removido após a edição. A edição é permitida em propostas reservadas ou aprovadas e mantém o status; verifica vínculo, status e revisão dentro da transação.
- Simulações não bloqueiam as etapas comerciais. Campos de contrapropostas legadas não foram apagados do banco e não controlam mais a interface.
- Recusa: proposta `recusada`; unidade `disponivel`; vínculo ativo removido; prazo removido; históricos dos dois documentos. A proposta permanece armazenada.
- Aprovação: proposta e unidade `aprovada`; vínculo ativo mantido; `expiraEm: null` nos dois documentos; administrador, data de atualização e históricos registrados. A unidade não fica disponível e ainda não é uma venda concluída.
- Na conclusão comercial, proposta e unidade passam para `vendida`, com data de venda e histórico.

Validação desta alteração: 24 testes locais de apresentação/cálculo/vínculos; 7 cenários comerciais no emulador, incluindo edição e conflito entre sessões; navegador com simulação sem gravações, subtotais, botão de edição e impressão/PDF. Nenhum documento de produção foi alterado.

Fonte: https://github.com/vinicbrandao/citypark-site-backup/tree/1a8235d90436091fe64af6ef526da42bfc9ea3cd

Comparação com o projeto local em `checkpoint/beta15f-20260904`, incluindo suas alterações ainda não commitadas. O repositório remoto foi buscado e os arquivos foram examinados em uma cópia temporária; não houve merge, publicação ou alteração de dados no Firebase nesta revisão.

## Melhorias aproveitáveis

- Cabeçalho e estrutura visual compartilhados nas páginas administrativas.
- Painel administrativo e tabela de unidades próprios do setor comercial.
- Apresentação dos dados de clientes PF/PJ, prazo da reserva e condições financeiras.
- Criação, edição, exclusão e confirmação de contraproposta.
- Cancelamento de proposta aprovada, com justificativa e gravação transacional do histórico.

## Correções necessárias antes da integração

1. **Validar o vínculo dentro de cada transação.** Em `js/detalhes-proposta.js:309–346`, aprovação e recusa verificam os status, mas não conferem se a unidade ainda pertence à proposta aberta. `requireLinkedUnit` verifica somente a existência de `unidadeId`. Uma proposta antiga pode, portanto, tentar aprovar ou liberar uma reserva posterior. Exigir correspondência entre o ID atual da proposta e o vínculo da unidade, considerando dados legados, e recusar vínculo ausente ou ambíguo. O cancelamento já possui uma verificação parcial, que também precisa ser uniformizada.

2. **Preservar as condições originais e as versões da negociação.** Em `js/detalhes-proposta.js:432` a edição altera diretamente `condicaoProposta`; em `:684` a contraproposta aceita também substitui esse campo. O histórico registra texto e total, sem guardar a composição anterior completa. Manter a condição enviada pelo corretor imutável, salvar cada revisão com autor/data e identificar separadamente a condição vigente.

3. **Conferir a revisão antes de aceitar ou excluir.** Em `js/detalhes-proposta.js:681`, a confirmação compara apenas `abertaEm`. A edição conserva a data de abertura e altera `atualizadaEm`. Uma segunda sessão pode confirmar condições diferentes das que revisou. Usar uma revisão consistente para editar, aceitar e excluir, verificada dentro da transação.

4. **Evitar carregar coleções inteiras na listagem.** Em `js/gestao-propostas.js:99–101`, cada carregamento consulta todas as propostas, todos os corretores e todas as unidades. A implementação local já aproveita dados da proposta e busca vínculos faltantes. Preservar essa estratégia e acrescentar paginação/filtros de consulta. O contador visual do prazo nos detalhes é local e não representa, por si só, leituras periódicas no Firebase.

5. **Implementar as etapas comerciais como dados persistidos.** Os indicadores de análise, documentos, assinatura e Sienge são apresentados como etiquetas. Eles não constituem um fluxo completo de transições. Separar o status da unidade da etapa comercial, registrar responsável, data, justificativa e histórico; definir as condições exigidas para cada avanço. Não tratar a etiqueta “Envio Sienge” como integração implementada.

6. **Preservar a integração de envio já validada.** A árvore do estagiário não contém a configuração e as regras Firebase locais e diverge significativamente do formulário e do cálculo de pagamento atuais. Uma substituição integral perderia trabalho recente. Integrar seletivamente os arquivos administrativos e adaptar suas dependências à condição financeira atual.

## Sequência proposta de implementação

1. Trazer a interface comercial e seus estilos, mantendo o formulário, o cálculo e as regras atuais.
2. Corrigir vínculo proposta/unidade e conflitos entre sessões; verificar as ações em emulador antes de qualquer operação real.
3. Persistir a etapa comercial e o histórico de transições, mantendo separado o estado de disponibilidade da unidade.
4. Integrar contrapropostas com versões imutáveis e confirmação da revisão exibida.
5. Aplicar paginação e carregamento dos dados relacionados somente quando necessários.
6. Validar o percurso completo com dados fictícios em ambiente de teste antes da publicação.

## Validação realizada

Os 42 testes fornecidos pelo repositório remoto passaram na cópia temporária: condições de pagamento, apresentação/ações dos detalhes e ordenação da tabela administrativa. Usam simulações do Firebase e não comprovam compatibilidade com as regras publicadas. Os problemas acima foram identificados por leitura do código; não foram exercitados contra o banco de produção.

A revisão não modifica a reserva já criada para a unidade 2208 A.

## Integração implementada — 07/09/2026

Após autorização, foram incorporadas as páginas `painel-admin.html`, `gestao-propostas.html`, `detalhes-proposta.html` e `tabela-admin.html`, com os estilos administrativos do commit revisado. O acesso às configurações comerciais foi mantido. O formulário e a biblioteca de cálculo atuais foram preservados.

- Aprovação, recusa, cancelamento e avanço comercial conferem o vínculo da unidade dentro da transação. Vínculos ausentes, divergentes ou ambíguos são recusados.
- A condição enviada permanece em `condicaoProposta`; a contraproposta aceita é registrada em `condicaoVigente`. Os detalhes e a visualização administrativa legada usam a condição vigente, quando houver.
- A edição direta da condição enviada foi substituída pelo fluxo de contraproposta. A original pode ser consultada nos detalhes. Criação, edição, exclusão e aceite registram cópias das condições no histórico imutável, além do autor e da data.
- Aceitar e excluir conferem `atualizadaEm` (com alternativa em `abertaEm` para registros antigos), bloqueando decisões sobre uma revisão que mudou em outra sessão.
- A negociação usa o preço da tabela registrado na proposta, com alternativa nos dados da unidade apenas para propostas antigas sem esse valor.
- A listagem consulta 25 propostas por página, filtra por status no servidor e ordena por criação. Dados relacionados são buscados somente quando não existem nos snapshots e são reutilizados durante a sessão da página. A busca textual atua sobre as páginas já carregadas, conforme indicado na interface.
- Os totais da listagem e do painel usam agregações; o painel consulta somente as quatro propostas mais recentes. A página de estoque continua lendo as unidades uma vez por abertura para montar o mapa completo; filtrar a tipologia não faz outra consulta.
- `etapaComercial` acompanha análise, documentos, assinatura, Sienge e conclusão. O avanço exige aprovação, vínculo válido, sequência correta, ausência de contraproposta pendente, justificativa e confirmação da conferência. Grava responsável, data e histórico na mesma transação. A conclusão também marca proposta e unidade como vendidas.
- Documentos, assinatura e Sienge são conferências manuais registradas pelo setor. Não foi implementado envio automático ao Sienge, upload de documentos ou assinatura eletrônica nesta integração.

O índice `propostas(statusProposta ASC, criadoEm DESC)` foi criado no projeto `city-park-25e9c` e confirmado em estado `READY`. Nenhum documento comercial ou regra de acesso de produção foi alterado nesta integração. O site público não foi publicado.

### Verificações

- 38 testes locais de apresentação, cálculo de contraproposta, conflito de revisão, proteção de vínculo e ordenação passaram.
- 3 testes de cálculo e os 68 cenários existentes de reserva no emulador passaram.
- 7 cenários comerciais passaram com o código real da página executando transações no emulador: aprovação/recusa, vínculo incorreto, aceite com histórico imutável, revisão concorrente, etapas até a venda, bloqueio de salto/negociação pendente e bloqueio de corretor sem permissão administrativa.
- As quatro páginas foram verificadas no navegador em 1440 px e 390 px, incluindo paginação, busca, consulta da original e abertura de contraproposta. O teste substitui os módulos Firebase e bloqueia chamadas externas, sem dados de produção.

Comandos: `npm test` na pasta `firebase`; `npm run test:commercial` para os cenários comerciais; `npm run test:browser` para a verificação visual isolada. O teste de navegador usa Playwright do runtime local do Codex e Edge; em outro computador, configure `CODEX_NODE_PACKAGES` para os pacotes Node instalados. Capturas locais ficam em `tests/artifacts/` (ignoradas pelo Git).

Para conferir com a sessão administrativa já aberta, recarregue `http://localhost:5501/gestao-propostas.html` com Ctrl+F5. As ações dessa página usam o Firebase real; a integração não executou nenhuma delas sobre a reserva de teste existente.
