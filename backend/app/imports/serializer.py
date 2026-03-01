from __future__ import annotations

import xml.etree.ElementTree as ET

from app.schemas.model import ModelDocument


def _style_blob(style: dict | None) -> str:
    if not style:
        return ""
    pairs = []
    mapping = {
        "fill": "fillColor",
        "stroke": "strokeColor",
        "stroke_width": "strokeWidth",
        "line_style": "dashed",
        "opacity": "opacity",
        "text_color": "fontColor",
        "font_family": "fontFamily",
        "font_size": "fontSize",
        "text_align": "align",
        "background": "labelBackgroundColor",
    }
    for src, target in mapping.items():
        val = style.get(src)
        if val is None:
            continue
        pairs.append(f"{target}={val}")
    return ";".join(pairs)


def _add_mx_cell(parent: ET.Element, node_or_edge: dict) -> None:
    mx_cell = ET.SubElement(parent, "mxCell")
    if node_or_edge.get("source"):
        mx_cell.set("source", str(node_or_edge["source"]).replace("im_", ""))
    if node_or_edge.get("target"):
        mx_cell.set("target", str(node_or_edge["target"]).replace("im_", ""))
    style_blob = _style_blob(node_or_edge.get("style"))
    if style_blob:
        ET.SubElement(parent, "Style").text = style_blob
    x = float(node_or_edge.get("position", {}).get("x", 0))
    y = float(node_or_edge.get("position", {}).get("y", 0))
    w = float(node_or_edge.get("layout", {}).get("width", 80) or 80)
    h = float(node_or_edge.get("layout", {}).get("height", 40) or 40)
    mx_geometry = ET.SubElement(mx_cell, "mxGeometry")
    mx_geometry.set("x", str(x))
    mx_geometry.set("y", str(y))
    mx_geometry.set("width", str(w))
    mx_geometry.set("height", str(h))
    # Write waypoints as <Array as="points"><mxPoint .../></Array>
    waypoints = node_or_edge.get("layout", {}).get("waypoints")
    if waypoints:
        array_elem = ET.SubElement(mx_geometry, "Array")
        array_elem.set("as", "points")
        for wp in waypoints:
            pt = ET.SubElement(array_elem, "mxPoint")
            pt.set("x", str(wp["x"]))
            pt.set("y", str(wp["y"]))


def serialize_insightmaker_xml(model: ModelDocument) -> str:
    root = ET.Element("InsightMakerModel")
    root_node = ET.SubElement(root, "root")

    imported_meta = model.metadata.imported if model.metadata else None
    if imported_meta and imported_meta.model_info and imported_meta.model_info.description:
        ET.SubElement(root_node, "Description").text = imported_meta.model_info.description

    setting = ET.SubElement(root_node, "Setting", {"id": "settings"})
    if imported_meta and imported_meta.style_defaults.get("time_units"):
        ET.SubElement(setting, "TimeUnits").text = imported_meta.style_defaults.get("time_units")

    for node in sorted(model.nodes, key=lambda n: n.id):
        raw = node.model_dump(exclude_none=True)
        kind = raw.get("annotation", {}).get("kind")
        source_id = raw.get("source_id") or raw["id"].replace("im_", "")

        if raw["type"] == "stock":
            elem = ET.SubElement(root_node, "Stock", {"id": source_id})
            ET.SubElement(elem, "name").text = raw.get("label") or raw.get("name")
            ET.SubElement(elem, "Equation").text = raw.get("equation", "0")
            ET.SubElement(elem, "InitialValue").text = str(raw.get("initial_value", 0))
            if raw.get("units"):
                ET.SubElement(elem, "Units").text = raw["units"]
            note = (raw.get("annotation") or {}).get("note")
            if note:
                ET.SubElement(elem, "Note").text = note
            _add_mx_cell(elem, raw)
            continue

        if raw["type"] == "flow":
            elem = ET.SubElement(root_node, "Flow", {"id": source_id})
            ET.SubElement(elem, "name").text = raw.get("label") or raw.get("name")
            ET.SubElement(elem, "FlowRate").text = raw.get("equation", "0")
            if raw.get("units"):
                ET.SubElement(elem, "Units").text = raw["units"]
            note = (raw.get("annotation") or {}).get("note")
            if note:
                ET.SubElement(elem, "Note").text = note
            _add_mx_cell(
                elem,
                {
                    **raw,
                    "source": raw.get("source_stock_id"),
                    "target": raw.get("target_stock_id"),
                },
            )
            continue

        if raw["type"] == "aux":
            elem = ET.SubElement(root_node, "Variable", {"id": source_id})
            ET.SubElement(elem, "name").text = raw.get("label") or raw.get("name")
            ET.SubElement(elem, "Equation").text = raw.get("equation", "0")
            if raw.get("units"):
                ET.SubElement(elem, "Units").text = raw["units"]
            note = (raw.get("annotation") or {}).get("note")
            if note:
                ET.SubElement(elem, "Note").text = note
            _add_mx_cell(elem, raw)
            continue

        if raw["type"] == "lookup":
            elem = ET.SubElement(root_node, "Converter", {"id": source_id})
            ET.SubElement(elem, "name").text = raw.get("label") or raw.get("name")
            ET.SubElement(elem, "Source").text = raw.get("equation", "0")
            points = raw.get("points") or []
            ET.SubElement(elem, "Data").text = "; ".join(f"({p['x']},{p['y']})" for p in points)
            if raw.get("units"):
                ET.SubElement(elem, "Units").text = raw["units"]
            note = (raw.get("annotation") or {}).get("note")
            if note:
                ET.SubElement(elem, "Note").text = note
            _add_mx_cell(elem, raw)
            continue

        if raw["type"] == "text":
            if kind == "display":
                elem = ET.SubElement(root_node, "Display", {"id": source_id})
                ET.SubElement(elem, "Title").text = raw.get("annotation", {}).get("title") or raw.get("text", "Display")
            else:
                elem = ET.SubElement(root_node, "Text", {"id": source_id})
                ET.SubElement(elem, "Text").text = raw.get("text", "")
            note = (raw.get("annotation") or {}).get("note")
            if note:
                ET.SubElement(elem, "Note").text = note
            _add_mx_cell(elem, raw)
            continue

    for edge in sorted(model.edges, key=lambda e: e.id):
        raw = edge.model_dump(exclude_none=True)
        if raw["type"] != "influence":
            continue
        source_id = raw.get("source_id") or raw["id"].replace("edge_", "")
        elem = ET.SubElement(root_node, "Link", {"id": source_id})
        _add_mx_cell(elem, raw)

    return ET.tostring(root, encoding="unicode")
