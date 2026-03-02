"""Export a ModelDocument to XMILE 1.0 XML.

Produces a standards-compliant XMILE file including:
- header (vendor, product)
- sim_specs (start, stop, dt, time_units)
- model variables (stocks with inflows/outflows, flows, aux)
- display view with positioned stock, flow, aux, connector elements
- visual styling (color, font) on display entities
"""

from __future__ import annotations

import xml.etree.ElementTree as ET
from typing import Optional

from app.schemas.model import ModelDocument, SimConfig


_XMILE_NS = "http://docs.oasis-open.org/xmile/ns/XMILE/v1.0"


def _color_attr(hex_color: str | None) -> str | None:
    """Normalise a colour value to a hex string XMILE expects."""
    if not hex_color:
        return None
    c = hex_color.strip()
    if c.startswith("#"):
        return c
    return c


def _indent(elem: ET.Element, level: int = 0) -> None:
    """Add pretty-print indentation to an ElementTree."""
    indent = "\n" + "  " * level
    if len(elem):
        if not elem.text or not elem.text.strip():
            elem.text = indent + "  "
        if not elem.tail or not elem.tail.strip():
            elem.tail = indent
        for child in elem:
            _indent(child, level + 1)
        if not child.tail or not child.tail.strip():
            child.tail = indent
    else:
        if level and (not elem.tail or not elem.tail.strip()):
            elem.tail = indent


