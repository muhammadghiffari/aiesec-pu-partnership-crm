#!/usr/bin/env python3
"""Structural validation for the documentation-first agent handover pack."""
from pathlib import Path
import xml.etree.ElementTree as ET
import sys
from collections import Counter

ROOT = Path(__file__).resolve().parents[1]
required = [
    "AGENTS.md", "README.md", "docs/PRD.md", "docs/ESSM_MAPPING.md",
    "docs/DECISIONS.md", "docs/ARCHITECTURE.md", "docs/DATA_MODEL.md",
    "docs/AI_MODEL_ROUTING.md", "docs/AGENT_STARTER_PROMPTS.md",
    "docs/IMPLEMENTATION_PLAN.md", "docs/DEVELOPER_WORKFLOW.md",
    "docs/SECURITY_PRIVACY.md", "docs/TESTING_UAT.md",
    "docs/TEAM_MODEL_PROMPTS.md", "docs/EXTENSIONS_AND_SKILLS.md",
    "docs/diagrams/Partnership_CRM_Diagrams_FINAL_EDGE_ANCHORED.drawio.xml",
]
missing = [p for p in required if not (ROOT / p).is_file()]
if missing:
    print("Missing required files:", *missing, sep="\n- ", file=sys.stderr)
    sys.exit(1)
xml_path = ROOT / "docs/diagrams/Partnership_CRM_Diagrams_FINAL_EDGE_ANCHORED.drawio.xml"
tree = ET.parse(xml_path)
root = tree.getroot()
diagrams = root.findall("diagram")
if len(diagrams) != 13 or root.get("pages") != "13":
    raise SystemExit(f"Expected 13 diagram pages, found pages={root.get('pages')} diagram_nodes={len(diagrams)}")
errors = []
for diagram in diagrams:
    model = diagram.find("mxGraphModel")
    if model is None:
        errors.append(f"{diagram.get('name')}: missing mxGraphModel")
        continue
    ids = [c.get("id") for c in model.findall(".//mxCell") if c.get("id")]
    duplicates = sorted(x for x, count in Counter(ids).items() if count > 1)
    if duplicates:
        errors.append(f"{diagram.get('name')}: duplicate cell ids {duplicates[:10]}")
    idset = set(ids)
    for cell in model.findall(".//mxCell[@edge='1']"):
        for attr in ("source", "target"):
            ref = cell.get(attr)
            if ref and ref not in idset:
                errors.append(f"{diagram.get('name')}: edge {cell.get('id')} has missing {attr} {ref}")
if errors:
    raise SystemExit("Diagram validation failed:\n- " + "\n- ".join(errors))
prd = (ROOT / "docs/PRD.md").read_text(encoding="utf-8")
for token in ["Prospecting", "Sales Process", "Close Deal", "Partnership Implementation", "Post Survey", "Rate Card", "Merchandise Tracker", "CRM Lead"]:
    if token not in prd:
        errors.append(f"PRD missing canonical term: {token}")
legacy_bad = ["Do not use B2B, B2C, MSME"]
for token in legacy_bad:
    if token not in prd:
        errors.append(f"Expected explicit exclusion is missing: {token}")
if errors:
    raise SystemExit("Handover content validation failed:\n- " + "\n- ".join(errors))
# Real workbooks, source PDFs, exports and partner documents must not be present in the repo pack.
forbidden_suffixes = {".xlsx", ".xls", ".pdf", ".sqlite", ".sqlite3", ".dump", ".zip"}
for path in ROOT.rglob("*"):
    if path.is_file() and path.suffix.lower() in forbidden_suffixes:
        errors.append(f"Forbidden operational/source file in handover pack: {path.relative_to(ROOT)}")
if errors:
    raise SystemExit("Handover content validation failed:\n- " + "\n- ".join(errors))
# Every planned issue must have an explicit model/effort and a prompt card.
playbook = (ROOT / "docs/TEAM_MODEL_PROMPTS.md").read_text(encoding="utf-8")
plan = (ROOT / "docs/IMPLEMENTATION_PLAN.md").read_text(encoding="utf-8")
import re
issue_ids = re.findall(r"\bM[0-6]-\d{2}\b", plan)
missing_cards = sorted(set(issue_ids) - set(re.findall(r"(?m)^### (M[0-6]-\d{2}) —", playbook)))
if missing_cards:
    raise SystemExit("Team prompt playbook missing cards for issues: " + ", ".join(missing_cards))
if "--trust-all-tools" not in playbook or "EXTENSIONS_AND_SKILLS.md" not in playbook:
    raise SystemExit("Team prompt playbook missing safety/extension policy")
print(f"PASS: {len(required)} required files, {len(diagrams)} diagram pages, XML IDs/references valid, canonical PRD terms present, model/effort prompt cards present for {len(set(issue_ids))} issue IDs, no prohibited source-data files.")
