# Benchmark: OnePlus LE2101

<!-- Verified on: OnePlus LE2101, Android 14, SoC kona -->

| | |
|---|---|
| **Device**           | OnePlus LE2101 (OnePlus 9R) |
| **SoC**              | kona (Snapdragon 870) |
| **RAM total**        | 11511 MiB |
| **Android version**  | 14 |
| **Ollama version**   | 0.2.07 |
| **Model**            | `qwen2.5:3b` |
| **Prompts version**  | 1 |
| **Runs per prompt**  | 2 |
| **Generated**        | 2026-04-16T08:40:00Z |

## Summary

- **Warm median:** `6.19 tok/s`
- **Cold median:** `5.94 tok/s`

## Per-prompt results

| Prompt | Cold tok/s | Warm tok/s |
|--------|-----------|-----------|
| hello  | 6.46 | 6.19 |
| math   | 8.05 | 7.78 |
| list   | 5.94 | 5.93 |
| python | 5.81 | 6.44 |
| explain| 5.82 | 5.65 |

## Notes

- This is `qwen2.5:3b` (1.9 GB download), a bigger model than the `qwen2.5:1.5b` (1 GB) benchmarked on the LG G8 ThinQ. The 3b model produces noticeably better structured JSON output but is ~16% slower per-token on the SD870 than the 1.5b model is on the SD855.
- The SD870 has ~20% more single-core throughput than the SD855 but the 2× larger model more than offsets that gain.
- With 11.5 GB total RAM (~7 GB free after Android 14), `qwen2.5:3b` loads comfortably with headroom for the PWA server + Chrome.
- `gemma4:e2b` (7.2 GB) and `gemma4:e4b` (9.6 GB) were attempted but are too large for this device's available RAM.
