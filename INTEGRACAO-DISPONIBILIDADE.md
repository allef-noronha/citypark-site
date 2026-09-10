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

## Verificação local

Testes das regras e transações no emulador, testes de projeção/Apps Script/filtros e testes de navegador desktop/mobile. Não validam dados, regras implantadas, índices ou gatilhos reais. Nenhuma regra ou dado de produção foi alterado pela preparação local.
