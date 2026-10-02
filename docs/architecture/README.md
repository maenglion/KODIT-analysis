# Architecture decision index

## Status

이 디렉터리는 KODIT Analysis의 장기 의미 계약과 설계 결정을 보존하는 공개 worklog입니다. 채팅 전문이나 일시적인 실행 메모가 아니라, 후속 구현에서 다시 사용해야 하는 정본·경계·불변조건만 기록합니다.

## 기록 원칙

다음 결정이 생기면 관련 문서를 신규 작성하거나 갱신합니다.

- canonical source와 identity가 결정된 경우
- 관측값, 파생값 및 추론값의 의미 경계가 결정된 경우
- PK/FK, versioning, relation semantics가 결정된 경우
- 기존 필드의 지위가 canonical에서 compatibility/cache로 바뀐 경우
- 후속 작업에서 재사용하면 안 되는 snapshot 또는 temporary contract가 생긴 경우
- 중요한 non-goal이나 금지사항이 확정된 경우

각 문서는 가능한 범위에서 Status, 기준 commit, Purpose, Current facts, Canonical sources, Invariants, Non-goals, Known gaps, Related paths 및 Decision history를 유지합니다.

## 주요 계약

- [`schema-boundaries.md`](schema-boundaries.md): 물리 스키마와 접근 경계
- [`regulation-version-availability-contract.md`](regulation-version-availability-contract.md): 규정 버전 단위 공개 판정
- [`parser-runtime-contract.md`](parser-runtime-contract.md): parser runtime과 실행 provenance
- [`parser-failure-taxonomy.md`](parser-failure-taxonomy.md): 실패 domain/code 계약
- [`parser-operation-review-20261003.md`](parser-operation-review-20261003.md): HWP·HWPX·PDF 코드·재현 로그 대조와 기술 사양 UI의 공개 경계
- [`document-extraction-ledger.md`](document-extraction-ledger.md): attachment, binary, parser run, extraction 원장
- [`observation-label-entity-model.md`](observation-label-entity-model.md): observation → label → entity 계층
- [`residual-ontology-workplan.md`](residual-ontology-workplan.md): 잔차·관계 온톨로지 작업 순서
- [`organization-lineage.md`](organization-lineage.md): 조직 node와 공식 근거 기반 lineage
- [`historical-organization-work-attribution.md`](historical-organization-work-attribution.md): 시점별 조직·업무 귀속 근거
- [`topic-analysis-contract.md`](topic-analysis-contract.md): 주제 분석의 membership과 집계 grain
- [`residual-resolution-ui.md`](residual-resolution-ui.md): 공개 가능한 잔차 설명 UI 경계
- [`public-ui-runtime-contract.md`](public-ui-runtime-contract.md): 정적 공개 UI, RPC 보존, 서로 다른 승인 시점의 표시 경계

## 공개 범위

문서에 등장하는 규정명과 업무 주제는 공개 source의 분석 범주다. 특정 개인에 대한 평가, 법적 판단 또는 비공개 활용 목적을 architecture contract에 기록하지 않는다. 보호가 필요한 운영 정보, 비밀값, 내부 검토 메모 및 개인 식별정보는 이 공개 worklog의 대상이 아니다.

실행별 수치와 결과물은 이 디렉터리에 복사하지 않고 `reports/measurements`의 versioned artifact와 Git commit으로 추적합니다.
