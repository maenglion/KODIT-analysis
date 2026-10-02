"use client";

import { useMemo, useRef, useState } from "react";

const initialConsonants = "ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ";
function initial(value: string) {
  const character = value.codePointAt(0) ?? 0;
  return character >= 0xac00 && character <= 0xd7a3 ? initialConsonants[Math.floor((character - 0xac00) / 588)] : "기타";
}

export function DepartmentSelectorDialog({ departments, selected, onSelect }: {
  departments: string[];
  selected: string | null;
  onSelect: (value: string) => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [query, setQuery] = useState("");
  const groups = useMemo(() => {
    const sorted = [...departments].sort((a, b) => a.localeCompare(b, "ko-KR"));
    const matches = sorted.filter((name) => name.toLocaleLowerCase("ko-KR").includes(query.trim().toLocaleLowerCase("ko-KR")));
    return Object.entries(Object.groupBy(matches, initial));
  }, [departments, query]);
  const choose = (name: string) => { onSelect(name); dialogRef.current?.close(); };

  return <>
    <button className="detail-button" type="button" aria-haspopup="dialog" onClick={() => { setQuery(""); dialogRef.current?.showModal(); }}>부서 목록</button>
    <dialog className="department-picker" ref={dialogRef} aria-labelledby="department-picker-title" onClick={(event) => { if (event.target === dialogRef.current) dialogRef.current?.close(); }}>
      <div className="department-picker-inner">
        <header><div><p className="eyebrow">ㄱㄴㄷ 부서 찾기</p><h2 id="department-picker-title">담당부서 목록</h2><p>부서를 선택하면 이 화면의 공개현황 카드가 바뀝니다. 아래 목록까지 이동하지 않습니다.</p></div><button className="department-picker-close" aria-label="부서 목록 닫기" onClick={() => dialogRef.current?.close()}>닫기 ×</button></header>
        <label className="department-picker-search">부서명 검색<input autoFocus type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="예: 리스크준법실" /></label>
        <div className="department-picker-groups">{groups.map(([letter, names]) => <section key={letter} aria-label={`${letter} 부서`}><h3>{letter}</h3><div>{names?.map((name) => <button key={name} className={selected === name ? "selected" : ""} aria-pressed={selected === name} onClick={() => choose(name)}>{name}</button>)}</div></section>)}{groups.length === 0 && <p className="department-picker-empty">일치하는 부서가 없습니다. 다른 검색어를 입력해 주세요.</p>}</div>
      </div>
    </dialog>
  </>;
}
