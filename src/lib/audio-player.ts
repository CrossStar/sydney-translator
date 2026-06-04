let currentAudio: HTMLAudioElement | null = null;

export function playBase64Wav(base64Data: string): Promise<void> {
  return new Promise((resolve, reject) => {
    stopPlayback();

    const audio = new Audio(`data:audio/wav;base64,${base64Data}`);
    currentAudio = audio;

    audio.onended = () => {
      currentAudio = null;
      resolve();
    };

    audio.onerror = () => {
      currentAudio = null;
      reject(new Error('Audio playback failed'));
    };

    audio.play().catch((err) => {
      currentAudio = null;
      reject(err);
    });
  });
}

export function stopPlayback(): void {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio.currentTime = 0;
    currentAudio = null;
  }
}

export function isPlaying(): boolean {
  return currentAudio !== null && !currentAudio.paused;
}
