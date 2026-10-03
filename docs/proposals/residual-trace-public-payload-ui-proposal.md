# 잔차 증거사슬 공개 payload — UI 검토 제안 v0

> **제안·미승인. 구현 계약 아님.** 이 문서는 Manus가 화면에 필요한 *최소 공개 투영 구조*를 Codex에 제안하는 **draft PR 전용** 자료다. DB migration, RPC 반환 스키마, snapshot exporter, 승인 정적 snapshot 또는 공개 화면을 변경하지 않는다. Codex가 장기 원장·공개 read model·표본을 먼저 고정하면 실제 필드명/값/집계와 다시 대조한다.
>
> 기준: `main@e1de1598bf46271758ac2814035bd3ff193b41e7` (2026-10-03). 당시 공개 `public-snapshot-v2.json.gz`에는 trace 사례·run·분기·근거번호·비교 레코드가 없었다. 아래 `<...>` 문자열은 **문법 확인용 자리표시자**이며 실제 조직·게시물·시각·URL·수치가 아니다. 이 JSON을 공개 snapshot에 넣거나 렌더링하지 않는다.

## 화면에서 답해야 하는 질문

1. **무엇을 조사했나?** release와 무관한 동일 조사 대상의 공개용 참조와 그 대상의 사전예고·규정·업무를 보여 준다. 내부 `trace_case_id`를 그대로 공개할지 가정하지 않고 **불투명한 `case_ref`**를 제안한다.
2. **어디까지 확인했나?** run별 단계, 공식 문서로 확인한 *인접 단계 간 연결*, 근거번호를 표시한다. 나중 시점의 자료가 따로 있으면 `detached_observations`로 보존하고 과거 단계와 선을 긋지 않는다.
3. **어디서/왜 멈췄나?** 각 분기의 종결값과 멈춘 단계·이유·복수 대응 하위 행을 Codex 원장에서 전달받는다. 화면에서는 계산·재분류하지 않는다.
4. **자료가 늘거나 과거 결론이 정정되면?** 동일 계약 run 간 배타적 변화 분류, 자료 추가 전 영향과 실제 연장 결과, append-only 정정 연결을 구분한다.
5. **어느 방향에서 찾나?** A 담당 표기, B 규정, C 현재 부서는 **동일 원장의 명시된 `(case_ref, run_ref)` 쌍**을 가리키는 공개 색인이다. 프론트가 ‘최신 run’을 고르거나 여러 run을 합치지 않는다. 서로 다른 알고리즘/점수/집계가 아니다. A는 공개가 허용된 **비PERSON 표기 또는 사전예고 진입점만** 사용한다.

## 표본: 구조만 보여 주는 비실데이터 JSON

아래는 **단일 가상 구조의 형태**이지 실제 조사 사실이나 유효한 공개 URL의 예시가 아니다. `E-001`도 예시 번호일 뿐 증거가 존재한다는 뜻이 아니다. 같은 계약의 전후 실행, 복수 대응 및 정정은 하단의 레코드 구조에 별도로 적었다.

