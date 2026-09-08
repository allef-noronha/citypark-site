// Acrescentar ao mesmo projeto Apps Script de Code.gs.
// Esta rotina lê somente unidade/status. Nunca grava em unidades ou propostas.
function chaveDisponibilidade_(value) {
  return String(value || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function lerDisponibilidadeFirebase_() {
  const response = UrlFetchApp.fetch(
    `https://firestore.googleapis.com/v1/${FIRESTORE_DOCUMENT_BASE}:runQuery`, {
      method: 'post', contentType: 'application/json',
      headers: { Authorization: `Bearer ${ScriptApp.getOAuthToken()}` },
      payload: JSON.stringify({ structuredQuery: {
        from: [{ collectionId: 'unidades' }],
        select: { fields: [{ fieldPath: 'unidade' }, { fieldPath: 'status' }, { fieldPath: 'destinacao' }] }
      } }), muteHttpExceptions: true
    });
  if (response.getResponseCode() !== 200) throw new Error(`Consulta de disponibilidade falhou: ${response.getContentText()}`);
  const entries = JSON.parse(response.getContentText());
  if (!Array.isArray(entries)) throw new Error('Resposta de disponibilidade inválida.');
  const result = {};
  entries.forEach(entry => {
    if (entry.error) throw new Error(JSON.stringify(entry.error));
    if (!entry.document) return;
    const fields = entry.document.fields || {};
    const id = chaveDisponibilidade_(fields.unidade?.stringValue || entry.document.name.split('/').pop());
    if (!id || Object.prototype.hasOwnProperty.call(result, id)) throw new Error(`Identificação de unidade ambígua: ${id}`);
    const destination = fields.destinacao?.stringValue;
    result[id] = destination && destination !== 'venda' && destination !== 'nao_classificada' ? 'bloqueada' : fields.status?.stringValue || '';
  });
  if (!Object.keys(result).length) throw new Error('Nenhuma unidade retornada; planilha preservada.');
  return result;
}

function atualizarDisponibilidadeSheets_() {
  const statuses = lerDisponibilidadeFirebase_();
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName('Tabela de Vendas');
  if (!sheet) throw new Error('Aba Tabela de Vendas não encontrada.');
  const values = sheet.getDataRange().getValues();
  const headers = values[0].map(value => String(value).trim().toUpperCase());
  const unitColumn = headers.indexOf('UNIDADE');
  const statusColumn = headers.indexOf('STATUS');
  if (unitColumn < 0 || statusColumn < 0 || values.length < 2) throw new Error('Tabela sem UNIDADE, STATUS ou linhas.');
  const target = sheet.getRange(2, statusColumn + 1, values.length - 1, 1);
  if (target.getFormulas().some(row => row[0])) throw new Error('STATUS contém fórmulas. Defina uma coluna STATUS editável antes de sincronizar.');
  const labels = { disponivel: 'Disponível', reservada: 'Reservado', aprovada: 'Reservado', vendida: 'Vendido', bloqueada: 'Indisponível' };
  const missing = [];
  const seen = new Set();
  const output = values.slice(1).map(row => {
    const key = chaveDisponibilidade_(row[unitColumn]);
    if (!key) return [row[statusColumn]];
    if (seen.has(key)) throw new Error(`Unidade duplicada na planilha: ${row[unitColumn]}`);
    seen.add(key);
    const label = labels[statuses[key]];
    if (!label) missing.push(String(row[unitColumn]));
    return [label || 'A confirmar'];
  });
  // Única coluna alterada; preços, fórmulas financeiras e condições permanecem intactos.
  target.setValues(output);
  SpreadsheetApp.flush();
  return { unidades: seen.size, semStatusConfirmado: missing, atualizadoEm: new Date().toISOString() };
}

function atualizarDisponibilidadeSheets() {
  return executarSincronizacao_({ disponibilidade: atualizarDisponibilidadeSheets_ });
}

function sincronizarDiariamente() {
  return executarSincronizacao_({ precos: publicarTodasUnidadesFirebaseTeste, disponibilidade: atualizarDisponibilidadeSheets_ });
}

function executarSincronizacao_(jobs) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) throw new Error('Já existe uma sincronização em execução.');
  const report = { iniciadoEm: new Date().toISOString() };
  const errors = [];
  try {
    Object.entries(jobs).forEach(([name, job]) => {
      try { report[name] = { sucesso: true, resultado: job() }; }
      catch (error) { report[name] = { sucesso: false, erro: String(error.message || error) }; errors.push(name); }
    });
    report.concluidoEm = new Date().toISOString();
    PropertiesService.getScriptProperties().setProperty('ultimaSincronizacao', JSON.stringify(report));
    console.log(JSON.stringify(report));
    if (errors.length) throw new Error(`Falha em: ${errors.join(', ')}. Consulte ultimaSincronizacao e o registro de execução.`);
    return report;
  } finally { lock.releaseLock(); }
}

function instalarGatilhoDiario() {
  const handler = 'sincronizarDiariamente';
  if (ScriptApp.getProjectTriggers().some(trigger => trigger.getHandlerFunction() === handler)) {
    console.log('Gatilho diário já existe para esta conta.');
    return;
  }
  ScriptApp.newTrigger(handler).timeBased().atHour(2).everyDays(1).inTimezone('America/Sao_Paulo').create();
}

// Plano gratuito: resumo público periódico; não requer Cloud Functions ou gcloud.
function atualizarResumoDisponibilidade() {
  return executarSincronizacao_({ resumoPublico: publicarResumoDisponibilidade_ });
}

function publicarResumoDisponibilidade_() {
  const statuses = lerDisponibilidadeFirebase_();
  const units = {};
  Object.entries(statuses).forEach(([id, value]) => {
    units[id] = ['disponivel', 'reservada', 'aprovada', 'vendida', 'bloqueada'].includes(value) ? value : 'desconhecida';
  });
  const now = new Date();
  executarBatchWrites_([buildFirestoreWrite_('disponibilidade_publica/atual', {
    schemaVersao: 1, unidades: units, atualizadoEm: now,
    validoAte: new Date(now.getTime() + 75 * 60 * 1000),
    fonte: 'apps-script-periodico'
  })]);
  return { unidades: Object.keys(units).length, atualizadoEm: now.toISOString() };
}

function instalarGatilhoDisponibilidade() {
  const handler = 'atualizarResumoDisponibilidade';
  if (ScriptApp.getProjectTriggers().some(trigger => trigger.getHandlerFunction() === handler)) {
    console.log('Gatilho de disponibilidade já existe para esta conta.');
    return;
  }
  ScriptApp.newTrigger(handler).timeBased().everyMinutes(30).create();
}
