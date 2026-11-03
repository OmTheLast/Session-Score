"""Generate the ten Electronic listening sketches. Requires NumPy and ffmpeg."""
from dataclasses import dataclass
from pathlib import Path
import subprocess

import numpy as np


RATE = 44100
SECONDS = 12
OUT = Path(__file__).resolve().parent


@dataclass(frozen=True)
class Sketch:
    title: str
    bpm: int
    root: int
    lead: str
    bed: str
    swing: float
    # Patterns repeat each bar. Each character is one sixteenth note.
    kick: str
    snare: str
    hats: str
    bass: tuple  # (sixteenth, semitones above root)
    hook: tuple  # (sixteenth, semitones above lead root, duration in sixteenths)


SKETCHES = [
    Sketch("Night Drive", 98, 38, "saw", "pad", 0,
           "x.......x..x....", "....x.......x...", "..x...x...x...x.",
           ((0,0),(2,12),(4,0),(6,7),(8,0),(10,12),(12,7),(14,12)),
           ((0,7,3),(4,10,2),(7,12,5))),
    Sketch("Pocket Dial", 132, 42, "pluck", "stab", 0.26,
           "x........x....x.", "....x.......x...", "..x..x.x..x..x.x",
           ((0,0),(3,7),(7,10),(10,0),(14,12)),
           ((1,12,1),(3,7,2),(8,10,2),(11,3,3))),
    Sketch("Glass Current", 170, 36, "glass", "pad", 0.03,
           "x.........x.....", "....x.......x...", "x.x.xx.xx.x.x.xx",
           ((0,0),(6,0),(10,7)),
           ((0,7,3),(4,14,3),(8,15,2),(11,10,4))),
    Sketch("Acid Steps", 128, 40, "acid", "none", 0.09,
           "x...x...x...x...", "....x.......x...", "..x...x...x...xx",
           ((0,0),(3,0),(6,12),(8,0),(11,7),(14,10)),
           ((0,0,2),(3,12,1),(5,7,2),(9,10,1),(11,3,3))),
    Sketch("Soft Orbit", 80, 45, "air", "cloud", 0,
           "x...............", "................", "......x.......x.",
           ((0,0),),
           ((0,14,3),(4,10,3),(8,7,6))),
    Sketch("Pixel Sprint", 150, 41, "pulse", "arp", 0,
           "x.......x.x.....", "....x.......x...", "..x...x...x..x..",
           ((0,0),(4,12),(8,7),(12,12)),
           ((0,0,1),(2,7,1),(4,12,1),(6,15,2),(10,14,3))),
    Sketch("Mirror Ball", 116, 43, "keys", "disco", 0.13,
           "x...x...x...x...", "....x.......x...", "..x...x...x...x.",
           ((0,0),(3,12),(6,7),(9,0),(11,10),(14,12)),
           ((1,3,2),(5,7,2),(8,10,1),(10,14,4))),
    Sketch("Submerged", 72, 38, "organ", "echo", 0.16,
           "x.........x.....", "........x.......", "..x...x...x...x.",
           ((0,0),(5,7),(10,0)),
           ((0,7,2),(3,3,2),(8,0,4))),
    Sketch("Chrome Candy", 158, 42, "stack", "chop", 0,
           "x......xx.....x.", "........x.......", "x.x.x.xxx.x.xxxx",
           ((0,0),(6,0),(8,12),(14,7)),
           ((0,12,2),(3,15,1),(5,12,1),(7,19,2),(11,14,3))),
    Sketch("Magnetic Field", 110, 40, "wire", "arp", 0.04,
           "x.....x...x..x..", "....x.......x...", "x..x..x.x..x..x.",
           ((0,0),(3,0),(6,7),(10,12),(13,0)),
           ((0,7,1),(3,6,1),(6,3,2),(10,0,4))),
]


def tone(voice, midi, seconds):
    t = np.arange(max(1, round(seconds * RATE))) / RATE
    f = 440 * 2 ** ((midi - 69) / 12)
    p = 2 * np.pi * f * t
    attack, decay = 80, 1.6
    if voice in ("saw", "stack", "pad"):
        # Detuned, band-limited harmonics for a broad analogue sound.
        spread = 0.005 if voice == "stack" else 0.002
        y = sum((np.sin(p*h*(1-spread)) + np.sin(p*h*(1+spread))) / (2*h)
                for h in range(1, min(12, int(RATE/(2.01*f))) + 1))
        if voice == "pad":
            attack, decay = 6, 0.5
    elif voice in ("glass", "keys", "wire"):
        ratio = {"glass": 2.71, "keys": 1.0, "wire": 3.02}[voice]
        y = np.sin(p + 2.2*np.exp(-6*t)*np.sin(ratio*p))
        decay = 3.8
    elif voice == "pulse":
        y = sum(np.cos(h*p)*np.sin(np.pi*h*0.23)/h for h in range(1, 14))
    elif voice == "acid":
        y = sum(np.sin(h*p)*np.exp(-h*(0.06 + 1.6*t))/h**0.55 for h in range(1, 12))
    elif voice == "air":
        y = np.sin(p + 0.65*np.sin(2*p)) + 0.25*np.sin(2.003*p)
        attack, decay = 9, 0.5
    elif voice == "organ":
        y = np.sin(p) + 0.48*np.sin(2*p) + 0.24*np.sin(3*p)
    elif voice == "bass":
        y = np.sin(p) + 0.32*np.sin(2*p) + 0.15*np.sin(3*p)*np.exp(-4*t)
    else:  # Plucked string
        y = sum(np.sin(h*p)*np.exp(-3*h*t)/h for h in range(1, 8))
        decay = 3
    edge = np.clip((seconds-t)/min(0.085, seconds/3), 0, 1)
    return y*(1-np.exp(-attack*t))*np.exp(-decay*t)*edge


