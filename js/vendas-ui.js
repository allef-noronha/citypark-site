// Somente apresentação: os links continuam controlados por auth.js.
(() => {
  const button = document.getElementById('btn-menu-vendas');
  const nav = document.getElementById('vendas-nav');
  const mobile = matchMedia('(max-width: 768px)');
  const filterButton = document.getElementById('btn-toggle-filtros');
  const title = document.querySelector('.vendas-topo');
  function placeFilter() {
    // Move o mesmo botão para preservar seu ID, estado e listener em vendas.js.
    if (mobile.matches) title.append(filterButton);
    else nav.prepend(filterButton);
  }
  function setMenu(open, restoreFocus = false) {
    nav.classList.toggle('is-open', open);
    nav.inert = mobile.matches && !open;
    button.setAttribute('aria-expanded', String(open));
    button.setAttribute('aria-label', open ? 'Fechar menu' : 'Abrir menu');
    if (restoreFocus) button.focus();
  }
  button.addEventListener('click', () => setMenu(!nav.classList.contains('is-open')));
  nav.addEventListener('click', e => { if (e.target.closest('a')) setMenu(false); });
  document.addEventListener('click', e => {
    if (!nav.contains(e.target) && !button.contains(e.target)) setMenu(false);
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && nav.classList.contains('is-open')) setMenu(false, true);
  });
  mobile.addEventListener('change', () => {
    setMenu(false);
    placeFilter();
  });
  setMenu(false);
  placeFilter();

})();
