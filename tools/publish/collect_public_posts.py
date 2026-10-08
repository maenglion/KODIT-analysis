"""Collect public KODIT board listings separately from regulation releases.
Only public read requests; no database writes. Detail collection prioritizes audit/legal subjects.
"""
import concurrent.futures, datetime, html, json, pathlib, re, urllib.request, urllib.parse
ROOT = pathlib.Path(__file__).resolve().parents[2]
OUT = ROOT / "apps/public-site/data"
BASE = "https://www.kodit.or.kr"
def clean(s):
    s = re.sub(r"<script\b.*?</script>|<style\b.*?</style>", "", s, flags=re.S|re.I)
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]*>", " ", s))).strip()
def fetch(u):
    with urllib.request.urlopen(urllib.request.Request(u,headers={"User-Agent":"KODIT-public-evidence-index/1.0"}), timeout=25) as r:
        return r.read().decode("utf-8")
def listings(board):
    result=[]; failed=[]; total=None
    if board["excluded_reason"]:return board,result,failed
    for page in range(1,101):
        try:
            s=fetch(board["url"]+"&listCo=500&currPage="+str(page))
            m=re.search(r'class="pge_totle".*?<strong[^>]*>([\d,]+)</strong>',s,re.S)
            if m:total=int(m[1].replace(",",""))
            rows=[]
            for row in re.findall(r"<tr\b.*?</tr>|<li\b.*?</li>",s,re.S|re.I):
                m=re.search(r'<a[^>]*data-(?:id|param)="(\d+)"[^>]*class="[^"]*(?:nttInfoBtn|menuFormBtn)[^"]*"[^>]*>(.*?)</a>',row,re.S)
                if not m:
                    title=re.search(r'<td[^>]*class="bbs_tit"[^>]*>(.*?)</td>',row,re.S)
                    files=[]
                    for key in dict.fromkeys(re.findall(r'nttFileDownload.do\?fileKey=([^"&]+)',row)):
                        filename=re.search(r'title=["\']([^"\']+)["\']',row)
                        files.append(dict(attachment_id=key,title=html.unescape(filename[1]) if filename else (clean(title[1]) if title else "첨부자료")))
                    if title and files:
                        dates=re.findall(r"20\d{2}[./-]\d{2}[./-]\d{2}",clean(row))
                        rows.append(dict(post_id=None,board_id=board["board_id"],board_name=board["name"],title=clean(title[1]),posted_date=re.sub(r"[./]","-",dates[-1]) if dates else None,document_type="공개 첨부자료",source_url=board["url"],attachments=files,public_status="공개 목록 확인 · 게시물 ID 미제공",body_available=False,attachment_status="목록 확인"))
                    continue
                dates=re.findall(r"20\d{2}[./-]\d{2}[./-]\d{2}",clean(row))
                pid=m[1];bid=board["board_id"]
                rows.append(dict(post_id=pid,board_id=bid,board_name=board["name"],title=clean(m[2]),posted_date=None if bid=="44" else (re.sub(r"[./]","-",dates[-1]) if dates else None),document_type="감사결과" if bid=="44" else "일반 게시물",source_url=BASE+"/kodit/na/ntt/selectNttInfo.do?mi="+board["menu_id"]+"&bbsId="+bid+"&nttSn="+pid,attachments=[],public_status="공개 목록 확인",body_available=False,attachment_status="상세 미수집"))
            identity=lambda r: r["post_id"] or r["attachments"][0]["attachment_id"]
            seen={identity(r) for r in result}; fresh=[r for r in rows if identity(r) not in seen];result+=fresh
            if not fresh or len(rows)<500:
                if total and not result:failed.append(dict(page=page,error="unsupported_listing_format"))
                break
        except Exception as e:failed.append(dict(page=page,error=type(e).__name__));break
    board.update(listed_total=total,collected_count=len(result),failed_pages=len(failed),listing_complete=total is not None and len(result)==total)
    return board,result,failed
