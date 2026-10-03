"use client";

import { useEffect, useId, useRef, useState } from "react";

type CollectionState = {
  available: boolean;
  lastSuccessfulAt?: string | null;
  recentStatus?: string;
  nextDueAt?: string | null;
};

type BasisDetail = { label: string; date: string };
type Props = {
  evidenceAsOf: string;
  snapshotGeneratedAt?: string | null;
  basisLabel?: string;
  additionalBases?: BasisDetail[];
  generationSource?: string;
};

function formatSeoulTime(value?: string | null) {
  if (!value) return "확인되지 않음";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "확인되지 않음";
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  }).format(date);
}

function statusLabel(value?: string) {
  const labels: Record<string, string> = {
    succeeded: "실행 기록상 완료", no_change: "변경 없음", running: "수집 중",
    failed: "수집 실패", waiting: "실행 대기", not_due: "다음 수집일 전",
    locked: "다른 수집 실행 중", partial: "부분 수집 기록",
  };
  return labels[value ?? ""] ?? "상태 확인 필요";
}

export function CollectionStatus({ evidenceAsOf, snapshotGeneratedAt, basisLabel, additionalBases = [], generationSource }: Props) {
  const [state, setState] = useState<CollectionState | null>(null);
  const dialogId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const response = await fetch("/api/collection-state", { cache: "no-store" });
        const value: CollectionState = response.ok ? await response.json() : { available: false };
        if (active) setState(value);
      } catch {
        if (active) setState({ available: false });
      }
    }
    void load();
    const timer = window.setInterval(() => { void load(); }, 5 * 60 * 1000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);

  const collectionValue = (value?: string | null) => state === null ? "조회 중" : state.available ? formatSeoulTime(value) : "상태 조회 불가";
  const currentStatus = state?.available ? statusLabel(state.recentStatus) : state === null ? "조회 중" : "확인 불가";
  return <aside className="collection-status" aria-label="이 페이지의 공개 데이터와 자동수집 날짜">
    <dl className="public-release-meta">
      <div><dt>공개 데이터 기준일</dt><dd>{evidenceAsOf}{basisLabel && <small> · {basisLabel}</small>}{additionalBases.map(basis => <small className="meta-additional-basis" key={`${basis.label}-${basis.date}`}>{basis.label} {basis.date}</small>)}</dd></div>
      <div><dt>공개본 생성일</dt><dd>{snapshotGeneratedAt ? snapshotGeneratedAt.slice(0, 10) : "기록 없음"}{generationSource && snapshotGeneratedAt && <small> · {generationSource}</small>}</dd></div>
      <div><dt>마지막 성공 수집일</dt><dd aria-live="polite">{collectionValue(state?.lastSuccessfulAt)}</dd></div>
      <div><dt>다음 수집 예정일</dt><dd aria-live="polite">{collectionValue(state?.nextDueAt)}</dd></div>
      <div><dt>자동수집 주기</dt><dd>10일</dd></div>
    </dl>
    <button ref={triggerRef} type="button" className="collection-status-help" aria-haspopup="dialog" aria-controls={dialogId} onClick={() => dialogRef.current?.showModal()}>
      <img src="/figma-icons/info.svg" alt="" /> 수집 상태: {currentStatus} <span className="sr-only">· 날짜와 수집 기준 설명 열기</span>
    </button>
    <dialog ref={dialogRef} id={dialogId} className="collection-status-dialog" aria-labelledby={`${dialogId}-title`} onClose={() => triggerRef.current?.focus()} onClick={event => { if (event.target === dialogRef.current) dialogRef.current?.close(); }}>
      <div className="collection-status-dialog-inner">
        <div className="collection-status-dialog-head"><h2 id={`${dialogId}-title`}>데이터·수집 날짜 안내</h2><button type="button" onClick={() => dialogRef.current?.close()} aria-label="날짜 안내 닫기">×</button></div>
        <p><strong>공개 데이터 기준일</strong>은 이 페이지의 표시 자료가 참조한 시점입니다. 조직도·주제 분류처럼 별도 날짜가 있으면 함께 표시합니다.</p>
        <p><strong>공개본 생성일</strong>은 생성일이 기록된 해당 공개본의 날짜입니다. 별도 검증본에 생성일 필드가 없으면 추정하지 않습니다.</p>
        <p><strong>마지막 성공 수집일</strong>과 <strong>다음 수집 예정일</strong>은 별도 공개 상태 API의 값이며, 공개본의 자료 날짜가 자동으로 바뀌는 것은 아닙니다.</p>
        <p>자동수집 상태: <strong>{currentStatus}</strong> · 실행 여부는 매일 확인하며 기본 수집 간격은 10일입니다. 성공은 작업 기록 기준이며 모든 출처의 완료나 공개본 승인을 뜻하지 않습니다.</p>
        <button type="button" className="collection-status-dialog-close" onClick={() => dialogRef.current?.close()}>닫기</button>
      </div>
    </dialog>
  </aside>;
}
