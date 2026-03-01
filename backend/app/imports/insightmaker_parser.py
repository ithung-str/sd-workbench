from __future__ import annotations

import re
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from typing import Any

from app.schemas.imported import (
    ImportGapItem,
    ImportGapSummary,
    ImportedGraphSummary,
    ImportedModelView,
    ImportedTimeSettings,
    ImportedVariableSummary,
    ImportedVisualSummary,
)
from app.schemas.model import (
    AnnotationMetadata,
    LayoutMetadata,
    ModelDocument,
    ModelMetadata,
    ImportedMetadata,
    ImportedModelInfo,
    ImportedRoundTripMetadata,
    Position,
    VisualStyle,
    WaypointPosition,
)


_TAGS = {
    "setting": "Setting",
    "stock": "Stock",
    "flow": "Flow",
    "variable": "Variable",
    "converter": "Converter",
    "link": "Link",
    "text": "Text",
    "display": "Display",
}


def _first_text(elem: ET.Element, tag_names: list[str]) -> str | None:
    for tag_name in tag_names:
        child = elem.find(tag_name)
        if child is not None and child.text is not None:
            val = child.text.strip()
            if val:
                return val
    return None


def _first_value(elem: ET.Element, keys: list[str]) -> str | None:
    for key in keys:
        if key in elem.attrib and elem.attrib[key].strip():
            return elem.attrib[key].strip()
    return _first_text(elem, keys)


def _float_text(elem: ET.Element, tag_names: list[str]) -> float | None:
    text = _first_value(elem, tag_names)
    if text is None:
        return None
    try:
        return float(text)
    except Exception:
        return None


def _parse_style(elem: ET.Element, mx_cell: ET.Element | None) -> VisualStyle | None:
    style_blob = _first_text(elem, ["Style", "style"]) or ""
    if not style_blob and mx_cell is not None:
        style_blob = mx_cell.attrib.get("style", "")
    if not style_blob:
        return None
    parts: dict[str, str] = {}
    for part in style_blob.split(";"):
        if "=" not in part:
            continue
        key, value = part.split("=", 1)
        k = key.strip()
        v = value.strip()
        if k:
            parts[k] = v
    return VisualStyle(
        fill=parts.get("fillColor"),
        stroke=parts.get("strokeColor"),
        stroke_width=float(parts["strokeWidth"]) if parts.get("strokeWidth", "").replace(".", "", 1).isdigit() else None,
        line_style=parts.get("dashed"),
        opacity=float(parts["opacity"]) if parts.get("opacity", "").replace(".", "", 1).isdigit() else None,
        text_color=parts.get("fontColor"),
        font_family=parts.get("fontFamily"),
        font_size=float(parts["fontSize"]) if parts.get("fontSize", "").replace(".", "", 1).isdigit() else None,
        font_weight="bold" if parts.get("fontStyle") == "1" else None,
        text_align=parts.get("align"),
        background=parts.get("labelBackgroundColor"),
    )


def _parse_layout(mx_cell: ET.Element | None) -> LayoutMetadata | None:
    if mx_cell is None:
        return None
    geom = mx_cell.find("mxGeometry")
    width = None
    height = None
    x = None
    y = None
    waypoints: list[WaypointPosition] | None = None
    if geom is not None:
        try:
            width = float(geom.attrib.get("width", "")) if geom.attrib.get("width") is not None else None
        except Exception:
            width = None
        try:
            height = float(geom.attrib.get("height", "")) if geom.attrib.get("height") is not None else None
        except Exception:
            height = None
        try:
            x = float(geom.attrib.get("x", "")) if geom.attrib.get("x") is not None else None
        except Exception:
            x = None
        try:
            y = float(geom.attrib.get("y", "")) if geom.attrib.get("y") is not None else None
        except Exception:
            y = None
        # Extract waypoints from <Array as="points"><mxPoint .../></Array>
        array_elem = geom.find("Array[@as='points']")
        if array_elem is not None:
            pts: list[WaypointPosition] = []
            for pt in array_elem.findall("mxPoint"):
                try:
                    px = float(pt.attrib.get("x", "0"))
                    py = float(pt.attrib.get("y", "0"))
                    pts.append(WaypointPosition(x=px, y=py))
                except Exception:
                    continue
            if pts:
                waypoints = pts
    visible = None
    locked = None
    if mx_cell is not None:
        if "visible" in mx_cell.attrib:
            visible = mx_cell.attrib.get("visible") not in {"0", "false", "False"}
        if "locked" in mx_cell.attrib:
            locked = mx_cell.attrib.get("locked") in {"1", "true", "True"}
    return LayoutMetadata(
        width=width,
        height=height,
        visible=visible,
        locked=locked,
        source=f"x={x},y={y}" if x is not None and y is not None else None,
        waypoints=waypoints,
    )


