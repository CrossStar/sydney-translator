import type { VoiceProfile } from '../types/app';
import { synthesizeSpeech, type VoiceProfileParam } from './ipc';
import { playBase64Wav, stopPlayback } from './audio-player';

export interface TtsContext {
  ttsProvider: string;
  ttsApiEndpoint: string;
  ttsApiKey: string;
}

export async function speak(
  text: string,
  voiceProfile: VoiceProfile,
  ctx: TtsContext,
): Promise<void> {
  const param: VoiceProfileParam = {
    id: voiceProfile.id,
    name: voiceProfile.name,
    type: voiceProfile.type,
    presetVoiceId: voiceProfile.presetVoiceId,
    referenceAudioPath: voiceProfile.referenceAudioPath,
  };

  const audioBase64 = await synthesizeSpeech(text, param, ctx.ttsProvider, ctx.ttsApiEndpoint, ctx.ttsApiKey);
  await playBase64Wav(audioBase64);
}

export function stop(): void {
  stopPlayback();
}
