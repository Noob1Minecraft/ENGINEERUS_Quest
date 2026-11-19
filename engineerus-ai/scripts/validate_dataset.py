"""Validate Engineerus AI Dataset Schema v1 JSONL files without modifying them."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any


REQUIRED_FIELDS = {
    "subject",
    "language",
    "problem",
    "student_step",
    "response_type",
    "ideal_response",
    "must_not_include",
}
STRING_FIELDS = REQUIRED_FIELDS - {"must_not_include"}
ALLOWED_SUBJECTS = {"physics", "mathematics"}
ALLOWED_LANGUAGES = {"en", "ru", "kk"}
ALLOWED_RESPONSE_TYPES = {
    "hint",
    "check_step",
    "explain_mistake",
    "guiding_question",
}


def validate_record(record: Any) -> list[str]:
    if not isinstance(record, dict):
        return ["record must be a JSON object"]

    errors: list[str] = []
    missing = sorted(REQUIRED_FIELDS - record.keys())
    if missing:
        errors.append(f"missing required fields: {', '.join(missing)}")

    for field in sorted(STRING_FIELDS & record.keys()):
        if not isinstance(record[field], str):
            errors.append(f"{field} must be a string")

    if isinstance(record.get("problem"), str) and not record["problem"].strip():
        errors.append("problem must be a non-empty string")
    if record.get("subject") not in ALLOWED_SUBJECTS:
        errors.append("subject must be physics or mathematics")
    if record.get("language") not in ALLOWED_LANGUAGES:
        errors.append("language must be en, ru, or kk")
    if record.get("response_type") not in ALLOWED_RESPONSE_TYPES:
        errors.append("response_type is not allowed")

    exclusions = record.get("must_not_include")
    if not isinstance(exclusions, list) or any(not isinstance(item, str) for item in exclusions):
        errors.append("must_not_include must be an array of strings")

    return errors


def validate_file(path: Path) -> list[str]:
    errors: list[str] = []
    try:
        lines = path.read_text(encoding="utf-8").splitlines()
    except (OSError, UnicodeError) as error:
        return [f"cannot read dataset: {error}"]

    for line_number, line in enumerate(lines, start=1):
        if not line.strip():
            continue
        try:
            record = json.loads(line)
        except json.JSONDecodeError as error:
            errors.append(f"line {line_number}: invalid JSON ({error.msg})")
            continue
        errors.extend(
            f"line {line_number}: {message}" for message in validate_record(record)
        )
    return errors


def main() -> int:
    parser = argparse.ArgumentParser(description="Validate Engineerus AI JSONL data.")
    parser.add_argument("dataset", type=Path)
    args = parser.parse_args()

    errors = validate_file(args.dataset)
    if errors:
        for error in errors:
            print(error)
        return 1
    print(f"Valid dataset: {args.dataset}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
