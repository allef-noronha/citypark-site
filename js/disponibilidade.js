import { db } from './firebase.js';
import { collection, query, where, doc, onSnapshot } from 'https://www.gstatic.com/firebasejs/10.12.1/firebase-firestore.js';

export function unitKey(value) {
  return String(value || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function publicStatus(value) {
  return { disponivel: 'Disponível', reservada: 'Reservado', aprovada: 'Reservado', vendida: 'Vendido', bloqueada: 'Indisponível' }[value] || 'A confirmar';
}

// Reservas operacionais têm precedência sobre qualquer resumo periódico.
export function watchAvailability(onChange) {
  let expiryTimer;
  let summary = {}, reservations = {}, reservationsReady = false;
  const emit = () => onChange(reservationsReady ? { ...summary, ...reservations } : {});
  const stopReservations = onSnapshot(query(collection(db, 'unidades'), where('status', 'in', ['reservada', 'aprovada'])), { includeMetadataChanges: true }, snapshot => {
    reservationsReady = !snapshot.metadata.fromCache;
    reservations = {};
    snapshot.docs.forEach(item => {
      const unit = item.data();
      reservations[unitKey(unit.unidade || item.id)] = unit.destinacao && unit.destinacao !== 'venda' ? 'bloqueada' : unit.status;
    });
    emit();
  }, error => { console.error('[disponibilidade] reservas:', error); reservationsReady = false; emit(); });
  const stop = onSnapshot(doc(db, 'disponibilidade_publica', 'atual'), { includeMetadataChanges: true }, snapshot => {
    clearTimeout(expiryTimer);
    const data = snapshot.exists() && !snapshot.metadata.fromCache ? snapshot.data() : null;
    const expires = data?.validoAte?.toMillis?.();
    if (data?.fonte === 'apps-script-periodico') {
      if (!Number.isFinite(expires) || expires <= Date.now()) { summary = {}; emit(); return; }
      expiryTimer = setTimeout(() => { summary = {}; emit(); }, expires - Date.now());
    }
    summary = data?.schemaVersao === 1 ? data.unidades || {} : {};
    emit();
  }, error => {
    clearTimeout(expiryTimer);
    console.error('[disponibilidade] consulta:', error);
    summary = {}; emit();
  });
  return () => { clearTimeout(expiryTimer); stop(); stopReservations(); };
}
