(function (root, factory) {
  const api = factory();

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }

  root.CityParkPaymentPlan = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  // Mantidos temporariamente apenas para compatibilidade com telas legadas.
  // O novo fluxo NÃO usa esses números para montar propostas.
  const MONTHLY_INSTALLMENTS = 40;
  const SEMIANNUAL_INSTALLMENTS = 6;
  const MAX_PAYMENT_GROUPS = 12;

  const DEFAULT_COMMERCIAL_CONFIG = Object.freeze({
    descontoMaximoPercentual: 15,
    alertaChavesPercentual: 60,
    diasVencimento: [15, 30],
    limites: {
      mensal: "2029-12",
      semestral: "2029-09",
      anual: "2029-09",
      outra: "2029-09"
    }
  });

  function currencyToCents(value) {
    if (typeof value === "number") {
      return Number.isFinite(value) ? Math.round(value * 100) : null;
    }

    const text = String(value ?? "").trim();
    if (!text || text === "-") return null;

    const withoutCurrency = text.replace(/R\$|\s/g, "");
    const normalized = withoutCurrency.includes(",")
      ? withoutCurrency.replace(/\./g, "").replace(",", ".")
      : withoutCurrency;
    const amount = Number(normalized.replace(/[^\d.-]/g, ""));

    return Number.isFinite(amount) ? Math.round(amount * 100) : null;
  }

  function formatMoney(cents) {
    return (Number(cents || 0) / 100).toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL"
    });
  }

  function formatOriginal(value) {
    const cents = currencyToCents(value);
    return Number.isInteger(cents) ? formatMoney(cents) : String(value ?? "");
  }

  function calculate(values, quantities = {}) {
    const priceCents = currencyToCents(values.price);
    const downPaymentCents = currencyToCents(values.downPayment);
    const monthlyInstallmentCents = currencyToCents(values.monthlyInstallment);
    const semiannualInstallmentCents = currencyToCents(values.semiannualInstallment);
    const keysCents = currencyToCents(values.keys);
    const monthlyCount = Number(quantities.monthly ?? quantities.parcelasMensais);
    const semiannualCount = Number(quantities.semiannual ?? quantities.intercaladas);

    if (![priceCents, downPaymentCents, monthlyInstallmentCents, semiannualInstallmentCents, keysCents].every(Number.isInteger)) {
      return null;
    }

    const canBalance = Number.isInteger(monthlyCount) && monthlyCount >= 0
      && Number.isInteger(semiannualCount) && semiannualCount >= 0;

    const totalCents = canBalance
      ? downPaymentCents + monthlyCount * monthlyInstallmentCents + semiannualCount * semiannualInstallmentCents + keysCents
      : null;

    return {
      priceCents,
      downPaymentCents,
      monthlyInstallmentCents,
      semiannualInstallmentCents,
      keysCents,
      totalCents
    };
  }

  function format(values) {
    return {
      price: formatOriginal(values.price),
      downPayment: formatOriginal(values.downPayment),
      monthlyInstallment: formatOriginal(values.monthlyInstallment),
      semiannualInstallment: formatOriginal(values.semiannualInstallment),
      keys: formatOriginal(values.keys),
      balanced: null
    };
  }

  function paymentIntervalMonths(periodicity) {
    return {
      mensal: 1,
      semestral: 6,
      anual: 12,
      outra: 0,
      unica: 0
    }[periodicity] ?? null;
  }

  function parseDateOnly(value) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value ?? ""));
    if (!match) return null;
    const year = Number(match[1]);
    const month = Number(match[2]) - 1;
    const day = Number(match[3]);
    const date = new Date(year, month, day, 12, 0, 0, 0);
    return date.getFullYear() === year && date.getMonth() === month && date.getDate() === day ? date : null;
  }

  function parseMonth(value) {
    const match = /^(\d{4})-(\d{2})$/.exec(String(value ?? ""));
    if (!match) return null;
    const year = Number(match[1]);
    const month = Number(match[2]) - 1;
    if (month < 0 || month > 11) return null;
    return { year, month };
  }

  function lastDayOfMonth(year, month) {
    return new Date(year, month + 1, 0, 12, 0, 0, 0).getDate();
  }

  function dateToInput(date) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";
    const yyyy = String(date.getFullYear()).padStart(4, "0");
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const dd = String(date.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }

  function monthToInput(date) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";
    const yyyy = String(date.getFullYear()).padStart(4, "0");
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    return `${yyyy}-${mm}`;
  }

  function todayDateOnly(now = new Date()) {
    return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0, 0);
  }

  function todayInput(now = new Date()) {
    return dateToInput(todayDateOnly(now));
  }

  function currentMonthInput(now = new Date()) {
    return monthToInput(todayDateOnly(now));
  }

  function isDateOnOrAfter(value, minimum = todayInput()) {
    const date = parseDateOnly(value);
    const minDate = parseDateOnly(minimum);
    return !!date && !!minDate && date >= minDate;
  }

  function buildAllowedDueDate(monthValue, dueDay, config = DEFAULT_COMMERCIAL_CONFIG) {
    const parsed = parseMonth(monthValue);
    const day = Number(dueDay);
    const allowed = mergeCommercialConfig(config).diasVencimento;
    if (!parsed || !allowed.includes(day)) return "";

    // Dia 30 em fevereiro vira automaticamente 28 ou 29.
    const actualDay = Math.min(day, lastDayOfMonth(parsed.year, parsed.month));
    return dateToInput(new Date(parsed.year, parsed.month, actualDay, 12, 0, 0, 0));
  }

  function addMonthsPreservingDueDay(date, months, preferredDay = date.getDate()) {
    const target = new Date(date.getFullYear(), date.getMonth() + months, 1, 12, 0, 0, 0);
    const actualDay = Math.min(preferredDay, lastDayOfMonth(target.getFullYear(), target.getMonth()));
    target.setDate(actualDay);
    return target;
  }

  function buildScheduleWithDueDay(firstDate, quantity, periodicity, dueDay = null) {
    const start = parseDateOnly(firstDate);
    const count = Number(quantity);
    const interval = paymentIntervalMonths(periodicity);
    if (!start || !Number.isInteger(count) || count < 1 || interval === null) return [];
    if (interval === 0) return count === 1 ? [start] : [];

    const preferredDay = Number(dueDay) || start.getDate();
    return Array.from({ length: count }, (_, index) => addMonthsPreservingDueDay(start, interval * index, preferredDay));
  }

  function buildSchedule(firstDate, quantity, periodicity) {
    return buildScheduleWithDueDay(firstDate, quantity, periodicity, null);
  }

  function limitEndDate(periodicity, config = DEFAULT_COMMERCIAL_CONFIG) {
    const merged = mergeCommercialConfig(config);
    const monthValue = merged.limites?.[periodicity];
    const parsed = parseMonth(monthValue);
    if (!parsed) return null;
    return new Date(parsed.year, parsed.month, lastDayOfMonth(parsed.year, parsed.month), 23, 59, 59, 999);
  }

  function maxQuantityForDate(firstDate, periodicity, config = DEFAULT_COMMERCIAL_CONFIG, dueDay = null) {
    const start = parseDateOnly(firstDate);
    const interval = paymentIntervalMonths(periodicity);
    const limit = limitEndDate(periodicity, config);
    if (!start || interval === null || !limit || start > limit) return 0;
    if (interval === 0) return 1;

    const preferredDay = Number(dueDay) || start.getDate();
    let count = 0;
    for (let index = 0; index < 500; index += 1) {
      const candidate = addMonthsPreservingDueDay(start, interval * index, preferredDay);
      if (candidate > limit) break;
      count += 1;
    }
    return count;
  }

  function sumPaymentGroups(groups) {
    return (groups || []).reduce((sum, group) => {
      const quantity = Number(group.quantidade);
      const unitValue = Number(group.valorUnitarioCentavos);
      return sum + (Number.isInteger(quantity) && Number.isInteger(unitValue) ? quantity * unitValue : 0);
    }, 0);
  }

  function normalizeCommercialPercent(value, fallback) {
    const number = Number(value);
    if (!Number.isFinite(number)) return fallback;
    // Aceita tanto 15 / 60 quanto 0.15 / 0.60 vindos do Firestore.
    if (number > 0 && number < 1) return number * 100;
    return number;
  }

  function mergeCommercialConfig(remote = {}) {
    const discount = normalizeCommercialPercent(
      remote.descontoMaximoPercentual ?? remote.descontoMaximo,
      DEFAULT_COMMERCIAL_CONFIG.descontoMaximoPercentual
    );
    const keysWarning = normalizeCommercialPercent(
      remote.alertaChavesPercentual ?? remote.percentualChavesAlerta,
      DEFAULT_COMMERCIAL_CONFIG.alertaChavesPercentual
    );
    const remoteDays = Array.isArray(remote.diasVencimento) ? remote.diasVencimento.map(Number).filter(Number.isInteger) : [];
    const remoteLimits = remote.limites && typeof remote.limites === "object" ? remote.limites : {};

    return {
      descontoMaximoPercentual: discount,
      alertaChavesPercentual: keysWarning,
      diasVencimento: remoteDays.length ? remoteDays : [...DEFAULT_COMMERCIAL_CONFIG.diasVencimento],
      limites: {
        ...DEFAULT_COMMERCIAL_CONFIG.limites,
        ...remoteLimits,
        mensal: remote.limiteMensal || remoteLimits.mensal || DEFAULT_COMMERCIAL_CONFIG.limites.mensal,
        semestral: remote.limiteSemestral || remoteLimits.semestral || DEFAULT_COMMERCIAL_CONFIG.limites.semestral,
        anual: remote.limiteAnual || remoteLimits.anual || DEFAULT_COMMERCIAL_CONFIG.limites.anual
      }
    };
  }

  function analyzeCommercialProposal({ tableValueCents, totalCents, keysCents, config = DEFAULT_COMMERCIAL_CONFIG }) {
    const merged = mergeCommercialConfig(config);
    const table = Number(tableValueCents);
    const total = Number(totalCents);
    const keys = Number(keysCents);

    const result = {
      blocked: false,
      blockCode: null,
      blockMessage: "",
      violations: [],
      warnings: [],
      discountPercent: null,
      keysPercent: null,
      config: merged
    };

    if (!Number.isInteger(table) || table <= 0 || !Number.isInteger(total) || total <= 0) {
      result.blocked = true;
      result.blockCode = "VALOR_INVALIDO";
      result.blockMessage = "O valor da proposta é inválido.";
      result.violations.push({
        code: "VALOR_INVALIDO",
        message: result.blockMessage
      });
      return result;
    }

    result.discountPercent = total < table ? ((table - total) / table) * 100 : 0;
    result.keysPercent = Number.isInteger(keys) && keys >= 0 ? (keys / total) * 100 : 0;

    if (result.discountPercent > merged.descontoMaximoPercentual + 1e-9) {
      result.violations.push({
        code: "DESCONTO_ACIMA_LIMITE",
        message: "O valor total da proposta está abaixo do valor da tabela."
      });
    }

    if (result.keysPercent > merged.alertaChavesPercentual + 1e-9) {
      result.violations.push({
        code: "CHAVES_ACIMA_LIMITE",
        message: "A condição informada está fora dos parâmetros comerciais permitidos."
      });
    }

    if (result.violations.length) {
      result.blocked = true;
      result.blockCode = result.violations.length > 1
        ? "MULTIPLAS_REGRAS_COMERCIAIS"
        : result.violations[0].code;
      result.blockMessage = result.violations.map(item => item.message).join(" ");
    }

    return result;
  }

  return {
    MONTHLY_INSTALLMENTS,
    SEMIANNUAL_INSTALLMENTS,
    MAX_PAYMENT_GROUPS,
    DEFAULT_COMMERCIAL_CONFIG,
    currencyToCents,
    formatMoney,
    calculate,
    format,
    buildSchedule,
    buildScheduleWithDueDay,
    buildAllowedDueDate,
    maxQuantityForDate,
    sumPaymentGroups,
    mergeCommercialConfig,
    analyzeCommercialProposal,
    todayInput,
    currentMonthInput,
    isDateOnOrAfter
  };
});
