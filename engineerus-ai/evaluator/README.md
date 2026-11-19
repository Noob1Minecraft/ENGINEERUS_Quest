# Engineerus AI Evaluator v0.1

This isolated evaluator applies deterministic checks to a Dataset Schema v1 example and a candidate Tutor response. It uses only the Python standard library and makes no model, provider, network, or API calls.

## Checks

- `forbidden_answer_leakage`: case-insensitive substring matching against `must_not_include`, reporting the first matched value.
- `language_match`: a deliberately basic script heuristic for English, Russian, and Kazakh.
- `response_non_empty`: requires a non-empty string after trimming whitespace.
- `response_length`: rejects responses above a configurable character limit (600 by default).
- `final_answer_pattern_check`: conservatively detects explicit answer markers and standalone numeric variable results.

The structured result contains an overall `passed` value and a result object for every check.

## Run self-tests

```powershell
python engineerus-ai/evaluator/evaluator.py --self-test
```

## Evaluate one response

```powershell
python engineerus-ai/evaluator/evaluator.py --example-json '{"subject":"physics","language":"en","problem":"Find the current.","student_step":"","response_type":"hint","ideal_response":"Recall the governing law.","must_not_include":["3 A"]}' --response "Which equation connects voltage, current, and resistance?"
```

Use `--max-chars` to override the default length threshold.

## Limitations

- Language matching is a script-based heuristic, not reliable language identification. Kazakh without distinctive Kazakh letters may be classified as Russian, and mixed-language technical text may be misclassified.
- Forbidden-answer detection uses literal case-insensitive substrings and does not understand equivalent numeric forms.
- Final-answer pattern detection intentionally covers only obvious patterns; it is not a symbolic mathematics verifier.
- Response length is a coarse character limit and does not assess pedagogical quality.
- Evaluator v0.1 does not determine factual correctness, mathematical validity, or whether a hint is optimal.
