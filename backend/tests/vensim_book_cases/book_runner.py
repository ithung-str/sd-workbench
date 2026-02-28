from __future__ import annotations

import argparse
import csv
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent
MANIFEST_PATH = ROOT / 'manifest.json'
PARITY_CASES_ROOT = Path(__file__).resolve().parents[1] / 'vensim_parity' / 'cases'
REPORT_JSON_PATH = ROOT / 'book_coverage_report.json'
REPORT_MD_PATH = ROOT / 'book_coverage_report.md'
MATRIX_MD_PATH = Path(__file__).resolve().parents[2] / '..' / 'docs' / 'book-coverage-matrix.md'

PART_ORDER = ['WARM-UP', 'RUN-UP', 'HOP', 'STEP', 'JUMP']


def load_manifest(path: Path = MANIFEST_PATH) -> dict[str, Any]:
    return json.loads(path.read_text())


def fixture_status_for_case(case: dict[str, Any]) -> dict[str, Any]:
    parity_path = case.get('parity_fixture_path')
    if not parity_path:
        return {
            'fixture_exists': False,
            'has_model_mdl': False,
            'has_expected_csv': False,
            'has_capabilities_json': False,
            'path': None,
        }
    p = Path(parity_path)
    if not p.is_absolute():
        p = Path.cwd() / p
    return {
        'fixture_exists': p.exists(),
        'has_model_mdl': (p / 'model.mdl').exists(),
        'has_expected_csv': (p / 'expected.csv').exists(),
        'has_capabilities_json': (p / 'capabilities.json').exists(),
        'path': str(p),
    }


def summarize(manifest: dict[str, Any]) -> dict[str, Any]:
    rows = []
    for case in manifest['cases']:
        fixture = fixture_status_for_case(case)
        row = {**case, **fixture}
        rows.append(row)

    by_part: dict[str, dict[str, int]] = {}
    for part in PART_ORDER:
        part_rows = [r for r in rows if r['part'] == part]
        by_part[part] = {
            'total': len(part_rows),
            'vensim_model_available': sum(1 for r in part_rows if r['vensim_model_available']),
            'fixtures_seeded': sum(1 for r in part_rows if r['fixture_exists']),
            'baselines_present': sum(1 for r in part_rows if r['has_expected_csv']),
            'imports': sum(1 for r in part_rows if r['import_status'] in {'imports', 'imports_with_warnings'}),
            'simulation_passes': sum(1 for r in part_rows if r['simulation_status'] == 'passes'),
        }

    return {
        'source': manifest.get('source', {}),
        'totals': {
            'cases': len(rows),
            'vensim_model_available': sum(1 for r in rows if r['vensim_model_available']),
            'fixtures_seeded': sum(1 for r in rows if r['fixture_exists']),
            'baselines_present': sum(1 for r in rows if r['has_expected_csv']),
            'imports': sum(1 for r in rows if r['import_status'] in {'imports', 'imports_with_warnings'}),
            'simulation_passes': sum(1 for r in rows if r['simulation_status'] == 'passes'),
        },
        'by_part': by_part,
        'rows': rows,
    }


def write_report_json(report: dict[str, Any], out_path: Path = REPORT_JSON_PATH) -> None:
    out_path.write_text(json.dumps(report, indent=2) + '\n')


def write_report_md(report: dict[str, Any], out_path: Path = REPORT_MD_PATH) -> None:
    lines = []
    lines.append('# Book Coverage Report')
    lines.append('')
    src = report.get('source', {})
    if src:
        lines.append(f"Source snapshot: {src.get('snapshot_date', 'unknown')}")
        lines.append('')
    t = report['totals']
    lines.append('## Totals')
    lines.append('')
    lines.append(f"- Cases: {t['cases']}")
    lines.append(f"- Cases with Vensim models: {t['vensim_model_available']}")
    lines.append(f"- Fixtures seeded: {t['fixtures_seeded']}")
    lines.append(f"- Baselines present: {t['baselines_present']}")
    lines.append(f"- Imports completed: {t['imports']}")
    lines.append(f"- Simulations passing: {t['simulation_passes']}")
    lines.append('')
    lines.append('## By Part')
    lines.append('')
    lines.append('| Part | Total | Vensim models | Fixtures | Baselines | Imports | Sim passes |')
    lines.append('|---|---:|---:|---:|---:|---:|---:|')
    for part in PART_ORDER:
        p = report['by_part'][part]
        lines.append(f"| {part} | {p['total']} | {p['vensim_model_available']} | {p['fixtures_seeded']} | {p['baselines_present']} | {p['imports']} | {p['simulation_passes']} |")
    out_path.write_text('\n'.join(lines) + '\n')


def regenerate_matrix_md(manifest: dict[str, Any], out_path: Path = Path('docs/book-coverage-matrix.md')) -> None:
    # Keep matrix in sync with manifest status fields and seeded fixture paths.
    summary = {part: {'total': 0, 'mdl': 0} for part in PART_ORDER}
    rows = []
    for c in manifest['cases']:
        summary[c['part']]['total'] += 1
        summary[c['part']]['mdl'] += 1 if c['vensim_model_available'] else 0
        rows.append(
            f"| {c['case_id']} | {c['title']} | {c['part']} | {'yes' if c['vensim_model_available'] else 'no'} | {c['import_status']} | {c['simulation_status']} | {c['native_edit_status']} | {', '.join(c['feature_tags']) if c['feature_tags'] else ''} | {c['parity_fixture_path'] or ''} | {c['notes']} |"
        )
    src = manifest.get('source', {})
    md = []
    md.append('# Book Coverage Matrix: Pruyt (Small System Dynamics Models for Big Issues)')
    md.append('')
    md.append('Seeded from TU Delft exercises/cases index and intended to track app support status for all examples in the book.')
    md.append('')
    md.append('Sources:')
    md.append(f"- Book PDF: {src.get('book_pdf','')}")
    md.append(f"- Exercises/Cases index: {src.get('exercises_index','')}")
    md.append(f"- Snapshot date: {src.get('snapshot_date','')}")
    md.append('')
    md.append('## Coverage Summary (Seed)')
    md.append('')
    md.append('| Part | Total Cases | Cases with Vensim Model Link |')
    md.append('|---|---:|---:|')
    for part in PART_ORDER:
        md.append(f"| {part} | {summary[part]['total']} | {summary[part]['mdl']} |")
    md.append('')
    md.append('## Tracking Matrix')
    md.append('')
    md.append('| Case ID | Title | Part | Vensim model? | Import | Simulation | Native edit | Feature tags | Parity fixture | Notes |')
    md.append('|---|---|---|---|---|---|---|---|---|---|')
    md.extend(rows)
    out_path.write_text('\n'.join(md) + '\n')


def main() -> int:
    parser = argparse.ArgumentParser(description='Generate book coverage reports from manifest and parity fixtures')
    parser.add_argument('--manifest', type=Path, default=MANIFEST_PATH)
    parser.add_argument('--json-out', type=Path, default=REPORT_JSON_PATH)
    parser.add_argument('--md-out', type=Path, default=REPORT_MD_PATH)
    parser.add_argument('--regenerate-matrix', action='store_true')
    args = parser.parse_args()

    manifest = load_manifest(args.manifest)
    report = summarize(manifest)
    write_report_json(report, args.json_out)
    write_report_md(report, args.md_out)
    if args.regenerate_matrix:
        regenerate_matrix_md(manifest, Path('docs/book-coverage-matrix.md'))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
