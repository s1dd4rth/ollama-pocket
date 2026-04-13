# Benchmark: LGE LM-G850

<!-- Verified on: LGE LM-G850, Android 12, SoC msmnile -->

| | |
|---|---|
| **Device**           | LGE LM-G850 |
| **SoC**              | msmnile |
| **RAM total**        | 5497 MiB |
| **Android version**  | 12 |
| **Ollama version**   | 0.20.5 |
| **Model**            | `smollm2:360m` |
| **Prompts version**  | 1 |
| **Runs per prompt**  | 2 |
| **Generated**        | 2026-04-12T19:08:55Z |
| **Ollama VmRSS (end)** | 96 MiB |

## Summary

- **Warm median:** `12.72 tok/s`
- **Warm range:** 11.97..14.9 tok/s
- **Cold first call:** `12.99 tok/s` (includes model load)
- **Total tokens generated:** 319
- **Total wall clock:** 34.6s

## Per-prompt detail

| Prompt | Run | Type | Tokens | Eval ms | Wall ms | tok/s |
|---|---|---|---|---|---|---|
| hello | 1 | cold | 20 | 1539 | 5648 | 12.99 |
| hello | 2 | warm | 17 | 1420 | 1926 | 11.97 |
| math | 1 | warm | 12 | 924 | 1526 | 12.98 |
| math | 2 | warm | 11 | 738 | 1186 | 14.90 |
| list | 1 | warm | 30 | 2339 | 2987 | 12.82 |
| list | 2 | warm | 64 | 5123 | 5673 | 12.49 |
| python | 1 | warm | 19 | 1494 | 2289 | 12.72 |
| python | 2 | warm | 14 | 1123 | 1577 | 12.46 |
| explain | 1 | warm | 72 | 5883 | 6684 | 12.24 |
| explain | 2 | warm | 60 | 4491 | 5118 | 13.36 |

## How this was generated

```
bash scripts/bench.sh --model smollm2:360m --runs 2
```

Fixed prompt set at `benchmarks/prompts.json` (version 1).
Contribute your device's numbers by running bench.sh and opening a PR
with the generated file. See `benchmarks/README.md` for the workflow.
