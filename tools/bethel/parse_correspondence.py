"""Private case intake. PDF uses the existing audited KODIT runner unchanged.

No source content is written into tracked directories. Re-run with a private
manifest containing absolute paths; generated paths must remain gitignored.
"""
from __future__ import annotations
import argparse, csv, hashlib, io, json, re, sys, zipfile
from pathlib import Path
from xml.etree import ElementTree as ET
from email import policy
from email.parser import BytesParser

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'workers/collector'))
import pdf_parser_runner
from pypdf import PdfReader

def dump(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding='utf-8')

def blocks_for(data, suffix):
    if suffix in ('.png','.jpg','.jpeg'):
        return []
    if suffix == '.pdf':
        return [{'locator': f'page:{i}', 'text': p.extract_text() or ''}
                for i, p in enumerate(PdfReader(io.BytesIO(data)).pages, 1)]
    if suffix == '.docx':
        with zipfile.ZipFile(io.BytesIO(data)) as z:
            blocks = []
            for part in z.namelist():
                if part == 'word/document.xml' or re.match(r'word/(header|footer)\d+\.xml', part):
                    ns = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
                    root = ET.fromstring(z.read(part))
                    for i, p in enumerate(root.findall('.//w:p', ns), 1):
                        text = ''.join(t.text or '' for t in p.findall('.//w:t', ns))
                        if text.strip(): blocks.append({'locator': f'{part}:paragraph:{i}', 'text': text})
            return blocks
    if suffix == '.eml':
        msg = BytesParser(policy=policy.default).parsebytes(data)
        blocks = [{'locator': 'email:headers', 'text': '\n'.join(f'{k}: {msg.get(k, "")}' for k in ['From','To','Date','Subject','Message-ID'])}]
        for i,p in enumerate(msg.walk()):
            if p.get_content_type() == 'text/plain' and p.get_content_disposition() != 'attachment':
                blocks.append({'locator': f'email:part:{i}', 'text': p.get_content()})
        return blocks
    return [{'locator': f'line:{i}', 'text': line} for i,line in enumerate(data.decode('utf-8-sig').splitlines(),1)]

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--manifest', type=Path, required=True)
    ap.add_argument('--output', type=Path, required=True)
    ap.add_argument('--reuse', action='store_true', help='Reuse matching audited artifacts for unchanged source bytes and parser code')
    args = ap.parse_args()
    if 'private-data' not in args.output.resolve().parts:
        ap.error('output must be inside a gitignored private-data directory')
    entries = json.loads(args.manifest.read_text(encoding='utf-8-sig'))
    documents, aliases, missing, hits = [], [], [], []
    seen = {}
    for entry in entries:
        path = Path(entry['path'])
        if not path.is_file():
            missing.append(entry); continue
        data = path.read_bytes(); sha = hashlib.sha256(data).hexdigest()
        if sha in seen:
            aliases.append({'document_id': seen[sha], 'path': str(path)}); continue
        did = 'BET-' + sha[:16]; seen[sha] = did
        folder = args.output / 'documents' / did
        folder.mkdir(parents=True, exist_ok=True)
        (folder / ('source' + path.suffix.lower())).write_bytes(data)
        record = None
        reuse_pdf = False
        if args.reuse and path.suffix.lower()=='.pdf' and (folder/'parser-run.json').exists() and (folder/'blocks.json').exists():
            previous=json.loads((folder/'parser-run.json').read_text(encoding='utf8'))
            reuse_pdf=(previous.get('input_sha256')==sha and
                previous.get('parser_source_sha256')==pdf_parser_runner.parser_source_sha256() and
                previous.get('environment',{}).get('runtime_contract_status')=='SATISFIED')
            if reuse_pdf: record=previous
        if path.suffix.lower() == '.pdf':
            if not reuse_pdf:
                record = pdf_parser_runner.run_file(path, expected_sha256=sha, file_name=path.name,
                    evidence_as_of='2026-10-20', lock_path=ROOT/'workers/collector/requirements.txt',
                    redact_roots=[path.parent], extraction_sink=lambda a: dump(folder/'extraction.json', a))
                dump(folder/'parser-run.json', record)
        try:
            blocks = json.loads((folder/'blocks.json').read_text(encoding='utf8')) if reuse_pdf else blocks_for(data, path.suffix.lower())
            status = ('NEEDS_OCR' if not any(b['text'].strip() for b in blocks) else 'EXTRACTED')
            # Court downloads may contain only an electronic filing footer over
            # a scanned body. Nonempty text is not evidence of a parsed body.
            def body_hangul_count(b):
                body=re.sub(r'(?m)^.*개인정보유출주의.*$|^.*대구지법.*제출 원본.*$|^.*갑\s*제\s*\d+.*호증.*$', '', b['text'])
                return len(re.findall('[가-힣]',body))
            if path.suffix.lower() == '.pdf' and any(body_hangul_count(b) < 50 for b in blocks):
                status = 'NEEDS_OCR'
        except Exception as exc:
            blocks=[]; status='ERROR:' + type(exc).__name__
        text = '\n\n'.join(f"[{b['locator']}]\n{b['text']}" for b in blocks)
        (folder/'text.txt').write_text(text, encoding='utf-8')
        dump(folder/'blocks.json',blocks)
        row = {'document_id': did, 'sha256': sha, 'filename': path.name,
            'source_path': str(path), 'intake_basis': entry.get('basis','user_provided'),
            'format': path.suffix.lower(), 'parse_status': status,
            'audited_pdf_result': record['result'] if record else None,
            'sender': None, 'recipient': None, 'document_date': None,
            'procedure': None, 'direction': None, 'round_claimed': None,
            'round_confirmed': None, 'dispatch_status': 'unverified',
            'receipt_status': 'unverified', 'reply_to': None,
            'metadata_review': 'pending', 'block_count': len(blocks)}
        documents.append(row)
        for b in blocks:
            if re.search('벧엘|전문|인가|필압|장비|현미경|면세|사업자|영수증|감정',b['text']):
                hits.append({'document_id':did, 'filename':path.name, **b})
    dump(args.output/'inventory.json', documents)
    dump(args.output/'aliases.json', aliases)
    dump(args.output/'missing.json', missing)
    dump(args.output/'keyword-hits.json', hits)
    if documents:
        with (args.output/'correspondence.csv').open('w',encoding='utf-8-sig',newline='') as f:
            writer=csv.DictWriter(f,fieldnames=list(documents[0]));writer.writeheader();writer.writerows(documents)
    print(json.dumps({'documents':len(documents),'aliases':len(aliases),'missing':len(missing),
        'needs_ocr':[d['document_id'] for d in documents if d['parse_status']=='NEEDS_OCR'],
        'audited_pdf_results':{s:sum(d['audited_pdf_result']==s for d in documents) for s in {d['audited_pdf_result'] for d in documents} if s}},ensure_ascii=False))

if __name__ == '__main__': main()
