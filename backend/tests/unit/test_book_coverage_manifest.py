from __future__ import annotations

import json
from pathlib import Path

MANIFEST_PATH = Path(__file__).resolve().parents[1] / 'vensim_book_cases' / 'manifest.json'


def test_book_manifest_structure_and_unique_case_ids():
    manifest = json.loads(MANIFEST_PATH.read_text())
    cases = manifest['cases']
    assert isinstance(cases, list)
    assert len(cases) >= 70

    ids = [c['case_id'] for c in cases]
    assert len(ids) == len(set(ids)), 'Duplicate case_id in manifest'

    required_keys = {
        'case_id', 'title', 'part', 'vensim_model_available', 'priority_order',
        'feature_tags', 'import_status', 'simulation_status', 'native_edit_status',
        'parity_fixture_path', 'notes'
    }
    for case in cases:
        assert required_keys.issubset(case.keys())


def test_book_manifest_contains_expected_part_groups_and_hop_cases():
    manifest = json.loads(MANIFEST_PATH.read_text())
    cases = manifest['cases']
    parts = {c['part'] for c in cases}
    assert {'WARM-UP', 'RUN-UP', 'HOP', 'STEP', 'JUMP'} <= parts

    hop_ids = {c['case_id'] for c in cases if c['part'] == 'HOP'}
    assert '10.1' in hop_ids
    assert '10.16' in hop_ids

    # HOP should be fully represented from 10.1 to 10.16 in this seed manifest.
    expected_hop = {f'10.{i}' for i in range(1, 17)}
    assert expected_hop <= hop_ids
