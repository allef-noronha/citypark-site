# Atualização City Park — Firestore, formulário interno e painel

Base utilizada: repositório oficial `allef-noronha/citypark-site`, branch `main`.

Este pacote contém somente arquivos novos ou alterados. As pastas de imagens, vídeos, PDFs e as demais páginas do site oficial devem ser preservadas.

## O que esta atualização faz

- Passa `vendas.html` e `tabela.html` a ler a coleção `unidades` do Firestore.
- Substitui o Google Forms pelo formulário interno `formulario.html`.
- Preserva a unidade selecionada mesmo quando o servidor usa URLs sem `.html`.
- Cria proposta e reserva a unidade em uma única transação do Firestore.
- Registra os eventos em `historico_propostas` e `historico_unidades`.
- Adiciona o painel `painel-admin.html` para a conta presente em `admins/{UID}`.
- Reconstrói o painel administrativo conforme as telas aprovadas: quatro colunas com rolagem independente, faixas de status, filtros e cartões expansíveis.
- Reúne os antigos históricos de unidade e proposta no **Gerenciador de Unidade**, com agrupamento mensal e linha do tempo por proposta.
- Permite ao administrador registrar comentários privados, marcar a etapa Jurídico, aprovar, vender, recusar, cancelar e registrar distrato com motivo obrigatório.
- Permite iniciar uma proposta pelo painel, selecionando um corretor aprovado antes de preencher os dados do cliente e da condição comercial.
- Ajusta o corpo do painel para o enquadramento branco e compacto aprovado como referência.
- Refina o card **Unidades**: filtro inicial em disponíveis, busca permanente, expansão de uma unidade por vez, rolagem própria e acesso ao formulário pelo botão ou pelo arraste até **Propostas Abertas**.
- Unifica a header do painel com a identidade visual de `formulario.html`: fundo azul City Park, logotipo branco e botão contornado.
- Mantém o painel em fundo branco fullscreen e destaca cada coluna em um módulo cinza independente.
- Adota layout responsivo sem rolagem horizontal global: quatro colunas no desktop, duas no tablet e uma no celular.
- Exibe o atalho do painel apenas quando `ativo == true` e `tipo == "admin"`.
- Mantém o cadastro e a aprovação dos corretores pela coleção `corretores`.

## Arquivos alterados

- `vendas.html`
- `tabela.html`
- `js/auth.js`
- `js/vendas.js`
- `js/tabela.js`
- `js/tour.js` — correção de sintaxe em arquivo legado não carregado pelo site.

## Arquivos novos

- `formulario.html`
- `painel-admin.html`
- `css/formulario.css`
- `css/admin.css`
- `js/formulario.js`
- `js/admin.js`
- `firestore.rules` — inclui a permissão limitada para um administrador ativo criar proposta em nome de um corretor aprovado.

## Aplicação segura

1. Criar uma branch a partir da versão atualmente publicada.
2. Extrair este pacote na raiz do repositório, mantendo as pastas.
3. Não apagar `img/`, `media/`, `files/`, `config/` nem os demais arquivos existentes.
4. Abrir o site localmente por um servidor HTTP; não abrir os HTML diretamente por `file://`.
5. Conferir a tabela pública, login de corretor aprovado, tabela-resumo e login administrativo.
6. Antes de testar **Nova proposta** pelo painel, revisar e publicar a nova versão de `firestore.rules`. A mudança não altera as permissões de corretores; apenas autoriza um admin ativo a criar uma proposta vinculada a um corretor aprovado.
7. Acessar `painel-admin.html` com a conta administrativa e conferir:
   - rolagem própria em cada uma das quatro colunas;
   - busca e filtros de unidades;
   - detalhes, comentários e tags das propostas;
   - navegação do Gerenciador de Unidade até a linha do tempo da proposta.
8. Não confirmar aprovação, venda, recusa ou distrato em produção durante o teste visual. Esses botões alteram os documentos reais em transações do Firestore.
9. Para testar **Nova proposta**, escolher previamente uma unidade disponível que possa ser devolvida ao estado anterior pelo próprio painel.
10. Publicar o site somente depois da conferência visual e funcional.

## Etapa complementar

O formulário já grava `expiraEm` sete dias após o envio. A liberação totalmente automática de reservas vencidas requer uma rotina segura no servidor, como uma função agendada do Firebase. Essa rotina não está incluída neste pacote de front-end e deve ser implantada separadamente antes de considerar a expiração automática concluída.
