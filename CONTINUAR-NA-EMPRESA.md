# Continuação na empresa

Repositório: https://github.com/allef-noronha/citypark-site

Branch de trabalho: `codex/comercial-firebase-20260907`.

## Preparar o computador

```powershell
git clone --branch codex/comercial-firebase-20260907 https://github.com/allef-noronha/citypark-site.git
cd citypark-site
cd firebase
npm ci
npm run preview
```

Abra `http://127.0.0.1:5500/vendas.html` e entre com sua conta administrativa. O servidor também pode ser iniciado pelo Live Server do VS Code. Para o preview, use Node.js 20 ou superior; para os testes do emulador, instale também Java JDK 21. Execute `npm test` na pasta `firebase`.

Credenciais, dependências instaladas, caches, arquivos de diagnóstico e capturas de testes não são transportados pelo Git. Autentique-se no Firebase/GitHub nesse computador quando necessário. Para os testes de navegador, consulte `REVISAO-COMERCIAL.md` (Playwright e Edge).

## Estado salvo

- Envio de proposta e reserva atômica validados. As regras já foram publicadas no projeto `city-park-25e9c`.
- Interface comercial integrada do repositório do estagiário, mantendo o formulário e os cálculos atuais.
- Configurações comerciais com o mesmo padrão visual.
- Listagem paginada, agregações de contagem e índice de status/data já ativo no Firebase.
- Aprovação, recusa e etapas comerciais com verificação do vínculo e históricos.
- Contraproposta é uma simulação local para impressão/PDF, sem aceitar/recusar e sem substituir a proposta.
- Edição da proposta salva a condição financeira, preserva a original e registra a versão anterior; inclui proteção contra edição concorrente.
- Subtotais nas tabelas de proposta e contraproposta.
- Alterações locais preexistentes de `js/vendas.js` e a cópia `js/vendas-backup.js` também foram preservadas neste checkpoint.
- O site público não foi atualizado: esta branch é para continuar o desenvolvimento.

## Próxima tarefa

Integrar a disponibilidade da tabela de vendas com o Firebase. Atualmente `js/vendas.js` carrega a tabela pelo Web App da planilha e usa cache local; a função que traduz status ainda não garante que o status operacional do Firestore chegue aos cards.

Manter três estados públicos:

| Firebase | Site |
| --- | --- |
| `disponivel` | Disponível |
| `reservada` ou `aprovada` | Reservado |
| `vendida` | Vendido |

Separar preços/condições vindos da tabela comercial da disponibilidade operacional, sem voltar a ler centenas de documentos desnecessariamente em cada visita. Verificar atualização após reserva, aprovação, recusa e venda; filtros, cores, cache e bloqueio de envio precisam usar o status correto.

## Situação do teste real

O usuário concluiu as etapas da proposta fictícia de John Doe, unidade `2208-A`, proposta `Q22ovBXKxVdn8r9BZi3h`. Nas últimas imagens enviadas, proposta e unidade estão vendidas e o histórico registra a conclusão. Não liberar nem excluir automaticamente esse registro: decidir com o usuário como encerrar o teste antes da publicação.

O formulário local está habilitado para envio real; abrir no localhost não isola o banco. Não ativar ou desativar configurações comerciais de produção como parte da instalação.

Leia `REVISAO-COMERCIAL.md` começando pelo fluxo vigente no início do documento. As seções posteriores preservam a evolução da implementação e incluem decisões que foram substituídas.
