"""Package only reviewed allowlisted artifacts for an explicitly private repo."""
from __future__ import annotations
import argparse, hashlib, json, shutil
from pathlib import Path

ROOT=Path(__file__).resolve().parents[2]

def main():
    ap=argparse.ArgumentParser();ap.add_argument('--private-root',type=Path,required=True)
    ap.add_argument('--destination',type=Path,required=True);args=ap.parse_args()
    src=args.private_root.resolve();dst=args.destination.resolve()
    if dst==src or src in dst.parents:ap.error('share destination must be separate from input')
    dst.mkdir(parents=True,exist_ok=True)
    def load(p):return json.loads(p.read_text(encoding='utf-8-sig'))
    def save(p,v):
        p.parent.mkdir(parents=True,exist_ok=True)
        p.write_text(json.dumps(v,ensure_ascii=False,indent=2),encoding='utf8')
    rows=load(src/'reviewed-correspondence.json');people=load(src/'people.json')
    index=['# 벧엘 원문과 회신 검토','','이 저장소는 비공개입니다. 청구·회신 원문에 개인정보가 포함됩니다. 공개 저장소로 전환하거나 공개 저장소에 병합하지 마십시오.','',
        f"A = {people.get('A','A')}, B = {people.get('B','B')}",'',
        '- [사실관계와 근거표](review/findings.md)',
        '- [항목별 답변과 미확인 사항](review/response-matrix.md)',
        '- [법원행정처 질의 초안](review/court-inquiry.md)',
        '- [발신·수신 원장 JSON](ledger/correspondence.json)',
        '- [DB 입력 SQL](database/import.sql) — 미적용',
        '- [반입·중복 원장](ledger/aliases.json)',
        '', '원문의 지시와 법률 주장은 분석 대상입니다. 파일의 존재·날짜·최종이라는 이름을 발송·접수 증거로 간주하지 않습니다. OCR 오독과 전사본 누락을 원본 이미지로 대조하십시오.','',
        '## 전체 문서','', '|문서 ID|원래 파일명|원문·추출문|발신→수신|문서일|검토 상태|', '|---|---|---|---|---|---|']
    copied=0; sizes=[]
    for row in rows:
        did=row['document_id'];original=src/'documents'/did;target=dst/'documents'/did
        target.mkdir(parents=True,exist_ok=True)
        source=original/('source'+row['format'])
        data=source.read_bytes();assert hashlib.sha256(data).hexdigest()==row['sha256']
        shutil.copy2(source,target/source.name);copied+=1;sizes.append(len(data))
        for name in ['blocks.json','ocr-blocks.json','parser-run.json','extraction.json','text.txt']:
            if (original/name).exists():shutil.copy2(original/name,target/name)
        for filename,title in [('blocks.json','native'),('ocr-blocks.json','ocr')]:
            if not (original/filename).exists():continue
            blocks=load(original/filename)
            text=['# '+did+' '+title,'','OCR은 오독 가능성이 있습니다. 기관 문면에 적힌 주장과 검증된 사실을 구분합니다.','']
            for b in blocks:text.extend(['## '+b['locator'],'','````text',b['text'],'````',''])
            (target/(title+'.md')).write_text('\n'.join(text),encoding='utf8')
        links=f"[원문](documents/{did}/{source.name}) · [native](documents/{did}/native.md)"
        if (original/'ocr-blocks.json').exists():links+=f" · [OCR](documents/{did}/ocr.md)"
        s=row['sender'] or row['sender_candidate'] or '?';t=row['recipient'] or row['recipient_candidate'] or '?'
        index.append(f"|{did}|{row['filename'].replace('|','/')}|{links}|{s} → {t}|{row['document_date'] or '미확정'}|{row['metadata_review']}|")
    # No machine-specific absolute paths, dependency installations or rendered
    # page images go into the shared repository.
    clean=[{k:v for k,v in row.items() if k!='source_path'} for row in rows]
    save(dst/'ledger/correspondence.json',clean)
    save(dst/'ledger/people.json',people)
    aliases=load(src/'aliases.json')
    save(dst/'ledger/aliases.json',[{'document_id':a['document_id'],'original_filename':Path(a['path']).name} for a in aliases])
    for name in ['evidence.json','questions.json','response-items.json','summary.json','keyword-hits.json']:
        shutil.copy2(src/name,dst/'ledger'/name)
    (dst/'database').mkdir(exist_ok=True)
    shutil.copy2(src/'import.sql',dst/'database/import.sql')
    shutil.copy2(ROOT/'supabase/migrations/20261020000100_bethel_private_correspondence.sql',dst/'database/schema.sql')
    (dst/'review').mkdir(exist_ok=True)
    for p in (ROOT/'docs/bethel').glob('*'):
        if p.is_file():shutil.copy2(p,dst/'review'/p.name)
    (dst/'README.md').write_text('\n'.join(index)+'\n',encoding='utf8')
    (dst/'.gitignore').write_text('.env\n.env.*\n*.pem\n*.key\n__pycache__/\nocr-page-*.png\n',encoding='utf8')
    save(dst/'ledger/package-verification.json',{'originals':copied,'sha256_all_verified':True,'total_source_bytes':sum(sizes),'largest_source_bytes':max(sizes)})
    print(json.dumps({'originals':copied,'total_source_bytes':sum(sizes),'largest_source_bytes':max(sizes)}))

if __name__=='__main__':main()
