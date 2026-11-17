// Voice search recording (docs/API_V2.md §7): expo-audio works in Expo Go; m4a on the phone, webm in the browser.
import { RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync, useAudioRecorder, type RecordingOptions } from 'expo-audio';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import type { UploadFile } from './api/types';

/** Recording stops on its own after this many seconds (the backend takes up to ~30 s / 1 MB). */
export const MAX_SECONDS = 15;

/**
 * Voice only needs 16 kHz mono. iOS records WAV: on 17.11.2026 Gemini understood a WAV clip in seconds but returned an
 * empty transcript for the same words as m4a / AAC. 16 kHz × 16 bit × 15 s ≈ 480 KB, under the backend's 1 MB.
 */
export const VOICE_RECORDING: RecordingOptions = {
  ...RecordingPresets.HIGH_QUALITY,
  sampleRate: 16000,
  numberOfChannels: 1,
  bitRate: 64000,
  ios: {
    extension: '.wav',
    outputFormat: 'lpcm', // IOSOutputFormat.LINEARPCM
    audioQuality: 96, // AudioQuality.HIGH
    sampleRate: 16000,
    linearPCMBitDepth: 16,
    linearPCMIsBigEndian: false,
    linearPCMIsFloat: false,
  },
};

export const MIC_DENIED = 'Pago nu are acces la microfon. Dă-i acces din Setări sau scrie ce cauți.';

/** The recording as a file for the multipart upload. The backend checks the real type from the bytes. */
export function audioFile(uri: string): UploadFile {
  const ext = (/\.([a-z0-9]+)(?:[?#]|$)/i.exec(uri)?.[1] ?? (Platform.OS === 'web' ? 'webm' : 'm4a')).toLowerCase();
  const mimeType = ext === 'webm' ? 'audio/webm' : ext === 'wav' ? 'audio/wav' : ext === 'ogg' ? 'audio/ogg' : 'audio/mp4';
  return { uri, name: `cautare.${ext}`, mimeType };
}

/** Tap to start, tap to stop (or auto-stop after MAX_SECONDS); `onDone` gets the file once per recording. */
export function useVoiceRecorder() {
  const recorder = useAudioRecorder(VOICE_RECORDING);
  const [recording, setRecording] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onDone = useRef<((file: UploadFile | null) => void) | null>(null);

  const stop = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const done = onDone.current;
    onDone.current = null; // a second tap / the timer must not send twice
    try {
      await recorder.stop();
    } catch {}
    setRecording(false);
    setAudioModeAsync({ allowsRecording: false }).catch(() => {});
    done?.(recorder.uri ? audioFile(recorder.uri) : null);
  }, [recorder]);

  const start = useCallback(
    async (done: (file: UploadFile | null) => void) => {
      const permission = await requestRecordingPermissionsAsync();
      if (!permission.granted) throw new Error(MIC_DENIED);
      await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      onDone.current = done;
      setRecording(true);
      timer.current = setTimeout(() => void stop(), MAX_SECONDS * 1000);
    },
    [recorder, stop],
  );

  // Leaving the screen while recording: stop quietly, send nothing.
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      if (onDone.current) {
        onDone.current = null;
        try {
          recorder.stop().catch(() => {});
        } catch {} // the recorder may already be released
      }
    },
    [recorder],
  );

  return { recording, start, stop };
}
