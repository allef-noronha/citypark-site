import { runTransaction as nativeTransaction, doc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.12.1/firebase-firestore.js';

// A projeção pública é gravada na mesma transação que a unidade, sem leitura
// adicional do resumo. Alterações em unidades diferentes atualizam campos distintos.
export function wrapInventoryTransaction(tx, db) {
  const units = new Map();
  return {
    async get(ref) {
      const snapshot = await tx.get(ref);
      if (ref.parent.id === 'unidades' && snapshot.exists()) units.set(ref.id, snapshot.data());
      return snapshot;
    },
    set(...args) { tx.set(...args); },
    delete(...args) { tx.delete(...args); },
    update(ref, changes) {
      if (ref.parent.id === 'unidades') {
        if (!units.has(ref.id)) throw new Error('Leia a unidade antes de alterar o estoque.');
        const unit = { ...units.get(ref.id), ...changes };
        const status = ['administracao', 'permuta'].includes(unit.destinacao) ? 'vendida' : unit.status;
        tx.update(doc(db, 'disponibilidade_publica', 'estoque'), {
          [`unidades.${ref.id}`]: { unidade: unit.unidade || ref.id, status },
          ultimaUnidade: ref.id, atualizadoEm: serverTimestamp()
        });
        units.set(ref.id, unit);
      }
      tx.update(ref, changes);
    }
  };
}

export function runTransaction(db, callback, options) {
  return nativeTransaction(db, tx => callback(wrapInventoryTransaction(tx, db)), options);
}
