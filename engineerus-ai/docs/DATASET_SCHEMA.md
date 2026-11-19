# Engineerus AI Dataset Schema v1

Each dataset file uses JSON Lines (JSONL): one JSON object per non-empty line.

## Structure

```json
{
  "subject": "physics",
  "language": "en",
  "problem": "A 12 V battery is connected to a 4 ohm resistor. Find the current.",
  "student_step": "",
  "response_type": "hint",
  "ideal_response": "Start by recalling Ohm's law. Which equation relates voltage, current, and resistance?",
  "must_not_include": ["3 A", "I = 3"]
}
```

## Required fields

Every record must contain:

- `subject`
- `language`
- `problem`
- `student_step`
- `response_type`
- `ideal_response`
- `must_not_include`

`subject`, `language`, `problem`, `student_step`, `response_type`, and `ideal_response` must be strings. `must_not_include` must be an array of strings.

## Allowed values

### `subject`

- `physics`
- `mathematics`

### `language`

- `en`
- `ru`
- `kk`

### `response_type`

- `hint`
- `check_step`
- `explain_mistake`
- `guiding_question`

## Validation rules

- Each non-empty line must contain one valid JSON object.
- All required fields must be present and have the documented types.
- `problem` must be a non-empty string after trimming whitespace.
- `subject`, `language`, and `response_type` must use their allowed values.
- Every item in `must_not_include` must be a string.

## Valid example

```json
{"subject":"physics","language":"en","problem":"A 12 V battery is connected to a 4 ohm resistor. Find the current.","student_step":"","response_type":"hint","ideal_response":"Start by recalling Ohm's law. Which equation relates voltage, current, and resistance?","must_not_include":["3 A","I = 3"]}
```

## Invalid example

This record is invalid because `chemistry` is not an allowed subject and `problem` is empty.

```json
{"subject":"chemistry","language":"en","problem":"","student_step":"","response_type":"hint","ideal_response":"Recall the relevant relationship.","must_not_include":[]}
```
