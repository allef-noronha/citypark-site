import { db } from "./firebase.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.1/firebase-firestore.js";

document.addEventListener("DOMContentLoaded", loadPublishedQuantities);

async function loadPublishedQuantities() {
  try {
    const data = await readCondition();
    const monthly = Number(data?.quantidades?.mensais ?? data?.parcelasMensais);
    const intercaladas = Number(data?.quantidades?.intercaladas ?? data?.intercaladas);

    document.querySelectorAll("th").forEach(th => {
      const text = th.textContent.replace(/\s+/g, " ").trim().toLowerCase();

      if (Number.isInteger(monthly) && /(parc|parcel).*mensais|mensais/.test(text)) {
        th.textContent = `${monthly} parc. mensais`;
      }

      if (Number.isInteger(intercaladas) && /(intercal|semestrais)/.test(text)) {
        th.textContent = `${intercaladas} intercal. semestrais`;
      }

      if (/chaves\s*\/?\s*financiamento/i.test(th.textContent)) {
        th.textContent = "Financiamento";
      }
    });

    console.info("[tabela] condição publicada aplicada aos cabeçalhos", { monthly, intercaladas });
  } catch (error) {
    console.warn("[tabela] cabeçalhos mantidos: não foi possível ler a condição publicada.", error);
  }
}

async function readCondition() {
  for (const [collectionName, documentId] of [
    ["site_conditions_test", "current"],
    ["site_conditions", "current"],
    ["condicoes_comerciais", "atual"]
  ]) {
    try {
      const snap = await getDoc(doc(db, collectionName, documentId));
      if (snap.exists()) return snap.data() || {};
    } catch (_) {}
  }
  throw new Error("Condição comercial publicada não encontrada.");
}
