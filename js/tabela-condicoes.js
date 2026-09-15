import { loadCommercialTable } from './tabela-comercial.js';

document.addEventListener("DOMContentLoaded", loadPublishedQuantities);

async function loadPublishedQuantities() {
  try {
    const data = await loadCommercialTable();
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
