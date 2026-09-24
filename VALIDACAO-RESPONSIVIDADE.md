# Responsividade — 24/09/2026

Correções locais de index.html, vendas.html e tabela.html. Não houve publicação,
merge, alteração de regras Firebase ou escrita de dados comerciais.

## Implementação

- Inicial: Folder.jpg como fallback real (o antigo hero-poster.jpg não existe).
  O vídeo do hero também toca no celular até 768px; sua proporção 1920:1012 e
  contain preservam o quadro inteiro. Com movimento reduzido, a imagem mantém
  a proporção original 2:1 e usa contain.
  A imagem permanece disponível se a reprodução falhar ou JavaScript estiver
  desabilitado. Removida a troca periódica do mesmo fundo.
- Não foi encontrada uma composição dedicada de banner mobile. A arte horizontal
  existente mostra logo e fachada completos; seus textos incorporados ficam pequenos.
  Uma versão específica só será necessária caso se queira ampliar esses textos.
- Removido o acúmulo de margem/padding antes de TORRE LIBERTY; grade da ficha
  usa colunas flexíveis, sem deslocamento horizontal. Cabeçalho de lazer pode
  quebrar linha e o rodapé limita a logo à largura disponível.
- Vendas: logo, conta e menu na primeira linha mobile; links existentes movidos
  para uma navegação expansível, mantendo IDs e atributos de permissão.
  Saudação limitada com reticências. Botão de filtros próximo ao título no celular;
  no desktop, somente o ícone na navbar, antes de Tabela Resumo. Campos em 1/2/4 colunas.
  Eliminado o handler duplicado dos filtros, mantendo o controle em vendas.js.
  Cartões flexíveis com ações empilháveis; cadastro e popups com rolagem interna.
- Tabela: largura mínima de 1180px apenas em tela, rolagem na .table-area,
  aviso de deslize, valores monetários sem quebra e navegação acessível por teclado.
  As nove colunas continuam presentes. Estilos de impressão independentes do
  mínimo de tela, em A4 retrato, com logos, cabeçalho, data e nota de financiamento.
- Tema: ocultação de .nav-links restrita à página com menu alternativo. Removido
  overflow-x:hidden global; recortes dos carrosséis e do menu lateral preservados.

## Evidências e testes

Navegador integrado do Codex (Chromium), larguras 320, 375, 390, 768, 1024 e
1440px. Alturas 812/900px e teste adicional em 320 × 480px.

| Verificação | Resultado |
| --- | --- |
| Largura total da inicial | Sem overflow nas seis larguras |
| Vendas, quatro perfis × seis larguras | Sem overflow nas 24 combinações |
| Tabela, seis larguras, 389 unidades | Página sem overflow; tabela com rolagem própria |
| Cabeçalhos e células da tabela | Nenhum scrollWidth maior que clientWidth; sem sobreposição |
| Maior preço disponível exibido na consulta | R$ 1.825.467,38; cabe na coluna |
| Visitante e pendente | Só Início no menu; nenhum VER |
| Corretor aprovado | Tabela resumida, Material digital e Início; VER disponível |
| Administrador aprovado | Mesmos links e Administração |
| Nome longo | Saudação com reticências sem alargar cabeçalho |
| Menu de vendas | Abre/fecha, Escape e retorno de foco; desktop visível ao redimensionar |
| Menu da inicial | Abre/fecha; seleção de âncora fecha o menu |
| Lazer e plantas | Troca de aba, avanço dos carrosséis, abertura/navegação/fechamento de modais |
| Filtros | Unidade, status e tipologia funcionam; Loft + Disponível retornou 9 unidades |
| Condições e planta | VER, rolagem do popup, planta e tela cheia funcionam |
| Login e cadastro | Abertura/troca/fechamento e campos/botões alcançáveis em 320 × 480px |
| Movimento reduzido | Preferência simulada: vídeo oculto e sem src carregado; fallback visível |
| Vídeo do hero | Evento playing confirmado em 320, 375 e 1440px; sem overflow no celular |
| Impressão (estilos) | Nove colunas em 733px úteis de A4, sem overflow em 389 linhas; logos, data e nota presentes |
| Testes Node existentes | 5 aprovados (vendas-preco e tabela-comercial) |
| Sintaxe | node --check dos três scripts de UI alterados e do servidor de teste aprovado |

O overflow original do cabeçalho foi reproduzido: seus controles chegavam até
530px em viewport de 375px com administrador simulado. Não foram encontrados
outros elementos causadores de corte lateral na página de vendas após os ajustes.

## Limitações e achado preexistente

- Os perfis foram simulados pelo servidor de teste; auth.js e guard-aprovado.js
  executaram suas condições originais. Não foram feitos login, cadastro ou logout
  reais. Os dados públicos de preços/disponibilidade foram lidos, sem escrita.
- O botão Imprimir / Salvar PDF foi acionado, mas a API do navegador integrado
  não expôs a janela de impressão. A validação cobriu os estilos de impressão
  aplicados na largura útil de A4; não comprova a paginação nem um PDF efetivamente
  salvo. Conferir a prévia de impressão final em Chrome/Edge antes de publicar.
- O iframe do vídeo incorporado foi verificado quanto ao tamanho e ausência de
  overflow. Reprodução de YouTube e gestos em aparelho físico não foram validados.
- O filtro de valor máximo tem um problema anterior à tarefa: initFiltrosForm
  remove pontos de item.preco mesmo quando ele já é numérico. Assim, 1383816.61
  vira 138381661 na comparação. Isso foi confirmado no HEAD anterior e mantido
  fora desta correção de layout. Não declarar esse filtro como validado.

## Reproduzir

```powershell
node firebase/local-preview.mjs
# http://127.0.0.1:5500/index.html — arquivos reais

node tests/responsive-preview.mjs
# http://127.0.0.1:5501/vendas.html?role=visitor
# http://127.0.0.1:5501/vendas.html?role=pending
# http://127.0.0.1:5501/vendas.html?role=approved
# http://127.0.0.1:5501/vendas.html?role=admin
# http://127.0.0.1:5501/tabela.html?role=approved
# http://127.0.0.1:5501/tabela.html?role=approved&print=1
# http://127.0.0.1:5501/index.html?motion=reduce

node --test tests/vendas-preco.test.cjs tests/tabela-comercial.test.cjs
```

O servidor de teste altera apenas respostas HTTP locais, mantém leituras públicas
originais e bloqueia funções de escrita de conta. Os parâmetros de simulação não
têm efeito no site normal. Ele não deve ser usado como servidor de produção.

Capturas locais em tests/artifacts/responsive/ (ignoradas pelo Git):
index-375.png, index-1440.png, vendas-375.png, vendas-1440.png,
vendas-menu-375.png, vendas-filtros-375.png, cadastro-320.png,
tabela-375.png e tabela-print-css.png.

## Arquivos alterados ou adicionados

index.html, vendas.html, tabela.html, css/index.css, css/vendas.css,
css/theme.css, js/index.js, js/vendas.js, js/vendas-ui.js,
tests/responsive-preview.mjs e este relatório.
