# 临时原作音频

这些 WAV 是从本机 Righty Tighty XL 的 FSB5 资源解码出的原版样本，按 Unity AudioClip path ID 命名。`music-101.mp3` 是原作音乐样本转码以缩小网页下载。玩法事件映射在 `src/audio.mjs`，详见仓库上一级的 `Righty-Tighty-XL-specials-fx-audio-spec-20261020.md`。

这组声音是当前本机比赛原型的临时素材。后续替换声音时保留事件键与调音参数，逐一替换文件并重新听感校准。

## 原声变调音律

`melodic/` 下的 12 个短 WAV 由 `clip-87.wav`（Bing）和 `clip-94.wav`（Bong）派生，原始 WAV 未被覆盖。生成脚本是 `tools/build_melodic_audio.py`，需要 `ffmpeg` 与 `numpy`；`melodic/manifest.json` 记录了每个音符的原始文件 SHA-256、目标音高和复测误差。音频保留原版攻击与音色，裁成 0.42 秒并淡出，以便连续转向。

原版背景曲 `music-101.mp3` 的分段频谱分析在全曲多个时段都更接近 G 小调；强节拍脉冲约为 128 BPM。因此转向音符使用 G 小调五声音阶 G、降 B、C、D、F。节拍相位由音频起始后约 25 毫秒估算，网页用十六分音符网格安排短音，慢动作时让旋律音高跟随原版背景曲的变速。五声音阶降低冲突概率，并不保证每个音在每一瞬间都是背景和弦的组成音。
