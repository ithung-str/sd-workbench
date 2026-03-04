"""Tests for repair_ai_model — no API key required."""
from __future__ import annotations

import copy

import pytest

from app.schemas.model import (
    AuxNode,
    CloudNode,
    FlowLinkEdge,
    FlowNode,
    InfluenceEdge,
    LookupNode,
    ModelDocument,
    Position,
    StockNode,
    TextNode,
)
from app.services.ai_model_service import (
    ALLOWED_EDGE_FIELDS,
    ALLOWED_FIELDS,
    KNOWN_ACTION_TYPES,
    PATCHABLE_FIELDS,
    PROMPT_AUX_EXAMPLE,
    PROMPT_CLOUD_EXAMPLE,
    PROMPT_FLOW_EXAMPLE,
    PROMPT_FLOW_LINK_EXAMPLE,
    PROMPT_INFLUENCE_EXAMPLE,
    PROMPT_LOOKUP_EXAMPLE,
    PROMPT_STOCK_EXAMPLE,
    PROMPT_TEXT_EXAMPLE,
    apply_patches,
    repair_ai_model,
    validate_actions,
)


def _minimal_model(**overrides) -> dict:
    """Return a minimal valid-ish raw model dict."""
    base = {
        "id": "m1",
        "name": "Test",
        "version": 1,
        "nodes": [],
        "edges": [],
        "outputs": [],
    }
    base.update(overrides)
    return base


def _stock_node(**overrides) -> dict:
    node = {
        "id": "s1",
        "type": "stock",
        "name": "Population",
        "label": "Population",
        "equation": "birth_rate",
        "initial_value": "100",
        "position": {"x": 100, "y": 200},
    }
    node.update(overrides)
    return node


def _flow_node(**overrides) -> dict:
    node = {
        "id": "f1",
        "type": "flow",
        "name": "birth_rate",
        "label": "birth_rate",
        "equation": "Population * 0.03",
        "position": {"x": 50, "y": 200},
    }
    node.update(overrides)
    return node


# ---- flat x/y → position ----

def test_flat_xy_converted_to_position():
    model = _minimal_model(nodes=[{
        "id": "s1", "type": "stock", "name": "Pop", "label": "Pop",
        "equation": "", "initial_value": "0",
        "x": 100, "y": 200,
    }])
    repaired = repair_ai_model(model)
    node = repaired["nodes"][0]
    assert node["position"] == {"x": 100, "y": 200}
    assert "x" not in node
    assert "y" not in node


def test_missing_position_gets_default():
    model = _minimal_model(nodes=[{
        "id": "s1", "type": "stock", "name": "Pop", "label": "Pop",
        "equation": "", "initial_value": "0",
    }])
    repaired = repair_ai_model(model)
    assert repaired["nodes"][0]["position"] == {"x": 0, "y": 0}


# ---- missing label → from name ----

def test_missing_label_copied_from_name():
    model = _minimal_model(nodes=[{
        "id": "a1", "type": "aux", "name": "growth_rate",
        "equation": "0.03",
        "position": {"x": 0, "y": 0},
    }])
    repaired = repair_ai_model(model)
    assert repaired["nodes"][0]["label"] == "growth_rate"


def test_empty_label_copied_from_name():
    model = _minimal_model(nodes=[{
        "id": "a1", "type": "aux", "name": "growth_rate", "label": "",
        "equation": "0.03",
        "position": {"x": 0, "y": 0},
    }])
    repaired = repair_ai_model(model)
    assert repaired["nodes"][0]["label"] == "growth_rate"


# ---- missing initial_value for stocks ----

def test_missing_initial_value_defaults_to_zero():
    model = _minimal_model(nodes=[{
        "id": "s1", "type": "stock", "name": "Pop", "label": "Pop",
        "equation": "inflow",
        "position": {"x": 0, "y": 0},
    }])
    repaired = repair_ai_model(model)
    assert repaired["nodes"][0]["initial_value"] == "0"


def test_none_initial_value_defaults_to_zero():
    model = _minimal_model(nodes=[{
        "id": "s1", "type": "stock", "name": "Pop", "label": "Pop",
        "equation": "inflow", "initial_value": None,
        "position": {"x": 0, "y": 0},
    }])
    repaired = repair_ai_model(model)
    assert repaired["nodes"][0]["initial_value"] == "0"


def test_existing_initial_value_preserved():
    model = _minimal_model(nodes=[_stock_node(initial_value="500")])
    repaired = repair_ai_model(model)
    assert repaired["nodes"][0]["initial_value"] == "500"


