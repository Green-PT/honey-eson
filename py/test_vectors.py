"""Conformance + Python-specific tests. Run: python3 py/test_vectors.py"""

import json
import pathlib
import sys
import unittest

sys.path.insert(0, str(pathlib.Path(__file__).parent))
import eso

VECTORS = json.loads((pathlib.Path(__file__).parent.parent / "vectors" / "vectors.json").read_text())


class Conformance(unittest.TestCase):
    def test_valid_canonical_encode_and_lossless_decode(self):
        for case in VECTORS["valid"]:
            with self.subTest(case["name"]):
                self.assertEqual(eso.encode(case["value"]), case["eso"])
                self.assertEqual(eso.decode(case["eso"]), case["value"])

    def test_decode_only(self):
        for case in VECTORS["decode_only"]:
            with self.subTest(case["name"]):
                self.assertEqual(eso.decode(case["eso"]), case["value"])

    def test_invalid_rejected(self):
        for case in VECTORS["invalid"]:
            with self.subTest(case["name"]):
                with self.assertRaises(eso.ESOError):
                    eso.decode(case["eso"])


class PythonSpecific(unittest.TestCase):
    def test_arbitrary_precision_integers(self):
        big = 2**53 + 1  # corrupts in float64
        doc = {"id": big, "rows": [{"id": -(10**30)}], "ids": [10**40]}
        self.assertEqual(eso.decode(eso.encode(doc)), doc)
        self.assertEqual(eso.decode("!eso/1\nid=9007199254740993\n")["id"], big)

    def test_number_option_and_reserved_n(self):
        out = eso.encode({"rows": [{"x": "a"}, {"x": "b"}]}, number=True)
        self.assertIn("rows[2]{n,x}", out)
        self.assertEqual(eso.decode(out)["rows"], [{"n": 1, "x": "a"}, {"n": 2, "x": "b"}])
        with self.assertRaises(eso.ESOError):
            eso.encode({"rows": [{"n": 9}]}, number=True)
        with self.assertRaises(eso.ESOError):
            eso.decode("!eso/1\nrows[2]{n,x}\n1\ta\n3\tb\n")

    def test_bool_is_not_int(self):
        self.assertEqual(eso.encode({"t": True}), "!eso/1\nt=true\n")
        self.assertEqual(eso.decode("!eso/1\nt=true\n"), {"t": True})

    def test_rejects_bad_values(self):
        for bad in ({"x": float("nan")}, {"x": float("inf")}, {"a b": 1}, {1: "x"}, {"x": {1: 2}}):
            with self.subTest(repr(bad)):
                with self.assertRaises(eso.ESOError):
                    eso.encode(bad)
        cyclic = {}
        cyclic["self"] = cyclic
        with self.assertRaises(eso.ESOError):
            eso.encode({"c": cyclic})


if __name__ == "__main__":
    unittest.main()
