# City Park (versão modular)

## Como configurar rapidamente
1. **Suba os arquivos** mantendo a estrutura de pastas `css/`, `js/`, `img/`.
2. **Firebase**: edite `js/firebase.js` e cole suas chaves em `firebaseConfig`.
3. **Planilha**: crie um Apps Script Web App que leia a aba `Tabela de Vendas` e retorne JSON. Cole a URL em `js/vendas.js > CONFIG.webAppURL`.
4. **Google Forms**: ajuste `CONFIG.formsBase` e os `entry.xxxxxx` em `CONFIG.formMap` para pré-preencher unidade e dados do corretor.
5. **Regras Firestore**: aplique as rules conforme indicado no review (bloqueando updates em `aprovado` pelo usuário final).

## Dicas
- Marque botões/áreas que exigem corretor **aprovado** com o atributo `data-require-approved`.
- `auth.js` expõe `window.corretorPodePropor()` e `window.dadosCorretor()`.
- Se preferir manter GViz por enquanto, mude `CONFIG.dataSource` para `"gviz"`.
