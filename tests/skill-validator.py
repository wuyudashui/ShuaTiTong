"""Behavioral checks for the portable ShuaTiTong conversion validator."""

import base64
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[1]
SKILL = Path(os.environ.get("SHUATITONG_SKILL_DIR", str(ROOT / "skills/shuatitong-any2json")))
sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location("bank_validator", SKILL / "scripts/validate_bank.py")
validator = importlib.util.module_from_spec(spec)
spec.loader.exec_module(validator)
PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="


def question(**changes):
    item = {
        "id": 1, "type": "single", "question": "1 + 1 = ?",
        "options": {"A": "1", "B": "2"}, "answer": "B",
        "difficulty": "易", "explanation": "相加得 2。",
    }
    item.update(changes)
    return item


class BankValidatorTests(unittest.TestCase):
    def assert_valid(self, bank):
        self.assertEqual(validator.validate_bank(bank)["errors"], [])

    def assert_invalid(self, bank):
        self.assertTrue(validator.validate_bank(bank)["errors"])

    def test_nonempty_raw_array_is_required(self):
        self.assert_invalid({"questions": [question()]})
        self.assert_invalid([])

    def test_ids_must_be_unique_positive_safe_integers(self):
        for bad in (True, False, 0, -1, 1.5, "1", 9007199254740992):
            with self.subTest(id=bad):
                self.assert_invalid([question(id=bad)])
        self.assert_invalid([question(), question()])
        self.assert_valid([question(id=7), question(id=12)])

    def test_fill_answer_is_optional_summary_options_are_authoritative(self):
        fill = question(type="fill", question="____(1) 与 ____(2)",
                        options={"空1": "a | b", "空2": [{"t": "text", "c": "c"}]}, answer="")
        self.assert_valid([fill])
        fill["answer"] = "便于查看的答案摘要"
        self.assert_valid([fill])
        fill["answer"] = None
        self.assert_invalid([fill])

    def test_fill_legacy_keys_warn_without_rejecting_supported_input(self):
        fill = question(type="fill", question="____(1) + ____(2)",
                        options={"A": "1", "B": "2"}, answer="")
        result = validator.validate_bank([fill])
        self.assertEqual(result["errors"], [])
        self.assertTrue(result["warnings"])

    def test_fill_missing_blank_answer_is_rejected(self):
        self.assert_invalid([question(type="fill", question="____(1) ____(2)",
                                      options={"空1": "1"}, answer="")])
        self.assert_invalid([question(type="fill", question="____(1)",
                                      options={"空1": []}, answer="")])

    def test_judge_mapping_and_choice_answer_references(self):
        self.assert_valid([question(type="judge", options={"A": "正确", "B": "错误"}, answer="A")])
        self.assert_invalid([question(type="judge", options={"A": "错误", "B": "正确"}, answer="A")])
        self.assert_invalid([question(answer="C")])
        self.assert_invalid([question(type="multi", answer="BB")])
        self.assert_invalid([question(type="multi", answer="B,A")])
        self.assert_valid([question(type="multi", answer="AB")])

    def test_mixed_blocks_formula_display_and_matrix_backslashes_roundtrip(self):
        matrix = r"\begin{bmatrix}1 & 2 \\ 3 & 4\end{bmatrix}"
        item = question(question=[{"t": "text", "c": "矩阵："},
                                  {"t": "f", "c": matrix, "d": True},
                                  {"t": "code", "c": 'print("1")\n'},
                                  {"t": "image", "c": PNG, "alt": "像素示例"}],
                        explanation=r"**解释**：$\frac{1}{2}$、\(x\)、\[y\]。" + "\n$$" + matrix + "$$")
        decoded = json.loads(json.dumps([item], ensure_ascii=False))
        self.assert_valid(decoded)
        self.assertEqual(decoded[0]["question"][1]["c"], matrix)
        self.assertEqual(decoded[0]["explanation"], item["explanation"])

    def test_invalid_content_blocks_rejected(self):
        for block in ({"t": "html", "c": "<script>"}, {"t": "f", "c": 1},
                      {"t": "f", "c": "x", "d": "true"}, {"t": "image", "c": PNG, "alt": 1},
                      {"t": "f", "c": "$$x$$"}, {"t": "f", "c": "\x0crac{1}{2}"}):
            with self.subTest(block=block):
                self.assert_invalid([question(question=[block])])

    def test_safe_embedded_and_https_images_allowed(self):
        gif = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw=="
        webp = "data:image/webp;base64,UklGRhYAAABXRUJQVlA4TAoAAAAvAAAAEAcQERGIiP4HAA=="
        for source in (PNG, gif, webp, "https://example.org/diagram.png"):
            with self.subTest(source=source[:45]):
                self.assert_valid([question(question=[{"t": "image", "c": source}])])

    def test_malicious_or_unusable_image_sources_rejected(self):
        disguised = "data:image/png;base64," + base64.b64encode(b"<svg onload='alert(1)'/>").decode("ascii")
        sources = ("javascript:alert(1)", "data:image/svg+xml;base64,PHN2Zy8+", disguised,
                   "data:image/png;base64,...", "C:\\tmp\\image.png", "/images/a.png",
                   "file:///tmp/a.png", "http://example.org/a.png", "https://", "//example.org/a.png",
                   "https://example.org/a.svg")
        for source in sources:
            with self.subTest(source=source):
                self.assert_invalid([question(question=[{"t": "image", "c": source}])])

    def test_duplicate_json_fields_and_invalid_json_fail_cli(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "bank.json"
            for raw in ('[{"id":1,"id":2}]', '[{"question":"\\frac{1}{2}"}] trailing'):
                path.write_text(raw, encoding="utf-8")
                result = subprocess.run([sys.executable, "-X", "utf8", str(SKILL / "scripts/validate_bank.py"), str(path)],
                                        capture_output=True, text=True, encoding="utf-8")
                self.assertNotEqual(result.returncode, 0)

    def test_bundled_templates_validate(self):
        for path in sorted((SKILL / "assets").glob("template-*.json")):
            with self.subTest(template=path.name):
                self.assert_valid(validator.load_json(str(path)))

    def test_publication_metadata_rejects_reserved_names_paths_and_credentials(self):
        meta = {"filename": "linear-algebra.json", "name": "线性代数", "subject": "数学",
                "description": "矩阵基础", "overwrite": False}
        self.assertEqual(validator.validate_metadata(meta)["errors"], [])
        for filename in ("catalog.json", "CATALOG.json", "../bank.json", "bank.txt", "中文.json", "-bank.json"):
            with self.subTest(filename=filename):
                self.assertTrue(validator.validate_metadata(dict(meta, filename=filename))["errors"])
        self.assertTrue(validator.validate_metadata(dict(meta, token="secret"))["errors"])
        self.assertTrue(validator.validate_metadata(dict(meta, overwrite="true"))["errors"])

    def test_cli_metadata_validates_publication_payload_size_without_uploading(self):
        with tempfile.TemporaryDirectory() as directory:
            bank_path = Path(directory) / "questions.json"
            meta_path = Path(directory) / "bank-meta.json"
            meta_path.write_text(json.dumps({"filename": "test-bank.json", "name": "Test",
                                            "subject": "Math", "description": "", "overwrite": False}), encoding="utf-8")
            bank_path.write_text(json.dumps([question()], ensure_ascii=False), encoding="utf-8")
            command = [sys.executable, "-X", "utf8", str(SKILL / "scripts/validate_bank.py"), str(bank_path), "--metadata", str(meta_path)]
            result = subprocess.run(command, capture_output=True, text=True, encoding="utf-8")
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            bank_path.write_text(json.dumps([question(explanation="a" * (8 * 1024 * 1024))]), encoding="utf-8")
            result = subprocess.run(command, capture_output=True, text=True, encoding="utf-8")
            self.assertNotEqual(result.returncode, 0)


if __name__ == "__main__":
    unittest.main(verbosity=2)
