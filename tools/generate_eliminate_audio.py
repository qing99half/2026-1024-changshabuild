"""Generate the dedicated short enemy-erasure cue with Python's standard library."""

import math
import random
import struct
import wave
from pathlib import Path


RATE = 44100
DURATION = 0.32
OUTPUT = Path(__file__).resolve().parents[1] / "assets" / "audio" / "eliminate.wav"
randomizer = random.Random(1024)
grains = [(0.094 + randomizer.uniform(0, 0.085), randomizer.uniform(1500, 4100),
           randomizer.uniform(0.11, 0.24)) for _ in range(9)]
samples = []
low_noise = 0.0
previous_noise = 0.0
phase = 0.0

for frame in range(round(RATE * DURATION)):
    t = frame / RATE
    noise = randomizer.uniform(-1, 1)
    low_noise += 0.055 * (noise - low_noise)
    high_noise = noise - previous_noise
    previous_noise = noise

    inhale = 0.0
    if t < 0.105:
        progress = t / 0.105
        envelope = math.sin(math.pi * progress) ** 1.4
        phase += 2 * math.pi * (480 - 310 * progress) / RATE
        inhale = envelope * (0.21 * math.sin(phase) + 0.13 * low_noise)

    crack = 0.0
    for start, frequency, strength in grains:
        age = t - start
        if 0 <= age < 0.16:
            envelope = (1 - math.exp(-age * 1000)) * math.exp(-age * 34)
            crack += strength * envelope * (0.55 * math.sin(2 * math.pi * frequency * age)
                                             + 0.45 * high_noise)

    tail = 0.0
    if t >= 0.105:
        age = t - 0.105
        tail = 0.13 * math.exp(-age * 19) * math.sin(2 * math.pi * (150 * age - 180 * age * age))

    fade = min(1.0, (DURATION - t) / 0.035)
    samples.append((inhale + crack + tail) * max(0, fade))

peak = max(abs(sample) for sample in samples)
pcm = b"".join(struct.pack("<h", round(sample / peak * 0.78 * 32767)) for sample in samples)
OUTPUT.parent.mkdir(parents=True, exist_ok=True)
with wave.open(str(OUTPUT), "wb") as output:
    output.setnchannels(1)
    output.setsampwidth(2)
    output.setframerate(RATE)
    output.writeframes(pcm)
print(f"Generated {OUTPUT} ({DURATION:.2f}s)")
