# Benchmark: LGE LM-G850

<!-- Verified on: LGE LM-G850, Android 12, SoC msmnile -->

| | |
|---|---|
| **Device**           | LGE LM-G850 |
| **SoC**              | msmnile |
| **RAM total**        | 5497 MiB |
| **Android version**  | 12 |
| **Ollama version**   | 0.20.5 |
| **Model**            | `gemma3:1b` |
| **Prompts version**  | 1 |
| **Runs per prompt**  | 2 |
| **Generated**        | 2026-04-12T19:08:17Z |
| **Ollama VmRSS (end)** | 99 MiB |

## Summary

- **Warm median:** `9.6 tok/s`
- **Warm range:** 8.53..13.4 tok/s
- **Cold first call:** `9.58 tok/s` (includes model load)
- **Total tokens generated:** 287
- **Total wall clock:** 53.8s

## Per-prompt detail

| Prompt | Run | Type | Tokens | Eval ms | Wall ms | tok/s |
|---|---|---|---|---|---|---|
| hello | 1 | cold | 14 | 1461 | 7860 | 9.58 |
| hello | 2 | warm | 14 | 1451 | 2669 | 9.65 |
| math | 1 | warm | 4 | 298 | 2140 | 13.40 |
| math | 2 | warm | 4 | 308 | 1702 | 12.98 |
| list | 1 | warm | 24 | 2499 | 4164 | 9.60 |
| list | 2 | warm | 25 | 2435 | 4382 | 10.27 |
| python | 1 | warm | 34 | 3599 | 5859 | 9.45 |
| python | 2 | warm | 36 | 3975 | 5670 | 9.06 |
| explain | 1 | warm | 63 | 7382 | 9672 | 8.53 |
| explain | 2 | warm | 69 | 7767 | 9681 | 8.88 |

## How this was generated

```
bash scripts/bench.sh --model gemma3:1b --runs 2
```

Fixed prompt set at `benchmarks/prompts.json` (version 1).
Contribute your device's numbers by running bench.sh and opening a PR
with the generated file. See `benchmarks/README.md` for the workflow.
