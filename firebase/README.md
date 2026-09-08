# Testes de envio e reserva

Este pacote testa as regras locais e a transação de reserva no Firestore Emulator,
usando exclusivamente o projeto fictício `demo-citypark-reserva`. Não publica regras
nem envia propostas ao projeto real.

## Executar

Pré-requisitos: Node.js 20 ou superior, npm e Java JDK 21 no PATH.

```powershell
cd C:\dev\citypark-site\firebase
npm ci
npm test
```

As dependências ficam fixadas em `package-lock.json`. Nesta máquina, `node_modules`
reutiliza, por uma junção local ignorada pelo Git, a instalação da pasta
`C:\dev\CityPark_Diagnostico_Reserva\node_modules`. Em outro checkout, use `npm ci`.
O teste lê `firestore.rules` desta pasta diretamente. A pasta de diagnóstico antiga
não é a suíte atual: os testes e o comando reproduzível agora estão neste repositório.

`npm test` executa os cálculos, inicia o emulador em `127.0.0.1:8080`, executa os
cenários de reserva e encerra o emulador. No Windows, configura os sockets
temporários do Java somente no processo filho. Os resultados ficam em
`resultado-testes.txt`; a cobertura detalhada fica em `rule-coverage.json`.
Ambos são arquivos locais ignorados pelo Git. A primeira execução pode baixar o emulador.

Validação local em 7 de setembro de 2026: três testes de cálculo e 68 cenários de
reserva aprovados. O executor Node informa 69 testes na etapa do emulador porque
também conta o teste que agrupa os 68 cenários. A suíte inclui os 12 grupos ativos,
envios administrativos, campos inválidos, transações incompletas, reutilização de
históricos e disputa entre duas reservas para a mesma unidade.

## Contrato da transação

O envio mantém quatro escritas atômicas:

| Documento | Verificação principal |
| --- | --- |
| `propostas/{id}` | Corretor, disponibilidade anterior, preço vigente, formato, sinal, financiamento e soma total |
| `unidades/{unidadeId}` | Transição de disponível para reservada e vínculo com a proposta |
| `historico_unidades/{id}` | Grupos de parcelas 01 a 06 da proposta criada na mesma transação |
| `historico_propostas/{id}` | Grupos de parcelas 07 a 12 da mesma proposta |

Os dois históricos **iniciais** usam o ID da proposta. O formulário já foi ajustado
para isso. Os históricos posteriores de aprovação, recusa e demais ações continuam
usando IDs próprios. O formato financeiro e os limites comerciais permanecem iguais.

A criação da proposta exige os históricos novos, com as ações esperadas. Cada
histórico exige a proposta nova, o mesmo corretor e unidade, e timestamp do servidor.
Histórico ausente, reutilizado ou com parcelas inválidas reprova a transação inteira,
inclusive quando o remetente é administrador. Essa distribuição evita concentrar a
validação dos 12 grupos em uma única operação e ultrapassar o limite de expressões.

As comparações por tamanho de mapa são acompanhadas do acesso a todos os campos
obrigatórios: campo ausente é negado, e o tamanho exato rejeita campos extras.
Os testes negativos também falham se a recusa ocorrer por estouro de orçamento,
evitando confundir um erro de execução com uma validação comercial correta.

Continuam sendo quatro escritas por envio. As regras agora também consultam os
históricos relacionados; não se deve interpretar esta correção como redução de
leituras faturadas. Ela não muda a carga da tabela de vendas nem resolve sua
sincronização de status, que permanece uma etapa separada.

## Estado da publicação

Em 7 de setembro de 2026, as regras foram publicadas em `city-park-25e9c`, após
validação remota com `--dry-run`. A versão anterior foi salva localmente em
`.deployment-backups/`. A publicação do formulário ainda aguarda a definição do
destino: endereço de teste ou integração ao site principal. O GitHub Pages atual
publica `main`, que ainda não contém essa área de propostas.

Nenhum deploy faz parte de `npm test`. As regras e `js/formulario.js` precisam ser
publicados como uma alteração coordenada. Clientes antigos enviam históricos com
IDs aleatórios e serão recusados pelas novas regras.

Para o teste local autorizado, o formulário está com `BETA15D_DIAGNOSTIC_ONLY = false`.
Foi conferido que `configuracoes/comercial.modoEnvioTeste` já está `false`, com prazo
de reserva de sete dias. Nenhuma alteração desse documento foi necessária.
O preflight local não substitui
os testes das regras nem comprova que a versão publicada corresponde à versão local.

Para abrir o site local, execute `npm run preview` nesta pasta e acesse
`http://127.0.0.1:5500/vendas.html`. Entre com a conta do City Park, escolha a unidade
e preencha a proposta. Esse servidor escuta somente no computador local e não
expõe a pasta do Git, as cópias de regras ou os arquivos de diagnóstico. O formulário
local usa o Firebase real: confirmar o envio cria uma proposta e reserva a unidade.

Os testes verificam fixtures locais e não comprovam os dados, usuários ou regras
atualmente publicados. A autorização administrativa para editar propostas existentes
foi mantida; o objetivo desta mudança é o contrato de criação e reserva.
