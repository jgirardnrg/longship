// Keep alerts in order so simultaneous server events cannot cut each other off.
let playerSoundQueue = Promise.resolve();

function playPlayerSound(kind, profile) {
  const file = kind === 'depart' ? 'player-depart.wav' : 'player-join.wav';
  const play = async () => {
    let source = '../resources/audio/' + file;
    const settings = profile?.playerSounds?.[kind];
    if (settings?.file) {
      try { source = await api.playerSoundSource(profile.id, kind) || source; }
      catch (error) { notify(error.message + ' Playing the default chime.'); }
    }
    return new Promise((resolve, reject) => {
      // A fresh element picks up audio-output changes after sleep or a device switch.
      const audio = new Audio(source);
      audio.volume = settings?.volume ?? 0.35;
      audio.preload = 'auto';
      let timeout = setTimeout(() => finish(Error('Player alert playback timed out.')), 15000);
      audio.onloadedmetadata = () => {
        if (Number.isFinite(audio.duration) && audio.duration > 0) {
          clearTimeout(timeout);
          timeout = setTimeout(() => finish(Error('Player alert playback timed out.')), (audio.duration + 15) * 1000);
        }
      };
      function finish(error) {
        clearTimeout(timeout);
        audio.onended = null;
        audio.onloadedmetadata = null;
        audio.onerror = null;
        audio.pause();
        if (error) reject(error);
        else resolve();
      }
      audio.onended = () => finish();
      audio.onerror = () => finish(Error('Player alert could not be decoded.'));
      audio.play().catch(finish);
    });
  };
  playerSoundQueue = playerSoundQueue.then(play).catch(error => {
    notify('Player sound could not play. Check your audio output.');
    console.error('Player sound:', error);
  });
  return playerSoundQueue;
}

function soundControls(profile) {
  const disabled = persisted() ? '' : 'disabled';
  return `<details class="sound-settings"><summary>Sound settings</summary><div id="soundSettings">${['join', 'depart'].map(kind => {
    const label = kind === 'join' ? 'Join' : 'Departure';
    const settings = profile.playerSounds?.[kind];
    const volume = Math.round((settings?.volume ?? 0.35) * 100);
    const name = settings?.file ? settings.name : 'Default ' + label.toLowerCase() + ' chime';
    return `<div class="sound-row" data-sound="${kind}"><label>${label} sound</label><span class="sound-name" title="${esc(name)}">${esc(name)}</span><div class="actions"><button data-sound-choose="${kind}" ${disabled}>Choose file…</button><button data-sound-preview="${kind}">Preview</button><button data-sound-reset="${kind}" ${disabled}>Default</button></div><div class="sound-volume"><label for="${kind}SoundVolume">Volume</label><input id="${kind}SoundVolume" data-sound-volume="${kind}" type="range" min="0" max="100" step="1" value="${volume}" aria-label="${label} volume" ${disabled}><output for="${kind}SoundVolume">${volume}%</output></div></div>`;
  }).join('')}</div></details>`;
}
function updateSoundProfiles(next, id) {
  servers = next;
  if (drafts[id]) drafts[id].playerSounds = servers.find(p => p.id === id).playerSounds;
  if (selected !== id || !$('soundSettings')) return;
  const template = document.createElement('div');
  template.innerHTML = soundControls(current());
  $('soundSettings').innerHTML = template.querySelector('#soundSettings').innerHTML;
  wireSoundControls();
}
function checkAudio(source) {
  return new Promise((resolve, reject) => {
    const audio = new Audio(source);
    audio.preload = 'metadata';
    const timer = setTimeout(() => finish(Error('Could not read this audio file.')), 10000);
    function finish(error) {
      clearTimeout(timer);
      audio.onloadedmetadata = null;
      audio.onerror = null;
      audio.removeAttribute('src');
      audio.load();
      if (error) reject(error);
      else resolve();
    }
    audio.onloadedmetadata = () => finish(Number.isFinite(audio.duration) && audio.duration > 0 ? null : Error('Choose an audio file with a valid duration.'));
    audio.onerror = () => finish(Error('This audio file cannot be played. Choose another file.'));
  });
}
function wireSoundControls() {
  document.querySelectorAll('[data-sound-choose]').forEach(button => {
    button.onclick = () => action(async () => {
      const id = selected, kind = button.dataset.soundChoose;
      button.disabled = true;
      try {
        const choice = await api.choosePlayerSound(id, kind);
        if (!choice) return;
        await checkAudio(choice.source);
        updateSoundProfiles(await api.confirmPlayerSound(choice.token), id);
      } finally { button.disabled = false; }
    });
  });
  document.querySelectorAll('[data-sound-reset]').forEach(button => {
    button.onclick = () => action(async () => {
      const id = selected;
      updateSoundProfiles(await api.resetPlayerSound(id, button.dataset.soundReset), id);
    });
  });
  document.querySelectorAll('[data-sound-volume]').forEach(input => {
    input.oninput = () => { input.parentElement.querySelector('output').textContent = input.value + '%'; };
    input.onchange = () => action(async () => {
      const id = selected;
      input.disabled = true;
      try { updateSoundProfiles(await api.setPlayerSoundVolume(id, input.dataset.soundVolume, Number(input.value) / 100), id); }
      finally { input.disabled = false; }
    });
  });
  document.querySelectorAll('[data-sound-preview]').forEach(button => {
    button.onclick = () => action(async () => {
      button.disabled = true;
      try { await playPlayerSound(button.dataset.soundPreview, current()); }
      finally { button.disabled = false; }
    });
  });
}
