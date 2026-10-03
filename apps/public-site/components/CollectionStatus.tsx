"use client";

import { useEffect, useState } from "react";

type CollectionState = {
  available: boolean;
  lastCheckedAt?: string | null;
  lastSuccessfulAt?: string | null;
  recentStatus?: string;
  nextDueAt?: string | null;
  reviewPendingCount?: number;
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

export function CollectionStatus({ evidenceAsOf, snapshotGeneratedAt }: { evidenceAsOf: string; snapshotGeneratedAt: string }) {
  const [state, setState] = useState<CollectionState | null>(null);
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
  return <div className="collection-status" aria-label="공개본 및 자동 수집 상태">
    <dl className="public-release-meta">
      <div><dt>공개 데이터 기준일</dt><dd>{evidenceAsOf}</dd></div>
      <div><dt>공개본 생성일</dt><dd>{snapshotGeneratedAt.slice(0, 10)}</dd></div>
      <div><dt>마지막 성공 수집일</dt><dd aria-live="polite">{collectionValue(state?.lastSuccessfulAt)}</dd></div>
      <div><dt>다음 수집 예정일</dt><dd aria-live="polite">{collectionValue(state?.nextDueAt)}</dd></div>
      <div><dt>자동수집 주기</dt><dd>10일</dd></div>
    </dl>
    <p className="collection-status-note">자동수집 상태: {state?.available ? statusLabel(state.recentStatus) : state === null ? "조회 중" : "확인 불가"} · 실행 여부는 매일 확인하며 기본 수집 간격은 10일입니다. 성공은 작업 기록 기준이며 모든 출처의 완료나 공개본 승인을 뜻하지 않습니다.</p>
  </div>;
}
