import { useCallback, useEffect, useRef, useState } from 'react';

interface SpeechAlternative {
  transcript: string;
}
interface SpeechResult {
  isFinal: boolean;
  0: SpeechAlternative;
}
interface SpeechResultList {
  length: number;
  item(index: number): SpeechResult;
  [index: number]: SpeechResult;
}
interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start(): void;
  stop(): void;
  onresult: ((event: { results: SpeechResultList }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
}
type SpeechCtor = new () => SpeechRecognitionLike;

function recognitionCtor(): SpeechCtor | undefined {
  if (typeof window === 'undefined') return undefined;
  const value = window as unknown as {
    SpeechRecognition?: SpeechCtor;
    webkitSpeechRecognition?: SpeechCtor;
  };
  return value.SpeechRecognition ?? value.webkitSpeechRecognition;
}

/**
 * Free, on-device voice: SpeechRecognition for dictation and SpeechSynthesis
 * for spoken replies. No paid voice services.
 */
export function useSpeech(
  lang = 'es-ES',
  onFinal?: (text: string) => void,
) {
  const [supported] = useState(() => !!recognitionCtor());
  const [listening, setListening] = useState(false);
  const recognition = useRef<SpeechRecognitionLike | null>(null);
  const finalHandler = useRef(onFinal);
  finalHandler.current = onFinal;

  useEffect(() => {
    return () => {
      recognition.current?.stop();
      if (typeof window !== 'undefined') window.speechSynthesis?.cancel();
    };
  }, []);

  const start = useCallback(() => {
    const Ctor = recognitionCtor();
    if (!Ctor) return;
    const instance = new Ctor();
    instance.lang = lang;
    instance.interimResults = true;
    instance.continuous = false;
    instance.onresult = (event) => {
      let final = '';
      for (let index = 0; index < event.results.length; index += 1) {
        const result = event.results[index];
        if (result.isFinal) final += result[0].transcript;
      }
      if (final.trim()) finalHandler.current?.(final.trim());
    };
    instance.onend = () => setListening(false);
    instance.onerror = () => setListening(false);
    recognition.current = instance;
    instance.start();
    setListening(true);
  }, [lang]);

  const stop = useCallback(() => {
    recognition.current?.stop();
    setListening(false);
  }, []);

  const speak = useCallback(
    (text: string) => {
      if (typeof window === 'undefined' || !window.speechSynthesis) return;
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = lang;
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utterance);
    },
    [lang],
  );

  return { supported, listening, start, stop, speak };
}
