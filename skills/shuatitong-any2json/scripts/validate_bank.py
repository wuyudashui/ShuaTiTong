#!/usr/bin/env python3
"""校验刷题通题库 JSON 的结构与答案编码。"""

from __future__ import annotations

import argparse
import base64
import binascii
import json
import re
import sys
from typing import Any
from urllib.parse import unquote, urlsplit

QUESTION_KEYS = {"id", "type", "question", "options", "answer", "difficulty", "explanation"}
OPTIONAL_QUESTION_KEYS = {"simpleExplanation"}
TYPES = {"single", "multi", "judge", "fill"}
DIFFICULTIES = {"易", "中", "难"}
BLOCK_TYPES = {"text", "f", "code", "image"}
MAX_SAFE_INTEGER = 9007199254740991
MAX_PUBLISH_BYTES = 8 * 1024 * 1024


def _duplicate_key(name: str):
    raise ValueError(f"发现重复 JSON 字段：{name}")


def load_json(path: str) -> Any:
    with open(path, "r", encoding="utf-8-sig") as fh:
        return json.load(fh, object_pairs_hook=lambda pairs: _pairs(pairs))


def _pairs(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for key, value in pairs:
        if key in result:
            _duplicate_key(key)
        result[key] = value
    return result


def _text(value: Any) -> str:
    if isinstance(value, str):
        return value
    if isinstance(value, list):
        return "".join(str(block.get("c", "")) for block in value if isinstance(block, dict))
    return ""


def _valid_image_source(source: str) -> bool:
    if re.search(r'[<>"\x00-\x20]', source):
        return False
    match = re.fullmatch(r"data:image/(png|jpe?g|webp|gif);base64,([A-Za-z0-9+/]+={0,2})", source, re.IGNORECASE)
    if match:
        try:
            data = base64.b64decode(match.group(2), validate=True)
        except (ValueError, binascii.Error):
            return False
        kind = match.group(1).lower()
        if kind == "png":
            return data.startswith(b"\x89PNG\r\n\x1a\n")
        if kind in {"jpg", "jpeg"}:
            return data.startswith(b"\xff\xd8\xff")
        if kind == "gif":
            return data.startswith((b"GIF87a", b"GIF89a"))
        return len(data) >= 12 and data[:4] == b"RIFF" and data[8:12] == b"WEBP"
    try:
        url = urlsplit(source)
        # Access port too, so malformed URLs fail locally rather than at import.
        port = url.port
        return (url.scheme.lower() == "https" and bool(url.hostname) and "\\" not in source
                and not unquote(url.path).lower().endswith((".svg", ".svgz")) and (port is None or port > 0))
    except ValueError:
        return False


def _validate_content(value: Any, path: str, errors: list[str]) -> None:
    if isinstance(value, str):
        if not value.strip():
            errors.append(f"{path} 不能为空")
        return
    if not isinstance(value, list) or not value:
        errors.append(f"{path} 必须是非空字符串或内容块数组")
        return
    for i, block in enumerate(value, 1):
        if not isinstance(block, dict) or not isinstance(block.get("t"), str) or block.get("t") not in BLOCK_TYPES:
            errors.append(f"{path}[{i}] 的内容块类型必须是 text、f、code 或 image")
            continue
        if not isinstance(block.get("c"), str) or not block["c"].strip():
            errors.append(f"{path}[{i}].c 不能为空字符串")
            continue
        if block["t"] == "image" and not _valid_image_source(block["c"]):
            errors.append(f"{path}[{i}].c 必须是有效 PNG/JPEG/WEBP/GIF Base64 数据 URL 或 HTTPS 图片 URL")
        if block["t"] == "image" and "alt" in block and not isinstance(block["alt"], str):
            errors.append(f"{path}[{i}].alt 必须是字符串")
        if "d" in block and not isinstance(block["d"], bool):
            errors.append(f"{path}[{i}].d 必须是布尔值")
        if block["t"] == "f":
            formula = block["c"].strip()
            if formula.startswith(("$", r"\(", r"\[")):
                errors.append(f"{path}[{i}].c 应为 LaTeX 本体，不包含数学定界符")
            if re.search(r"[\x00-\x08\x0b-\x1f]", block["c"]):
                errors.append(f"{path}[{i}].c 含控制字符，请检查 JSON 反斜杠转义")


def _blank_numbers(question: str) -> list[int]:
    patterns = [
        r"[_＿]{2,}\s*[（(]\s*(\d+)\s*[）)]",
        r"空\s*[（(]?\s*(\d+)\s*[）)]?",
    ]
    found: list[int] = []
    for pattern in patterns:
        found.extend(int(n) for n in re.findall(pattern, question))
    return sorted(set(found))


def validate_bank(bank: Any) -> dict[str, list[str]]:
    errors: list[str] = []
    warnings: list[str] = []
    if not isinstance(bank, list):
        return {"errors": ["顶层必须是题目数组，不能使用 questions 等包装对象"], "warnings": []}
    if not bank:
        errors.append("题库需要包含至少一道题目")

    ids: set[int] = set()
    for index, question in enumerate(bank, 1):
        prefix = f"第 {index} 题"
        if not isinstance(question, dict):
            errors.append(f"{prefix} 必须是对象")
            continue
        missing = QUESTION_KEYS - question.keys()
        if missing:
            errors.append(f"{prefix} 缺少字段：{', '.join(sorted(missing))}")
        extra = set(question) - QUESTION_KEYS - OPTIONAL_QUESTION_KEYS
        if extra:
            warnings.append(f"{prefix} 包含未使用字段：{', '.join(sorted(extra))}")

        qid = question.get("id")
        if not isinstance(qid, int) or isinstance(qid, bool) or not 1 <= qid <= MAX_SAFE_INTEGER:
            errors.append(f"{prefix}.id 必须是 JavaScript 安全范围内的正整数")
        elif qid in ids:
            errors.append(f"{prefix}.id={qid} 重复")
        else:
            ids.add(qid)

        qtype = question.get("type")
        if not isinstance(qtype, str) or qtype not in TYPES:
            errors.append(f"{prefix}.type 必须是 single、multi、judge 或 fill")
        _validate_content(question.get("question"), f"{prefix}.question", errors)

        options = question.get("options")
        if not isinstance(options, dict) or not options:
            errors.append(f"{prefix}.options 必须是非空对象")
            options = {}
        else:
            for key, value in options.items():
                _validate_content(value, f"{prefix}.options.{key}", errors)

        answer = question.get("answer")
        if not isinstance(answer, str):
            errors.append(f"{prefix}.answer 必须是字符串，填空题可以为空")
        elif qtype != "fill" and not answer.strip():
            errors.append(f"{prefix}.answer 必须是非空字符串")
        if not isinstance(answer, str):
            answer = ""
        difficulty = question.get("difficulty")
        if not isinstance(difficulty, str) or difficulty not in DIFFICULTIES:
            errors.append(f"{prefix}.difficulty 必须是 易、中、难 之一")
        if not isinstance(question.get("explanation"), str):
            errors.append(f"{prefix}.explanation 必须是字符串")
        if "simpleExplanation" in question and not isinstance(question["simpleExplanation"], str):
            errors.append(f"{prefix}.simpleExplanation 必须是字符串")

        if qtype == "single":
            keys = list(options)
            if any(not re.fullmatch(r"[A-Z]", k) for k in keys):
                errors.append(f"{prefix} 选择题选项键必须是大写字母")
            if not re.fullmatch(r"[A-Z]", answer or "") or answer not in options:
                errors.append(f"{prefix} 单选答案必须是 options 中的一个大写字母")
            if len(keys) < 2:
                errors.append(f"{prefix} 单选至少需要两个选项")
        elif qtype == "multi":
            if len(options) < 2 or any(not re.fullmatch(r"[A-Z]", k) for k in options):
                errors.append(f"{prefix} 多选需要至少两个大写字母选项")
            if not re.fullmatch(r"[A-Z]+", answer or ""):
                errors.append(f"{prefix} 多选答案必须是无分隔符的大写字母字符串")
            elif len(set(answer)) != len(answer) or answer != "".join(sorted(answer)) or any(k not in options for k in answer):
                errors.append(f"{prefix} 多选答案必须升序、无重复且全部存在于 options")
        elif qtype == "judge":
            if set(options) != {"A", "B"} or _text(options.get("A")) != "正确" or _text(options.get("B")) != "错误":
                errors.append(f"{prefix} 判断题 options 必须为 A=正确、B=错误")
            if answer not in {"A", "B"}:
                errors.append(f"{prefix} 判断题答案只能是 A 或 B")
        elif qtype == "fill":
            blank_keys = list(options)
            expected = [f"空{i}" for i in range(1, len(blank_keys) + 1)]
            if blank_keys != expected:
                warnings.append(f"{prefix} 使用旧式填空键；应用按当前顺序规范化为 空1、空2……，请核对空位后再导出")
            numbers = _blank_numbers(_text(question.get("question")))
            if numbers and numbers != list(range(1, max(numbers) + 1)):
                errors.append(f"{prefix} 题干填空编号不连续：{numbers}")
            if numbers and len(blank_keys) != max(numbers):
                errors.append(f"{prefix} 题干有 {max(numbers)} 个编号，但 options 有 {len(blank_keys)} 个答案")
            # 本地判分读取 options；answer 只是可空的查看摘要，不解析其分隔符。
            if not numbers:
                markers = re.findall(r"[_＿]{2,}", _text(question.get("question")))
                if markers and len(markers) != len(blank_keys):
                    errors.append(f"{prefix} 题干有 {len(markers)} 处下划线填空，但 options 有 {len(blank_keys)} 个答案")
                elif not markers:
                    warnings.append(f"{prefix} 未识别到填空标记，请人工核对空位与答案对应关系")

    return {"errors": errors, "warnings": warnings}


def validate_metadata(meta: Any) -> dict[str, list[str]]:
    errors: list[str] = []
    if not isinstance(meta, dict):
        return {"errors": ["发布元数据必须是独立 JSON 对象"], "warnings": []}
    allowed = {"filename", "name", "subject", "description", "overwrite"}
    if set(meta) - allowed:
        errors.append("发布元数据只允许 filename、name、subject、description、overwrite；不包含凭据或题目")
    filename = meta.get("filename")
    if not isinstance(filename, str) or not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_-]*\.json", filename) or filename.lower() == "catalog.json":
        errors.append("filename 必须是安全 ASCII 文件名，以 .json 结尾，不能是 catalog.json 或路径")
    for key in ("name", "subject"):
        if not isinstance(meta.get(key), str) or not meta[key].strip():
            errors.append(f"发布元数据 {key} 必须是非空字符串")
    if "description" in meta and not isinstance(meta["description"], str):
        errors.append("发布元数据 description 必须是字符串")
    if "overwrite" in meta and not isinstance(meta["overwrite"], bool):
        errors.append("发布元数据 overwrite 必须是布尔值")
    return {"errors": errors, "warnings": []}


