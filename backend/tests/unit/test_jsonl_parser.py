"""Tests for the JSONL streaming parser."""

from __future__ import annotations

import json
import uuid

import pytest

from app.services.jsonl_parser import (
    JSONLLineBuffer,
    assemble_model_from_chunks,
    detect_monolithic_response,
    parse_jsonl_line,
    repair_chunk,
    validate_chunk,
)


# ---------------------------------------------------------------------------
# JSONLLineBuffer
# ---------------------------------------------------------------------------

class TestJSONLLineBuffer:
    def test_feed_complete_lines(self):
        buf = JSONLLineBuffer()
        lines = buf.feed('{"type":"node"}\n{"type":"edge"}\n')
        assert lines == ['{"type":"node"}', '{"type":"edge"}']

    def test_feed_partial_lines(self):
        buf = JSONLLineBuffer()
        lines1 = buf.feed('{"type":"no')
        assert lines1 == []
        lines2 = buf.feed('de"}\n')
        assert lines2 == ['{"type":"node"}']

    def test_feed_mixed(self):
        buf = JSONLLineBuffer()
        lines = buf.feed('first\nsecond\nthir')
        assert lines == ["first", "second"]
        rest = buf.flush()
        assert rest == "thir"

    def test_flush_empty(self):
        buf = JSONLLineBuffer()
        assert buf.flush() is None

    def test_flush_partial(self):
        buf = JSONLLineBuffer()
        buf.feed("partial content")
        assert buf.flush() == "partial content"
        assert buf.flush() is None  # second flush is empty

    def test_empty_lines_skipped(self):
        buf = JSONLLineBuffer()
        lines = buf.feed('first\n\n  \nsecond\n')
        assert lines == ["first", "second"]


# ---------------------------------------------------------------------------
# parse_jsonl_line
# ---------------------------------------------------------------------------

class TestParseJsonlLine:
    def test_valid_json(self):
        result = parse_jsonl_line('{"type":"node","data":{"id":"s1"}}')
        assert result == {"type": "node", "data": {"id": "s1"}}

    def test_code_fence(self):
        assert parse_jsonl_line("```json") is None
        assert parse_jsonl_line("```") is None

    def test_empty_line(self):
        assert parse_jsonl_line("") is None
        assert parse_jsonl_line("   ") is None

    def test_invalid_json(self):
        assert parse_jsonl_line("not json at all") is None

    def test_brace_extraction(self):
        # JSON with leading text
        result = parse_jsonl_line('some prefix {"type":"edge"}')
        assert result == {"type": "edge"}

    def test_non_dict_json(self):
        assert parse_jsonl_line("[1,2,3]") is None
        assert parse_jsonl_line('"hello"') is None


# ---------------------------------------------------------------------------
# repair_chunk
# ---------------------------------------------------------------------------

class TestRepairChunk:
    def test_repair_node_position_normalization(self):
        chunk = {"type": "node", "data": {"type": "stock", "name": "Pop", "x": 100, "y": 200}}
        result = repair_chunk(chunk)
        assert result["data"]["position"] == {"x": 100, "y": 200}
        assert "x" not in result["data"]
        assert "y" not in result["data"]

    def test_repair_node_default_position(self):
        chunk = {"type": "node", "data": {"type": "aux", "name": "rate"}}
        result = repair_chunk(chunk)
        assert result["data"]["position"] == {"x": 0, "y": 0}

    def test_repair_node_auto_id(self):
        chunk = {"type": "node", "data": {"type": "stock", "name": "Pop"}}
        result = repair_chunk(chunk)
        assert result["data"]["id"]  # Should have an auto-generated ID
        uuid.UUID(result["data"]["id"])  # Should be a valid UUID

    def test_repair_node_default_label(self):
        chunk = {"type": "node", "data": {"type": "flow", "name": "births"}}
        result = repair_chunk(chunk)
        assert result["data"]["label"] == "births"

    def test_repair_node_default_equation(self):
        chunk = {"type": "node", "data": {"type": "aux", "name": "rate"}}
        result = repair_chunk(chunk)
        assert result["data"]["equation"] == ""

    def test_repair_stock_default_initial_value(self):
        chunk = {"type": "node", "data": {"type": "stock", "name": "Pop"}}
        result = repair_chunk(chunk)
        assert result["data"]["initial_value"] == "0"

    def test_repair_node_strip_unknown_fields(self):
        chunk = {"type": "node", "data": {
            "type": "stock", "id": "s1", "name": "Pop", "label": "Pop",
            "equation": "b-d", "initial_value": "100",
            "position": {"x": 0, "y": 0},
            "unknown_field": "should be stripped",
        }}
        result = repair_chunk(chunk)
        assert "unknown_field" not in result["data"]

    def test_repair_edge_auto_id(self):
        chunk = {"type": "edge", "data": {"type": "influence", "source": "a1", "target": "f1"}}
        result = repair_chunk(chunk)
        assert result["data"]["id"]
        uuid.UUID(result["data"]["id"])

    def test_repair_edge_strip_unknown_fields(self):
        chunk = {"type": "edge", "data": {
            "type": "flow_link", "id": "e1", "source": "s1", "target": "f1",
            "extra": "gone",
        }}
        result = repair_chunk(chunk)
        assert "extra" not in result["data"]

    def test_repair_non_dict_data(self):
        chunk = {"type": "node", "data": "not a dict"}
        result = repair_chunk(chunk)
        # Should pass through without error
        assert result == chunk

    def test_repair_message_passthrough(self):
        chunk = {"type": "message", "data": {"text": "Hello"}}
        result = repair_chunk(chunk)
        assert result == chunk


# ---------------------------------------------------------------------------
# validate_chunk
# ---------------------------------------------------------------------------

