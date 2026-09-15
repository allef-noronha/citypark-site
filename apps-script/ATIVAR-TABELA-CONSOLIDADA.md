# Ativação da tabela consolidada

1. Substituir o código do Apps Script pelo conteúdo de `script_sheets_completo.txt` e salvar.
2. Executar `publicarTodasUnidadesFirebaseTeste` uma vez. Conferir execução concluída e a criação de `tabela_comercial/atual`, com `unidades`, `quantidades` e `atualizadoEm`.
3. Publicar as regras: `firebase deploy --only firestore:rules --project city-park-25e9c`.
4. Somente após essas etapas, publicar as novas páginas e os módulos JavaScript.

O gatilho existente `sincronizarDiariamente`, configurado para a faixa das 2h em São Paulo, passa a publicar também o documento consolidado. Não é necessário criar outro gatilho. A execução manual inicial evita esperar a próxima madrugada.

As páginas vendas.html e tabela.html deixam de consultar o Web App. Preços e quantidades vêm juntos de um documento, com cache de sessão de dois minutos entre páginas. Status continuam no documento de disponibilidade atualizado em tempo real. Não há recuperação de preços antigos quando o cache vence e a consulta falha.

Sem a publicação inicial ou as novas regras, as páginas novas exibem erro de carregamento; manter a versão atual no ar até concluir a preparação.
