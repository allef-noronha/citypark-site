# Disponibilidade e ativação — 10/09/2026

Esta versão substitui as instruções anteriores de resumo a cada 30 minutos. Não requer Cloud Functions, troca de conta ou ativação de faturamento.

## O que mudou

- O site público escuta somente `disponibilidade_publica/estoque`, com identificação e status das unidades. Não consulta a coleção operacional.
- Reserva, aprovação, venda, recusa, cancelamento, distrato, ajuste e invalidação de teste atualizam a projeção pública na mesma transação. As regras rejeitam alteração de unidade sem projeção correspondente e projeção falsa. Uma reserva concorrente continua gerando apenas uma proposta.
- Administração e Permuta aparecem como Vendido publicamente. Internamente permanecem classificadas com seus status originais. Todos, Todos exceto Administração, Venda comercial classificada, Administração e Permuta continuam distintos, inclusive no CSV. Outros bloqueios continuam Indisponível.
- Leitura das unidades operacionais exige administrador ou corretor aprovado. Documentos de propostas continuam sujeitos às permissões próprias.
- O Apps Script reconcilia o resumo diariamente, em transação. Uma falha preserva o resumo anterior. O site não espera essa rotina para receber mudanças feitas pelo novo programa.
- Sem confirmação do servidor, a disponibilidade pública fica A confirmar. Não há expiração por idade do resumo: estoque sem movimentação continua válido.
- Ajustes na tabela administrativa aproveitam a escuta existente, sem reler todo o estoque após cada ajuste.

## Consumo estimado

Com 389 unidades, a reconciliação do resumo cai de 18.672 para cerca de 389 leituras/dia (redução de 98% nessa rotina). A sincronização diária do Sheets acrescenta outras 389. Preços e outros consumidores permanecem separados.

A disponibilidade pública custa uma leitura do documento no carregamento e por atualização recebida por sessão, além de reconexões conforme as regras de cobrança. Cada mudança operacional acrescenta uma gravação da projeção e leituras de validação das regras. Muitos visitantes e movimentações ainda podem consumir a cota; não é garantia de permanecer no limite. Referência: https://firebase.google.com/docs/firestore/pricing .

Um único documento recebe as movimentações. Os testes cobrem concorrência de reserva; volume elevado de gravações simultâneas exigirá reavaliar essa arquitetura. Ela evita a necessidade de serviços pagos para a entrada inicial em operação.

## Ativação coordenada

Execute em uma janela curta sem operações comerciais. Não publique apenas um dos componentes.

1. Preserve uma versão recuperável do site/regras e confira a unidade de teste 2208 A. Não libere essa unidade por inferência. As nove unidades da Administração já classificadas devem continuar assim. Identifique as permutas com o comercial, sem inventar a classificação das demais.
2. Atualize o editor Apps Script com `apps-script/script_sheets_completo.txt`, preservando o manifesto e autorizações atuais. Ainda não execute rotinas de importação ou bootstrap de dados operacionais.
3. Publique as regras deste checkout: `firebase deploy --only "firestore:rules" --project city-park-25e9c`. Elas interrompem escritas de versões antigas que não atualizam a projeção. A página pública antiga pode mostrar A confirmar durante a troca.
4. Execute `atualizarResumoDisponibilidade` no Apps Script. Confirme o total esperado e a criação de `disponibilidade_publica/estoque`. A consulta e a gravação usam uma transação para não gravar uma leitura obsoleta. Em erro, não avance até resolver e repetir.
5. Execute `instalarGatilhoDisponibilidade`. A função remove os gatilhos de 30 minutos pertencentes à conta atual e garante o diário. Se outra conta criou gatilhos, remova os de 30 minutos também nela. A rotina diária mantém preços e Sheets e reconcilia a projeção.
6. Publique os arquivos do site desta revisão, incluindo `js/transacao-estoque.js`. Os pontos de entrada tiveram suas versões de cache atualizadas. Oriente a equipe a recarregar as páginas abertas.
7. Valide login, administrador, corretor aprovado, disponibilidade pública, filtros e uma operação autorizada em duas sessões. Confirme a instalação dos índices exigidos e o domínio de login. Não crie testes sobre unidades reais disponíveis sem escolher e registrar o caso com o responsável.
8. Interrompa novas propostas pelo fluxo Forms/Sheets/AppSheet; mantenha o legado apenas para conferência. Permutas ainda não identificadas e propostas legadas exigem validação humana.

Não há liberação automática de reservas antigas nesta revisão. Mantenha a revisão comercial de vencimentos; a presença de uma data vencida não significa que a unidade possa ser liberada.

## Histórico e venda anterior

