// BIRDS header for the API documentation page (served as a file: the page's CSP allows no inline scripts)
(function () {
  function add() {
    if (document.querySelector('.birds-docs-header')) return;
    var h = document.createElement('header');
    h.className = 'birds-docs-header';
    h.innerHTML =
      '<div class="inner">' +
      '<img src="/bgb.png" alt="Border Guard Bangladesh crest">' +
      '<div><div class="name">BIRDS API documentation</div>' +
      '<div class="sub">Border Incident Reporting &amp; Documentation System · Border Guard Bangladesh</div></div>' +
      '<span class="tag">CONFIDENTIAL // OPERATIONAL</span>' +
      '</div>';
    var img = h.querySelector('img');
    img.addEventListener('error', function () { img.style.display = 'none'; });
    document.body.insertBefore(h, document.body.firstChild);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', add);
  else add();
})();
