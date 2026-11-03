"""Electronic preset at 120 BPM. Run this file to render the listening example."""
import wave

import numpy as np

from score import Groove


# Each entry gives the onset in eighth notes, MIDI pitch, and length in eighths.
# E minor is the key. Both hooks leave space between their first two attacks.
SIGNAL = [(0, 76, 0.75), (2, 79, 0.7), (3, 83, 2.4)]
ANSWER = [(0, 83, 0.65), (1.5, 81, 0.65), (3, 79, 0.85), (5, 76, 1.4)]
# On repeat keep the hook's opening, then strike its last note twice.
PULSE_END = [(0, 0.48), (1, 0.86)]
# Descend through chord tones when the turn ends.
LANDING = [(0, 2, 0.68), (1, 1, 0.68), (2, 0, 2.6)]
# E minor 9, C major 9, A minor 9 and B minor 7.
HARMONY = [(40, (64, 67, 71, 74)), (36, (60, 64, 67, 71)),
           (33, (57, 60, 64, 71)), (35, (59, 62, 66, 69))]


class Electronic(Groove):
    def __init__(self, rate):
        super().__init__(rate)
        self.step = round(rate * 0.25)
        self.lead_buffer = np.zeros_like(self.buffer)
        self.phrase = SIGNAL
        self.fresh_calls = 0

    def lead(self, onset, pitch, length):
        seconds = length * self.step / self.rate
        t = np.arange(round(seconds * self.rate)) / self.rate
        phase = 2 * np.pi * 440 * 2 ** ((pitch - 69) / 12) * t
        wavelet = (np.sin(phase) + 0.36 * np.sin(phase * 1.003)
                   + 0.38 * np.exp(-5 * t) * np.sin(2 * phase))
        envelope = (1 - np.exp(-135 * t)) * np.exp(-1.6 * t)
        envelope *= np.minimum(1, (seconds - t) * 22)
        for delay, gain in ((0, 0.19), (1.5, 0.042)):
            start = round((onset + delay) * self.step)
            self.lead_buffer[start:start + len(t)] += gain * wavelet * envelope

    def play_step(self, events, active=True):
        # Several events can arrive on one eighth note. Play the latest gesture.
        gesture = None
        for event in events:
            if event == "start":
                self.tick = 0
                self.fresh_calls = 0
                self.phrase = SIGNAL
                gesture = None
            elif event in ("call", "repeat", "finish"):
                gesture = event
                if event == "call":
                    self.phrase = (SIGNAL, ANSWER)[self.fresh_calls % 2]
                    self.fresh_calls += 1
        step = self.tick % 8
        root, chord = HARMONY[self.tick // 8 % len(HARMONY)]
        if gesture:
            # Release the old lead quickly so fast events cannot stack whole phrases.
            release = min(self.step, round(self.rate * 0.02))
            self.lead_buffer[:release] *= np.linspace(1, 0, release)
            self.lead_buffer[release:] = 0
            if gesture == "finish":
                for onset, degree, length in LANDING:
                    self.lead(onset, chord[degree] + 12, length)
            else:
                for note in self.phrase[:-1]:
                    self.lead(*note)
                onset, pitch, length = self.phrase[-1]
                if gesture == "repeat":
                    for delay, pulse in PULSE_END:
                        self.lead(onset + delay, pitch, pulse)
                else:
                    self.lead(onset, pitch, length)
        if active:
            self.drums(step)
            if step in (0, 3, 4, 7):
                self.note(root + (12 if step == 7 else 0), 0.39, 0.29 if step % 2 else 0.43)
            if step in (1, 5):
                for index, pitch in enumerate(chord):
                    self.note(pitch, 0.066, 0.70, 0.012 * index)
        self.buffer[:self.step] += self.lead_buffer[:self.step]
        self.lead_buffer[:-self.step] = self.lead_buffer[self.step:]
        self.lead_buffer[-self.step:] = 0
        return self.next_block()


if __name__ == "__main__":
    synth = Electronic(44100)
    cues = {0: "start", 16: "call", 32: "repeat", 48: "call", 64: "repeat", 80: "finish"}
    with wave.open("electronic.wav", "wb") as audio:
        audio.setparams((1, 2, synth.rate, 0, "NONE", ""))
        for tick in range(88):
            event = cues.get(tick)
            block = synth.play_step([event] if event else [], active=tick < 80)
            audio.writeframes((block * 32767).astype("<i2").tobytes())
