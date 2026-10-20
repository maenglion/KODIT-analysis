"""Build private intake ledger/import SQL and a content-minimized public index."""
from __future__ import annotations
import argparse, csv, hashlib, json, re
from collections import Counter
from pathlib import Path

ROOT=Path(__file__).resolve().parents[2]

def read(p,default=None):
    return json.loads(p.read_text(encoding='utf-8-sig')) if p.exists() else default

def write(p,v):
    p.parent.mkdir(parents=True,exist_ok=True)
    p.write_text(json.dumps(v,ensure_ascii=False,indent=2),encoding='utf8')

def literal(v):
    if v is None: return 'NULL'
    if isinstance(v,bool):return 'true' if v else 'false'
    if isinstance(v,int):return str(v)
    return "'"+str(v).replace("'","''").replace('\x00','')+"'"

def insert(table,row,update=False):
    columns=','.join(row)
    vals=','.join(literal(v) for v in row.values())
    conflict='do nothing'
    if update:
        conflict='do update set '+','.join(k+'=excluded.'+k for k in row if k!='document_id')
    return f'insert into "case".{table} ({columns}) values ({vals}) on conflict (document_id) {conflict};'

# Reviewed document metadata: body dates, never filesystem timestamps.
# A/B are pseudonyms; full name mapping stays in the private input data.
REVIEWED={
 'BET-fc05f8971406f157':('A','법원','2026-10-13','other','reference',None),
 'BET-41ff98881ff68155':('A','법원',None,'other','reference',None),
 'BET-375209b396d4a6fe':('A','법원',None,'other','reference',None),
 'BET-abe391396e10a932':('벧엘','B','2026-07-22','personal_data_access','reply',None),
 'BET-4769bf6d686b9496':('벧엘','B','2026-07-22','personal_data_access','reply',None),
 'BET-1ff6b077e36b080d':('벧엘','B','2026-08-10','personal_data_access','reply',None),
 'BET-5f510a4644febece':('벧엘','A','2026-08-01','personal_data_access','reply',None),
 'BET-618dba8e33fc43a6':('벧엘','A','2026-08-13','personal_data_access','reply',None),
 'BET-48b5578ea8eae840':('벧엘','법원','2026-10-07','document_transmission','reply',None),
 'BET-6399ea4424391cac':('삼일','A','2026-08-06','personal_data_access','reply',None),
 'BET-9fdc8509dec6a673':('삼일','A','2026-08-10','personal_data_access','reply',2),
 'BET-e5453c2b5b8651ec':('삼일','A','2026-09-22','personal_data_access','reply',None),
 'BET-e76d2f244f0b392c':('B','신보','2026-07-31','information_disclosure','request',None),
 'BET-8cf8ef7a4f88d43a':('B','벧엘',None,'personal_data_access','request',2),
 'BET-5c927bc4044459e5':('B','법원','2026-07-13','document_transmission','request',None),
 'BET-ea63583391213a7f':('A','신보','2026-07-28','personal_data_access','request',None),
 'BET-81cdb37caeff34bc':('A','삼일','2026-07-28','personal_data_access','request',None),
 'BET-c1d8039e36dc07b1':('A','벧엘','2026-07-27','personal_data_access','request',None),
 'BET-8c1e67d14d4ba554':('A','삼일','2026-09-03','personal_data_access','request',None),
 'BET-4c542fc1065746bf':('A','신보','2026-08-05','mixed','request',2),
 'BET-1a29ca8dce2b6ca8':('A','삼일','2026-08-05','personal_data_access','request',None),
 'BET-bde3092d3f5c0f09':('A','벧엘','2026-07-27','personal_data_access','request',None),
 'BET-994afdf17e697601':('B','신보','2024-08-23','other','reference',None),
 'BET-cc052d3a9fc77a36':('신보','A','2026-08-03','personal_data_access','reply',None),
 'BET-ef848706c771ac41':('A','삼일',None,'personal_data_access','request',None),
 'BET-233044b5d8691f9e':('삼일','A','2026-08-03','personal_data_access','reply',None),
 'BET-c2dcd30ba2ef67bb':('신보','A','2026-08-06','personal_data_access','reply',None),
 'BET-6f6bfa6f9cb54e5a':('신보','A','2026-08-12','personal_data_access','reply',None),
 'BET-809fc6cef83e2152':('신보','A','2026-08-14','personal_data_access','reply',None),
 'BET-e04c5d05d2743f52':('신보','A','2026-08-14','personal_data_access','reply',None),
 'BET-eabb2409384529e3':('신보','A','2026-08-14','personal_data_access','reply',None),
 'BET-ec05fa277062ffbc':('삼일','A','2026-08-04','personal_data_access','reply',None),
 'BET-d70fb7f30d4b7ef6':('삼일','A','2026-08-03','personal_data_access','reply',None),
 'BET-159e908f29dde0f3':('A','B','2026-08-18','other','request',None),
 'BET-63aedf1144f56ea1':('A','B',None,'other','request',None),
 'BET-c03456d728d48299':('삼일','법원',None,'other','reference',None),
 'BET-da0e6d06301f6902':('삼일','법원',None,'other','reference',None),
 'BET-e16ba3b60020bee7':('벧엘','신보','2025-12-22','other','reference',None),
 'BET-479013bc794098af':('B','벧엘',None,'personal_data_access','request',None),
 'BET-3089ef93afc36216':('B','벧엘','2026-07-16','personal_data_access','request',None),
 'BET-739fcfb4ef79f3e5':('A','벧엘','2026-08-05','personal_data_access','request',2),
 'BET-e405d377939d4966':('A','신보','2026-08-06','personal_data_access','request',2),
 'BET-a18b8bb12850a526':('삼일','법원',None,'other','reference',None),
 'BET-7f9e729acd07a731':('B','벧엘',None,'personal_data_access','request',None),
 'BET-fd5941f5852100d7':('A','신보','2026-09-04','other','reference',None),
}

