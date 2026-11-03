"""Validate tracker data and read the backup formats emitted by CirGrid."""

from datetime import date
import json
import re


MAX_IMPORT_BYTES = 10 * 1024 * 1024
MAX_STATE_BYTES = 3 * 1024 * 1024
HABIT_COLORS = {"blue", "yellow", "pink", "sage", "purple", "teal"}
RESERVED_IDS = {
    "__defineGetter__", "__defineSetter__", "__lookupGetter__", "__lookupSetter__",
    "__proto__", "constructor", "hasOwnProperty", "isPrototypeOf",
    "propertyIsEnumerable", "prototype", "toLocaleString", "toString", "valueOf",
}
JS_WHITESPACE = "\u0009\u000a\u000b\u000c\u000d\u0020\u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000\ufeff"


def tracker_text(value, maximum, minimum=0):
    if not isinstance(value, str) or value.strip(JS_WHITESPACE) != value or re.search(r"[\x00-\x1f\x7f]", value):
        return False
    try:
        return minimum <= len(value.encode("utf-16-le")) // 2 <= maximum
    except UnicodeEncodeError:
        return False


def tracker_date(value):
    if not isinstance(value, str) or not re.fullmatch(r"[0-9]{4}-[0-9]{2}-[0-9]{2}", value):
        raise ValueError("Invalid date.")
    return date.fromisoformat(value)


def validate_state(state, allow_legacy=False):
    """Accept v2 data or, for imports, the browser-only v1 shape."""
    if not isinstance(state, dict) or state.keys() != {"version", "habits", "completions"}:
        raise ValueError("Invalid tracker data.")
    version, habits, completions = state["version"], state["habits"], state["completions"]
    if (type(version) is not int or version not in ((1, 2) if allow_legacy else (2,))
            or not isinstance(habits, list) or not isinstance(completions, dict)):
        raise ValueError("Unsupported tracker data.")
    fields = {"id", "name", "color"}
    if version == 2:
        fields |= {"weeklyGoals", "endDate", "stageGoal"}
    ids, names = set(), set()
    for habit in habits:
        if not isinstance(habit, dict) or habit.keys() != fields:
            raise ValueError("Invalid habit.")
        identifier, name, color = habit["id"], habit["name"], habit["color"]
        if (not isinstance(identifier, str) or not re.fullmatch(r"[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}", identifier)
                or identifier in RESERVED_IDS or identifier in ids
                or not tracker_text(name, 60, 1) or name.lower() in names
                or not isinstance(color, str)
                or (color not in HABIT_COLORS and (version == 1 or not re.fullmatch(r"#[0-9a-f]{6}", color)))):
            raise ValueError("Invalid habit.")
        if version == 2:
            weekly_goals, end_date, stage_goal = habit["weeklyGoals"], habit["endDate"], habit["stageGoal"]
            if not isinstance(weekly_goals, dict) or "0001-01-01" not in weekly_goals:
                raise ValueError("Missing weekly goal.")
            if not tracker_text(stage_goal, 120) or (stage_goal and not end_date):
                raise ValueError("Invalid stage goal.")
            if end_date != "":
                tracker_date(end_date)
            for day, goal in weekly_goals.items():
                if tracker_date(day).weekday() != 0 or type(goal) is not int or not 1 <= goal <= 7:
                    raise ValueError("Invalid weekly goal.")
        ids.add(identifier)
        names.add(name.lower())
    for day, records in completions.items():
        tracker_date(day)
        if not isinstance(records, dict) or not records:
            raise ValueError("Invalid check-ins.")
        for identifier, status in records.items():
            if identifier not in ids or (status is not True and (version == 1 or status != "late")):
                raise ValueError("Invalid check-in.")


def unique_fields(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("Duplicate fields are not allowed.")
        result[key] = value
    return result


def invalid_constant(value):
    raise ValueError(f"Invalid number: {value}.")


DECODER = json.JSONDecoder(object_pairs_hook=unique_fields, parse_constant=invalid_constant)


def dump_yaml(value):
    # The same two-space block format used by Daily Todo, with JSON-quoted strings.
    escapes = {code: f"\\u{code:04x}" for code in (*range(0x7f, 0xa0), 0x2028, 0x2029, 0xfffe, 0xffff)}

    def scalar(item):
        return json.dumps(item, ensure_ascii=False).translate(escapes)

    def lines(item, indent):
        entries = item.items() if isinstance(item, dict) else ((None, child) for child in item)
        for key, child in entries:
            prefix = " " * indent + (scalar(key) + ":" if key is not None else "-")
            if isinstance(child, (dict, list)) and child:
                yield prefix
                yield from lines(child, indent + 2)
            else:
                yield prefix + " " + scalar(child)

    return "\n".join(lines(value, 0)) + "\n"


def read_yaml(content):
    # Only the small grammar emitted by dump_yaml. Tags, anchors and aliases are unnecessary.
    lines = []
    for line in content.splitlines():
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        indent = len(line) - len(line.lstrip(" "))
        if "\t" in line or indent % 2 or indent > 8:
            raise ValueError("Use an unmodified CirGrid YAML export.")
        lines.append((indent, line[indent:]))

    def block(index, indent):
        sequence = lines[index][1] == "-" or lines[index][1].startswith("- ")
        result = [] if sequence else {}
        while index < len(lines) and lines[index][0] == indent:
            text = lines[index][1]
            if sequence:
                if text != "-" and not text.startswith("- "):
                    raise ValueError("Invalid YAML sequence.")
                rest = text[1:].strip()
            else:
                key, end = DECODER.raw_decode(text)
                if not isinstance(key, str) or key in result or not text[end:].startswith(":"):
                    raise ValueError("Invalid YAML key.")
                rest = text[end + 1:].strip()
            index += 1
            if rest:
                value = DECODER.decode(rest)
                if isinstance(value, (dict, list)) and value:
                    raise ValueError("Use an unmodified CirGrid YAML export.")
            elif index < len(lines) and lines[index][0] == indent + 2:
                value, index = block(index, indent + 2)
            else:
                raise ValueError("Invalid YAML indentation.")
            if sequence:
                result.append(value)
            else:
                result[key] = value
        return result, index

    if not lines or lines[0][0] != 0:
        raise ValueError("Invalid YAML document.")
    value, consumed = block(0, 0)
    if consumed != len(lines):
        raise ValueError("Invalid YAML document.")
    return value


def read_backup(content, file_format):
    content = content.removeprefix("\ufeff")
    value = DECODER.decode(content) if file_format == "json" else read_yaml(content)
    if isinstance(value, dict) and value.keys() == {"format", "state"}:
        if value["format"] != "cirgrid-export":
            raise ValueError("This file belongs to another application.")
        value = value["state"]
    validate_state(value, allow_legacy=True)
    return value