# ---- missing equation ----

def test_missing_equation_defaults_to_empty():
    model = _minimal_model(nodes=[{
        "id": "a1", "type": "aux", "name": "x", "label": "x",
        "position": {"x": 0, "y": 0},
    }])
    repaired = repair_ai_model(model)
    assert repaired["nodes"][0]["equation"] == ""


# ---- strip extra fields ----

def test_extra_fields_stripped_from_stock():
    node = _stock_node(bogus_field="junk", another="nope")
    model = _minimal_model(nodes=[node])
    repaired = repair_ai_model(model)
    assert "bogus_field" not in repaired["nodes"][0]
    assert "another" not in repaired["nodes"][0]


def test_extra_fields_stripped_from_edge():
    model = _minimal_model(edges=[{
        "id": "e1", "type": "influence", "source": "a1", "target": "f1",
        "weight": 1.5, "animated": True,
    }])
    repaired = repair_ai_model(model)
    edge = repaired["edges"][0]
    assert "weight" not in edge
    assert "animated" not in edge
    assert edge["source"] == "a1"


# ---- auto-generate id ----

def test_missing_id_auto_generated():
    model = _minimal_model(nodes=[{
        "type": "aux", "name": "x", "label": "x",
        "equation": "1", "position": {"x": 0, "y": 0},
    }])
    repaired = repair_ai_model(model)
    assert repaired["nodes"][0]["id"]  # truthy, non-empty
    assert len(repaired["nodes"][0]["id"]) > 0


def test_empty_id_auto_generated():
    model = _minimal_model(nodes=[{
        "id": "", "type": "aux", "name": "x", "label": "x",
        "equation": "1", "position": {"x": 0, "y": 0},
    }])
    repaired = repair_ai_model(model)
    assert repaired["nodes"][0]["id"] != ""


def test_missing_edge_id_auto_generated():
    model = _minimal_model(edges=[{
        "type": "influence", "source": "a1", "target": "f1",
    }])
    repaired = repair_ai_model(model)
    assert repaired["edges"][0]["id"]


# ---- auto-populate outputs ----

def test_outputs_auto_populated_when_empty():
    model = _minimal_model(
        nodes=[_stock_node(), _flow_node()],
        outputs=[],
    )
    repaired = repair_ai_model(model)
    assert "Population" in repaired["outputs"]
    assert "birth_rate" in repaired["outputs"]


def test_existing_outputs_preserved():
    model = _minimal_model(
        nodes=[_stock_node(), _flow_node()],
        outputs=["Population"],
    )
    repaired = repair_ai_model(model)
    assert repaired["outputs"] == ["Population"]


# ---- drop unknown node types ----

def test_unknown_node_type_dropped():
    model = _minimal_model(nodes=[
        _stock_node(),
        {"id": "x1", "type": "connector", "name": "bad", "position": {"x": 0, "y": 0}},
    ])
    repaired = repair_ai_model(model)
    assert len(repaired["nodes"]) == 1
    assert repaired["nodes"][0]["type"] == "stock"


def test_unknown_edge_type_dropped():
    model = _minimal_model(edges=[
        {"id": "e1", "type": "influence", "source": "a", "target": "b"},
        {"id": "e2", "type": "data_link", "source": "c", "target": "d"},
    ])
    repaired = repair_ai_model(model)
    assert len(repaired["edges"]) == 1
    assert repaired["edges"][0]["type"] == "influence"


# ---- cloud node ----

def test_cloud_node_extra_fields_stripped():
    model = _minimal_model(nodes=[{
        "id": "c1", "type": "cloud",
        "name": "source", "label": "source", "equation": "",
        "position": {"x": 0, "y": 0},
    }])
    repaired = repair_ai_model(model)
    node = repaired["nodes"][0]
    assert "name" not in node
    assert "label" not in node
    assert "equation" not in node
    assert node["position"] == {"x": 0, "y": 0}


# ---- text node ----

def test_text_node_extra_fields_stripped():
    model = _minimal_model(nodes=[{
        "id": "t1", "type": "text", "text": "Hello",
        "name": "note", "label": "note", "equation": "bad",
        "position": {"x": 10, "y": 20},
    }])
    repaired = repair_ai_model(model)
    node = repaired["nodes"][0]
    assert "name" not in node
    assert "label" not in node
    assert "equation" not in node
    assert node["text"] == "Hello"


# ---- text/cloud nodes not in outputs ----

