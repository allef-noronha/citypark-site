(function (root, factory) {
  const api = factory();

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }

  root.CityParkPaymentPlan = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const MONTHLY_INSTALLMENTS = 40;
  const SEMIANNUAL_INSTALLMENTS = 6;

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
    return (cents / 100).toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL"
    });
  }

  function formatOriginal(value) {
    const cents = currencyToCents(value);
    return Number.isInteger(cents) ? formatMoney(cents) : String(value ?? "");
  }

  function calculate(values) {
    const priceCents = currencyToCents(values.price);
    const downPaymentCents = currencyToCents(values.downPayment);
    const monthlyInstallmentCents = currencyToCents(values.monthlyInstallment);
    const semiannualInstallmentCents = currencyToCents(values.semiannualInstallment);

    if (![priceCents, downPaymentCents, monthlyInstallmentCents, semiannualInstallmentCents].every(Number.isInteger)) {
      return null;
    }

    const keysCents =
      priceCents -
      downPaymentCents -
      MONTHLY_INSTALLMENTS * monthlyInstallmentCents -
      SEMIANNUAL_INSTALLMENTS * semiannualInstallmentCents;

    if (keysCents < 0) return null;

    return {
      priceCents,
      downPaymentCents,
      monthlyInstallmentCents,
      semiannualInstallmentCents,
      keysCents,
      totalCents:
        downPaymentCents +
        MONTHLY_INSTALLMENTS * monthlyInstallmentCents +
        SEMIANNUAL_INSTALLMENTS * semiannualInstallmentCents +
        keysCents
    };
  }

  function format(values) {
    // A Tabela de Vendas no Google Sheets passa a ser a fonte oficial dos
    // valores da condição comercial. O site apenas formata e exibe os dados.
    //
    // Mantemos calculate() e as constantes 40/6 exportadas temporariamente
    // por compatibilidade com qualquer código legado, mas format() NÃO usa
    // mais esses valores para recalcular Chaves/Financiamento.
    return {
      price: formatOriginal(values.price),
      downPayment: formatOriginal(values.downPayment),
      monthlyInstallment: formatOriginal(values.monthlyInstallment),
      semiannualInstallment: formatOriginal(values.semiannualInstallment),
      keys: formatOriginal(values.keys),
      balanced: null
    };
  }

  return {
    MONTHLY_INSTALLMENTS,
    SEMIANNUAL_INSTALLMENTS,
    currencyToCents,
    calculate,
    format
  };
});