KEYS=re.compile("감사|구상권|구상금|채권관리|소송|책임경영|소송위임")
def detail(post):
    try:
        s=fetch(post["source_url"]); start=s.find('class="bbs_ViewA"'); fragment=s[start:] if start>=0 else ""
        if not fragment:raise ValueError("detail_not_found")
        m=re.search(r'<strong>등록일</strong>\s*([\d.]+)',fragment)
        if m:post["posted_date"]=m[1].replace(".","-")
        files=[]
        for m in re.finditer(r'<p[^>]*>(.*?)</p>\s*<a[^>]*href="(/common/nttFileDownload.do\?fileKey=([^"&]+))"',fragment,re.S):
            files.append(dict(attachment_id=m[3],title=clean(m[1])))
        post["attachments"]=files;post["attachment_status"]="상세 확인"
        m=re.search(r'<div[^>]*class="[^" ]*(?:bbsV_cont|bbsV_content|bbs_view_cont)[^" ]*"[^>]*>(.*?)</div>',fragment,re.S)
        if m:
            body=clean(m[1]);post["body"]=body;post["body_available"]=bool(body)
        post["public_status"]="공개 원문 확인"
        return post,None
    except Exception as e:return post,dict(board_id=post["board_id"],post_id=post["post_id"],error=type(e).__name__)
def main():
    home=fetch(BASE+"/kodit/main.do");boards={}
    excluded={"322":"기존 사규예고 검색 유지", "97":"개인 문의 게시판", "265":"개인 민원 게시판", "103":"개인 참여 게시판"}
    for href,label in re.findall(r'<a[^>]+href=["\']([^"\']+)["\'][^>]*>(.*?)</a>',home,re.S):
        if "selectNttList.do" not in href:continue
        q=urllib.parse.parse_qs(urllib.parse.urlparse(html.unescape(href)).query)
        if "bbsId" not in q or "mi" not in q:continue
        bid=q["bbsId"][0]
        if bid not in boards:boards[bid]=dict(board_id=bid,menu_id=q["mi"][0],name=clean(label),url=urllib.parse.urljoin(BASE,html.unescape(href)),excluded_reason=excluded.get(bid),listed_total=None,collected_count=0,failed_pages=0,listing_complete=False)
    posts=[]; inventory=[];failures=[]
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        for board,rows,errors in pool.map(listings,boards.values()):
            inventory.append(board);posts+=rows;failures.extend(dict(board_id=board["board_id"],**e) for e in errors);print("board",board["board_id"],len(rows),flush=True)
    # Detail sampling is explicit; uncollected bodies are never searchable.
    targets=[p for p in posts if p["post_id"] and KEYS.search(p["title"])][:600]
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        for post,error in pool.map(detail,targets):
            if error:failures.append(error)
    required=next((p for p in posts if p["board_id"]=="44" and p["post_id"]=="64613"),None)
    if required is None:
        required=dict(post_id="64613",board_id="44",board_name="감사공개방",title="기타소송 업무처리 실태 점검",posted_date="2016-12-08",document_type="감사결과",source_url=BASE+"/kodit/na/ntt/selectNttInfo.do?mi=2809&bbsId=44&nttSn=64613",attachments=[],body_available=False,public_status="보존 원문 확인");posts.append(required)
    required,error=detail(required)
    if error:failures.append(error)
    preserved=pathlib.Path(r"C:\Users\PC\OneDrive\사진\문서\신용보증기금\howareyou-sinbo-site\markdown\01_kodit_other_litigation_audit_2016.md")
    if preserved.exists():
        text=preserved.read_text(encoding="utf-8-sig");required["body"]=" ".join(re.findall(r"```text\s*(.*?)```",text,re.S));required["body_available"]=True
    report=dict(collected_at=datetime.datetime.now(datetime.timezone.utc).isoformat(),discovery_source=BASE+"/kodit/main.do",population_complete=False,coverage_note="홈페이지 메뉴에서 발견한 게시판의 공개 목록 수집. 전체 게시판 모집단과 비메뉴 게시판은 미확정. 일부 상세·첨부 미수집. 전수검색 완료 아님.",internal_db_status="확인 불가: DB 관리 조회 권한 403",boards=inventory,failures=failures,posts_count=len(posts),details_attempted=len(targets)+1,body_count=sum(bool(p.get("body_available")) for p in posts))
    OUT.mkdir(exist_ok=True)
    for name,data in [("public-posts.json",posts),("public-posts-coverage.json",report)]: (OUT/name).write_text(json.dumps(data,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print("DONE",len(posts),"failures",len(failures),flush=True)
if __name__=="__main__":main()
