{
  const minimize = document.getElementById('windowMinimize');
  const maximize = document.getElementById('windowMaximize');
  const close = document.getElementById('windowClose');

  minimize.addEventListener('click', () => action(() => api.minimizeWindow()));
  maximize.addEventListener('click', () => action(() => api.toggleMaximizeWindow()));
  close.addEventListener('click', () => action(() => api.closeWindow()));

  api.onWindowMaximized(maximized => {
    maximize.setAttribute('aria-label', maximized ? 'Restore window' : 'Maximize window');
    maximize.title = maximized ? 'Restore' : 'Maximize';
    maximize.firstElementChild.textContent = maximized ? '❐' : '□';
  });
}
