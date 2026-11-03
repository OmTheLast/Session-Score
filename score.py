"""An eight-bar electric piano groove. Run this file to render the listening test."""
import wave

import numpy as np


# Bass root and right-hand voicing, with one chord per bar.
CHORDS = [(41, (57, 60, 64, 67)), (40, (55, 59, 62, 67)),
          (45, (55, 59, 60, 64)), (43, (53, 57, 60, 64))]


class Groove:
    def __init__(self, rate):
        self.rate = rate
        self.step = round(rate * 60 / 96 / 2)
        self.buffer = np.zeros(rate * 3)
        self.tick = 0
        self.busy_until = 0
        self.random = np.random.default_rng(96)

    def note(self, midi, gain, duration, offset=0):
        t = np.arange(int(duration * self.rate)) / self.rate
        phase = 2 * np.pi * 440 * 2 ** ((midi - 69) / 12) * t
        env = (1 - np.exp(-t * 100)) * np.exp(-t * 3 / duration)
        env *= np.minimum((duration - t) * 40, 1)
        tone = np.sin(phase + 1.3 * np.exp(-5 * t) * np.sin(2 * phase))
        start = round(offset * self.rate)
        self.buffer[start:start + len(t)] += gain * env * tone

    def drums(self, step):
        t = np.arange(self.step) / self.rate
        attack = np.minimum(t * 1800, 1)
        noise = self.random.normal(0, 0.4, len(t))
        hat = np.diff(noise, prepend=0) * np.exp(-t * 80)
        self.buffer[:self.step] += attack * hat * (0.12 if step % 2 else 0.05)
        if step in (0, 4, 7):
            phase = 2 * np.pi * (49 * t + 1.7 * (1 - np.exp(-35 * t)))
            self.buffer[:self.step] += 0.5 * attack * np.sin(phase) * np.exp(-17 * t)
        if step in (2, 6):
            rim = noise + 0.32 * np.sin(2 * np.pi * 190 * t)
            self.buffer[:self.step] += 0.38 * attack * rim * np.exp(-24 * t)

    def play_step(self, events, active=True):
        if "call" in events or "repeat" in events:
            self.busy_until = self.tick + 8
        if "finish" in events:
            self.busy_until = self.tick
        step = self.tick % 8
        root, chord = CHORDS[(self.tick // 8) % len(CHORDS)]
        if active:
            self.drums(step)
            if step in (0, 5):
                for i, pitch in enumerate(chord):
                    self.note(pitch, 0.105, 1.45 if step == 0 else 0.62, i * 0.016)
            if step in (0, 4):
                self.note(root, 0.38, 0.57)
            if self.tick < self.busy_until and step in (3, 6, 7):
                self.note(root + (12 if step == 6 else 7), 0.32, 0.25)
        return self.next_block()

    def next_block(self):
        self.tick += 1
        block = self.buffer[:self.step].copy()
        self.buffer[:-self.step] = self.buffer[self.step:]
        self.buffer[-self.step:] = 0
        return np.asarray(np.tanh(block), dtype="float32")


def render(filename):
    groove = Groove(44100)
    with wave.open(filename, "wb") as audio:
        audio.setparams((1, 2, groove.rate, 0, "NONE", ""))
        for tick in range(68):
            # Scripted calls in bars 5–7. Bar 8 returns to the original bass.
            events = ["call"] if tick in (32, 40, 48) else []
            block = groove.play_step(events, active=tick < 64)
            audio.writeframes((block * 32767).astype("<i2").tobytes())


if __name__ == "__main__":
    render("first-groove.wav")
