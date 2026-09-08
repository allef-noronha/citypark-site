# Disponibilidade no plano gratuito — 08/09/2026

Esta configuração substitui a ativação por Cloud Functions. Não executar deploy de funções, bootstrap.js ou comandos de faturamento. A configuração do gcloud pode permanecer instalada, mas não é necessária neste fluxo.

## Instalar no Apps Script

1. Substitua o código do editor pelo conteúdo completo de `apps-script/script_sheets_completo.txt`. Esse arquivo reúne o script original de preços e a versão atualizada da disponibilidade. Se os arquivos estiverem separados no editor, substitua apenas Disponibilidade.gs e mantenha Code.gs; não duplique funções.
2. Preserve o appsscript.json atual, inclusive os escopos já autorizados.
3. Execute `atualizarResumoDisponibilidade` uma vez. Ela consulta as unidades e grava apenas `disponibilidade_publica/atual`. Não altera propostas, preços ou unidades operacionais.
4. Execute `instalarGatilhoDisponibilidade` uma vez. Cria um gatilho a cada 30 minutos, separado do gatilho diário existente. A rotina diária de preços e atualização do Sheets continua entre 2h e 3h. Não precisa reinstalar o gatilho diário.
5. Confira na lista de gatilhos os dois manipuladores: `sincronizarDiariamente` e `atualizarResumoDisponibilidade`.

## Comportamento

O site acompanha o resumo público e uma consulta em tempo real das unidades reservadas/aprovadas. A reserva operacional prevalece sobre o resumo antigo e aparece assim que a conexão entrega a atualização, sem esperar o Apps Script. A transação do formulário e as regras impedem duas reservas simultâneas da mesma unidade, mesmo antes da atualização visual. Sem confirmação da conexão de reservas, a tela exibe A confirmar.

Venda, liberação e bloqueio podem aguardar o resumo periódico (30 minutos, sujeito ao agendador). Se o resumo vencer após 75 minutos, seus estados deixam de ser usados; reservas confirmadas em tempo real continuam visíveis. O Sheets continua recebendo disponibilidade diariamente.

Com 389 unidades e 48 execuções diárias, a consulta periódica soma aproximadamente 18.672 leituras/dia e 48 gravações/dia. A sincronização diária do Sheets acrescenta 389 leituras e a publicação de preços acrescenta 390 gravações. A consulta em tempo real acrescenta leituras das reservas/aprovações no carregamento e nas mudanças, conforme acessos e reconexões. Visitas ao site, painel administrativo, console e propostas consomem cotas adicionais. A cota gratuita de 50 mil leituras/dia é compartilhada pelo projeto; não se trata de garantia de consumo total.

Referências: [intervalos dos gatilhos](https://developers.google.com/apps-script/reference/script/clock-trigger-builder), [cotas do Firestore](https://firebase.google.com/docs/firestore/quotas).

## Histórico e distrato

Tabela administrativa → unidade → proposta vinculada → Registrar distrato. O motivo é obrigatório. A proposta e a data da venda são preservadas, os históricos recebem novos eventos e a unidade fica disponível para uma nova proposta. Propostas anteriores continuam acessíveis pela unidade. O mapa administrativo acompanha o estoque operacional em tempo real; use Atualizar para reconectar se necessário. O diálogo relê a unidade e a transação confere o estado antes de salvar.

## Publicação

As regras do resumo já foram publicadas pelo usuário, conforme captura. A nova configuração local remove Cloud Functions do firebase.json. O diretório functions permanece apenas como código anterior, sem implantação automática.

O Apps Script deve inicializar o resumo antes da publicação dos arquivos do site. O script atualizado ainda precisa ser colado e executado pelo usuário. Nenhuma nova gravação de produção foi executada pelo agente nesta adaptação.


## Destinação, relatórios e ajustes

A tabela administrativa oferece destinação Venda comercial, Administração ou Permuta, separada do status operacional. Unidades da Administração ficam bloqueadas. Permutas ficam bloqueadas ou concluídas; não aceitam reserva comercial. Dados antigos sem destinação aparecem como Não classificada, sem inferir que sejam vendas.

Na tabela, a ação Classificar nove unidades apresenta a relação informada pelo responsável e registra cada classificação com histórico. Nenhuma classificação é executada ao abrir a página. O processamento é por unidade; falhas e sucessos são mostrados individualmente e a ação pode ser retomada.

Unidades sem vínculo oferecem Ajuste administrativo com motivo e referência obrigatórios. Propostas ativas ou legadas pendentes impedem o ajuste. Os relatórios e a exportação CSV usam a visão selecionada: total, sem Administração, apenas Venda comercial classificada, Administração ou Permuta. O painel inicial continua identificado como estoque total, com bloqueadas separadas visualmente de vendidas.

A proposta de teste Q22ovBXKxVdn8r9BZi3h oferece Invalidar teste: mantém preços, condições e histórico, marca teste_invalidado e bloqueia a 2208 A para conferência do legado. Não libera automaticamente a unidade e não é distrato real. Nenhum dado real foi invalidado por esta implementação.

## Ativar esta revisão

1. Publicar as regras atualizadas: `firebase deploy --only "firestore:rules" --project city-park-25e9c`.
2. Atualizar o Apps Script com o arquivo completo desta revisão e executar atualizarResumoDisponibilidade. Os gatilhos existentes podem permanecer.
3. Conferir o site local e publicar os arquivos do site pelo fluxo habitual.
4. Na tabela administrativa, executar a classificação das nove unidades e verificar os resultados. A atualização do resumo torna o novo bloqueio visível publicamente; as reservas já usam o caminho em tempo real.

Esta revisão foi preparada localmente. Publicação, classificação real e invalidação real são etapas de ativação, não efeitos de abrir o site.

## Cadastrar venda anterior

Na tabela administrativa, abra uma unidade vendida sem proposta vinculada. O formulário Cadastrar venda anterior recebe cliente/razão social, corretor da época, data original, valor, condições em texto e referência documental. A confirmação declara que se trata de venda comercial, mesmo quando a destinação antiga ainda não está classificada. Administração e permuta não são aceitas.

O registro é criado como vendida, origem venda_anterior, com data de cadastro separada da data original. Não exige uma conta ativa para o corretor antigo e não concede acesso ao registro com base no nome informado. O valor histórico não é validado contra preços atuais. Os detalhes apresentam as condições originais em seção própria.

Uma única transação cria proposta e dois históricos e vincula a unidade; não altera seu status nem a data de venda existente na unidade. ID estável por unidade impede duplicação por repetição. Propostas vinculadas ou legadas ainda abertas precisam ser conferidas antes. Propostas encerradas e históricos antigos são preservados. Um distrato posterior usa o fluxo normal, com justificativa.

Esta funcionalidade requer publicar novamente firestore:rules e os arquivos do site. Nenhuma venda real é cadastrada pela instalação da funcionalidade.
