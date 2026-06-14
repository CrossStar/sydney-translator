import type { VoiceProfile } from '../types/app';
import { synthesizeSpeech, type VoiceProfileParam } from './ipc';
import { playBase64Audio, stopPlayback } from './audio-player';

export interface TtsContext {
  ttsProvider: string;
  ttsApiEndpoint: string;
  ttsApiKey: string;
}

let currentUtterance: SpeechSynthesisUtterance | null = null;

function speakWithWebSpeech(text: string, voiceId: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!window.speechSynthesis) {
      reject(new Error('Web Speech API not supported'));
      return;
    }

    // 停止之前的播放
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    currentUtterance = utterance;

    // 设置语言
    utterance.lang = voiceId.startsWith('zh') ? 'zh-CN' : 'en-US';

    // 查找匹配的声音
    const voices = window.speechSynthesis.getVoices();
    const matchedVoice = voices.find(v => v.voiceURI === voiceId || v.name === voiceId);
    if (matchedVoice) {
      utterance.voice = matchedVoice;
    }

    utterance.onend = () => {
      currentUtterance = null;
      resolve();
    };

    utterance.onerror = (event) => {
      currentUtterance = null;
      if (event.error === 'canceled') {
        resolve(); // 取消不算错误
      } else {
        reject(new Error(`Speech synthesis error: ${event.error}`));
      }
    };

    window.speechSynthesis.speak(utterance);
  });
}

function withTimeout<T>(promise: Promise<T>, ms: number, errorMessage: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(errorMessage)), ms)
    ),
  ]);
}

export async function speak(
  text: string,
  voiceProfile: VoiceProfile,
  ctx: TtsContext,
): Promise<void> {
  // Web Speech API 直接播放，不经过后端
  if (ctx.ttsProvider === 'webspeech') {
    const voiceId = voiceProfile.presetVoiceId || 'zh-CN-XiaoxiaoNeural';
    await speakWithWebSpeech(text, voiceId);
    return;
  }

  const param: VoiceProfileParam = {
    id: voiceProfile.id,
    name: voiceProfile.name,
    type: voiceProfile.type,
    presetVoiceId: voiceProfile.presetVoiceId,
    referenceAudioPath: voiceProfile.referenceAudioPath,
  };

  const timeoutMs = ctx.ttsProvider === 'edge' ? 30000 : 120000;
  const audioBase64 = await withTimeout(
    synthesizeSpeech(text, param, ctx.ttsProvider, ctx.ttsApiEndpoint, ctx.ttsApiKey),
    timeoutMs,
    `TTS request timeout (${timeoutMs / 1000}s). Please check your network or use a proxy.`
  );
  const mimeType = ctx.ttsProvider === 'mimo' ? 'audio/wav' : 'audio/mpeg';
  await playBase64Audio(audioBase64, mimeType);
}

export function stop(): void {
  if (currentUtterance) {
    window.speechSynthesis.cancel();
    currentUtterance = null;
  }
  stopPlayback();
}

// 获取系统可用的 TTS 声音
export function getWebSpeechVoices(): { id: string; name: string; lang: string }[] {
  if (!window.speechSynthesis) return [];
  return window.speechSynthesis.getVoices().map(v => ({
    id: v.voiceURI,
    name: v.name,
    lang: v.lang,
  }));
}
