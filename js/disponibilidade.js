import { db } from './firebase.js';
import { doc, onSnapshot } from 'https://www.gstatic.com/firebasejs/10.12.1/firebase-firestore.js';

export function unitKey(value) {
  return String(value || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function publicStatus(value) {
  return { disponivel: 'Disponível', reservada: 'Reservado', aprovada: 'Reservado', vendida: 'Vendido', bloqueada: 'Indisponível' }[value] || 'A confirmar';
}

// Um documento público mínimo, atualizado atomicamente com cada mudança.
export function watchAvailability(onChange) {
  return onSnapshot(doc(db, 'disponibilidade_publica', 'estoque'), { includeMetadataChanges: true }, snapshot => {
    const data = snapshot.exists() && !snapshot.metadata.fromCache ? snapshot.data() : null;
    const units = {};
    if (data?.schemaVersao === 2) {
      Object.entries(data.unidades || {}).forEach(([id, unit]) => {
        units[unitKey(unit.unidade || id)] = unit.status;
      });
    }
    onChange(units);
  }, error => { console.error('[disponibilidade]', error); onChange({}); });
}
