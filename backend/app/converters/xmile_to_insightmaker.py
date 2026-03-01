from __future__ import annotations

import re
import xml.etree.ElementTree as ET


def _local(tag: str) -> str:
    if "}" in tag:
        return tag.rsplit("}", 1)[1]
    return tag


def convert_xmile_to_insightmaker(payload: str) -> tuple[str, list[str]]:
    diagnostics: list[str] = []
    try:
        root = ET.fromstring(payload)
    except Exception as exc:
        raise ValueError(f"Malformed XMILE XML: {exc}")

    if _local(root.tag).lower() != "xmile":
        raise ValueError("Expected <xmile> root")

    model = None
    for child in root.iter():
        if _local(child.tag) == "model":
            model = child
            break
    if model is None:
        raise ValueError("XMILE model section not found")

    out_root = ET.Element("InsightMakerModel")
    out_body = ET.SubElement(out_root, "root")

    # Convert simulation specs if present.
    sim_specs = None
    for child in model:
        if _local(child.tag) == "sim_specs":
            sim_specs = child
            break
    if sim_specs is not None:
        setting = ET.SubElement(out_body, "Setting", {"id": "settings"})
        if sim_specs.attrib.get("start"):
            ET.SubElement(setting, "TimeStart").text = sim_specs.attrib["start"]
        if sim_specs.attrib.get("stop") and sim_specs.attrib.get("start"):
            try:
                ET.SubElement(setting, "TimeLength").text = str(float(sim_specs.attrib["stop"]) - float(sim_specs.attrib["start"]))
            except Exception:
                diagnostics.append("Could not derive TimeLength from sim_specs start/stop")
        if sim_specs.attrib.get("dt"):
            ET.SubElement(setting, "TimeStep").text = sim_specs.attrib["dt"]
        if sim_specs.attrib.get("time_units"):
            ET.SubElement(setting, "TimeUnits").text = sim_specs.attrib["time_units"]

    # stocks, flows, auxiliaries
    stock_count = flow_count = aux_count = 0
    for section in model.iter():
        tag = _local(section.tag)
        if tag == "stock":
            stock_count += 1
            sid = section.attrib.get("name", f"stock_{stock_count}")
            elem = ET.SubElement(out_body, "Stock", {"id": re.sub(r'[^A-Za-z0-9_]+', '_', sid)})
            ET.SubElement(elem, "name").text = sid
            eq = None
            init = None
            for child in section:
                ctag = _local(child.tag)
                if ctag == "eqn":
                    eq = (child.text or "").strip()
                elif ctag == "inflow" or ctag == "outflow":
                    # flow links handled by flow section conversion
                    pass
                elif ctag == "non_negative":
                    pass
                elif ctag == "init_eqn":
                    init = (child.text or "").strip()
            ET.SubElement(elem, "Equation").text = eq or "0"
            ET.SubElement(elem, "InitialValue").text = init or "0"
            mx = ET.SubElement(elem, "mxCell")
            ET.SubElement(mx, "mxGeometry", {"x": str(80 + stock_count * 130), "y": "120", "width": "90", "height": "54"})
        elif tag == "flow":
            flow_count += 1
            name = section.attrib.get("name", f"flow_{flow_count}")
            fid = re.sub(r'[^A-Za-z0-9_]+', '_', name)
            elem = ET.SubElement(out_body, "Flow", {"id": fid})
            ET.SubElement(elem, "name").text = name
            eq = None
            src = None
            tgt = None
            for child in section:
                ctag = _local(child.tag)
                if ctag == "eqn":
                    eq = (child.text or "").strip()
                elif ctag == "from":
                    src = re.sub(r'[^A-Za-z0-9_]+', '_', (child.text or '').strip())
                elif ctag == "to":
                    tgt = re.sub(r'[^A-Za-z0-9_]+', '_', (child.text or '').strip())
            ET.SubElement(elem, "FlowRate").text = eq or "0"
            mx = ET.SubElement(elem, "mxCell")
            if src:
                mx.set("source", src)
            if tgt:
                mx.set("target", tgt)
            ET.SubElement(mx, "mxGeometry", {"x": str(120 + flow_count * 130), "y": "240", "width": "80", "height": "36"})
        elif tag == "aux":
            aux_count += 1
            name = section.attrib.get("name", f"aux_{aux_count}")
            aid = re.sub(r'[^A-Za-z0-9_]+', '_', name)
            elem = ET.SubElement(out_body, "Variable", {"id": aid})
            ET.SubElement(elem, "name").text = name
            eq = None
            for child in section:
                if _local(child.tag) == "eqn":
                    eq = (child.text or "").strip()
            ET.SubElement(elem, "Equation").text = eq or "0"
            mx = ET.SubElement(elem, "mxCell")
            ET.SubElement(mx, "mxGeometry", {"x": str(90 + aux_count * 120), "y": "340", "width": "84", "height": "42"})

    if stock_count == 0 and flow_count == 0 and aux_count == 0:
        diagnostics.append("No stock/flow/aux variables found in XMILE model")

    xml = ET.tostring(out_root, encoding="unicode")
    return xml, diagnostics
