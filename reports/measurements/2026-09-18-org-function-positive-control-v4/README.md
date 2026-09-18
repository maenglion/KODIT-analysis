# T06.8 organization-function positive control

## Scope

Current approved release의 exact-department notice 817건을 known-answer control로 사용했다.
정답 `notice_department`는 feature query와 scorer에서 제외했고, 정답 조직명과 모든 관측
PERSON/ORG/EMAIL 문자열도 입력 text에서 제거했다. residual 1,272건은 조회하지 않았다.

입력 채널은 notice title/body, resolved regulation identity, direct
`PROPOSES_CHANGE_TO`, WORK context뿐이다.

## Strict subset

- known-answer population: 817
- strict evaluable subset: 728
- excluded: 89
  - 정답 조직에 current atomic function assignment가 없음: 85
  - 제목 외 입력 신호가 없음: 4

strict subset은 정답을 맞힌 행만 사후 선택한 집합이 아니다. unique answer node, 정답 node의
기능 profile 존재, non-title signal 존재라는 사전 계약만 적용한다.

## Phrase-grain audit

- canonical assignments: 202
- 200자 초과 조직 블록: 21
- duplicate phrase groups: 5
- 별표3 `부서명+1.` heading으로 재경계한 조직 block: 22
- 연속 번호 직무 관측: 134
- temporal assignment: 3
- scorer phrase profiles: 137

원 202행은 수정하지 않았다. T06.8은 조직명 첫 출현이 아니라 실제 표 heading을 사용하여
다른 조직의 본문 속 부서명 언급을 block boundary로 오인하지 않는다.

## Result

- leakage: 0
- coverage: 670 / 728 (92.03%)
- top-1: 468 / 728 (64.29%)
- top-3: 607 / 728 (83.38%)
- ambiguous: 162
- no candidate: 58

조직별 confusion matrix와 817개 행의 top-3 결과는 `result.json`에 있다.

## Decision

이 결과는 candidate discovery의 가능성은 보여주지만 automatic organization attribution을
검증하지 못했다. 따라서 v4를 residual 1,272건에 적용하지 않았고, T06.7 run/candidate/
evidence도 변경하지 않았다. 임계값은 residual 결과를 보고 조정하지 않았다.

T06.8의 다음 반복은 별도 버전으로 해야 한다. 현재 report/config/evaluator hash를 덮어쓰지
않으며, T07 UI를 시작하지 않는다.