EVIDENCE=[
 ('E19','BET-41ff98881ff68155','line:70','A','litigation_argument','processing_status','원업무가 없는 이상', '의견서의 주장: 비당사자 개인정보 처리 원업무와 위탁 전제에 이의를 제기함. 법적 결론 미확정',False),
 ('E20','BET-fc05f8971406f157','line:665','A','litigation_argument','retention_authority','보유 권한의 문제: 이러한 정보를 보유할 수 있는 주체인가','의견서의 문제제기: 감정 완료 후 보유 주체의 처리 근거와 파기 의무 확인 필요',False),
 ('E21','BET-375209b396d4a6fe','line:11','A','litigation_argument','nonparty_status','저는 이 사건의 피고가 아닙니다.','의견서의 진술: 비당사자의 독립된 개인정보 권리보호를 요청',False),
 ('E01','BET-abe391396e10a932','ocr:ocr-page-1','벧엘','reply_text','registration','법원에 등록되어있는 문서감정원','법원 등록 문서감정원이라는 자기표시',True),
 ('E02','BET-abe391396e10a932','ocr:ocr-page-1','벧엘','reply_text','transfer','본 감정원은 의뢰인으로부터 「책임경영 이행 약정서」 컬러 복사본 2매를 수령하였습니다.','사본 수령 및 마스킹 미실시라는 회신',True),
 ('E03','BET-abe391396e10a932','ocr:ocr-page-1','벧엘','reply_text','retention','본 감정원에서는 보관하고 있지 않습니다.','원본 및 PDF 미보관이라고 회신',True),
 ('E04','BET-1ff6b077e36b080d','ocr:ocr-page-2','벧엘','reply_text','retention','본 감정원의 하드디스크에 감정서 PDF파일이 보관되어 있는 사실을 추가로 확인하였습니다.','종전 PDF 미보관 회신 정정',True),
 ('E05','BET-5f510a4644febece','ocr:ocr-page-1','벧엘','reply_text','transfer','법무법인 삼일','자료 출처를 삼일로 회신',False),
 ('E06','BET-618dba8e33fc43a6','ocr:ocr-page-1','벧엘','reply_text','transfer','2025년 12월 2일경 이메일을 통하여 감정자료로 수령','사본 네 매 이메일 수령이라는 회신',False),
 ('E07','BET-48b5578ea8eae840','ocr:ocr-page-2','삼일','attachment','transfer','2_계약서(칼라 스캔본)','삼일의 감정의뢰 이메일 출력본, 원본 EML은 미확보',True),
 ('E08','BET-48b5578ea8eae840','ocr:ocr-page-7','벧엘','attachment','payment','700,000원','2025-12-03 13:40:01 입금 70만원, 적요 법무법인삼일',True),
 ('E09','BET-48b5578ea8eae840','ocr:ocr-page-1','벧엘','reply_text','court_submission','감정료 입금 내역 1매','작성일 10월7일과 법원 제출일 10월12일을 구분',False),
 ('E10','BET-6399ea4424391cac','ocr:ocr-page-4','삼일','reply_text','authorization','의뢰인의 승인하에','승인 아래 2025-12-02 SNS 사본 전달했다는 회신',False),
 ('E11','BET-d15026ffbb88cf68','page:4','신보','reply_text','authorization','감정 진행 및 비용지급 여부에 대하여 구두 협\n의 및 승인하였음을 알려드립니다.','원기록 부존재와 구두 협의·승인 진술이 함께 존재',False),
 ('E12','BET-e5453c2b5b8651ec','ocr:ocr-page-2','삼일','reply_text','transfer','2024. 10월 경','SNS를 의뢰인으로부터 2024년10월경 수령했다고 회신',False),
 ('E13','BET-e16ba3b60020bee7','ocr:ocr-page-1','벧엘','attachment','materials','사본 2매','감정서 첫 면의 의뢰인 표시와 사본 자료 네 매',True),
 ('E14','BET-e16ba3b60020bee7','ocr:ocr-page-1','벧엘','attachment','equipment','전자 현미경','현미경·CCD카메라 등 사용을 기재, 보유·사용 사실 외부 확인 전',True),
 ('E15','BET-a18b8bb12850a526','ocr:ocr-page-23','벧엘','attachment','professional_claim','법원감정전문','4월15일 원고 서면의 갑21호증 감정서에 법원감정전문 표시',True),
 ('E16','BET-a18b8bb12850a526','ocr:ocr-page-22','벧엘','attachment','conclusion','동일인','형태적 공통특징을 열거하고 동일인 필적으로 사료된다는 결론',True),
 ('E17','BET-a18b8bb12850a526','page:11','삼일','litigation_argument','litigation_use','특수관계','원고 서면이 SNS 게시물과 감정서를 특수관계 주장에 인용',False),
 ('E18','BET-a18b8bb12850a526','ocr:ocr-page-19','벧엘','attachment','equipment','전자 현미경','사본 네 매와 현미경·CCD카메라 등 사용 기재가 같은 감정서에 존재',True),
]
QUESTIONS=[
 ('Q09',1,'법원행정처','법원 인가·등록 또는 등재 심사와 관리 범위에 개인정보 처리·보유·파기 요건이 포함되는가'),
 ('Q10',3,'개인정보보호위원회','B 주민등록번호의 수령·저장·감정서 편철에 대한 구체적 처리 허용 근거와 현재 보관·파기 상태'),
 ('Q11',3,'개인정보보호위원회','A 비당사자 식별정보를 받은 벧엘의 처리 지위·독립적 법적 근거와 감정 완료 후 보관·파기 상태'),
 ('Q01',1,'법원행정처','사설 감정원 인가와 개인 감정인 명단 등재 제도의 구분'),
 ('Q02',1,'법원행정처/관할법원','2025년12월 및 2026년7월 해당인·기관의 등재 주체·분야·기간'),
 ('Q03',2,'법원행정처/관할법원','당시 적용된 시설·장비 기준과 제출·심사한 장비 소명자료'),
 ('Q04',2,'벧엘','이 건 사용장비의 모델·식별번호·촬영·측정파일·원본/사본 한계'),
 ('Q05',3,'삼일/신보/벧엘','실제 전송 EML·첨부 ZIP·승인·비용 지급과 정산의 원기록'),
 ('Q06',3,'벧엘','감정서 PDF 보관 정정의 발견일·보존기간·접근·파기 및 전달이력'),
 ('Q07',3,'국세청/관할세무서','해당 용역의 면세 적용근거와 실제 전용시설·고용 등 요건'),
 ('Q08',3,'개인정보보호위원회','법원 답변과 자료흐름을 결합한 처리 적법성 검토; 아직 미제출'),
]