Distrato preserva proposta e valores, registrando histórico. Invalidação do teste identificado preserva o registro e bloqueia a 2208 A para conferência. Cadastro de venda anterior aceita unidade comercial vendida sem vínculo pendente, mantém a venda e evita duplicação. Esses fluxos agora atualizam também a projeção pública.

No Mapa (`tabela-admin.html`), unidades com proposta vinculada oferecem acesso direto a `detalhes-proposta.html?id=...`. O cadastro de venda anterior cria a proposta e o vínculo e abre automaticamente o detalhamento após o sucesso da transação. A unidade permanece vendida. Cliente e corretor usam os dados gerais da mesma página; valor, data original, referência e condições contratadas aparecem em Condição de Proposta. O cadastro preserva a tipologia e a área da unidade em seu snapshot quando disponíveis. Em falha, o formulário mantém os valores preenchidos e apresenta o erro.

Os links também carregam o ID em `#proposta=...`, preservando a seleção quando o servidor redireciona para uma URL sem `.html` e remove a query. O detalhamento repõe o ID na query da URL atual e exige identificação explícita; não abre a última proposta guardada na sessão. IDs retornados pelo Firestore prevalecem sobre campos `id` eventualmente gravados dentro dos documentos.

Para uma unidade comercial vendida sem vínculo, o administrador também pode selecionar uma proposta existente já vendida da mesma unidade. `js/vinculo-proposta.js` grava `propostaAtualId`, `vinculoHistoricoId` e a atualização da unidade junto à projeção pública e aos dois históricos, na mesma transação. Não altera a proposta, as condições contratadas nem o status vendido. Propostas de outra unidade, vínculos existentes e outras propostas ativas ou legadas pendentes bloqueiam a operação.

Esta opção exige publicar as regras atualizadas de `firebase/firestore.rules` junto aos arquivos do Mapa. Não exige migração nem recria dados ausentes de vendas antigas. A verificação de navegador dedicada é `node tests/mapa-browser.cjs`, com Firebase substituído por dados isolados.

O cadastro de venda anterior inclui agora nome, CRECI, telefone, e-mail e imobiliária do corretor da época, além dos dados completos de cliente PF/PJ do formulário. O corretor histórico permanece em `corretorSnapshot`, sem criar uma conta ou atribuir a venda ao administrador. Os dados do cliente seguem o mesmo mapa `cliente` das propostas comuns.

Os pagamentos são registrados em `condicaoProposta` (schema 3, personalizada): sinal opcional em até 3 parcelas, até 12 grupos mensais/semestrais/anuais/únicos e financiamento opcional. O cadastro usa as funções de moeda e calendário de `js/condicao-venda.js`. Subtotais, total, diferença e percentuais usam centavos e a soma efetivamente contratada; subtotal, total e percentuais não são editáveis. O valor de tabela e os vencimentos são os informados do contrato original, sem aplicar retroativamente a tabela, os limites de desconto/financiamento ou o calendário comercial vigente. As observações em texto são opcionais e não substituem as parcelas.

A proposta histórica mantém o status vendido e usa a tabela financeira e os dados gerais de `detalhes-proposta.html`. Registros antigos sem `condicaoProposta` continuam exibindo as condições em texto; não são migrados ou sobrescritos. As regras verificam os snapshots, componentes, totais e os dois históricos na mesma transação, distribuindo a validação para respeitar o limite de expressões do Firestore. Publique `firebase/firestore.rules` desta revisão juntamente com os novos scripts `js/venda-anterior-modelo.js` e `js/venda-anterior-form.js` e os arquivos alterados do Mapa/detalhamento.

Vendas anteriores com parcelas estruturadas também oferecem **Editar proposta** e **Fazer uma Contraproposta**, usando o editor compartilhado. A edição é permitida enquanto a proposta histórica e sua unidade vinculada permanecem vendidas. Preserva `condicaoOriginal`, incrementa `financeiroRevisao` e registra a condição anterior/nova no histórico, com proteção contra alterações simultâneas. Valor contratado, data original, referência e observações da venda anterior permanecem como dados do contrato original. A condição atual é exibida separadamente.

O editor mantém o financiamento histórico sem vencimento e permite a ausência de sinal/financiamento, conforme o cadastro. Ao alterar apenas valores, conserva os calendários e as descrições existentes. A contraproposta continua sendo uma simulação para impressão, sem gravar alterações na proposta. O resumo contratual separa os grupos por item de lista apenas na apresentação, sem reescrever o texto armazenado. Registros legados sem parcelas estruturadas continuam com sua leitura anterior.

## Verificação local

Testes das regras e transações no emulador, testes de projeção/Apps Script/filtros e testes de navegador desktop/mobile. Não validam dados, regras implantadas, índices ou gatilhos reais. Nenhuma regra ou dado de produção foi alterado pela preparação local.
