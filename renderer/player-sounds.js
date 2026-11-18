// Keep alerts in order so simultaneous server events cannot cut each other off.
let playerSoundQueue = Promise.resolve();

function playPlayerSound(kind) {
  const file = kind === 'depart' ? 'player-depart.wav' : 'player-join.wav';
  const play = () => new Promise((resolve, reject) => {
    // A fresh element picks up audio-output changes after sleep or a device switch.
    const audio = new Audio('../resources/audio/' + file);
    audio.volume = 0.35;
    audio.preload = 'auto';
    const timeout = setTimeout(() => finish(Error('Player alert playback timed out.')), 10000);
    function finish(error) {
      clearTimeout(timeout);
      audio.onended = null;
      audio.onerror = null;
      audio.pause();
      if (error) reject(error);
      else resolve();
    }
    audio.onended = () => finish();
    audio.onerror = () => finish(Error('Player alert could not be decoded.'));
    audio.play().catch(finish);
  });
  playerSoundQueue = playerSoundQueue.then(play).catch(error => {
    notify('Player sound could not play. Check your audio output.');
    console.error('Player sound:', error);
  });
  return playerSoundQueue;
}
