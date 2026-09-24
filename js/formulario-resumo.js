/* Apresentação do resumo da proposta personalizada no celular. */
(() => {
  const summary = document.getElementById('proposalValueSummary');
  const financing = document.querySelector('.payment-row-keys');
  const proposalTypes = document.querySelectorAll('input[name="proposalType"]');
  if (!summary || !financing || !proposalTypes.length) return;

  const mobile = matchMedia('(max-width: 640px)');
  let scheduled = false;
  const update = () => {
    scheduled = false;
    const custom = document.querySelector('input[name="proposalType"][value="outro"]')?.checked;
    const pastFinancing = financing.getBoundingClientRect().bottom <= summary.offsetHeight + 30;
    summary.classList.toggle('is-past-financing', mobile.matches && custom && pastFinancing);
  };
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(update);
  };

  addEventListener('scroll', schedule, { passive: true });
  addEventListener('resize', schedule);
  proposalTypes.forEach(input => input.addEventListener('change', schedule));
  schedule();
})();