def drum(kind, rng):
    t = np.arange(round(0.35*RATE))/RATE
    noise = rng.normal(0, 0.4, len(t))
    if kind == "kick":
        y = np.sin(2*np.pi*(48*t + 2.2*(1-np.exp(-36*t))))*np.exp(-16*t)
    elif kind == "snare":
        y = (noise + 0.32*np.sin(2*np.pi*192*t))*np.exp(-22*t)
    else:
        y = np.diff(noise, prepend=0)*np.exp(-67*t)
    return y*np.minimum(t*1600, 1)


def arrange(s, seed):
    mix = np.zeros((SECONDS*RATE, 2))
    grid = 60/s.bpm/4
    rng = np.random.default_rng(seed)

    def place(step, signal, gain, pan=0):
        delay = s.swing if int(step) % 2 else 0
        start = round((step+delay)*grid*RATE)
        n = min(len(signal), len(mix)-start)
        if n > 0:
            angle = (pan+1)*np.pi/4
            mix[start:start+n] += signal[:n,None] * gain * [np.cos(angle), np.sin(angle)]

    def note(step, voice, midi, duration, gain, pan=0, echo=False):
        signal = tone(voice, midi, duration*grid)
        place(step, signal, gain, pan)
        if echo:
            place(step+3, signal, gain*0.22, -0.65)
            place(step+6, signal, gain*0.10, 0.65)

    # Snap the same three scripted events to each track's own musical grid.
    call, repeat, finish = (round(sec/grid/2)*2 for sec in (2, 5.5, 9.5))
    for step in range(finish):
        i = step % 16
        for kind, pattern, gain, pan in (("kick",s.kick,.68,0), ("snare",s.snare,.58,-.1),
                                        ("hat",s.hats,.23,.32)):
            if pattern[i] == "x":
                place(step, drum(kind,rng), gain*rng.uniform(.85,1), pan)
        root = s.root + (0, -2, -5, 0)[step//16 % 4]
        for onset, interval in s.bass:
            if i == onset:
                duration = min(7, 13/len(s.bass))
                note(step, "bass", root+interval, duration, .50)
        chord = (root+24, root+27, root+31, root+34)
        if s.bed in ("pad","cloud") and i == 0:
            for j, pitch in enumerate(chord):
                note(step+j*.10, "pad", pitch, 15, .072, (j-1.5)*.38)
        elif s.bed == "arp" and i%2 == 0:
            note(step, "pluck", chord[(i//2)%4], 1.55, .13, (-1)**(i//2)*.45)
        elif (s.bed in ("disco","chop","stab","echo") and
              i in {"disco":(2,6,10,14),"chop":(0,3,6,11,14),"stab":(3,10),"echo":(4,12)}[s.bed]):
            for j,pitch in enumerate(chord):
                note(step, "saw" if s.bed=="chop" else "keys", pitch,
                     1.5, .080, (j-1.5)*.3, s.bed=="echo")
    for start in (call, repeat):
        for index,(onset,interval,duration) in enumerate(s.hook):
            hits = [(0,duration)]
            if start == repeat and index == len(s.hook)-1:
                hits = [(0,duration*.33),(duration*.55,duration*.42)]
            for offset,length in hits:
                note(start+onset+offset,s.lead,s.root+24+interval,length,.40,.08,True)
    # Drop the drums, then land on a sustained tonic.
    for j,interval in enumerate((7,3,0)):
        note(finish+j*1.5,s.lead,s.root+24+interval,1.2 if j<2 else 5,.34,0,True)
    mix *= np.clip((SECONDS-np.arange(len(mix))/RATE)/.33,0,1)[:,None]
    return np.tanh(mix*1.3)


def export(path, pcm):
    subprocess.run(["ffmpeg","-loglevel","error","-y","-f","s16le","-ar",str(RATE),
                    "-ac","2","-i","pipe:0","-codec:a","libmp3lame","-q:a","2",str(path)],
                   input=pcm,check=True)


if __name__ == "__main__":
    reel = bytearray()
    for i, sketch in enumerate(SKETCHES, 1):
        audio = arrange(sketch, i)
        # Match average power for auditioning and leave headroom on drum peaks.
        gain = min(.125 / np.sqrt(np.mean(audio**2)), .89 / np.max(abs(audio)))
        pcm = (audio*gain*32767).astype("<i2").tobytes()
        export(OUT/f"{i:02}-{sketch.title.lower().replace(' ','-')}.mp3",pcm)
        reel.extend(pcm)
    export(OUT/"electronic-sampler.mp3",reel)
