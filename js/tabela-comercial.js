import { db } from './firebase.js';
import { doc, getDocFromServer } from 'https://www.gstatic.com/firebasejs/10.12.1/firebase-firestore.js';
const KEY = 'citypark:tabela-consolidada:v1';
let pending;
export function loadCommercialTable() {
  if (!pending) pending = readTable().catch(error => { pending = null; throw error; });
  return pending;
}
function valid(data) {
  return data?.schemaVersao === 1 && Array.isArray(data.unidades) && data.unidades.length > 0 && data.quantidades && data.versaoTabela;
}
async function readTable() {
  try {
    const cached = JSON.parse(sessionStorage.getItem(KEY));
    const age = Date.now() - cached.savedAt;
    if (age >= 0 && age < 120000 && valid(cached.data)) return cached.data;
  } catch {}
  const snap = await getDocFromServer(doc(db, 'tabela_comercial', 'atual'));
  const data = snap.exists() ? snap.data() : null;
  if (!valid(data)) throw new Error('Tabela comercial consolidada ainda não publicada.');
  data.atualizadoEm = data.atualizadoEm?.toDate?.().toISOString() || data.atualizadoEm;
  try { sessionStorage.setItem(KEY, JSON.stringify({ savedAt: Date.now(), data })); } catch {}
  return data;
}
export function commercialRows(data) {
  return data.unidades.map(u => ({
    UNIDADE: u.unidade, TIPOLOGIA: u.tipologia, 'ÁREA': u.areaM2,
    'PREÇO À VISTA': u.precoVista, SINAL: u.sinal, 'PARCELA MENSAL': u.parcelaMensal,
    INTERCALADA: u.intercalada, CHAVES: u.chaves, IMAGEM: u.imagem
  }));
}