def test_text_and_cloud_not_in_auto_outputs():
    model = _minimal_model(nodes=[
        _stock_node(),
        {"id": "t1", "type": "text", "text": "Note", "position": {"x": 0, "y": 0}},
        {"id": "c1", "type": "cloud", "position": {"x": 0, "y": 0}},
    ])
    repaired = repair_ai_model(model)
    assert "Note" not in repaired["outputs"]
    assert repaired["outputs"] == ["Population"]


# ---- version forced ----

def test_version_forced_to_1():
    model = _minimal_model(version=2)
    repaired = repair_ai_model(model)
    assert repaired["version"] == 1


def test_version_forced_when_missing():
    model = _minimal_model()
    del model["version"]
    repaired = repair_ai_model(model)
    assert repaired["version"] == 1


# ---- idempotent ----

def test_repair_is_idempotent():
    model = _minimal_model(nodes=[_stock_node(), _flow_node()])
    first = repair_ai_model(copy.deepcopy(model))
    second = repair_ai_model(copy.deepcopy(first))
    # Outputs should be identical (excluding auto-generated IDs which are stable)
    assert first["nodes"] == second["nodes"]
    assert first["edges"] == second["edges"]
    assert first["version"] == second["version"]
    assert first["outputs"] == second["outputs"]


# ---- flow_link edge ----

def test_flow_link_edge_preserved():
    model = _minimal_model(edges=[{
        "id": "fl1", "type": "flow_link",
        "source": "s1", "target": "f1",
    }])
    repaired = repair_ai_model(model)
    assert len(repaired["edges"]) == 1
    assert repaired["edges"][0]["type"] == "flow_link"


# ---- missing name filled from label ----

def test_missing_name_copied_from_label():
    model = _minimal_model(nodes=[{
        "id": "a1", "type": "aux", "label": "growth_rate",
        "equation": "0.03",
        "position": {"x": 0, "y": 0},
    }])
    repaired = repair_ai_model(model)
    assert repaired["nodes"][0]["name"] == "growth_rate"


# ========================================================================
# Schema-drift detection tests
# ========================================================================
# These tests validate the prompt examples against the real Pydantic schemas.
# If you add a required field to a schema, the PROMPT_*_EXAMPLE constant will
# fail to construct at import time. If you add an optional field to the
# allowed-fields set, these tests catch the mismatch.

class TestPromptExamplesMatchSchemas:
    """Prompt examples must round-trip through their Pydantic models."""

    def test_stock_example_validates(self):
        data = PROMPT_STOCK_EXAMPLE.model_dump()
        StockNode.model_validate(data)

    def test_flow_example_validates(self):
        data = PROMPT_FLOW_EXAMPLE.model_dump()
        FlowNode.model_validate(data)

    def test_aux_example_validates(self):
        data = PROMPT_AUX_EXAMPLE.model_dump()
        AuxNode.model_validate(data)

    def test_lookup_example_validates(self):
        data = PROMPT_LOOKUP_EXAMPLE.model_dump()
        LookupNode.model_validate(data)

    def test_cloud_example_validates(self):
        data = PROMPT_CLOUD_EXAMPLE.model_dump()
        CloudNode.model_validate(data)

    def test_text_example_validates(self):
        data = PROMPT_TEXT_EXAMPLE.model_dump()
        TextNode.model_validate(data)

    def test_influence_example_validates(self):
        data = PROMPT_INFLUENCE_EXAMPLE.model_dump()
        InfluenceEdge.model_validate(data)

    def test_flow_link_example_validates(self):
        data = PROMPT_FLOW_LINK_EXAMPLE.model_dump()
        FlowLinkEdge.model_validate(data)