```json
{
  "proposal_only": true,
  "payload_schema_version": "<Codex-approved-public-payload-version>",
  "release": {
    "evidence_as_of": "<approved-evidence-date>",
    "generated_at": "<approved-publication-time>",
    "source_release_ref": "<opaque-approved-release-ref>"
  },
  "cases": [
    {
      "case_ref": "<opaque-public-case-ref>",
      "runs": [
        {
          "run_ref": "<opaque-public-run-ref>",
          "case_ref": "<opaque-public-case-ref>",
          "trace_contract_version": "<Codex-approved-trace-contract-version>",
          "source_release_ref": "<opaque-approved-release-ref>",
          "observed_at": "<approved-run-time>",
          "steps": [
            {
              "step_ref": "<notice-step-ref>",
              "kind": "NOTICE",
              "display_text": "<approved-notice-title>",
              "as_of": "<approved-date-or-null>",
              "evidence_nos": ["E-001"]
            },
            {
              "step_ref": "<regulation-step-ref>",
              "kind": "REGULATION",
              "display_text": "<approved-regulation-title>",
              "as_of": "<approved-date-or-null>",
              "evidence_nos": ["E-002"]
            },
            {
              "step_ref": "<current-observation-ref>",
              "kind": "CURRENT_ASSIGNMENT_OBSERVATION",
              "display_text": "<approved-current-work-description>",
              "as_of": "<approved-date-or-null>",
              "evidence_nos": ["E-003"]
            }
          ],
          "official_links": [
            {
              "from_step_ref": "<notice-step-ref>",
              "to_step_ref": "<regulation-step-ref>",
              "relationship_code": "<Codex-approved-direct-relationship-code>",
              "evidence_nos": ["E-002"]
            }
          ],
          "candidate_comparisons": [
            {
              "branch_ref": "<opaque-public-branch-ref>",
              "left_step_ref": "<regulation-step-ref>",
              "right_step_ref": "<current-observation-ref>",
              "observed_phrase": "<approved-observed-work-phrase>",
              "current_assignment_phrase": "<approved-current-work-phrase>",
              "evidence_nos": ["E-003"]
            }
          ],
          "detached_observations": [
            {
              "branch_ref": "<opaque-public-branch-ref>",
              "step_ref": "<current-observation-ref>",
              "display_role": "별도로 확인된 현행 관측"
            }
          ],
          "branches": [
            {
              "branch_ref": "<opaque-public-branch-ref>",
              "step_refs": ["<notice-step-ref>", "<regulation-step-ref>"],
              "terminal_code": "MATCH_NOT_CONFIRMED",
              "stopped_after_step_ref": "<regulation-step-ref>",
              "reason_text": "<approved-branch-specific-reason>",
              "correspondences": []
            }
          ],
          "evidence": [
            {
              "evidence_no": "E-001",
              "document_title": "<approved-document-title>",
              "document_kind": "<approved-document-kind>",
              "effective_on": "<approved-date-or-null>",
              "cited_text": "<approved-public-excerpt>",
              "official_url": "<approved-official-url>"
            },
            {
              "evidence_no": "E-002",
              "document_title": "<approved-document-title>",
              "document_kind": "<approved-document-kind>",
              "effective_on": "<approved-date-or-null>",
              "cited_text": "<approved-public-excerpt>",
              "official_url": "<approved-official-url>"
            },
            {
              "evidence_no": "E-003",
              "document_title": "<approved-document-title>",
              "document_kind": "<approved-document-kind>",
              "effective_on": "<approved-date-or-null>",
              "cited_text": "<approved-public-excerpt>",
              "official_url": "<approved-official-url>"
            }
          ]
        }
      ]
    }
  ],
  "entry_indexes": {
    "by_label": [
      { "entry_ref": "<approved-nonperson-entry-ref>", "entry_kind": "NON_PERSON_LABEL", "display_text": "<approved-nonperson-label>", "targets": [{ "case_ref": "<opaque-public-case-ref>", "run_ref": "<opaque-public-run-ref>" }] }
    ],
    "by_regulation": [
      { "entry_ref": "<approved-regulation-ref>", "display_text": "<approved-regulation-title>", "targets": [{ "case_ref": "<opaque-public-case-ref>", "run_ref": "<opaque-public-run-ref>" }] }
    ],
    "by_current_department": [
      { "entry_ref": "<approved-current-department-ref>", "display_text": "<approved-current-department-name>", "targets": [{ "case_ref": "<opaque-public-case-ref>", "run_ref": "<opaque-public-run-ref>" }] }
    ]
  },
  "run_comparisons": [],
  "corrections": [],
  "research_inputs": []
}
```

`proposal_only`는 **문서용 안전 표지**로, 실제 공개 계약 필드 제안이 아니다. 실데이터 투영에는 위 가상 문자열·빈 예시 배열을 복사하지 않는다. 배열 `[]`는 표본에 해당 **예시 행을 생략**했다는 뜻이며 운영상 ‘0건’ 판정이 아니다. 인접 관계는 `official_links`에 **해당 공식 근거번호가 있을 때만** 존재한다. `candidate_comparisons`는 `branch_ref`가 지정한 분기의 두 문구를 나란히 대조하기 위한 별도 자료이며 **공식 연결선이 아니다**. 중간 근거가 없는 시점 사이에는 `official_links`가 없어야 한다. `detached_observations`도 귀속 분기를 알 수 있도록 `branch_ref`를 갖지만 화살표를 만들지 않는다. 여러 분기에 걸치는 경우의 중복/공유 표현은 Codex가 정하고 UI는 임의 배치하지 않는다.

