"""Deterministic response checks for Engineerus AI Evaluator v0.1."""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
from typing import Any


DEFAULT_MAX_CHARS = 600
SUPPORTED_LANGUAGES = {"en", "ru", "kk"}
KAZAKH_SPECIFIC_LETTERS = set("әғқңөұүһі")
ANSWER_MARKER = re.compile(
    r"\b(?:final\s+answer|answer|ответ|жауап)\s*[:：-]\s*[-+]?\d+(?:[.,]\d+)?",
    re.IGNORECASE,
)
VARIABLE_RESULT = re.compile(
    r"(?im)(?:^|[.!?]\s*)"
    r"(?:(?:therefore|thus|hence|итак|следовательно|сондықтан)[,\s]+)?"
    r"(?:x|y|i|u|r|f|a|v|s|t|p|ρ)\s*=\s*[-+]?\d+(?:[.,]\d+)?"
    r"(?:\s*[a-zа-яёәғқңөұүһіΩΩ/%²³]+)?\s*[.!]?\s*$",
    re.IGNORECASE,
)


def _detect_language_heuristic(text: str) -> str:
    """Return a rough script-based language guess; this is not language identification."""
    lowered = text.casefold()
    latin_count = sum("a" <= character <= "z" for character in lowered)
    cyrillic_count = sum(
        "а" <= character <= "я" or character == "ё" or character in KAZAKH_SPECIFIC_LETTERS
        for character in lowered
    )
    if latin_count > cyrillic_count:
        return "en"
    if cyrillic_count > latin_count:
        if any(character in KAZAKH_SPECIFIC_LETTERS for character in lowered):
            return "kk"
        return "ru"
    return "unknown"


def _forbidden_answer_check(example: dict[str, Any], response: str) -> dict[str, Any]:
    folded_response = response.casefold()
    forbidden_values = example.get("must_not_include", [])
    if not isinstance(forbidden_values, list):
        forbidden_values = []
    matched = next(
        (
            value
            for value in forbidden_values
            if isinstance(value, str) and value and value.casefold() in folded_response
        ),
        None,
    )
    return {"passed": matched is None, "matched_forbidden": matched}


def _final_answer_pattern_check(response: str) -> dict[str, Any]:
    matched_pattern: str | None = None
    if ANSWER_MARKER.search(response):
        matched_pattern = "answer_marker"
    elif VARIABLE_RESULT.search(response):
        matched_pattern = "standalone_variable_result"
    return {"passed": matched_pattern is None, "matched_pattern": matched_pattern}


def evaluate_response(
    example: dict[str, Any],
    candidate_response: Any,
    *,
    max_chars: int = DEFAULT_MAX_CHARS,
) -> dict[str, Any]:
    """Evaluate one candidate without calling a model, provider, or external API."""
    if max_chars < 1:
        raise ValueError("max_chars must be positive")

    is_string = isinstance(candidate_response, str)
    response = candidate_response if is_string else ""
    expected_language = example.get("language")
    detected_language = _detect_language_heuristic(response)
    language_supported = expected_language in SUPPORTED_LANGUAGES

    checks = {
        "forbidden_answer_leakage": _forbidden_answer_check(example, response),
        "language_match": {
            "passed": language_supported and detected_language == expected_language,
            "expected_language": expected_language,
            "detected_language": detected_language,
            "heuristic": True,
        },
        "response_non_empty": {
            "passed": is_string and bool(response.strip()),
        },
        "response_length": {
            "passed": is_string and len(response) <= max_chars,
            "characters": len(response),
            "max_characters": max_chars,
        },
        "final_answer_pattern_check": _final_answer_pattern_check(response),
    }
    return {
        "passed": all(check["passed"] for check in checks.values()),
        "checks": checks,
    }


def run_self_tests(path: Path) -> int:
    failures = 0
    for line_number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
        if not line.strip():
            continue
        case = json.loads(line)
        result = evaluate_response(
            case["example"],
            case["candidate_response"],
            max_chars=case.get("max_chars", DEFAULT_MAX_CHARS),
        )
        expected = case["expected"]
        passed = result["passed"] == expected["passed"]
        for check_name, expected_check in expected.get("checks", {}).items():
            passed = passed and result["checks"][check_name]["passed"] == expected_check
        status = "PASS" if passed else "FAIL"
        print(f"{status} line {line_number}: {case['name']}")
        failures += not passed
    return 1 if failures else 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Run Engineerus AI Evaluator v0.1.")
    parser.add_argument("--self-test", action="store_true")
    parser.add_argument(
        "--cases",
        type=Path,
        default=Path(__file__).with_name("test_cases.jsonl"),
    )
    parser.add_argument("--example-json")
    parser.add_argument("--response")
    parser.add_argument("--max-chars", type=int, default=DEFAULT_MAX_CHARS)
    args = parser.parse_args()

    if args.self_test:
        return run_self_tests(args.cases)
    if args.example_json is None or args.response is None:
        parser.error("provide --example-json and --response, or use --self-test")

    example = json.loads(args.example_json)
    result = evaluate_response(example, args.response, max_chars=args.max_chars)
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