class TestAllowedFieldsMatchSchemas:
    """ALLOWED_FIELDS sets must cover every field the Pydantic schema accepts."""

    def _schema_fields(self, model_cls) -> set[str]:
        return set(model_cls.model_fields.keys())

    def test_stock_allowed_fields_cover_schema(self):
        assert self._schema_fields(StockNode) <= ALLOWED_FIELDS["stock"]

    def test_flow_allowed_fields_cover_schema(self):
        assert self._schema_fields(FlowNode) <= ALLOWED_FIELDS["flow"]

    def test_aux_allowed_fields_cover_schema(self):
        assert self._schema_fields(AuxNode) <= ALLOWED_FIELDS["aux"]

    def test_lookup_allowed_fields_cover_schema(self):
        assert self._schema_fields(LookupNode) <= ALLOWED_FIELDS["lookup"]

    def test_text_allowed_fields_cover_schema(self):
        assert self._schema_fields(TextNode) <= ALLOWED_FIELDS["text"]

    def test_cloud_allowed_fields_cover_schema(self):
        assert self._schema_fields(CloudNode) <= ALLOWED_FIELDS["cloud"]

    def test_influence_allowed_fields_cover_schema(self):
        assert self._schema_fields(InfluenceEdge) <= ALLOWED_EDGE_FIELDS["influence"]

    def test_flow_link_allowed_fields_cover_schema(self):
        assert self._schema_fields(FlowLinkEdge) <= ALLOWED_EDGE_FIELDS["flow_link"]

    def test_no_phantom_node_fields(self):
        """ALLOWED_FIELDS should not list fields that don't exist in the schema."""
        for ntype, cls in [
            ("stock", StockNode), ("flow", FlowNode), ("aux", AuxNode),
            ("lookup", LookupNode), ("text", TextNode), ("cloud", CloudNode),
        ]:
            schema_fields = self._schema_fields(cls)
            extra = ALLOWED_FIELDS[ntype] - schema_fields
            assert not extra, f"ALLOWED_FIELDS['{ntype}'] has phantom fields: {extra}"

    def test_no_phantom_edge_fields(self):
        """ALLOWED_EDGE_FIELDS should not list fields that don't exist in the schema."""
        for etype, cls in [
            ("influence", InfluenceEdge), ("flow_link", FlowLinkEdge),
        ]:
            schema_fields = self._schema_fields(cls)
            extra = ALLOWED_EDGE_FIELDS[etype] - schema_fields
            assert not extra, f"ALLOWED_EDGE_FIELDS['{etype}'] has phantom fields: {extra}"


class TestFullModelRoundTrip:
    """A model built from prompt examples must pass ModelDocument validation."""

    def test_prompt_examples_form_valid_model(self):
        doc = ModelDocument(
            id="test", name="Test Model", version=1,
            nodes=[
                PROMPT_STOCK_EXAMPLE,
                PROMPT_FLOW_EXAMPLE,
                PROMPT_AUX_EXAMPLE,
                PROMPT_CLOUD_EXAMPLE,
                PROMPT_TEXT_EXAMPLE,
            ],
            edges=[PROMPT_INFLUENCE_EXAMPLE, PROMPT_FLOW_LINK_EXAMPLE],
            outputs=["Population", "birth_rate"],
        )
        # Round-trip through dict → validate
        ModelDocument.model_validate(doc.model_dump())


# ========================================================================
# apply_patches tests
# ========================================================================

def _make_model_doc(**overrides) -> ModelDocument:
    """Build a valid ModelDocument for patch testing."""
    base = {
        "id": "m1",
        "name": "Test",
        "version": 1,
        "nodes": [
            {
                "id": "s1", "type": "stock", "name": "Population", "label": "Population",
                "equation": "birth_rate", "initial_value": "100",
                "position": {"x": 100, "y": 200},
            },
            {
                "id": "f1", "type": "flow", "name": "birth_rate", "label": "birth_rate",
                "equation": "Population * 0.03",
                "position": {"x": 50, "y": 200},
            },
        ],
        "edges": [],
        "outputs": ["Population", "birth_rate"],
    }
    base.update(overrides)
    return ModelDocument.model_validate(base)


