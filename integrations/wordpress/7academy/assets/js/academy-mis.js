(function () {
  'use strict';

  function bindContainerLoading(container) {
    if (!container) return;

    var iframe = container.querySelector('iframe');
    if (!iframe) {
      container.classList.remove('is-loading');
      return;
    }

    var resolved = false;
    var finishLoading = function () {
      if (resolved) return;
      resolved = true;
      container.classList.remove('is-loading');
    };

    iframe.addEventListener('load', finishLoading, { once: true });
    window.setTimeout(finishLoading, 10_000);
  }

  function initSevenAcademyContainers() {
    var containers = document.querySelectorAll('.seven-academy-container.is-loading');
    if (!containers.length) return;

    containers.forEach(bindContainerLoading);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSevenAcademyContainers);
  } else {
    initSevenAcademyContainers();
  }

  window.addEventListener('pageshow', initSevenAcademyContainers);
})();
