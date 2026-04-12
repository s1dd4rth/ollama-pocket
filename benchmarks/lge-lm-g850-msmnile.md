# Benchmark: LGE LM-G850

<!-- Verified on: LGE LM-G850, Android 12, SoC msmnile -->

| | |
|---|---|
| **Device**           | LGE LM-G850 |
| **SoC**              | msmnile |
| **RAM total**        | 5497 MiB |
| **Android version**  | 12 |
| **Ollama version**   | 0.20.5 |
| **Model**            | `qwen2.5:1.5b` |
| **Prompts version**  | 1 |
| **Runs per prompt**  | 2 |
| **Generated**        | 2026-04-12T18:28:51Z |
| **Ollama VmRSS (end)** | 1137 MiB |

## Summary

- **Warm median:** `7.38 tok/s`
- **Warm range:** 5.89..10.65 tok/s
- **Cold first call:** `7.28 tok/s` (includes model load)
- **Total tokens generated:** 220
- **Total wall clock:** 47.7s

## Per-prompt detail

| Prompt | Run | Type | Tokens | Eval ms | Wall ms | tok/s |
|---|---|---|---|---|---|---|
| hello | 1 | cold | 10 | 1372 | 6586 | 7.28 |
| hello | 2 | warm | 11 | 1376 | 2226 | 7.99 |
| math | 1 | warm | 4 | 418 | 2086 | 9.57 |
| math | 2 | warm | 4 | 375 | 1181 | 10.65 |
| list | 1 | warm | 44 | 6036 | 7820 | 7.29 |
| list | 2 | warm | 31 | 4249 | 5169 | 7.30 |
| python | 1 | warm | 16 | 2082 | 4536 | 7.68 |
| python | 2 | warm | 16 | 2718 | 3549 | 5.89 |
| explain | 1 | warm | 55 | 7876 | 9649 | 6.98 |
| explain | 2 | warm | 29 | 3928 | 4855 | 7.38 |

## How this was generated

```
bash scripts/bench.sh --model qwen2.5:1.5b --runs 2
```

Fixed prompt set at `benchmarks/prompts.json` (version 1).
Contribute your device's numbers by running bench.sh and opening a PR
with the generated file. See `benchmarks/README.md` for the workflow.