## 필드군·종결값·복수 대응

| 범위 | 제안 필드 / 구조 | Codex가 확정할 뜻 |
|---|---|---|
| 공개 단위 | 루트 `payload_schema_version`; run의 `case_ref`, `run_ref`, `trace_contract_version`, `source_release_ref`, `observed_at` | 공개 JSON 형태 버전과 조사/판정 계약 버전은 다름. 동일 조사 대상·버전별 실행·입력 자료 범위. 내부 PK·raw ID를 재사용하지 않음 |
| 단계/연결 | `steps[]`, `official_links[]`, `candidate_comparisons[]`, `detached_observations[]` | 직접 연결·문구 후보·분리된 현행 관측은 서로 다른 컬렉션. 후보·분리 관측은 `branch_ref`로 분기에 귀속하되 공식 연결로 승격하지 않음. 시행일이 없으면 누락 사실을 유지 |
| 근거 | `evidence_no`, `document_title`, `document_kind`, `effective_on`, `cited_text`, `official_url` | `[E-001]` 클릭의 공개 안전 최소 필드. 번호가 **run 범위 내**에서 유일한지, run 간 재사용/변경 규칙은 Codex 결정 |
| 분기 | `branch_ref`, `step_refs[]`, `terminal_code`, `stopped_after_step_ref`, `reason_text` | 현재 run의 확인된 마지막 단계와 원장의 정확한 종결값. 중단 사유를 프론트에서 추론하지 않음 |
| 대응 하위 행 | `department_ref`, `public_department_name`, `grade`, `evidence_nos[]`, 후보일 때 `observed_phrase`·`current_assignment_phrase` | 하나의 분기에 **여러 행** 허용. 대표 부서/최고 점수 고르지 않음 |
| 탐색 색인 | `entry_indexes.by_label/by_regulation/by_current_department` → `targets[]`의 `(case_ref, run_ref)` | A/B/C는 같은 실행을 여는 읽기 방향만 바꿈. `display_text`는 승인된 공개용 텍스트; A는 PERSON 별칭/원문 성명이 아닌 비PERSON 표기 또는 Codex가 허용한 notice 진입점만 |

**종결값 제안 enum(표시 문구는 정본 그대로, 실제 코드는 Codex가 확정):**

| `terminal_code` | 화면 표시 | 의미·금지선 |
|---|---|---|
| `CURRENT_ASSIGNMENT_CONFIRMED` | 현행 업무분장까지 확인 | 현재 대응이 확인돼도 과거→현재 이관 경로를 자동 주장하지 않음 |
| `OFFICIAL_TRANSFER_PATH_CONFIRMED` | 공식 이관 경로까지 확인 | 공식 변경/이관 문서에 따라 확인된 범위만 |
| `SOURCE_NOT_OBSERVED_IN_SCOPE` | 자료 부재 | **현재 확보 범위**에서 다음 관계 자료 미확보; 자료가 전혀 없다는 전역 결론 아님 |
| `DIRECT_LINK_NOT_EVIDENCED` | 연결 근거 부재 | 사전예고↔개정 대상 규정 직접 근거를 확인하지 못함 |
| `MATCH_NOT_CONFIRMED` | 대응 미확인 | 규정/업무 확인 후 현행 업무분장 대응 문구 미확인 |
| `MULTIPLE_CORRESPONDENCES` | 복수 대응 | 둘 이상 대응, 실패/모호/조사자료 부족 목록에 포함하지 않음 |

