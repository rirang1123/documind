문서 분류 기능의 성능 테스트 → 분석 → 고도화를 자동으로 수행하는 5단계 사이클입니다.

## Phase 1: 테스트 문서 생성

먼저 `test_docs` 폴더에 기존 파일이 있는지 확인하세요. 파일이 있다면 **모두 삭제**한 후 진행하세요.
그 다음 `/randomdocs` 커맨드를 실행하여 test_docs 폴더에 30개의 테스트 docx 파일을 생성하세요.
생성 완료 후 다음 Phase로 진행하세요.

## Phase 2: 성능 테스트 실행

Phase 1에서 생성된 파일들로 분류 성능 테스트를 실행하세요.

### 2-1. 기대 분류 설정
생성된 30개 파일 각각의 **정답 카테고리**를 먼저 결정하세요.
- 각 파일의 내용을 직접 읽고, 문서의 **형식(format)** 기준으로 정답 판정
- 카테고리: planning(기획), evaluation(평가), report(보고), reference(참고자료), meeting(회의), contract(계약), finance(재무), other(기타)
- 기대 분류를 JSON으로 저장: `scripts/test-expected.json`

### 2-2. 규칙 엔진 테스트
- `src/services/document/classifyService.ts`의 `detectCategory` 함수를 사용
- mammoth로 각 docx 텍스트 추출 → detectCategory(title, content) 실행
- Tier 분류 기준: >= 0.85 Tier1, 0.35~0.85 Tier2, < 0.35 Tier3
- 결과를 테이블로 출력 (파일명, 기대, 결과, 신뢰도, Tier, 판정)

### 2-3. AI 분류 테스트
- Tier 2/3에 해당하는 파일들을 **Haiku 모델 Agent 병렬 호출**로 AI 분류
- 프롬프트에 분류 기준을 명확히 포함 (구조/형식 기반 분류)
- Agent는 5개씩 배치로 묶어 최대 6개 병렬 실행

### 2-4. 결합 결과 산출
- Tier 1: 규칙 결과 사용
- Tier 2/3: AI 결과 사용 (규칙과 AI 모두 비교)
- 최종 정확도 산출: 규칙 단독 / AI 단독 / 3단계 결합

## Phase 3: 결과 분석 및 수정사항 도출

테스트 결과를 기반으로 심층 분석을 수행하세요.

### 3-1. 오분류 분석
각 오분류 문서에 대해:
- 실제 내용을 읽고 오분류 원인 파악
- 규칙 엔진의 점수 분포 분석 (어떤 패턴이 잘못 매칭됐는지)
- AI의 판단 근거 분석

### 3-2. 카테고리별 정확도 분석
- 각 카테고리의 정확도, 재현율(recall), 정밀도(precision) 산출
- 취약 카테고리 식별

### 3-3. 패턴 분석
- 규칙 엔진이 강한 영역 vs AI가 강한 영역
- 공통 오분류 패턴 (둘 다 틀리는 경계 사례)
- Tier 임계값(0.85, 0.35)의 적정성 검토

### 3-4. 수정사항 목록
분석 결과를 바탕으로 구체적인 수정사항 목록을 작성:
- 규칙 엔진: 추가/수정할 패턴, 가중치 조정
- AI 프롬프트: 개선할 분류 기준, 예시
- Tier 임계값: 조정 필요 여부
- 결과를 `scripts/test-analysis.md`에 저장

## Phase 4: CTO 기반 고도화 계획 수립

Phase 3의 분석 결과를 기반으로 **Agent 병렬 호출(CTO 패턴)**로 고도화 계획을 수립하세요.

### Agent 구성 (3~4개 병렬)
각 Agent에게 Phase 3의 분석 결과(`scripts/test-analysis.md`)를 제공하고 담당 영역의 개선안을 작성하게 하세요:

- **Agent A (규칙 엔진)**: 구조 패턴, 복합 패턴, 키워드 패턴의 추가/수정/가중치 조정안
- **Agent B (AI 프롬프트)**: classifyDocument, validateClassification 프롬프트 개선안
- **Agent C (Tier 설계)**: 임계값 조정, disambiguation 로직 개선안
- **Agent D (학습 시스템)**: learnedRules 적용 로직, 피드백 처리 개선안 (해당 시)

### 계획 통합
각 Agent의 결과를 통합하여 `scripts/improvement-plan.md`에 저장.
우선순위와 예상 효과를 함께 기술.

## Phase 5: CTO 기반 고도화 실행 및 재테스트

### 5-1. 고도화 구현 (Agent 병렬)
Phase 4의 계획을 기반으로 **Agent 병렬 호출**로 구현:
- 각 Agent가 담당 파일을 수정 (classifyService.ts, aiService.ts 등)
- Agent 간 충돌 방지: 각 Agent는 자신의 담당 영역만 수정
  - Agent A: STRUCTURE_PATTERNS, COMBO_PATTERNS, KEYWORD_PATTERNS
  - Agent B: aiService.ts의 프롬프트
  - Agent C: disambiguate 함수, Tier 임계값
  - (Agent D는 필요 시에만)

### 5-2. 빌드 검증
`npx tsc --noEmit --project tsconfig.app.json`으로 타입 체크 통과 확인.
실패 시 수정.

### 5-3. 재테스트
Phase 2와 동일한 방법으로 재테스트 실행.
**동일한 test_docs 파일, 동일한 기대 분류**를 사용하여 비교.

### 5-4. 결과 비교
고도화 전후 비교표 출력:
- 전체 정확도 변화
- 카테고리별 정확도 변화
- 오분류 건수 변화
- 개선된 파일 / 새로 오분류된 파일 목록

## 핵심 규칙

- 각 Phase는 순서대로 실행 (이전 Phase 결과에 의존)
- Agent 병렬 호출 시 **반드시 하나의 메시지에서 동시 호출** (순차 금지)
- AI 테스트는 **Haiku 모델** 사용 (`model: "haiku"`)
- Phase 완료 시마다 진행 상황을 사용자에게 보고
- 최종 목표: **3단계 결합 정확도 90% 이상**
- **권한 위임**: 이 사이클 실행 중 필요한 모든 파일 읽기/쓰기/삭제, 스크립트 실행, Agent 호출 등의 허용 권한은 CTO(메인 Agent)에게 위임한다. `/randomdocs` 실행 시 test_docs 폴더의 문서 생성 및 삭제 권한도 포함한다. 사용자에게 개별 허가를 구하지 않고 자율적으로 진행한다.
