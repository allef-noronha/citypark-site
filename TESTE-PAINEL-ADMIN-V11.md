# Teste do Gerenciador de Corretores — Painel Administrativo v11

Esta versão adiciona o Gerenciador de Corretores ao painel. O Firestore de produção é apenas lido ao abrir a página; aprovar, ignorar ou devolver um cadastro para pendentes realiza uma gravação real na coleção `corretores`.

## Preparação

1. Extraia o pacote v11 sobre a mesma cópia completa do City Park.
2. Substitua os arquivos existentes quando solicitado.
3. Reinicie o servidor local e atualize o navegador com `Ctrl + F5`.
4. Entre com a conta administrativa.

## Testes apenas de leitura

1. Role até a parte inferior do painel.
2. Confirme que o Gerenciador de Unidade aparece à esquerda e o Gerenciador de Corretores à direita.
3. Confirme que o filtro inicial do Gerenciador de Corretores é `Pendentes`.
4. Pesquise por nome, CPF, CRECI, telefone, e-mail e imobiliária.
5. Alterne entre `Pendentes`, `Ignorados`, `Aprovados` e `Todos`.
6. Selecione um corretor e confira:
   - nome;
   - CPF;
   - CRECI;
   - telefone;
   - e-mail;
   - imobiliária;
   - data de cadastro;
   - situação da revisão.
7. Clique em `Consultar no CRECI-AL` e confirme que o site oficial abre em outra aba.
8. Use a seta de retorno para voltar à lista.
9. Reduza a janela:
   - no desktop largo, os dois gerenciadores devem ficar lado a lado;
   - no tablet e no celular, devem ficar empilhados;
   - nenhum conteúdo deve criar rolagem horizontal na página.

## Teste controlado de gravação

Execute esta parte somente depois de escolher um cadastro real para a validação.

### Aprovar

1. Abra um cadastro pendente cujo CRECI já foi validado.
2. Clique em `Aprovar corretor`.
3. Revise o resumo da confirmação.
4. Confirme a operação.
5. O cadastro deve desaparecer de `Pendentes` e aparecer em `Aprovados`.
6. No Firestore, o documento deve manter os dados originais e receber:
   - `aprovado: true`;
   - `statusRevisao: "aprovado"`;
   - `revisadoEm`;
   - `revisadoPor`;
   - `aprovadoEm`;
   - `aprovadoPor`.

### Ignorar

1. Abra outro cadastro pendente que não será aprovado.
2. Clique em `Ignorar cadastro`.
3. Confirme a operação.
4. O cadastro deve desaparecer de `Pendentes` e aparecer em `Ignorados`.
5. No Firestore, o documento deve permanecer com:
   - `aprovado: false`;
   - `statusRevisao: "ignorado"`;
   - `revisadoEm`;
   - `revisadoPor`;
   - `ignoradoEm`;
   - `ignoradoPor`.

### Desfazer “Ignorar”

1. No filtro `Ignorados`, abra o cadastro usado no teste.
2. Clique em `Voltar para pendentes`.
3. Confirme a operação.
4. O cadastro deve voltar para `Pendentes`, continuar com `aprovado: false` e receber `statusRevisao: "pendente"`.

## Segurança

- O recurso não exclui documentos da coleção `corretores`.
- O recurso não altera usuários no Firebase Authentication.
- Um corretor não pode alterar a própria aprovação.
- As regras atuais já permitem que somente um administrador ativo execute essas atualizações.