class TestApplyPatches:
    """Tests for the apply_patches function."""

    def test_patch_equation(self):
        model = _make_model_doc()
        patches = [{"node_name": "birth_rate", "field": "equation", "value": "Population * 0.05"}]
        updated, parsed = apply_patches(model, patches)
        flow = next(n for n in updated.nodes if n.name == "birth_rate")
        assert flow.equation == "Population * 0.05"
        assert len(parsed) == 1
        assert parsed[0].node_name == "birth_rate"
        assert parsed[0].field == "equation"

    def test_patch_initial_value(self):
        model = _make_model_doc()
        patches = [{"node_name": "Population", "field": "initial_value", "value": "500"}]
        updated, parsed = apply_patches(model, patches)
        stock = next(n for n in updated.nodes if n.name == "Population")
        assert stock.initial_value == "500"

    def test_patch_units(self):
        model = _make_model_doc()
        patches = [{"node_name": "Population", "field": "units", "value": "people"}]
        updated, parsed = apply_patches(model, patches)
        stock = next(n for n in updated.nodes if n.name == "Population")
        assert stock.units == "people"

    def test_patch_non_negative(self):
        model = _make_model_doc()
        patches = [{"node_name": "Population", "field": "non_negative", "value": True}]
        updated, parsed = apply_patches(model, patches)
        stock = next(n for n in updated.nodes if n.name == "Population")
        assert stock.non_negative is True

    def test_multiple_patches(self):
        model = _make_model_doc()
        patches = [
            {"node_name": "birth_rate", "field": "equation", "value": "Population * 0.05"},
            {"node_name": "Population", "field": "initial_value", "value": "200"},
        ]
        updated, parsed = apply_patches(model, patches)
        flow = next(n for n in updated.nodes if n.name == "birth_rate")
        stock = next(n for n in updated.nodes if n.name == "Population")
        assert flow.equation == "Population * 0.05"
        assert stock.initial_value == "200"
        assert len(parsed) == 2

    def test_patch_bad_node_name_raises(self):
        from fastapi import HTTPException as _HTTPException
        model = _make_model_doc()
        patches = [{"node_name": "nonexistent", "field": "equation", "value": "0"}]
        with pytest.raises(_HTTPException) as exc_info:
            apply_patches(model, patches)
        assert exc_info.value.status_code == 422
        assert "AI_PATCH_BAD_TARGET" in str(exc_info.value.detail)

    def test_patch_bad_field_raises(self):
        from fastapi import HTTPException as _HTTPException
        model = _make_model_doc()
        patches = [{"node_name": "Population", "field": "position", "value": {"x": 0, "y": 0}}]
        with pytest.raises(_HTTPException) as exc_info:
            apply_patches(model, patches)
        assert exc_info.value.status_code == 422
        assert "AI_PATCH_BAD_FIELD" in str(exc_info.value.detail)

    def test_patch_preserves_other_fields(self):
        model = _make_model_doc()
        patches = [{"node_name": "Population", "field": "equation", "value": "birth_rate - 1"}]
        updated, _ = apply_patches(model, patches)
        stock = next(n for n in updated.nodes if n.name == "Population")
        assert stock.initial_value == "100"  # unchanged
        assert stock.position.x == 100  # unchanged
        assert stock.equation == "birth_rate - 1"  # changed

    def test_patchable_fields_constant(self):
        """PATCHABLE_FIELDS should contain exactly the documented set."""
        assert PATCHABLE_FIELDS == {"equation", "initial_value", "units", "label", "name", "non_negative", "min_value", "max_value", "longitude", "latitude", "dimensions", "equation_overrides"}


# ========================================================================
# validate_actions tests
# ========================================================================

class TestValidateActions:
    """Tests for the validate_actions function."""

    def test_known_action_passes(self):
        actions = [{"type": "update_sim_config", "params": {"stop": 100}}]
        result = validate_actions(actions)
        assert len(result) == 1
        assert result[0].type == "update_sim_config"
        assert result[0].params == {"stop": 100}

    def test_multiple_known_actions_pass(self):
        actions = [
            {"type": "create_scenario", "params": {"name": "High Growth"}},
            {"type": "navigate", "params": {"page": "scenarios"}},
        ]
        result = validate_actions(actions)
        assert len(result) == 2

    def test_unknown_action_raises(self):
        from fastapi import HTTPException as _HTTPException
        actions = [{"type": "do_magic", "params": {}}]
        with pytest.raises(_HTTPException) as exc_info:
            validate_actions(actions)
        assert exc_info.value.status_code == 422
        assert "AI_UNKNOWN_ACTION" in str(exc_info.value.detail)

    def test_missing_required_params_raises(self):
        from fastapi import HTTPException as _HTTPException
        actions = [{"type": "create_scenario", "params": {}}]  # missing 'name'
        with pytest.raises(_HTTPException) as exc_info:
            validate_actions(actions)
        assert exc_info.value.status_code == 422
        assert "AI_ACTION_MISSING_PARAMS" in str(exc_info.value.detail)

    def test_empty_list_passes(self):
        result = validate_actions([])
        assert result == []

    def test_action_with_no_required_params(self):
        """Actions like run_simulate have no required params."""
        actions = [{"type": "run_simulate", "params": {}}]
        result = validate_actions(actions)
        assert len(result) == 1
        assert result[0].type == "run_simulate"

    def test_action_default_empty_params(self):
        """Missing params key defaults to empty dict."""
        actions = [{"type": "run_validate"}]
        result = validate_actions(actions)
        assert len(result) == 1
        assert result[0].params == {}
