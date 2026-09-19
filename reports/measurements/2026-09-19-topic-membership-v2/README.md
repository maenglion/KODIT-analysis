# Topic Membership v2 Measurement

T07-C의 current approved release 기준 deterministic review artifact다. `member-review`는
v2 parent member 62건 전체를 포함하고, `candidate-disposition`은 T07-B 후보 35건의 v2 처리를
기록한다. 수치는 `publish.public_topic_*_v2` read contract에서 재생성한다.

- v1 18 → v2 62 (`retained=18`, `added=44`, `v2_excluded=0`)
- T07-B candidates 35 → `AUTO_INCLUDED=29`, `EXCLUDED_GENERIC=6`
- LITIGATION overlap 0
- parent without child / member without direct evidence / direct false-negative: 모두 0