def export_xmile(model: ModelDocument, sim_config: Optional[SimConfig] = None) -> str:
    """Convert a ModelDocument to XMILE 1.0 XML string."""

    root = ET.Element("xmile", {"version": "1.0", "xmlns": _XMILE_NS})

    # --- header ---
    header = ET.SubElement(root, "header")
    ET.SubElement(header, "vendor").text = "SD Workbench"
    ET.SubElement(header, "product", {"version": "1.0"}).text = "SD Workbench"
    if model.name:
        ET.SubElement(header, "name").text = model.name

    # --- sim_specs ---
    start = 0.0
    stop = 100.0
    dt = 1.0
    time_units = "Time"

    if sim_config:
        start = sim_config.start
        stop = sim_config.stop
        dt = sim_config.dt

    # Check for imported time settings
    if model.metadata and model.metadata.imported and model.metadata.imported.style_defaults:
        tu = model.metadata.imported.style_defaults.get("time_units")
        if tu:
            time_units = tu

    sim_specs = ET.SubElement(root, "sim_specs")
    ET.SubElement(sim_specs, "start").text = str(start)
    ET.SubElement(sim_specs, "stop").text = str(stop)
    ET.SubElement(sim_specs, "dt").text = str(dt)
    ET.SubElement(sim_specs, "time_units").text = time_units

    # --- model ---
    model_elem = ET.SubElement(root, "model")
    variables = ET.SubElement(model_elem, "variables")

    # Build lookup maps
    node_by_id: dict[str, dict] = {}
    stocks: list[dict] = []
    flows: list[dict] = []
    auxes: list[dict] = []
    lookups: list[dict] = []
    texts: list[dict] = []

    for node in model.nodes:
        raw = node.model_dump(exclude_none=True)
        node_by_id[raw["id"]] = raw
        ntype = raw["type"]
        if ntype == "stock":
            stocks.append(raw)
        elif ntype == "flow":
            flows.append(raw)
        elif ntype == "aux":
            auxes.append(raw)
        elif ntype == "lookup":
            lookups.append(raw)
        elif ntype == "text":
            texts.append(raw)

    # Build inflow/outflow maps for stocks from flow_link edges
    stock_inflows: dict[str, list[str]] = {}
    stock_outflows: dict[str, list[str]] = {}
    for edge in model.edges:
        raw_edge = edge.model_dump(exclude_none=True)
        if raw_edge["type"] == "flow_link":
            src = raw_edge["source"]
            tgt = raw_edge["target"]
            # flow_link: stock → flow (outflow) or flow → stock (inflow)
            src_node = node_by_id.get(src)
            tgt_node = node_by_id.get(tgt)
            if src_node and tgt_node:
                if src_node["type"] == "stock" and tgt_node["type"] == "flow":
                    stock_outflows.setdefault(src, []).append(tgt_node.get("name", tgt))
                elif src_node["type"] == "flow" and tgt_node["type"] == "stock":
                    stock_inflows.setdefault(tgt, []).append(src_node.get("name", src))

    # Also check source_stock_id/target_stock_id on flow nodes
    for flow in flows:
        flow_name = flow.get("name", flow["id"])
        src_stock = flow.get("source_stock_id")
        tgt_stock = flow.get("target_stock_id")
        if src_stock and src_stock in node_by_id:
            stock_outflows.setdefault(src_stock, [])
            if flow_name not in stock_outflows[src_stock]:
                stock_outflows[src_stock].append(flow_name)
        if tgt_stock and tgt_stock in node_by_id:
            stock_inflows.setdefault(tgt_stock, [])
            if flow_name not in stock_inflows[tgt_stock]:
                stock_inflows[tgt_stock].append(flow_name)

    # Stocks
    for s in stocks:
        stock_elem = ET.SubElement(variables, "stock", {"name": s.get("label") or s["name"]})
        eq = s.get("equation", "0")
        ET.SubElement(stock_elem, "eqn").text = str(s.get("initial_value", eq))
        if s.get("units"):
            ET.SubElement(stock_elem, "units").text = s["units"]
        for inflow_name in stock_inflows.get(s["id"], []):
            ET.SubElement(stock_elem, "inflow").text = inflow_name
        for outflow_name in stock_outflows.get(s["id"], []):
            ET.SubElement(stock_elem, "outflow").text = outflow_name
        if s.get("min_value") is not None or s.get("max_value") is not None:
            range_elem = ET.SubElement(stock_elem, "range")
            if s.get("min_value") is not None:
                range_elem.set("min", str(s["min_value"]))
            if s.get("max_value") is not None:
                range_elem.set("max", str(s["max_value"]))

    # Flows
    for f in flows:
        flow_elem = ET.SubElement(variables, "flow", {"name": f.get("label") or f["name"]})
        ET.SubElement(flow_elem, "eqn").text = f.get("equation", "0")
        if f.get("units"):
            ET.SubElement(flow_elem, "units").text = f["units"]
        if f.get("min_value") is not None or f.get("max_value") is not None:
            range_elem = ET.SubElement(flow_elem, "range")
            if f.get("min_value") is not None:
                range_elem.set("min", str(f["min_value"]))
            if f.get("max_value") is not None:
                range_elem.set("max", str(f["max_value"]))

    # Auxiliaries
    for a in auxes:
        aux_elem = ET.SubElement(variables, "aux", {"name": a.get("label") or a["name"]})
        ET.SubElement(aux_elem, "eqn").text = a.get("equation", "0")
        if a.get("units"):
            ET.SubElement(aux_elem, "units").text = a["units"]

    # Lookups → aux with gf
    for lk in lookups:
        aux_elem = ET.SubElement(variables, "aux", {"name": lk.get("label") or lk["name"]})
        ET.SubElement(aux_elem, "eqn").text = lk.get("equation", "0")
        if lk.get("units"):
            ET.SubElement(aux_elem, "units").text = lk["units"]
        points = lk.get("points", [])
        if points:
            gf = ET.SubElement(aux_elem, "gf")
            ET.SubElement(gf, "xscale", {
                "min": str(points[0]["x"]),
                "max": str(points[-1]["x"]),
            })
            ET.SubElement(gf, "yscale", {
                "min": str(min(p["y"] for p in points)),
                "max": str(max(p["y"] for p in points)),
            })
            ET.SubElement(gf, "ypts").text = ",".join(str(p["y"]) for p in points)

    # --- display/views ---
    views = ET.SubElement(model_elem, "views")
    view = ET.SubElement(views, "view", {"type": "stock_flow"})

    # Collect influence edges for connectors
    influence_edges = [
        e.model_dump(exclude_none=True) for e in model.edges
        if e.type == "influence"
    ]

    def _style_attrs(style: dict | None) -> dict[str, str]:
        attrs: dict[str, str] = {}
        if not style:
            return attrs
        fill = _color_attr(style.get("fill"))
        if fill:
            attrs["color"] = fill
        stroke = _color_attr(style.get("stroke"))
        if stroke:
            attrs["color"] = stroke  # XMILE uses 'color' for border/line
        bg = _color_attr(style.get("background") or style.get("fill"))
        if bg:
            attrs["background"] = bg
        fc = _color_attr(style.get("text_color"))
        if fc:
            attrs["font_color"] = fc
        fs = style.get("font_size")
        if fs:
            attrs["font_size"] = str(int(float(fs)))
        ff = style.get("font_family")
        if ff:
            attrs["font_family"] = ff
        return attrs

    # Stocks in view
    for s in stocks:
        pos = s.get("position", {})
        attrs: dict[str, str] = {
            "name": s.get("label") or s["name"],
            "x": str(pos.get("x", 0)),
            "y": str(pos.get("y", 0)),
        }
        layout = s.get("layout")
        if layout:
            if layout.get("width"):
                attrs["width"] = str(layout["width"])
            if layout.get("height"):
                attrs["height"] = str(layout["height"])
        attrs.update(_style_attrs(s.get("style")))
        ET.SubElement(view, "stock", attrs)

    # Flows in view
    for f in flows:
        pos = f.get("position", {})
        attrs = {
            "name": f.get("label") or f["name"],
            "x": str(pos.get("x", 0)),
            "y": str(pos.get("y", 0)),
        }
        attrs.update(_style_attrs(f.get("style")))
        ET.SubElement(view, "flow", attrs)

    # Aux in view
    for a in auxes:
        pos = a.get("position", {})
        attrs = {
            "name": a.get("label") or a["name"],
            "x": str(pos.get("x", 0)),
            "y": str(pos.get("y", 0)),
        }
        attrs.update(_style_attrs(a.get("style")))
        ET.SubElement(view, "aux", attrs)

    # Lookups in view (rendered as aux)
    for lk in lookups:
        pos = lk.get("position", {})
        attrs = {
            "name": lk.get("label") or lk["name"],
            "x": str(pos.get("x", 0)),
            "y": str(pos.get("y", 0)),
        }
        attrs.update(_style_attrs(lk.get("style")))
        ET.SubElement(view, "aux", attrs)

    # Connectors (influence edges)
    for edge in influence_edges:
        src_node = node_by_id.get(edge["source"])
        tgt_node = node_by_id.get(edge["target"])
        if not src_node or not tgt_node:
            continue
        conn = ET.SubElement(view, "connector")
        from_elem = ET.SubElement(conn, "from")
        from_elem.text = src_node.get("label") or src_node.get("name", edge["source"])
        to_elem = ET.SubElement(conn, "to")
        to_elem.text = tgt_node.get("label") or tgt_node.get("name", edge["target"])
        # Connector style
        style_attrs = _style_attrs(edge.get("style"))
        for k, v in style_attrs.items():
            conn.set(k, v)

    # Text annotations as aliases or display annotations
    for t in texts:
        pos = t.get("position", {})
        # XMILE doesn't have a native text annotation, but we can use an alias
        # with a label attribute, or use a group with a label
        alias = ET.SubElement(view, "alias", {
            "x": str(pos.get("x", 0)),
            "y": str(pos.get("y", 0)),
            "uid": t.get("id", ""),
        })
        ET.SubElement(alias, "of").text = t.get("text", "")

    _indent(root)
    xml_declaration = '<?xml version="1.0" encoding="UTF-8"?>\n'
    return xml_declaration + ET.tostring(root, encoding="unicode")