**복수 대응 하위 행 형식(제안):** `correspondences: [{ department_ref, public_department_name, grade: "DIRECT_CURRENT_ASSIGNMENT" | "TEXT_COMPARISON_CANDIDATE", evidence_nos, observed_phrase?, current_assignment_phrase? }]`. `MULTIPLE_CORRESPONDENCES`가 표시되려면 **서로 다른 대응 하위 행이 최소 2개** 있어야 한다는 검증을 제안한다. 단, 후보만 여러 건인 경우에도 이 종결값을 허용할지, 직접 근거 행의 최소 수를 요구할지는 Codex가 확정해야 한다. 각 행에는 근거 등급·근거번호를 표시해 직접 확인과 후보를 **같은 강도의 확인**으로 렌더하지 않는다. 복수 대응은 세 중단 상태와 다른 관측 산출물이고 다음 조사자료 목록에 넣지 않는다. 프론트는 대응 행 수나 등급에서 종결값을 재판정하지 않는다. 실제 자료·문구 공개 가능성은 Codex exporter가 검증한다.

## 동일 계약 run 비교·정정·추가 조사자료의 별도 행

예시 JSON의 세 배열이 비어 있어도, **실제 공개 시 이 구조가 필요한 경우** Codex가 승인된 행을 공급해야 한다. 아래는 필드 제안이지 재계산 지시가 아니다.

| 컬렉션 | UI에 필요한 행 구조 | 제약 |
|---|---|---|
| `run_comparisons[]` | `{ case_ref, before_run_ref, after_run_ref, trace_contract_version, branch_changes: [{ branch_ref, change_code, added_evidence_nos, multiple_correspondence_transition, official_transfer_path_added }] }` | 두 실행의 **조사 계약 버전** 같음. 변화 코드는 아래 다섯 값 중 **비교 가능한 분기당 하나**, 추가 세 항목은 별도 부가 정보. 분할/병합 분기의 안정 참조와 비교 가능성은 Codex 정의 필요 |
| `corrections[]` | `{ case_ref, previous_run_ref, successor_run_ref, reason_public, recorded_at }` | 과거 실행 보존, 사유+후속 실행 동시 표시. `reason_public`는 승인된 공개용 설명; 원 실행을 삭제/덮어쓰지 않음 |
| `research_inputs[]` | `{ input_ref, input_kind, trace_contract_version, population_scope_ref, before_run_ref, after_run_ref?, impacted_branch_count, actually_extended_count?, newly_completed_count?, still_stopped_count?, overlap_policy: "NON_ADDITIVE_ACROSS_INPUTS" }` | 제목: **현재 확보 범위에서 추적을 멈추게 한 자료·근거 유형**. 예상 영향과 실제 연장을 분리하고, 후속 실행도 **동일 조사 계약·같은 비교 가능한 모집단**일 때만 연결. 하나의 분기가 여러 조사자료 유형에 포함될 수 있으므로 **서로 다른 input 행의 건수를 더하지 않는다.** 미제공 값은 0이 아님; 단위는 분기 |

`change_code` 제안: `EXTENDED` / `NEWLY_COMPLETED` / `TERMINAL_CHANGED` / `SHORTENED_BY_CORRECTION` / `UNCHANGED`. `added_evidence_nos`, `multiple_correspondence_transition`, `official_transfer_path_added`는 배타적 변화 범주가 아니므로 합산하지 않는다. **계약 버전이 다르면** 자료 확충 효과 비교행을 내지 않는다. 다음 조사자료 표 각주 정본:

화면 표시 문구는 같은 순서로 **연장된 분기 / 새로 완료된 분기 / 종결값이 바뀐 분기 / 정정으로 짧아진 분기 / 변화 없는 분기**다. `MULTIPLE_CORRESPONDENCES`의 각 하위 행 등급은 각각 **공식 업무분장에서 직접 확인 / 업무 문구 대조 후보**로 따로 표시한다.

> 현재 영향 분기 수는 해당 자료나 근거를 확인하지 못해 당시 추적이 멈춘 분기 수입니다. 자료를 확보하더라도 모든 분기가 연장되거나 완료된다는 뜻은 아닙니다.

## 공개 안전·정합성 게이트 — Codex 답변 필요

