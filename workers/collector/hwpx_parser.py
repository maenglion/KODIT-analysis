#!/usr/bin/env python3
"""Deterministic HWPX ZIP/XML parser using only the Python standard library."""

from __future__ import annotations

import io
import re
import sys
import zipfile
from xml.etree import ElementTree as ET

PARSER_NAME = "kodit-hwpx-zipxml"
PARSER_VERSION = "0.1.0"
PARSER_ENGINE = "stdlib-zipfile-elementtree"
PARSER_ENGINE_VERSION = platform_version = sys.version.split()[0]

HP_NS = "http://www.hancom.co.kr/hwpml/2011/paragraph"
HP = f"{{{HP_NS}}}"
ZIP_MAGIC = b"PK\x03\x04"
OLE_MAGIC = bytes.fromhex("d0cf11e0a1b11ae1")
SECTION_RE = re.compile(r"^contents/section(\d+)\.xml$", re.IGNORECASE)
MAX_ZIP_ENTRIES = 10_000
MAX_UNCOMPRESSED_BYTES = 512 * 1024 * 1024


def _structure(archive: zipfile.ZipFile) -> tuple[list[str], str, bool, bool]:
    names = archive.namelist()
    lower_names = {name.lower() for name in names}
    sections = sorted(
        (name for name in names if SECTION_RE.match(name)),
        key=lambda name: int(SECTION_RE.match(name).group(1)),
    )
    mimetype = ""
    if "mimetype" in names:
        mimetype = archive.read("mimetype").decode("ascii", errors="replace").strip()
    return (
        sections,
        mimetype,
        "contents/content.hpf" in lower_names,
        "contents/header.xml" in lower_names,
    )


def detect_magic(data: bytes) -> str:
    if data.startswith(ZIP_MAGIC):
        try:
            with zipfile.ZipFile(io.BytesIO(data)) as archive:
                sections, mimetype, content_hpf, header_xml = _structure(archive)
                if (
                    sections
                    and mimetype == "application/hwp+zip"
                    and content_hpf
                    and header_xml
                ):
                    return "ZIP_HWPX"
        except (OSError, ValueError, zipfile.BadZipFile):
            return "ZIP_INVALID"
        return "ZIP_OTHER"
    if data.startswith(OLE_MAGIC):
        return "OLE_HWP"
    if data.startswith(b"%PDF-"):
        return "PDF"
    return "UNKNOWN"


def _parent_map(root: ET.Element) -> dict[ET.Element, ET.Element]:
    return {child: parent for parent in root.iter() for child in parent}


def _text_chunks(element: ET.Element) -> list[str]:
    return ["".join(node.itertext()) for node in element.iter(f"{HP}t") if "".join(node.itertext())]


def _paragraphs(root: ET.Element) -> list[str]:
    parents = _parent_map(root)
    lines: list[str] = []
    for paragraph in root.iter(f"{HP}p"):
        ancestor = parents.get(paragraph)
        nested = False
        while ancestor is not None:
            if ancestor.tag == f"{HP}p":
                nested = True
                break
            ancestor = parents.get(ancestor)
        if nested:
            continue
        tables = list(paragraph.iter(f"{HP}tbl"))
        if tables:
            for table in tables:
                for table_row in table.iter(f"{HP}tr"):
                    cells = [" ".join(_text_chunks(cell)).strip() for cell in table_row.iter(f"{HP}tc")]
                    if any(cells):
                        lines.append("\t".join(cells))
            continue
        text = "".join(_text_chunks(paragraph)).strip()
        if text:
            lines.append(text)
    return lines


def parse_hwpx_bytes(data: bytes) -> str:
    if detect_magic(data) != "ZIP_HWPX":
        raise ValueError("input is not a structurally verified HWPX document")
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        infos = archive.infolist()
        if len(infos) > MAX_ZIP_ENTRIES:
            raise ValueError("HWPX ZIP has too many entries")
        if sum(info.file_size for info in infos) > MAX_UNCOMPRESSED_BYTES:
            raise ValueError("HWPX ZIP uncompressed size exceeds the safety limit")
        section_names, _, _, _ = _structure(archive)
        all_lines: list[str] = []
        for name in section_names:
            xml_bytes = archive.read(name)
            if b"<!DOCTYPE" in xml_bytes.upper() or b"<!ENTITY" in xml_bytes.upper():
                raise ValueError(f"unsafe XML declaration in {name}")
            try:
                root = ET.fromstring(xml_bytes)
            except ET.ParseError as exc:
                raise ValueError(f"invalid section XML {name}: {exc}") from exc
            all_lines.extend(_paragraphs(root))
    extracted = "\n".join(all_lines).strip()
    if not extracted:
        raise ValueError("HWPX body text is empty")
    return extracted
