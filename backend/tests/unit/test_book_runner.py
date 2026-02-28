from __future__ import annotations

import importlib.util
import json
from pathlib import Path


def _load_book_runner():
    path = Path(__file__).resolve().parents[1] / 'vensim_book_cases' / 'book_runner.py'
    spec = importlib.util.spec_from_file_location('book_runner_test_module', path)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_book_runner_summary_counts_include_fixture_stats():
    book_runner = _load_book_runner()
    manifest = book_runner.load_manifest()
    report = book_runner.summarize(manifest)
    assert report['totals']['cases'] >= 80
    assert report['totals']['fixtures_seeded'] >= 16  # all HOP seeded
    assert report['by_part']['HOP']['fixtures_seeded'] >= 16
    assert report['by_part']['HOP']['total'] == 16


def test_book_runner_writes_reports(tmp_path: Path):
    book_runner = _load_book_runner()
    manifest = book_runner.load_manifest()
    report = book_runner.summarize(manifest)
    out_json = tmp_path / 'report.json'
    out_md = tmp_path / 'report.md'
    book_runner.write_report_json(report, out_json)
    book_runner.write_report_md(report, out_md)
    assert json.loads(out_json.read_text())['totals']['cases'] >= 80
    assert '# Book Coverage Report' in out_md.read_text()