1. `case_ref`/`run_ref`/`branch_ref`/`step_ref`가 **공개용 불투명 참조**인지, 서로 다른 release/run에서도 어느 범위까지 안정적인지 확정. `entry_indexes.targets[]`의 `(case_ref, run_ref)`가 실제 승인 run을 가리키도록 검사하고, 프론트는 run을 고르지 않음. 이전 run을 비교/정정에서 가리킬 때에는 동일 공개 payload 또는 승인된 **공개용 run 색인**에서 참조가 해소돼야 한다. 내부 ID, 원장 경로, 원문 인명, 점수, PERSON→ORG 연결을 공개 투영에서 제외.
2. PERSON 관측은 기존 `public_alias`, `posted_at`, `title`, `source_location`, `observation_count` 다섯 필드에만 남긴다. **trace payload와 C축에 PERSON 별칭/원문/조직·업무 결합을 절대 넣지 않는다.** A축에 들어갈 표기의 안전 기준과 notice 중심 진입점은 Codex가 결정.
3. evidence 번호의 범위, `cited_text`뿐 아니라 `display_text`·`reason_text`·`observed_phrase`·`current_assignment_phrase`·`reason_public`의 공개/인명/문맥 검열·길이/인용 범위를 확정. `official_url`은 승인된 공식 URL만 허용하고 개별 문서/공식 목록을 구별. 없는 필드의 처리와 시점(게시/시행/관측/실행)의 nullable/ISO 날짜·시간대 형식을 확정. 이 JSON의 `<...>` 문자열은 타입 유효성의 근거가 아님.
4. `official_links`의 직접 근거 유형·인접 단계 규칙·시점 역전 금지, 후보/별도 관측의 `branch_ref` 참조 무결성·다중 분기 귀속, 복수 대응 최소 2행/허용 grade 조합을 **DB/read model에서** 검증. 프론트는 연결선·종결값·숫자를 계산하지 않음.
5. append-only 정정과 동일 `trace_contract_version` run 비교의 유일성/배타성, 분기 split/merge 식별, 자료 추가 전 영향/실제 연장 수치의 `population_scope_ref`·분모·중복·공개 가능 여부를 검증. `research_inputs`도 다른 계약 버전이나 다른 모집단의 run을 자료 확충 효과로 잇지 않음. `source_release_ref`로 case의 독립성과 run의 입력 시점을 혼동하지 않음.
6. exporter가 최소 공개 snapshot으로 투영하고 **PERSON 혼합 키 0개, PERSON→ORG 공개 관계 0건**, 내부 식별자·점수·로컬 경로·비공개 원문 0건을 검사. 익명 core 직접 조회나 혼합 RPC를 새로 열지 않음.

## 구현·PR 경계

이 draft PR은 **제안 문서만** 포함한다. 실제 승인 전에는 `apps/public-site/app/residual-data/page.tsx`, `packages/common/src/regulations`, DB migration/RPC, snapshot exporter/snapshot v2, Netlify 설정을 변경하지 않는다. Codex가 실제 계약과 표본을 별도 커밋으로 main에 올린 뒤 Manus는 최신 main에서 UI 컴포넌트·CSS·회귀만 적용한다. UI는 상단 낮은 인사이트 → A/B/C 동일 원장 보기 → 확인된 인접 단계의 실선/문구 후보의 다른 표현/단절 → `[E-001]` 근거 상세 → run 비교·정정·조사자료 순이다. 768px 웹 레이아웃, 키보드/초점/ARIA, 기존 PERSON 화면의 5필드 경계를 검증하고 **새 head Netlify 미리보기·사용자 명시 병합 승인 전에는 main에 UI를 반영하지 않는다.**

**검토 요청:** Codex는 위 필드명과 enum을 그대로 수용할 필요가 없다. 실제 승인 가능한 공개 필드, 누락/비공개 상태, 대표 표본의 참조 무결성과 PERSON 보호 규칙, run 간 변화·정정 사례를 회신해 달라. Manus는 그 응답에 맞춰 이 제안을 고치고, 실제 trace UI의 디자인·구현 범위를 별도 PR로 검수받는다.