class TestValidateChunk:
    def test_valid_stock(self):
        chunk = {"type": "node", "data": {
            "type": "stock", "id": "s1", "name": "Pop", "label": "Pop",
            "equation": "births - deaths", "initial_value": "1000",
            "position": {"x": 100, "y": 100},
        }}
        data, status, errors = validate_chunk(chunk)
        assert status == "valid"
        assert errors == []

    def test_invalid_stock_missing_initial_value(self):
        chunk = {"type": "node", "data": {
            "type": "stock", "id": "s1", "name": "Pop", "label": "Pop",
            "equation": "births - deaths",
            "position": {"x": 100, "y": 100},
            # missing initial_value
        }}
        data, status, errors = validate_chunk(chunk)
        assert status == "warning"
        assert len(errors) > 0

    def test_unknown_node_type(self):
        chunk = {"type": "node", "data": {"type": "unknown_type"}}
        data, status, errors = validate_chunk(chunk)
        assert status == "error"
        assert "Unknown node type" in errors[0]

    def test_valid_edge(self):
        chunk = {"type": "edge", "data": {
            "type": "influence", "id": "e1", "source": "a1", "target": "f1",
        }}
        data, status, errors = validate_chunk(chunk)
        assert status == "valid"

    def test_unknown_edge_type(self):
        chunk = {"type": "edge", "data": {"type": "bogus"}}
        data, status, errors = validate_chunk(chunk)
        assert status == "error"

    def test_valid_action(self):
        chunk = {"type": "action", "data": {
            "type": "update_sim_config", "params": {"start": 0, "stop": 100},
        }}
        data, status, errors = validate_chunk(chunk)
        assert status == "valid"

    def test_action_missing_required_params(self):
        chunk = {"type": "action", "data": {
            "type": "create_scenario", "params": {},
        }}
        data, status, errors = validate_chunk(chunk)
        assert status == "warning"
        assert "Missing required params" in errors[0]

    def test_unknown_action_type(self):
        chunk = {"type": "action", "data": {"type": "bogus_action"}}
        data, status, errors = validate_chunk(chunk)
        assert status == "error"

    def test_message_passthrough(self):
        chunk = {"type": "message", "data": {"text": "Built model"}}
        data, status, errors = validate_chunk(chunk)
        assert status == "valid"

    def test_unknown_chunk_type(self):
        chunk = {"type": "zzzz", "data": {}}
        data, status, errors = validate_chunk(chunk)
        assert status == "error"


# ---------------------------------------------------------------------------
# assemble_model_from_chunks
# ---------------------------------------------------------------------------

class TestAssembleModelFromChunks:
    def test_assemble_basic(self):
        chunks = [
            {"type": "node", "data": {"type": "stock", "id": "s1", "name": "Pop", "label": "Pop", "equation": "b-d", "initial_value": "100", "position": {"x": 0, "y": 0}}},
            {"type": "node", "data": {"type": "flow", "id": "f1", "name": "births", "label": "births", "equation": "Pop*0.03", "position": {"x": 100, "y": 0}}},
            {"type": "edge", "data": {"type": "influence", "id": "e1", "source": "s1", "target": "f1"}},
            {"type": "action", "data": {"type": "run_simulate"}},
            {"type": "message", "data": {"text": "Created model"}},
        ]
        result = assemble_model_from_chunks(chunks, model_name="Test")
        assert result["name"] == "Test"
        assert result["version"] == 1
        assert len(result["nodes"]) == 2
        assert len(result["edges"]) == 1
        assert result["_actions"] == [{"type": "run_simulate"}]
        assert result["_message"] == "Created model"
        assert "Pop" in result["outputs"]
        assert "births" in result["outputs"]

    def test_assemble_empty(self):
        result = assemble_model_from_chunks([])
        assert result["nodes"] == []
        assert result["edges"] == []
        assert result["outputs"] == []

    def test_assemble_custom_id(self):
        result = assemble_model_from_chunks([], model_id="custom-id")
        assert result["id"] == "custom-id"


# ---------------------------------------------------------------------------
# detect_monolithic_response
# ---------------------------------------------------------------------------

class TestDetectMonolithicResponse:
    def test_detect_model_response(self):
        text = json.dumps({"model": {"nodes": [], "edges": []}, "message": "done"})
        result = detect_monolithic_response(text)
        assert result is not None
        assert "model" in result

    def test_detect_patches_response(self):
        text = json.dumps({"patches": [{"node_name": "x", "field": "equation", "value": "1"}], "message": "patched"})
        result = detect_monolithic_response(text)
        assert result is not None
        assert "patches" in result

    def test_detect_clarification_response(self):
        text = json.dumps({"clarification": "What do you mean?", "suggestions": ["A", "B"]})
        result = detect_monolithic_response(text)
        assert result is not None
        assert "clarification" in result

    def test_detect_code_fenced(self):
        inner = json.dumps({"model": {"nodes": []}})
        text = f"```json\n{inner}\n```"
        result = detect_monolithic_response(text)
        assert result is not None

    def test_reject_jsonl(self):
        # A JSONL chunk should NOT match (no monolithic keys)
        text = '{"type":"node","data":{"id":"s1"}}'
        result = detect_monolithic_response(text)
        assert result is None

    def test_reject_empty(self):
        assert detect_monolithic_response("") is None
        assert detect_monolithic_response("   ") is None

    def test_reject_invalid_json(self):
        assert detect_monolithic_response("not json") is None

    def test_detect_actions_response(self):
        text = json.dumps({"actions": [{"type": "run_simulate"}], "message": "running"})
        result = detect_monolithic_response(text)
        assert result is not None
        assert "actions" in result
