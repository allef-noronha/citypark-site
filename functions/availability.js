const key = value => String(value || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
const status = value => ['disponivel', 'reservada', 'aprovada', 'vendida'].includes(value) ? value : 'desconhecida';

// Reler dentro da transação evita que eventos repetidos/fora de ordem restaurem estados antigos.
async function refreshUnit(db, unitId, timestamp) {
  const unitRef = db.doc(`unidades/${unitId}`);
  const summaryRef = db.doc('disponibilidade_publica/atual');
  await db.runTransaction(async tx => {
    const [unit, summary] = await Promise.all([tx.get(unitRef), tx.get(summaryRef)]);
    const data = unit.exists ? unit.data() : null;
    const units = { ...(summary.exists ? summary.data().unidades : {}) };
    const sources = { ...(summary.exists ? summary.data().fontes : {}) };
    // IDs operacionais são usados internamente para remover renomeações e detectar colisões.
    for (const [name, id] of Object.entries(sources)) {
      if (id === unitId) { delete sources[name]; delete units[name]; }
    }
    if (data) {
      const name = key(data.unidade || unitId);
      if (!name) throw new Error('Unidade sem identificação pública');
      if (sources[name] && sources[name] !== unitId) throw new Error(`Unidade duplicada: ${name}`);
      sources[name] = unitId;
      units[name] = status(data.status);
    }
    tx.set(summaryRef, { schemaVersao: 1, unidades: units, fontes: sources, atualizadoEm: timestamp() });
  });
}
module.exports = { key, status, refreshUnit };