def main() -> int:
    parser = argparse.ArgumentParser(description="校验刷题通题库 JSON")
    parser.add_argument("json_file")
    parser.add_argument("--metadata", help="同时校验独立 bank-meta.json 和 8 MiB 发布请求限制；不会上传")
    args = parser.parse_args()
    try:
        bank = load_json(args.json_file)
        result = validate_bank(bank)
        if args.metadata:
            meta = load_json(args.metadata)
            meta_result = validate_metadata(meta)
            result["errors"].extend(meta_result["errors"])
            if not result["errors"]:
                payload = dict(meta, questions=bank)
                size = len(json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8"))
                if size > MAX_PUBLISH_BYTES:
                    result["errors"].append(f"发布请求大小 {size} 字节超过 8 MiB；压缩图片或拆分题库后再发布")
    except (OSError, UnicodeError, json.JSONDecodeError, ValueError) as exc:
        print(f"错误：无法读取 JSON：{exc}")
        return 1
    for message in result["errors"]:
        print(f"错误：{message}")
    for message in result["warnings"]:
        print(f"警告：{message}")
    if not result["errors"]:
        print(f"通过：题库结构有效，共 {len(bank)} 题")
    return 1 if result["errors"] else 0


if __name__ == "__main__":
    sys.exit(main())
