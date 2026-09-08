# Conferência do acervo de propostas — 08/09/2026

Fontes: Excel fornecido pelo responsável em `C:/Users/orcam/Downloads/Solicitações - Tabela de Venda.xlsx` e script `C:/Users/orcam/Downloads/script_sheets_propostas.txt`. Análise local, sem executar o script e sem alterar Firebase, planilhas ou gatilhos. Não é ainda uma conciliação com o banco atual.

## Inventário

- Propostas!A2:V115: 114 propostas, 114 IDs distintos, para 68 unidades. Datas de 15/10/2025 a 21/08/2026.
- Respostas ao formulário!A2:CL114: 113 respostas, 90 colunas. Inclui grupos de dados de clientes e cônjuges; não limitar a migração aos 22 campos resumidos de Propostas.
- Histórico!A2:I584: 583 eventos. Há 48 eventos com 11 IDs sem proposta correspondente nesta exportação. Preservar como eventos legados sem vínculo confirmado, não descartar nem inventar propostas.
- Debug!A2:C443: 442 registros de diagnóstico; separar de histórico comercial.

## Significado dos estados

StatusProposta: 89 Recebida (Pendente Correção), 25 Recebida. O script define pendência a partir de aprovação do corretor e validação CPF/CNPJ no recebimento. Não representa, isoladamente, venda ou reserva atual.

StatusUnidade nas 114 linhas: 64 Disponível, 34 Vendido, 16 Reservado. Estes são estados por proposta, não uma contagem do estoque: há várias propostas por unidade. Todas as 16 linhas Reservado têm prazo anterior a 08/09/2026; isso exige revisão, não liberação automática.

TagsEtapas são múltiplas e devem ser preservadas separadamente. Não converter automaticamente uma lista de tags em uma única etapa atual.

## Problemas de integridade

1. O cabeçalho do Histórico não contém Campo: D está intitulada De. O script U.log escreve nove valores na ordem Timestamp, PropostaID, Unidade, Campo, De, Para, Por, Motivo, Observação. Os dados de D confirmam Campo em todas as 583 linhas. A importação deve preservar a linha original e usar o layout efetivo; leitura cega pelo cabeçalho deslocaria os campos D:I.
2. A proposta PROP-20260409103941-463, unidade 202 A, tem FormID sem correspondência na aba de respostas. O FormRow é 65; uma linha numérica não prova identidade após exclusões/reordenações. Não associar dados de outro cliente por aproximação.
3. Há 48 eventos sem proposta correspondente; a ausência nesta exportação não comprova exclusão no sistema de origem.

## Unidade 2208 A

A proposta legada PROP-20251015181848-144 está Disponível na linha atual, mas Recebida (Pendente Correção) no campo de proposta, com tag Jurídico. Seu histórico contém venda, liberação e uma reserva posterior em 03/12/2025. Portanto o Excel não resolve sozinho a disponibilidade atual. Preservar separadamente o teste Q22ovBXKxVdn8r9BZi3h e conferir o vínculo operacional antes de liberar.

## Automações antigas e virada

O script antigo altera a Tabela de Vendas através de U.tvSetStatus. onFormSubmit cria reservas; onEdit e cronWatcher processam alterações; syncTVFromPropostasAll copia o estado da proposta mais recente por data; cronExpiracoes pode liberar unidades e enviar e-mails. A função setupTriggers instala onEdit, onFormSubmit e cronWatcher a cada minuto; o agendamento de cronExpiracoes está comentado. Isso descreve o código, não confirma quais gatilhos estão instalados.

Há também notificações ao comercial e ao jurídico. A substituição completa precisa decidir como essas notificações serão atendidas no novo fluxo, em vez de presumir que somente o cadastro de propostas basta.

Na virada, desativar as automações operacionais do projeto antigo de Solicitações e encerrar respostas no Forms. Preservar os gatilhos do projeto novo de Tabela de Vendas: sincronizarDiariamente e atualizarResumoDisponibilidade. AppSheet e acervo antigo ficam para conferência. Não executar setupTriggers do script antigo.

## Próxima conciliação

Ler os IDs de propostas, unidades e históricos no Firebase com acesso autorizado e comparar por PropostaID/FormID, incluindo dados de clientes, condições, datas e eventos. Produzir diferenças antes de importar. Nunca substituir status operacional atual pelo StatusUnidade de uma linha antiga. Importação deve ser repetível sem duplicar IDs/eventos e guardar origem, aba, linha e valores originais. A análise deste documento não confirma quantas propostas já estão no Firebase.
