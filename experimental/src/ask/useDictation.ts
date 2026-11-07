import { useState } from "react";
import { AudioModule, RecordingPresets, setAudioModeAsync, useAudioRecorder } from "expo-audio";
import { postForm } from "@/api/multipart";
import { haptic } from "@/haptics";
import { readVoice } from "@/nav/AccountSheet";
import { toast } from "@/ui/toast";

type State = "idle" | "recording" | "transcribing";

/** Tap to talk, tap to stop: the recording goes to /api/transcribe (Groq Whisper on the server) and comes back as text. */
export function useDictation(onText: (text: string) => void) {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [state, setState] = useState<State>("idle");

  const start = async () => {
    const perm = await AudioModule.requestRecordingPermissionsAsync();
    if (!perm.granted) {
      toast("Cortex needs the microphone for dictation. Turn it on in Android Settings › Apps › Cortex.");
      return;
    }
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
    await recorder.prepareToRecordAsync();
    recorder.record();
    haptic.tap();
    setState("recording");
  };

  const stop = async () => {
    await recorder.stop();
    haptic.tap();
    const uri = recorder.uri;
    if (!uri) return setState("idle");
    setState("transcribing");
    try {
      const { text } = await postForm<{ text: string }>("/api/transcribe", { audio: { uri, name: "dictation.m4a", type: "audio/mp4" }, lang: readVoice().lang }, { timeoutMs: 60_000 });
      if (text) onText(text);
      else toast("Didn't catch that. Try again a little closer to the phone.");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't transcribe that recording.");
    } finally {
      setState("idle");
    }
  };

  return { state, toggle: () => void (state === "recording" ? stop() : state === "idle" ? start() : undefined) };
}
