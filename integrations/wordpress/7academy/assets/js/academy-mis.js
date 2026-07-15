(function () {
  'use strict';

  function getFrameOrigin(iframe) {
    try {
      return new URL(iframe.src, window.location.href).origin;
    } catch (error) {
      return null;
    }
  }

  function clampHeight(height, minHeight) {
    var parsed = Number(height);
    if (!Number.isFinite(parsed)) return minHeight;
    return Math.max(minHeight, Math.ceil(parsed));
  }

  function forwardEmailVerificationToStudentFrame(container) {
    if (!container || !window.location.hash) return false;

    var iframe = container.querySelector('iframe');
    if (!iframe) return false;

    try {
      var frameUrl = new URL(iframe.src, window.location.href);
      if (frameUrl.searchParams.get('app') !== 'student') return false;

      var pageFragment = new URLSearchParams(window.location.hash.replace(/^#/, ''));
      var token = pageFragment.get('emailVerificationToken');
      var email = pageFragment.get('emailVerificationEmail');
      if (!token || !email) return false;

      frameUrl.hash = new URLSearchParams({
        emailVerificationToken: token,
        emailVerificationEmail: email,
      }).toString();
      iframe.src = frameUrl.toString();

      pageFragment.delete('emailVerificationToken');
      pageFragment.delete('emailVerificationEmail');
      var cleanPageUrl = new URL(window.location.href);
      cleanPageUrl.hash = pageFragment.toString();
      window.history.replaceState({}, document.title, cleanPageUrl.toString());
      return true;
    } catch (error) {
      return false;
    }
  }

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

  function findIframeBySource(sourceWindow) {
    if (!sourceWindow) return null;
    var iframes = document.querySelectorAll('.seven-academy-container iframe');
    for (var i = 0; i < iframes.length; i += 1) {
      var iframe = iframes[i];
      if (iframe.contentWindow === sourceWindow) {
        return iframe;
      }
    }
    return null;
  }

  function onFrameMessage(event) {
    if (!event || !event.data || typeof event.data !== 'object') return;
    if (
      event.data.type !== 'seven-academy:resize' &&
      event.data.type !== 'seven-academy:scroll-top'
    ) {
      return;
    }

    var iframe = findIframeBySource(event.source);
    if (!iframe) return;

    var frameOrigin = getFrameOrigin(iframe);
    if (frameOrigin && event.origin && frameOrigin !== event.origin) {
      return;
    }

    var container = iframe.closest('.seven-academy-container');
    if (event.data.type === 'seven-academy:scroll-top') {
      var targetTop = (container || iframe).getBoundingClientRect().top + window.pageYOffset - 12;
      window.scrollTo({
        top: Math.max(0, targetTop),
        behavior: 'smooth',
      });
      return;
    }

    var minHeight = Number(iframe.dataset.minHeightPx || 720);
    var nextHeight = clampHeight(event.data.height, minHeight);

    iframe.style.height = nextHeight + 'px';
    iframe.style.minHeight = nextHeight + 'px';
    iframe.style.overflow = 'hidden';

    if (container) {
      container.classList.add('is-auto-height');
      container.classList.remove('is-loading');
    }
  }

  function initSevenAcademyContainers() {
    var containers = document.querySelectorAll('.seven-academy-container');
    if (!containers.length) return;

    containers.forEach(function (container) {
      forwardEmailVerificationToStudentFrame(container);
      if (container.classList.contains('is-loading')) {
        bindContainerLoading(container);
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSevenAcademyContainers);
  } else {
    initSevenAcademyContainers();
  }

  window.addEventListener('message', onFrameMessage);
  window.addEventListener('pageshow', initSevenAcademyContainers);
})();
