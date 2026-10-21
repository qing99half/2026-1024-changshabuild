"""Build pitch-calibrated turn notes from extracted Righty Tighty XL WAVs.

Requires ffmpeg on PATH. The source clips under assets/audio stay unchanged.
Run from any directory with: python tools/build_melodic_audio.py
"""

from __future__ import annotations

import hashlib
import json
import math
from pathlib import Path
import subprocess
import wave

import numpy as np


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "assets" / "audio"
OUTPUT = SOURCE / "melodic"
SAMPLE_RATE = 44100
SOURCE_HZ = {87: 654.576, 94: 490.385}
DIRECTIONS = ("up", "right", "down", "left")
ROWS = {
    "upper": (87, (79, 77, 74, 70)),   # G5, F5, D5, Bb4
    "middle": (94, (74, 72, 70, 67)),  # D5, C5, Bb4, G4
    "lower": (94, (70, 67, 65, 62)),   # Bb4, G4, F4, D4
}


def target_hz(midi: int) -> float:
    return 440 * 2 ** ((midi - 69) / 12)


def verify_pitch(path: Path, expected_hz: float) -> float:
    with wave.open(str(path), "rb") as wav:
        samples = np.frombuffer(wav.readframes(wav.getnframes()), dtype="<i2")
        samples = samples.reshape(-1, wav.getnchannels()).mean(axis=1)
    segment = samples[:round(SAMPLE_RATE * 0.20)]
    spectrum = np.abs(np.fft.rfft(segment * np.hanning(len(segment)), n=131072))
    frequencies = np.fft.rfftfreq(131072, 1 / SAMPLE_RATE)
    band = (frequencies > expected_hz * 0.85) & (frequencies < expected_hz * 1.15)
    peak = frequencies[np.flatnonzero(band)[np.argmax(spectrum[band])]]
    cents = 1200 * math.log2(peak / expected_hz)
    if abs(cents) > 20:
        raise ValueError(f"{path.name}: pitch error {cents:.1f} cents")
    return cents


def main() -> None:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    manifest = {"version": 1, "notes": {}}
    for row, (clip_id, midi_notes) in ROWS.items():
        source = SOURCE / f"clip-{clip_id}.wav"
        source_digest = hashlib.sha256(source.read_bytes()).hexdigest()
        for direction, midi in zip(DIRECTIONS, midi_notes):
            name = f"turn-{row}-{direction}"
            destination = OUTPUT / f"{name}.wav"
            wanted = target_hz(midi)
            rate = round(SAMPLE_RATE * wanted / SOURCE_HZ[clip_id])
            filters = (
                f"asetrate=sample_rate={rate},aresample={SAMPLE_RATE},"
                "atrim=duration=0.42,"
                "afade=t=in:st=0:d=0.003,afade=t=out:st=0.33:d=0.09,"
                "volume=3.2"
            )
            subprocess.run([
                "ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
                "-i", str(source), "-af", filters,
                "-ar", str(SAMPLE_RATE), "-ac", "2", "-c:a", "pcm_s16le",
                str(destination),
            ], check=True)
            cents = verify_pitch(destination, wanted)
            manifest["notes"][name] = {
                "source_clip": clip_id,
                "source_sha256": source_digest,
                "source_hz": SOURCE_HZ[clip_id],
                "midi": midi,
                "target_hz": round(wanted, 3),
                "pitch_error_cents": round(cents, 2),
            }
            print(f"{name:23} MIDI {midi:2} error {cents:+5.1f} cents")
    (OUTPUT / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