def main():
    ap=argparse.ArgumentParser();ap.add_argument('--private-root',type=Path,required=True)
    ap.add_argument('--originals-uploaded',action='store_true');args=ap.parse_args()
    r=args.private_root
    if 'private-data' not in r.resolve().parts:ap.error('private-data directory required')
    docs=read(r/'inventory.json'); aliases=read(r/'aliases.json'); rows=[];sql=['begin;']
    people=read(r/'people.json',{})
    allblocks={};runs=[];stats=Counter();unreviewed=[]
    for d in docs:
        did=d['document_id']; f=r/'documents'/did
        native=read(f/'blocks.json',[]);ocr=read(f/'ocr-blocks.json',[])
        allblocks[did]=native+ocr
        run=read(f/'parser-run.json');
        if run:runs.append(run)
        status=d['parse_status']
        if ocr:
            status='OCR_EXTRACTED_UNVERIFIED'; stats['ocr_documents']+=1
            stats['ocr_pages']+=len(ocr)
        stats['formats_'+d['format']]+=1
        name=d['filename']; text='\n'.join(b['text'] for b in native+ocr)
        compact=re.sub(r'\s+','',text)
        row=dict(d);row['parse_status']=status;row['subject_person']=None
        row['receipt_number']=None;row['metadata_evidence']=[];row['notes']=''
        row['sender_candidate']=None;row['recipient_candidate']=None
        row['direction_candidate']='unknown'; row['procedure_candidate']='unknown'
        row['date_candidate']=None;row['round_filename']=None
        m=re.search(r'(\d+)차',name)
        if m:row['round_filename']=int(m.group(1))
        if d['format']=='.md':row['direction_candidate']='reference'
        elif d['format']=='.docx' or re.search('요구서|청구서',name):row['direction_candidate']='request'
        elif re.search('회신|통지|답변|정보공개청구_0',name):row['direction_candidate']='reply'
        if re.search('문서송부촉탁',compact[:1500]):row['procedure_candidate']='document_transmission'
        elif re.search('정보공개',compact[:800]):row['procedure_candidate']='information_disclosure'
        elif re.search('개인정보',compact[:800]):row['procedure_candidate']='personal_data_access'
        if row['direction_candidate']=='request':
            row['sender_candidate']=next((key for key,value in people.items() if value and value in name),None)
            row['recipient_candidate']=next((org for org,word in [('삼일','삼일'),('신보','신용보증기금'),('벧엘','벧엘')] if word in name),None)
        if did in REVIEWED:
            s,t,date,proc,direction,rd=REVIEWED[did]
            row.update(sender=s,recipient=t,document_date=date,procedure=proc,direction=direction,
                round_claimed=rd,metadata_review='body_reviewed')
            row['subject_person']= t if t in ('A','B') else (s if s in ('A','B') else None)
            row['metadata_evidence']=[{'basis':'document body reviewed; dispatch/receipt not assumed'}]
        if re.search(r'신보 정보공개청구_0[1-4]',name) or did=='BET-d15026ffbb88cf68':
            row.update(sender='신보',recipient='B',subject_person='B',procedure='information_disclosure',direction='reply',metadata_review='body_reviewed')
            row['receipt_number']=re.search(r'172\d{5}',name).group()
            row['notes']='동일 2026-07-31 청구의 분할 접수; 01~04는 절차상 1~4차가 아님'
            row['metadata_evidence']=[{'locator':'page:1','basis':'수신자·접수번호·접수일. 접수일은 회신 작성일이 아님'}]
        if did=='BET-e76d2f244f0b392c':row['notes']='파일명은 두 이름을 포함하나 본문 청구인은 B'
        if did=='BET-618dba8e33fc43a6':row['notes']='파일명 3차와 달리 본문은 2차 요구서에 대한 회신. 회신 차수 미확정'
        if did=='BET-e5453c2b5b8651ec':row['notes']='2026-09-11 요구서와 09-14 도달을 회신에 기재; 제공된 09-03 초안과 동일 발송본으로 자동 연결하지 않음'
        if did=='BET-48b5578ea8eae840':row['notes']='작성 10-07, 법원 제출 10-12. 일반 우편 수신일과 구분'
        if did in {'BET-fc05f8971406f157','BET-41ff98881ff68155','BET-375209b396d4a6fe'}:
            row['notes']='사용자 제공 법원 의견서 MD 전사본. 내용은 작성자의 주장·해석이며 기관 회신과 구별. 원 PDF·그림·접수증 미대조. 문서명 또는 본문 제출 표시는 제출 완료의 독립 증명이 아님.'
        # Drafts, receipt evidence and confidence remain explicit.
        if row['metadata_review']=='pending':unreviewed.append(did)
        rows.append(row)
        sql.append(insert('bethel_documents',{k:row[k] for k in ['document_id','sha256','filename','format','intake_basis','parse_status']}))
        sql.append(insert('bethel_extractions',{'document_id':did,'native_blocks':json.dumps(native,ensure_ascii=False),
            'ocr_blocks':json.dumps(ocr,ensure_ascii=False),'parser_run':json.dumps(run,ensure_ascii=False) if run else None,
            'ocr_review_status':'partial_visual_review' if did in {x[1] for x in EVIDENCE if x[-1]} else 'unverified'},True))
        keys=['document_id','sender','recipient','subject_person','document_date','procedure','direction','round_claimed','round_confirmed','dispatch_status','receipt_status','receipt_number','reply_to','metadata_review','notes']
        sql.append(insert('bethel_correspondence',{**{k:row[k] for k in keys},'metadata_evidence':json.dumps(row['metadata_evidence'],ensure_ascii=False)}))
    evidence=[]
    for eid,did,loc,speaker,role,topic,quote,prop,visual in EVIDENCE:
        assert did in allblocks and any(b['locator']==loc for b in allblocks[did]),(eid,did,loc)
        e=dict(evidence_id=eid,document_id=did,locator=loc,speaker=speaker,passage_role=role,topic=topic,quotation=quote,
            proposition=prop,epistemic_status='document_statement',visual_review=visual)
        evidence.append(e)
        sql.append('insert into "case".bethel_evidence ('+','.join(e)+') values ('+','.join(literal(v) for v in e.values())+') on conflict (evidence_id) do nothing;')
    question_evidence={
        'Q09':['E01','E15'],'Q10':['E02','E03','E04'],'Q11':['E05','E06','E19','E20','E21'],
        'Q01':['E01','E15'],'Q02':['E01','E13','E15'],'Q03':['E01','E14','E18'],
        'Q04':['E02','E07','E13','E14','E16','E18'],'Q05':['E05','E07','E08','E10','E11','E12','E17'],
        'Q06':['E03','E04'],'Q07':['E08','E14'],'Q08':['E01','E02','E03','E04','E10','E11']}
    for q,stage,authority,question in QUESTIONS:
        sql.append('insert into "case".bethel_questions(question_id,stage,authority,question,evidence_ids) values ('+','.join(map(literal,[q,stage,authority,question,'{'+','.join(question_evidence[q])+'}']))+') on conflict (question_id) do nothing;')
    relations=[('BET-1ff6b077e36b080d','BET-abe391396e10a932','corrects','8월10일 회신 제3항의 명시적 정정','reviewed'),
        ('BET-4769bf6d686b9496','BET-abe391396e10a932','same_content_candidate','동일 제목·날짜·핵심문구이나 바이너리 해시 상이','candidate')]
    for s,t,rel,basis,review in relations:
        sql.append('insert into "case".bethel_relations(source_id,target_id,relation,basis,review_status) values ('+','.join(map(literal,[s,t,rel,basis,review]))+') on conflict do nothing;')
    response_items=read(ROOT/'tools/bethel/response-items.json')
    labels={'substantive':'구체 답변','partial':'부분 답변','prior_reference':'종전 답변 원용','refusal':'제한·거절 사유 명시','outside_scope':'범위 밖으로 분류','unanswered':'개별 답변 미확인','correction':'종전 회신 정정','stated_absence':'보유기록 부존재 통지'}
    matrix=['# 청구 항목별 답변과 남은 공백','','답변의 형식과 충족 범위를 기록한 표입니다. 고의적 회피나 위법성을 자동 판정하지 않습니다. 주제 대조(topic_only)는 실제 발송본의 동일성 확인과 다릅니다. 날짜가 비어 있는 초안·회신에 언급된 미확보 요구서는 직접 연결하지 않았습니다.','',
        '삼일은 8월6일·8월10일·9월22일 회신에서 업무·계약·회계 정보 또는 소송상 비밀 등의 제한 논리를 반복합니다. 반면 전달일·수령시점·보유기간 등 일부 사실은 답합니다. 벧엘은 수령범위·일자·마스킹·이메일 수령은 답하고, 등록 세부정보·장비 생성자료·메일 헤더 등의 개별 답변은 아직 확인되지 않습니다. 이후 법원 촉탁에서 메일 출력본과 입금내역이 제공된 항목은 후속 보완으로 따로 기록했습니다.','',
        '|항목|질문 주제|처리 유형|청구 근거 → 회신 근거|평가와 남은 공백|','|---|---|---|---|---|']
    for item in response_items:
        did=item['request_document_id'];search=item.pop('request_search')
        if did:
            matching=[b for b in allblocks[did] if search in b['text']]
            assert matching,(item['item_id'],search)
            item['request_locator']=matching[0]['locator']
        else:item['request_locator']=None
        assert any(b['locator']==item['reply_locator'] for b in allblocks[item['reply_document_id']]),item['item_id']
        item['intent_assessed']=False
        sql.append('insert into "case".bethel_response_items ('+','.join(item)+') values ('+','.join(literal(v) for v in item.values())+') on conflict (item_id) do nothing;')
        req=f"{did} {item['request_locator']}" if did else '회신이 지칭한 발송본 미특정'
        matrix.append(f"|{item['item_id']}|{item['topic']}|{labels[item['response_status']]}|{req} → {item['reply_document_id']} {item['reply_locator']}|{item['assessment']}|")
    matrix += ['', '## 우선 보완할 항목','',
        '1. 등록 법원·등록 분야·기간·심사자료: 법원행정처와 실제 보유 법원에 먼저 확인합니다.',
        '2. 장비의 실제 보유·사용 및 원본 확대파일: 감정서의 기재와 별도로 검증합니다.',
        '3. 승인 원기록과 비용 최종 정산: 신보의 구두 승인 진술, 삼일 입금 표시, 감정서 의뢰인 표시를 분리합니다.',
        '4. 메일 원본·전체 헤더·첨부 ZIP: 법원에 제출된 출력본을 원본 파일로 간주하지 않습니다.',
        '5. 정확한 거절·누락 건수와 지속성 평가: 실제 발송본·접수증·회신 첨부를 먼저 대조합니다. 원문 없이 거절 비율을 산출하지 않습니다.']
    (ROOT/'docs/bethel/response-matrix.md').write_text('\n'.join(matrix)+'\n',encoding='utf8')
    write(r/'response-items.json',response_items)
    combined_hits=[]
    for did,blocks in allblocks.items():
        for b in blocks:
            if re.search('벧\\s*엘|전\\s*문|인\\s*가|필\\s*압|현\\s*미\\s*경|장\\s*비|면\\s*세|영\\s*수\\s*증',b['text']):
                combined_hits.append({'document_id':did,**b,'passage_role_review':'pending'})
    write(r/'keyword-hits.json',combined_hits)
    sql.append('commit;')
    (r/'import.sql').write_text('\n'.join(sql),encoding='utf8')
    write(r/'reviewed-correspondence.json',rows);write(r/'evidence.json',evidence)
    write(r/'questions.json',[dict(question_id=q,stage=s,authority=a,question=t,evidence_ids=question_evidence[q],status='not_sent') for q,s,a,t in QUESTIONS])
    with (r/'correspondence.csv').open('w',encoding='utf-8-sig',newline='') as f:
        w=csv.DictWriter(f,fieldnames=list(rows[0]));w.writeheader();w.writerows(rows)
    summary={'input_paths':len(docs)+len(aliases),'unique_documents':len(docs),'binary_aliases':len(aliases),
        'missing_paths':len(read(r/'missing.json',[])),'stats':dict(stats),
        'audited_pdf_results':dict(Counter(x['result'] for x in runs)),
        'runtime_contracts':dict(Counter(x['environment']['runtime_contract_status'] for x in runs)),
        'metadata_body_reviewed':len(rows)-len(unreviewed),'metadata_pending':len(unreviewed),
        'response_items':len(response_items),'db_applied':False,'originals_uploaded':args.originals_uploaded}
    write(r/'summary.json',summary)
    write(ROOT/'docs/bethel/processing-summary.json',summary)
    table=['# 발신 수신 및 차수 원장','','전체 문서는 아래에 기록했습니다. A·B의 실명 대응, 원본 경로 및 전체 추출문은 비공개 원장에 있습니다. 후보 값은 파일명·문면 탐색용이며 발송·도달·차수를 확정하지 않습니다.','',
        '접수번호 17212866·17212935·17212999·17213342는 같은 날 접수한 분할 청구입니다. 이를 정보공개 1~4차로 자동 재분류하지 않습니다. 삼일 9월22일 회신이 지칭한 9월11일 요구서와 9월3일 초안의 동일성도 미확인입니다.','',
        '|문서 ID|발신→수신 (본문검토 또는 후보)|문서일|유형|문면 차수 / 파일명 차수|발송·수신|메타데이터|',
        '|---|---|---|---|---|---|---|']
    for row in rows:
        s=row['sender'] or row['sender_candidate'] or '?'; t=row['recipient'] or row['recipient_candidate'] or '?'
        kind=row['procedure'] or row['procedure_candidate'];direction=row['direction'] or row['direction_candidate']
        table.append(f"|{row['document_id']}|{s} → {t}|{row['document_date'] or '미확정'}|{kind} / {direction}|{row['round_claimed'] or '?'} / {row['round_filename'] or '?'}|미확인|{row['metadata_review']}|")
    table += ['', '## 원장 읽는 방법','',
        '- `body_reviewed`: 해당 발신·수신·문서일 등을 본문과 대조했습니다. 실제 도달일·발송본 여부까지 확정한 뜻은 아닙니다.',
        '- `pending`: 수집·파싱은 되었으나 당사자·차수 매칭은 검토 전입니다. 임의로 채우지 않았습니다.',
        '- 모든 `round_confirmed`는 현재 NULL입니다. 등기증명·접수증·메일 전체 헤더를 대조한 후에만 확정합니다.',
        '- 같은 내용의 Markdown, PDF, DOCX와 여러 수정본이 모두 독립 발송된 것은 아닙니다.',
        '- 본문에서 회신이 지칭한 선행 요구서는 관계 후보로 관리하며 날짜가 다른 초안과 자동 연결하지 않습니다.']
    (ROOT/'docs/bethel/correspondence.md').write_text('\n'.join(table)+'\n',encoding='utf8')
    print(json.dumps(summary,ensure_ascii=False))

if __name__=='__main__':main()
