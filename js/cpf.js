(function (root) {
  function isValidCpf(value) {
    const input = String(value ?? '').trim();
    if (!/^(\d{11}|\d{3}\.\d{3}\.\d{3}-\d{2})$/.test(input)) return false;
    const cpf = input.replace(/\D/g, '');
    if (/^(\d)\1{10}$/.test(cpf)) return false;
    for (let size = 9; size <= 10; size++) {
      let sum = 0;
      for (let i = 0; i < size; i++) sum += Number(cpf[i]) * (size + 1 - i);
      const digit = (sum * 10 % 11) % 10;
      if (digit !== Number(cpf[size])) return false;
    }
    return true;
  }
  if (typeof module === 'object' && module.exports) module.exports = { isValidCpf };
  else root.CityParkCpf = { isValidCpf };
})(typeof window === 'undefined' ? globalThis : window);
