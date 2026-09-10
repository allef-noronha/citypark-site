# Entrada em produção — análise de 10/09/2026

Atualização: os quatro pontos técnicos abaixo foram tratados localmente na revisão de disponibilidade atômica. Administração **e Permuta** agora são vendidas no público, preservando os filtros internos. Validação: 85 testes no emulador, 34 testes locais e testes de navegador desktop/mobile aprovados. A ativação real ainda depende da sequência em INTEGRACAO-DISPONIBILIDADE.md; os achados abaixo registram a situação anterior à correção.

Escopo: revisão do checkout 071fd1a e comparação prévia da branch do estagiário 6649fdf. Nenhuma publicação ou alteração de dados de produção nesta análise. O site institucional responde em https://www.cityparkmcz.com.br; isso não valida o novo fluxo comercial publicado.

## Bloqueios prioritários

1. **Consumo fixo:** apps-script/script_sheets_completo.txt lê as 389 unidades a cada 30 minutos: 18.672 leituras/dia, além dos acessos, preços, sincronização diária e console. O painel de propostas já pagina 25 registros e a visão geral usa agregações; evitar reescrever essas partes sem evidência. A tabela administrativa reinicia a escuta completa em loadUnits, inclusive em atualizações manuais.
2. **Regressão visual de status:** js/disponibilidade.js reconstrói a lista de reservas e a sobrepõe ao resumo. Ao passar de aprovada/reservada para vendida, a unidade desaparece dessa lista e volta ao status do resumo antigo, eventualmente disponível. A transação do formulário confere o estado atual e impede reservar uma vendida, mas a apresentação é incorreta. Não aumentar simplesmente o intervalo do resumo antes de corrigir isso.
3. **Administração:** publicar as nove unidades como Vendido, preservando destinação Administração e bloqueio internos. Não converter todo bloqueio em venda: a unidade de teste e outros bloqueios precisam continuar distintos. Hoje o Apps Script perde essa distinção ao transformar toda destinação não comercial em bloqueada.
4. **Leitura pública:** firebase/firestore.rules permite read irrestrito em unidades. Isso expõe todos os campos desses documentos, inclusive vínculos operacionais, e permite consultas completas fora da interface. Não foi demonstrada exposição de dados pessoais nesta análise. Projetar dados públicos mínimos e adaptar a escuta antes de restringir as regras para não interromper reservas em tempo real.

## Critérios para liberar o uso comercial

- Reserva confirmada aparece em outra sessão sem esperar o Sheets ou o resumo periódico.
- Duas tentativas concorrentes geram uma única proposta válida e seus históricos.
- Venda não retorna visualmente a disponível por causa de resumo antigo; falha de conexão apresenta estado não confirmado.
- Administração: nove unidades vendidas publicamente, bloqueadas internamente e excluídas do relatório apropriado.
- Conferir a 2208 A e invalidar somente o teste identificado, sem liberar automaticamente o estoque legado.
- Conferir estoque inicial com responsável comercial. A reconciliação com Sienge depende dos dados de referência; não foi executada.
- Confirmar regra operacional de vencimento: uma data expirada na tela não comprova liberação automática. Não liberar reservas antigas somente pela idade.
- Testar acesso de administrador, corretor aprovado e usuário sem permissão, inclusive documentos de outro corretor.
- Conferir regras e índices efetivamente publicados, domínios autorizados de login, gatilhos realmente instalados e versão do Apps Script. Código local não comprova configuração remota.
- Definir o corte do fluxo Forms/Sheets/AppSheet para não continuar recebendo propostas por duas origens operacionais.
- Publicar somente arquivos do site, com versão recuperável. Não enviar backups, exports, scripts de diagnóstico e arquivos locais ao diretório público.

## Estratégia de correção

Priorizar uma projeção pública mínima atualizada juntamente com as mudanças operacionais, com regras que validem consistência e testes de concorrência. Manter o resumo periódico como reconciliação, reduzindo sua frequência somente depois de o caminho imediato estar validado. A implementação deve cobrir reserva, aprovação, venda, recusa, cancelamento, distrato, ajuste e invalidação de teste. Não ativar Cloud Functions pagas para resolver isso sem rever a restrição de plano gratuito.

Depois: executar testes isolados, integrar as melhorias aproveitáveis do estagiário, validar em prévia e conferir a ativação no ambiente real. Gráficos, relatórios adicionais, marcação de andar e acabamento do PDF não bloqueiam esta primeira versão.

## Limites da análise

Validação executada nesta análise: 31 testes locais aprovados; 84 testes de regras e transações aprovados no emulador demo-citypark-reserva, incluindo reservas concorrentes; testes das quatro páginas comerciais em desktop/mobile aprovados com acesso ao Firebase interceptado. Esses testes não validam configuração nem dados de produção. O emulador precisou do Java disponível em .tools/jdk21 no PATH.

Estimativas de consumo são derivadas do código, não uma medição nova do projeto. Não foi consultada a coleção real de propostas nem alterada disponibilidade. A cota documentada é de 50 mil leituras/dia, compartilhada com outros consumidores: https://firebase.google.com/docs/firestore/pricing .
