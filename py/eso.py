"""ESO (Efficient Structured Output) — Python implementation. Spec: ../SPEC.md

Lossless, line-oriented wire format for agent-to-agent handoffs.
Arbitrary-precision integers are native ``int``; JSON is used for nested cells.
"""

from __future__ import annotations

import json
import re

HEADER = "!eso/1"
_NAME = re.compile(r"^[A-Za-z_][A-Za-z0-9_.-]*$")
_NUMBER = re.compile(r"^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$")
_SCALAR = re.compile(r"^([A-Za-z_][A-Za-z0-9_.-]*)=(.*)$")
_SECTION = re.compile(r"^([A-Za-z_][A-Za-z0-9_.-]*)(?:\[(\d+)\])?(?:\{([^}]*)\})?$")


class ESOError(ValueError):
    """Raised on malformed documents or unencodable values."""


def _assert_name(name: str) -> None:
    if not _NAME.match(name):
        raise ESOError(f"Invalid ESO name: {name}")


def _json(value, seen=None):
    """Compact JSON for nested cells; validates depth-first like the reference."""
    seen = seen if seen is not None else set()
    if value is None or isinstance(value, str):
        return json.dumps(value, ensure_ascii=False)
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, int):
        return str(value)
    if isinstance(value, float):
        if value != value or value in (float("inf"), float("-inf")):
            raise ESOError("ESO only supports finite numbers")
        return json.dumps(value)
    if not isinstance(value, (list, dict)):
        raise ESOError(f"Unsupported ESO value: {type(value).__name__}")
    if id(value) in seen:
        raise ESOError("ESO does not support cyclic values")
    seen.add(id(value))
    if isinstance(value, list):
        out = "[" + ",".join(_json(item, seen) for item in value) + "]"
    else:
        parts = []
        for key, item in value.items():
            if not isinstance(key, str):
                raise ESOError(f"Unsupported ESO key: {type(key).__name__}")
            parts.append(json.dumps(key, ensure_ascii=False) + ":" + _json(item, seen))
        out = "{" + ",".join(parts) + "}"
    seen.discard(id(value))
    return out


def _cell(value) -> str:
    if value is None or isinstance(value, (bool, int, float)):
        return _json(value)
    if not isinstance(value, str):
        return _json(value)
    bare = (
        value
        and value == value.strip()
        and not any(ch in value for ch in "\t\r\n")
        and not _NUMBER.match(value)
        and value not in ("null", "true", "false")
        and value[0] not in '"[{'
    )
    return value if bare else json.dumps(value, ensure_ascii=False)


def _value(text: str):
    if text == "null":
        return None
    if text == "true":
        return True
    if text == "false":
        return False
    if _NUMBER.match(text):
        if not any(ch in text for ch in ".eE"):
            return int(text)  # arbitrary precision, no 2^53 corruption
        parsed = float(text)
        if parsed in (float("inf"), float("-inf")):
            raise ESOError(f"Invalid ESO number: {text}")
        return parsed
    if text[:1] and text[:1] in '"[{':
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            raise ESOError(f"Invalid ESO cell: {text}") from None
    return text


def _is_record(value) -> bool:
    return isinstance(value, dict)


def encode(data: dict, *, number: bool = False) -> str:
    """Encode a dict to an ESO document. ``number=True`` prepends a reserved
    1-based ``n`` field to every record array (restores positional access)."""
    if not _is_record(data):
        raise ESOError("ESO document root must be an object")
    lines = [HEADER]
    for name, item in data.items():
        if not isinstance(name, str):
            raise ESOError(f"Unsupported ESO key: {type(name).__name__}")
        _assert_name(name)
        if isinstance(item, list):
            records = len(item) > 0 and all(_is_record(row) for row in item)
            if records:
                fields = list(item[0].keys())
                for field in fields:
                    if not isinstance(field, str):
                        raise ESOError(f"Unsupported ESO key: {type(field).__name__}")
                    _assert_name(field)
                if any(list(row.keys()) != fields for row in item):
                    raise ESOError(f"ESO record array {name} must have one schema")
                rows = item
                if number:
                    if "n" in fields:
                        raise ESOError(f"ESO record array {name} already has a field n")
                    fields = ["n"] + fields
                    rows = [{"n": i + 1, **row} for i, row in enumerate(item)]
                lines.append(f"{name}[{len(item)}]{{{','.join(fields)}}}")
                for row in rows:
                    lines.append("\t".join(_cell(row[field]) for field in fields))
            else:
                lines.append(f"{name}[{len(item)}]")
                for element in item:
                    lines.append(_cell(element))
        elif _is_record(item):
            fields = list(item.keys())
            for field in fields:
                if not isinstance(field, str):
                    raise ESOError(f"Unsupported ESO key: {type(field).__name__}")
                _assert_name(field)
            lines.append(f"{name}{{{','.join(fields)}}}")
            lines.append("\t".join(_cell(item[field]) for field in fields))
        else:
            lines.append(f"{name}={_cell(item)}")
    return "\n".join(lines) + "\n"


def decode(source: str) -> dict:
    """Decode an ESO document to a dict. Raises ESOError on malformed input."""
    if not isinstance(source, str):
        raise ESOError("ESO source must be a string")
    lines = source.replace("\r\n", "\n").split("\n")
    if lines and lines[-1] == "":
        lines.pop()
    if not lines or lines.pop(0) != HEADER:
        raise ESOError(f"Expected {HEADER}")
    output: dict = {}
    i = 0
    while i < len(lines):
        head = lines[i]
        i += 1
        match = _SCALAR.match(head)
        if match:
            name = match.group(1)
            if name in output:
                raise ESOError(f"Duplicate ESO name: {name}")
            output[name] = _value(match.group(2))
            continue
        match = _SECTION.match(head)
        if not match or (match.group(2) is None and match.group(3) is None):
            raise ESOError(f"Invalid ESO section: {head}")
        name, count_text, field_text = match.groups()
        if name in output:
            raise ESOError(f"Duplicate ESO name: {name}")
        count = 1 if count_text is None else int(count_text)
        fields = None if field_text is None else (field_text.split(",") if field_text else [])
        if fields is not None:
            for field in fields:
                _assert_name(field)
            if len(set(fields)) != len(fields):
                raise ESOError(f"Duplicate field in {name}")
        if len(lines) - i < count:
            raise ESOError(f"Section {name} expected {count} rows, got {len(lines) - i}")
        numbered = count_text is not None and fields is not None and fields[:1] == ["n"]
        rows = []
        for row_index in range(count):
            line = lines[i]
            i += 1
            if fields is None:
                rows.append(_value(line))
                continue
            cells = [] if not fields and line == "" else line.split("\t")
            if len(cells) != len(fields):
                raise ESOError(f"Section {name} expected {len(fields)} cells, got {len(cells)}")
            row = {field: _value(cells[j]) for j, field in enumerate(fields)}
            if numbered and row["n"] != row_index + 1:
                raise ESOError(
                    f"Section {name} row {row_index + 1} has n={row['n']}; n must be 1-based and sequential"
                )
            rows.append(row)
        output[name] = rows[0] if count_text is None else rows
    return output