def _position_from_layout(layout: LayoutMetadata | None) -> Position:
    if not layout or not layout.source:
        return Position(x=0.0, y=0.0)
    match = re.match(r"x=([-0-9.]+),y=([-0-9.]+)", layout.source)
    if not match:
        return Position(x=0.0, y=0.0)
    return Position(x=float(match.group(1)), y=float(match.group(2)))


def _normalize_name(value: str) -> str:
    return re.sub(r"[^a-z0-9_]+", "_", value.lower()).strip("_")


def _unique_name(base: str, seen: set[str]) -> str:
    """Return a unique normalized name, appending _2, _3, etc. on collision."""
    if base not in seen:
        seen.add(base)
        return base
    suffix = 2
    while f"{base}_{suffix}" in seen:
        suffix += 1
    unique = f"{base}_{suffix}"
    seen.add(unique)
    return unique


# InsightMaker function name (lowercase) → Python-safe equivalent
_IM_FUNCTION_MAP: dict[str, str] = {
    "ifthenelse": "_ifthenelse",
    "pulse": "_pulse",
    "step": "_step",
    "ramp": "_ramp",
    "delay": "_delay",
    "delay1": "_delay1",
    "delay3": "_delay3",
    "smooth": "_smooth",
    "smooth3": "_smooth3",
    "years": "_years",
    "months": "_months",
    "weeks": "_weeks",
    "days": "_days",
    "hours": "_hours",
    "minutes": "_minutes",
    "seconds": "_seconds",
    # Case-insensitive built-ins
    "min": "min",
    "max": "max",
    "abs": "abs",
    "exp": "exp",
    "log": "log",
}


def _translate_equation(equation: str, name_map: dict[str, str]) -> str:
    """Translate InsightMaker equation syntax to Python-safe syntax.

    - Replaces [Variable Name] bracket references with normalized names
    - Converts InsightMaker function names to internal names (case-insensitive)
    - Rewrites IfThenElse(cond=val, ...) equality syntax to _ifthenelse(cond, val, ...)
    - Replaces ^ with ** for exponentiation
    """
    # Step 1: Replace bracket references [Variable Name] → normalized name
    result: list[str] = []
    i = 0
    while i < len(equation):
        if equation[i] == "[":
            j = equation.find("]", i + 1)
            if j == -1:
                result.append(equation[i])
                i += 1
                continue
            ref_name = equation[i + 1:j]
            normalized = name_map.get(ref_name)
            if normalized is None:
                for orig, norm in name_map.items():
                    if orig.lower() == ref_name.lower():
                        normalized = norm
                        break
            result.append(normalized if normalized else ref_name)
            i = j + 1
        else:
            result.append(equation[i])
            i += 1

    translated = "".join(result)

    # Step 2: Replace ^ with ** for exponentiation
    translated = translated.replace("^", "**")

    # Step 3: Map function names (case-insensitive) and fix IfThenElse equality syntax
    # Regex matches a function call name immediately followed by (
    def _replace_func(m: re.Match) -> str:
        fn_name = m.group(1)
        mapped = _IM_FUNCTION_MAP.get(fn_name.lower())
        if mapped is None:
            return m.group(0)
        return mapped + "("

    translated = re.sub(r'\b([A-Za-z_]\w*)\s*\(', _replace_func, translated)

    # Step 4: Fix IfThenElse equality syntax: _ifthenelse(var=val, ...) → _ifthenelse(var, val, ...)
    # InsightMaker uses = for equality comparison inside IfThenElse
    ite_match = re.search(r'_ifthenelse\(', translated)
    if ite_match:
        start = ite_match.end()
        # Find the first = before the first comma — that's the equality test
        first_comma = translated.find(",", start)
        if first_comma != -1:
            segment = translated[start:first_comma]
            if "=" in segment and "==" not in segment:
                segment = segment.replace("=", ", ", 1)
                translated = translated[:start] + segment + translated[first_comma:]

    return translated


@dataclass
class ParsedInsightMaker:
    model_view: ImportedModelView



def parse_insightmaker_xml(payload: str, filename: str) -> ParsedInsightMaker:
    try:
        root = ET.fromstring(payload)
    except Exception as exc:
        raise ValueError(f"Malformed XML: {exc}")

    if root.tag not in ("InsightMakerModel", "insightmakermodel"):
        raise ValueError("Expected <InsightMakerModel> root")

    root_node = root.find("root")
    if root_node is None:
        raise ValueError("Expected <InsightMakerModel><root>...</root>")

    nodes: list[dict[str, Any]] = []
    edges: list[dict[str, Any]] = []
    variables: list[ImportedVariableSummary] = []
    graph_edges: list[tuple[str, str]] = []
    import_gaps = ImportGapSummary()
    roundtrip = ImportedRoundTripMetadata()
    style_defaults: dict[str, str] = {}
    # Map original InsightMaker name → normalized Python-safe name
    original_to_normalized: dict[str, str] = {}
    seen_names: set[str] = set()
    # Deferred Link elements — processed after all nodes are registered in id_map
    deferred_links: list[tuple[str, ET.Element, ET.Element | None, VisualStyle | None, LayoutMetadata | None]] = []
    # Deferred flow edges — (flow_id, source_ref, target_ref) resolved after all nodes registered
    deferred_flow_edges: list[tuple[str, str | None, str | None]] = []

    settings = ImportedTimeSettings()

    id_map: dict[str, str] = {}

    def mapped_id(source_id: str, prefix: str = "im") -> str:
        mid = f"{prefix}_{source_id}"
        id_map[source_id] = mid
        roundtrip.source_ids[mid] = source_id
        return mid

    for elem in list(root_node):
        tag = elem.tag
        source_id = elem.attrib.get("id") or elem.attrib.get("ID")
        if not source_id:
            import_gaps.unsupported_constructs.append(f"{tag}:missing-id")
            continue

        mx_cell = elem.find("mxCell")
        style = _parse_style(elem, mx_cell)
        layout = _parse_layout(mx_cell)
        pos = _position_from_layout(layout)

        if tag == _TAGS["setting"]:
            settings.initial_time = _float_text(elem, ["TimeStart", "time_start"])
            time_length = _float_text(elem, ["TimeLength", "time_length"])
            settings.time_step = _float_text(elem, ["TimeStep", "time_step"])
            if settings.initial_time is not None and time_length is not None:
                settings.final_time = settings.initial_time + time_length
            time_units = _first_value(elem, ["TimeUnits", "time_units"])
            if time_units:
                style_defaults["time_units"] = time_units
            continue

        if tag == _TAGS["stock"]:
            name = _first_value(elem, ["name", "Name"]) or source_id
            eq = _first_value(elem, ["Equation", "equation"]) or "0"
            initial_value = _first_value(elem, ["InitialValue", "initial_value"]) or "0"
            units = _first_value(elem, ["Units", "units"])
            note = _first_value(elem, ["Note", "note"])
            nid = mapped_id(source_id)
            safe_name = _unique_name(_normalize_name(name), seen_names)
            original_to_normalized[name] = safe_name
            nodes.append(
                {
                    "id": nid,
                    "type": "stock",
                    "name": safe_name,
                    "label": name,
                    "equation": eq,
                    "initial_value": initial_value,
                    "units": units,
                    "position": pos.model_dump(),
                    "source_id": source_id,
                    "style": style.model_dump(exclude_none=True) if style else None,
                    "layout": layout.model_dump(exclude_none=True) if layout else None,
                    "annotation": AnnotationMetadata(kind="stock", note=note or None).model_dump(exclude_none=True),
                }
            )
            variables.append(ImportedVariableSummary(name=name, kind="stock", equation=eq, units=units or None))
            continue

        if tag == _TAGS["flow"]:
            name = _first_value(elem, ["name", "Name"]) or source_id
            eq = _first_value(elem, ["FlowRate", "Equation", "equation"]) or "0"
            units = _first_value(elem, ["Units", "units"])
            note = _first_value(elem, ["Note", "note"])
            source_ref = mx_cell.attrib.get("source") if mx_cell is not None else None
            target_ref = mx_cell.attrib.get("target") if mx_cell is not None else None
            flow_id = mapped_id(source_id)
            safe_name = _unique_name(_normalize_name(name), seen_names)
            original_to_normalized[name] = safe_name
            # Store source/target refs for deferred edge creation (stocks may appear later in XML)
            deferred_flow_edges.append((flow_id, source_ref, target_ref))
            nodes.append(
                {
                    "id": flow_id,
                    "type": "flow",
                    "name": safe_name,
                    "label": name,
                    "equation": eq,
                    "units": units,
                    "position": pos.model_dump(),
                    "source_id": source_id,
                    "style": style.model_dump(exclude_none=True) if style else None,
                    "layout": layout.model_dump(exclude_none=True) if layout else None,
                    "annotation": AnnotationMetadata(kind="flow", note=note or None).model_dump(exclude_none=True),
                }
            )
            variables.append(ImportedVariableSummary(name=name, kind="flow", equation=eq, units=units or None))
            continue

        if tag == _TAGS["variable"]:
            name = _first_value(elem, ["name", "Name"]) or source_id
            eq = _first_value(elem, ["Equation", "equation"]) or "0"
            units = _first_value(elem, ["Units", "units"])
            note = _first_value(elem, ["Note", "note"])
            nid = mapped_id(source_id)
            safe_name = _unique_name(_normalize_name(name), seen_names)
            original_to_normalized[name] = safe_name
            nodes.append(
                {
                    "id": nid,
                    "type": "aux",
                    "name": safe_name,
                    "label": name,
                    "equation": eq,
                    "units": units,
                    "position": pos.model_dump(),
                    "source_id": source_id,
                    "style": style.model_dump(exclude_none=True) if style else None,
                    "layout": layout.model_dump(exclude_none=True) if layout else None,
                    "annotation": AnnotationMetadata(kind="variable", note=note or None).model_dump(exclude_none=True),
                }
            )
            variables.append(ImportedVariableSummary(name=name, kind="aux", equation=eq, units=units or None))
            continue

        if tag == _TAGS["converter"]:
            name = _first_value(elem, ["name", "Name"]) or source_id
            source_expr = _first_value(elem, ["Source", "source"]) or "0"
            units = _first_value(elem, ["Units", "units"])
            note = _first_value(elem, ["Note", "note"])
            raw_data = _first_value(elem, ["Data", "data"]) or ""
            points = []
            for x_str, y_str in re.findall(r"\(?\s*([-0-9.]+)\s*,\s*([-0-9.]+)\s*\)?", raw_data):
                try:
                    points.append({"x": float(x_str), "y": float(y_str)})
                except Exception:
                    continue
            points = sorted(points, key=lambda p: p["x"])
            if len(points) < 2:
                points = [{"x": 0, "y": 0}, {"x": 1, "y": 1}]
                import_gaps.unparsed_equations += 1
                import_gaps.samples.append(
                    ImportGapItem(kind="equation", symbol=name, reason="Converter.Data missing/invalid; default lookup used", severity="warning")
                )
            nid = mapped_id(source_id)
            safe_name = _unique_name(_normalize_name(name), seen_names)
            original_to_normalized[name] = safe_name
            nodes.append(
                {
                    "id": nid,
                    "type": "lookup",
                    "name": safe_name,
                    "label": name,
                    "equation": source_expr,
                    "points": points,
                    "interpolation": "linear",
                    "units": units,
                    "position": pos.model_dump(),
                    "source_id": source_id,
                    "style": style.model_dump(exclude_none=True) if style else None,
                    "layout": layout.model_dump(exclude_none=True) if layout else None,
                    "annotation": AnnotationMetadata(kind="converter", note=note or None).model_dump(exclude_none=True),
                }
            )
            variables.append(ImportedVariableSummary(name=name, kind="lookup", equation=source_expr, units=units or None))
            continue

        if tag == _TAGS["link"]:
            # Defer Link processing — source/target nodes may appear later in the XML
            deferred_links.append((source_id, elem, mx_cell, style, layout))
            continue

        if tag == _TAGS["text"]:
            tid = mapped_id(source_id, prefix="text")
            text = _first_value(elem, ["Text", "text", "name", "Name"]) or ""
            note = _first_value(elem, ["Note", "note"])
            nodes.append(
                {
                    "id": tid,
                    "type": "text",
                    "text": text,
                    "position": pos.model_dump(),
                    "source_id": source_id,
                    "style": style.model_dump(exclude_none=True) if style else None,
                    "layout": layout.model_dump(exclude_none=True) if layout else None,
                    "annotation": AnnotationMetadata(kind="text", note=note or None).model_dump(exclude_none=True),
                }
            )
            continue

        if tag == _TAGS["display"]:
            did = mapped_id(source_id, prefix="display")
            display_text = _first_value(elem, ["Title", "name", "Name"]) or "Display"
            nodes.append(
                {
                    "id": did,
                    "type": "text",
                    "text": f"[Display] {display_text}",
                    "position": pos.model_dump(),
                    "source_id": source_id,
                    "style": style.model_dump(exclude_none=True) if style else None,
                    "layout": layout.model_dump(exclude_none=True) if layout else None,
                    "annotation": AnnotationMetadata(kind="display", title=display_text, raw_xml=ET.tostring(elem, encoding="unicode")).model_dump(exclude_none=True),
                }
            )
            continue

        import_gaps.unsupported_constructs.append(tag)
        roundtrip.unmapped_fragments.append(ET.tostring(elem, encoding="unicode"))

    # Second pass: create flow_link edges now that all nodes are in id_map
    for flow_id, source_ref, target_ref in deferred_flow_edges:
        source_stock = id_map.get(source_ref) if source_ref else None
        target_stock = id_map.get(target_ref) if target_ref else None
        # Update flow node with resolved stock IDs
        for node in nodes:
            if node["id"] == flow_id:
                node["source_stock_id"] = source_stock
                node["target_stock_id"] = target_stock
                break
        if source_stock:
            eid = f"edge_{flow_id}_src"
            edges.append({"id": eid, "type": "flow_link", "source": source_stock, "target": flow_id})
            graph_edges.append((source_stock, flow_id))
        if target_stock:
            eid = f"edge_{flow_id}_tgt"
            edges.append({"id": eid, "type": "flow_link", "source": flow_id, "target": target_stock})
            graph_edges.append((flow_id, target_stock))

    # Third pass: process deferred Links now that all nodes are in id_map
    for source_id, elem, mx_cell, style, layout in deferred_links:
        if mx_cell is None:
            import_gaps.dropped_edges += 1
            import_gaps.samples.append(
                ImportGapItem(kind="edge", symbol=source_id, reason="Link missing mxCell source/target", severity="warning")
            )
            continue
        src = id_map.get(mx_cell.attrib.get("source", ""))
        tgt = id_map.get(mx_cell.attrib.get("target", ""))
        if not src or not tgt:
            import_gaps.dropped_edges += 1
            import_gaps.samples.append(
                ImportGapItem(kind="edge", symbol=source_id, reason="Link source/target not mapped", severity="warning")
            )
            continue
        eid = mapped_id(source_id, prefix="edge")
        edges.append(
            {
                "id": eid,
                "type": "influence",
                "source": src,
                "target": tgt,
                "source_id": source_id,
                "style": style.model_dump(exclude_none=True) if style else None,
                "layout": layout.model_dump(exclude_none=True) if layout else None,
            }
        )
        graph_edges.append((src, tgt))

    # Translate equations: replace [OriginalName] bracket refs with normalized names
    for node in nodes:
        if "equation" in node and node["equation"]:
            node["equation"] = _translate_equation(node["equation"], original_to_normalized)
        if "initial_value" in node and isinstance(node["initial_value"], str):
            node["initial_value"] = _translate_equation(node["initial_value"], original_to_normalized)

    if settings.initial_time is None:
        settings.initial_time = 0
    if settings.final_time is None:
        settings.final_time = 100
    if settings.time_step is None:
        settings.time_step = 1
    if settings.saveper is None:
        settings.saveper = settings.time_step

    styled_nodes = sum(1 for n in nodes if n.get("style"))
    styled_edges = sum(1 for e in edges if e.get("style"))

    metadata = ModelMetadata(
        imported=ImportedMetadata(
            source_format="insightmaker-xml",
            model_info=ImportedModelInfo(
                description=_first_value(root_node, ["Description", "description"]),
                author=_first_value(root_node, ["Author", "author"]),
                notes=_first_value(root_node, ["Note", "Notes", "note", "notes"]),
            ),
            style_defaults=style_defaults,
            roundtrip=roundtrip,
        )
    )

    # Use normalized names for outputs (not original InsightMaker names)
    output_names = []
    for v in variables[:20]:
        normalized = original_to_normalized.get(v.name)
        if normalized:
            output_names.append(normalized)

    canonical = ModelDocument(
        id=f"im_{_normalize_name(filename.rsplit('.', 1)[0]) or 'model'}",
        name=filename,
        version=1,
        metadata=metadata,
        nodes=nodes,
        edges=edges,
        outputs=output_names,
    )

    return ParsedInsightMaker(
        model_view=ImportedModelView(
            canonical=canonical,
            variables=variables,
            time_settings=settings,
            dependency_graph=ImportedGraphSummary(edges=graph_edges),
            import_gaps=import_gaps,
            visual_summary=ImportedVisualSummary(
                text_nodes=sum(1 for n in nodes if n.get("type") == "text"),
                display_nodes=sum(1 for n in nodes if (n.get("annotation") or {}).get("kind") == "display"),
                styled_nodes=styled_nodes,
                styled_edges=styled_edges,
            ),
        )
    )
