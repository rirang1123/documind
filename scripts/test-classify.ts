/**
 * test_docs 폴더의 docx 파일들을 분류하여 결과를 출력하는 테스트 스크립트
 * 실행: npx tsx scripts/test-classify.ts
 */
import fs from 'fs'
import path from 'path'
import mammoth from 'mammoth'

// ── detectCategory를 직접 import할 수 없으므로 (브라우저 모듈) 핵심 로직만 추출 ──
// src/services/document/classifyService.ts의 detectCategory와 동일한 로직

type FolderCategory = 'planning' | 'evaluation' | 'report' | 'reference' | 'meeting' | 'contract' | 'finance' | 'other'

const FOLDER_CATEGORY_LABELS: Record<FolderCategory, string> = {
  planning: '기획',
  evaluation: '평가',
  report: '보고',
  reference: '참고자료',
  meeting: '회의',
  contract: '계약',
  finance: '재무',
  other: '기타',
}

// ═══ 1단계: 구조 패턴 ═══
const STRUCTURE_PATTERNS: { category: FolderCategory; patterns: RegExp; weight: number }[] = [
  {
    category: 'meeting',
    patterns: new RegExp([
      '참석자\\s*[:\\-]', '참석인\\s*[:\\-]', '출석자\\s*[:\\-]', '배석\\s*[:\\-]',
      '불참\\s*[:\\-]', '참석\\s*부서', '외부\\s*참석',
      '회의\\s*일[시자]\\s*[:\\-]', '회의\\s*장소\\s*[:\\-]', '회의\\s*주제\\s*[:\\-]',
      '회의\\s*목적', '회의\\s*유형', '화상\\s*회의', '대면\\s*회의',
      '일시\\s*[:\\-]\\s*\\d{4}', '장소\\s*[:\\-]', '진행\\s*방식\\s*[:\\-]',
      '안건\\s*[:\\d\\.]', '논의\\s*사항\\s*[:\\d]', '보고\\s*사항\\s*[:\\d]',
      '협의\\s*사항', '상정\\s*안건', '주요\\s*논의',
      '논의\\s*후\\s*결정', '논의\\s*내용', '안건\\s*및',
      '결정\\s*사항', '조치\\s*사항', '후속\\s*조치', '담당자\\s*[:\\-]',
      '이행\\s*기한', '완료\\s*기한', '다음\\s*회의\\s*[:\\-]',
      '회의\\s*결과', 'follow\\s*up',
      '킥오프\\s*(미팅|회의)?', 'kick\\s*off', '워크숍\\s*결과', '워크숍\\s*내용',
      '피드백\\s*정리', '피드백\\s*내용', '피드백\\s*사항',
      '리뷰\\s*결과', '리뷰\\s*기록', '리뷰\\s*내용',
      '출시\\s*준비\\s*검토', '준비\\s*상황\\s*점검',
      'attendees?\\s*[:\\-]', 'agenda\\s*[:\\d\\.]', 'action\\s*items?',
      'minutes?\\s*of\\s*(the)?\\s*meeting', 'meeting\\s*notes?',
      'decision\\s*log', 'next\\s*meeting',
      'zoom\\s*(링크|link|url)', '화상.*zoom', 'zoom.*회의',
    ].join('|'), 'gi'),
    weight: 6,
  },
  {
    category: 'contract',
    patterns: new RegExp([
      '제\\s*\\d+\\s*조', '제\\s*\\d+\\s*항', '제\\s*\\d+\\s*호',
      '갑\\s*[과와]\\s*을', '이하\\s*["\']?갑["\']?', '이하\\s*["\']?을["\']?',
      '갑\\s*[은는이가]', '을\\s*[은는이가]', '병\\s*[은는이가]',
      '위탁자', '수탁자', '발주자', '수급자', '임대인', '임차인',
      '계약\\s*기간\\s*[:\\-]', '계약\\s*금액\\s*[:\\-]', '계약\\s*조건',
      '계약\\s*목적', '계약\\s*범위', '계약\\s*체결일',
      '효력\\s*발생', '계약\\s*해지', '계약\\s*해제', '계약\\s*갱신',
      '위약금', '손해\\s*배상', '분쟁\\s*해결', '관할\\s*법원',
      '준거법', '비밀\\s*유지\\s*의무', '지식\\s*재산', '면책',
      '불가항력', '양도\\s*금지', '통지\\s*의무',
      '서명\\s*날인', '기명\\s*날인', '인감',
      'article\\s*\\d', 'clause\\s*\\d', 'section\\s*\\d',
      'party\\s*[ab]', 'hereinafter', 'whereas',
      'effective\\s*date', 'termination', 'indemnif',
      'governing\\s*law', 'jurisdiction', 'force\\s*majeure',
      'confidential', 'intellectual\\s*property',
    ].join('|'), 'gi'),
    weight: 6,
  },
  {
    category: 'report',
    patterns: new RegExp([
      '[1IⅠ일]\\s*\\.?\\s*(개요|배경|현황|서론|목적)',
      '[2IIⅡ이]\\s*\\.?\\s*(현황|본론|분석|조사)',
      '[3IIIⅢ삼]\\s*\\.?\\s*(결론|결과|요약|종합)',
      '결론\\s*및\\s*(제언|건의|시사점)', '요약\\s*및\\s*결론',
      '분석\\s*결과', '조사\\s*결과', '검토\\s*결과', '점검\\s*결과',
      '실적\\s*현황', '추진\\s*현황', '이행\\s*현황', '집행\\s*현황',
      '운영\\s*현황', '진행\\s*현황', '활동\\s*현황', '참여\\s*현황',
      '전년\\s*(대비|동기|동월)', '전월\\s*대비', '증감\\s*[율률]',
      '첨부\\s*[:\\-]', '별첨\\s*[:\\-]',
      '(프로젝트|사업|과제)\\s*(현황|진행|상황)',
      '진척\\s*[율률]', '완료\\s*[율률]', '달성\\s*[율률]',
      '보고\\s*대상\\s*[:\\-]', '보고\\s*일\\s*[:\\-]',
      '종합\\s*현황', '종합\\s*분석', '종합\\s*평가',
      '\\d{4}년\\s*\\d{1,2}월\\s*(실적|현황|보고|결과)',
      '(제|\\d)\\s*\\d\\s*(분기|반기)\\s*(실적|현황|보고)',
      '(성과|실적)\\s*(요약|종합|분석|현황)',
      '주요\\s*성과', '핵심\\s*성과',
      'executive\\s*summary', 'key\\s*findings', 'recommendations?',
      'conclusion', 'appendix', 'year[\\-\\s]over[\\-\\s]year',
      'quarter[\\-\\s]over[\\-\\s]quarter', 'highlights?',
    ].join('|'), 'gi'),
    weight: 5,
  },
  {
    category: 'planning',
    patterns: new RegExp([
      '(사업|추진|기획)\\s*목적', '(사업|추진|기획)\\s*배경',
      '추진\\s*(전략|방향|방안|체계)', '실행\\s*(계획|방안|전략)',
      '세부\\s*(추진|실행)\\s*(계획|과제)', '단계별\\s*(추진|실행)',
      '기대\\s*효과', '예상\\s*성과', '성과\\s*목표', '핵심\\s*성과\\s*지표',
      '추진\\s*일정', '세부\\s*일정', '마일스톤',
      '\\d{1,2}월\\s*[~\\-]\\s*\\d{1,2}월',
      '(1|2|3)\\s*(단계|Phase|phase)',
      '소요\\s*예산', '투입\\s*인력', '필요\\s*자원', '예산\\s*계획',
      '리스크\\s*(관리|요인|분석)', '위험\\s*요인', '대응\\s*방안',
      'SWOT', '강점|약점|기회|위협',
      '내부\\s*환경', '외부\\s*환경', '경쟁\\s*분석', '시장\\s*분석',
      '제안\\s*개요', '제안\\s*내용', '제안\\s*배경',
      'objectives?\\s*[:\\-]', 'scope\\s*[:\\-]', 'deliverables?',
      'timeline\\s*[:\\-]', 'milestones?', 'risk\\s*assessment',
      'resource\\s*plan', 'budget\\s*plan', 'action\\s*plan',
      'roadmap', 'gantt', 'work\\s*breakdown',
    ].join('|'), 'gi'),
    weight: 5,
  },
  {
    category: 'evaluation',
    patterns: new RegExp([
      '평가\\s*항목\\s*[:\\d]', '평가\\s*기준\\s*[:\\d]', '평가\\s*지표',
      '평가\\s*결과\\s*[:\\-]', '평가\\s*대상', '평가\\s*기간',
      '평가\\s*방법', '평가\\s*위원', '심사\\s*위원', '평가\\s*등급',
      '총점\\s*[:\\d]', '배점\\s*[:\\d]', '가중치\\s*[:\\d]',
      '(우수|양호|보통|미흡|부진)\\s*[:\\d]',
      '([SABCD]\\s*등급|[SABCD]\\s*[:\\-]\\s*\\d)',
      '합격|불합격|적합|부적합|pass|fail',
      '개선\\s*(필요|사항|권고|요청)', '시정\\s*조치', '보완\\s*사항',
      '강점\\s*[:\\-]', '약점\\s*[:\\-]', '개선점\\s*[:\\-]',
      '종합\\s*의견', '심사\\s*소견', '검토\\s*의견',
      '감사\\s*결과', '지적\\s*사항', '조치\\s*계획',
      '내부\\s*감사', '외부\\s*감사', '자체\\s*점검',
      'evaluation\\s*criteria', 'assessment\\s*result',
      'score\\s*[:\\d]', 'rating\\s*[:\\d]', 'grading',
      'compliance', 'non[\\-\\s]?conformance',
      'corrective\\s*action', 'audit\\s*finding',
    ].join('|'), 'gi'),
    weight: 5,
  },
  {
    category: 'finance',
    patterns: new RegExp([
      '합\\s*계\\s*[:\\d₩\\\\]', '소\\s*계\\s*[:\\d₩\\\\]',
      '총\\s*액\\s*[:\\d]', '잔\\s*액\\s*[:\\d]',
      '부가\\s*(가치)?\\s*세', '공급\\s*가액', '세액\\s*[:\\d]',
      '과세\\s*표준', '면세', '영세율',
      '차변\\s*[:\\d]', '대변\\s*[:\\d]', '이월\\s*[:\\d]',
      '전기\\s*이월', '차기\\s*이월', '이월\\s*잔액',
      '당기\\s*순이익', '영업\\s*이익', '매출\\s*총이익',
      '재무\\s*상태표', '손익\\s*계산서', '현금\\s*흐름표',
      '자본\\s*변동표', '대차\\s*대조표', 'balance\\s*sheet',
      '기본급', '수당', '공제', '실수령', '4대\\s*보험',
      '원천\\s*징수', '연말\\s*정산',
      '예산\\s*편성', '예산\\s*집행', '예산\\s*잔액', '이용\\s*[율률]',
      '집행\\s*[율률]', '배정\\s*[액금]',
      // 투자/수익 분석 (재무 전용 문맥)
      '투자\\s*수익\\s*(률|율|분석)', '수익\\s*[율률]\\s*(산출|분석|비교)',
      '투자\\s*대비\\s*수익', '집행\\s*잔액',
      '배당\\s*(금|률)', '투자\\s*회수', '순\\s*현재\\s*가치',
      'subtotal', 'amount\\s*[:\\d]',
      'balance\\s*[:\\d]', 'debit', 'credit',
      'revenue', 'expense', 'profit', 'loss',
      'accounts?\\s*(payable|receivable)',
      'invoice\\s*(no|number|#)', 'P\\.?O\\.?\\s*#?\\d',
    ].join('|'), 'gi'),
    weight: 4,
  },
  {
    category: 'reference',
    patterns: new RegExp([
      '(사용|이용|운영|설치|설정|작성)\\s*(방법|절차|가이드|안내|표준|원칙)',
      '양식별\\s*(안내|설명)', '(작성|활용)\\s*(팁|노하우)',
      'step\\s*\\d', '단계\\s*\\d', '절차\\s*\\d',
      '주의\\s*사항\\s*[:\\-]', '유의\\s*사항\\s*[:\\-]',
      '참고\\s*사항\\s*[:\\-]', '비고\\s*[:\\-]',
      'FAQ', '자주\\s*묻는\\s*질문', 'Q\\s*[&:]\\s*A',
      '시스템\\s*요구\\s*사항', '호환성', '버전\\s*정보',
      '업데이트\\s*내역', '변경\\s*이력', 'changelog',
      'release\\s*notes?', 'API\\s*(문서|reference|doc)',
      '파라미터\\s*[:\\-]', '반환\\s*값\\s*[:\\-]',
      '문서\\s*번호\\s*[:\\-]', '문서\\s*분류\\s*[:\\-]',
      '적용\\s*범위\\s*[:\\-]', '적용\\s*대상\\s*[:\\-]',
      '(설계|개발|코딩|네이밍)\\s*(표준|규칙|규약|컨벤션)',
      '(거버넌스|프레임워크|아키텍처)\\s*(구조|체계|개요)',
      '(정책|원칙|기준)\\s*(정의|수립|체계)',
      '(역할|책임)\\s*(정의|분담|체계)',
      '학습\\s*목표', '교육\\s*목표', '교육\\s*내용',
      '교육\\s*대상', '커리큘럼', '교안', '학습\\s*자료',
      '온보딩', '체크리스트', '필수\\s*교육',
      '입사\\s*(안내|가이드|절차)', '신규\\s*(입사|직원)\\s*(안내|가이드)',
      '(업무|운영|관리)\\s*규정', '(업무|운영|관리)\\s*지침',
      '표준\\s*운영\\s*절차', 'SOP',
      '시장\\s*(동향|분석|조사|현황)', '(산업|업계)\\s*(동향|분석|전망)',
      '(소비자|고객)\\s*(인사이트|조사|분석)',
      '(트렌드|trend)\\s*(분석|조사|리포트)',
      'how\\s*to\\s', 'tutorial', 'getting\\s*started',
      'prerequisites?', 'installation\\s*guide',
      'user\\s*(guide|manual)', 'reference\\s*(guide|manual)',
      'troubleshoot', 'known\\s*issues?',
    ].join('|'), 'gi'),
    weight: 5,
  },
]

// ═══ 2단계: 복합 구조 패턴 ═══
interface ComboRule {
  category: FolderCategory
  requires: RegExp[]
  minMatch: number
  weight: number
}

const COMBO_PATTERNS: ComboRule[] = [
  {
    category: 'meeting',
    requires: [/참석자|출석자|attendee/i, /안건|논의\s*사항|agenda/i, /결정\s*사항|조치\s*사항|action\s*item/i],
    minMatch: 2, weight: 8,
  },
  {
    category: 'meeting',
    requires: [/일시\s*[:\-]\s*\d|회의\s*일[시자]\s*[:\-]/i, /참석\s*[:\-]|참석자\s*[:\-]|attendee/i, /장소\s*[:\-]|회의\s*장소|zoom|화상|대면|온라인/i],
    minMatch: 2, weight: 10,
  },
  {
    category: 'contract',
    requires: [/제\s*\d+\s*조|article\s*\d/i, /갑.*을|party\s*[ab]|위탁자.*수탁자/i, /계약\s*(기간|금액|조건)|effective\s*date/i],
    minMatch: 2, weight: 8,
  },
  {
    category: 'evaluation',
    requires: [/평가\s*(항목|기준|지표)|evaluation\s*criteria/i, /점수|등급|배점|총점|score|rating|grade/i, /개선\s*(사항|필요|권고)|종합\s*의견|corrective/i],
    minMatch: 2, weight: 8,
  },
  {
    category: 'finance',
    requires: [/합\s*계|소\s*계|total|subtotal/i, /부가세|세액|차변|대변|공제|원천\s*징수|정산\s*내역|세금\s*계산/i, /재무\s*상태표|손익\s*계산서|예산\s*편성|예산\s*집행|급여\s*명세|revenue|expense/i],
    minMatch: 2, weight: 8,
  },
  {
    category: 'finance',
    requires: [/투자\s*(현황|금액)|investment\s*(amount|status)/i, /수익\s*[율률]\s*(산출|분석|비교)|투자\s*대비\s*수익|회수\s*기간/i, /집행\s*잔액|배정\s*[액금]|예산\s*(편성|집행|배정)/i],
    minMatch: 2, weight: 8,
  },
  {
    category: 'report',
    requires: [/개요|배경|서론|현황|executive\s*summary/i, /분석\s*결과|조사\s*결과|검토\s*결과|key\s*findings|종합\s*분석|종합\s*평가/i, /결론|제언|건의|시사점|종합|recommendations?|향후\s*(과제|계획|방향)/i],
    minMatch: 2, weight: 8,
  },
  {
    category: 'report',
    requires: [/현황|진행\s*상황|진척|추진\s*현황|운영\s*현황/i, /완료\s*[율률]|달성\s*[율률]|진척\s*[율률]|이행\s*[율률]|전년\s*대비|전월\s*대비/i, /주요\s*성과|핵심\s*성과|향후\s*(과제|계획)|개선\s*사항|첨부|별첨/i],
    minMatch: 2, weight: 8,
  },
  {
    category: 'planning',
    requires: [/(사업|추진|기획)\s*(목적|배경)|objectives?/i, /추진\s*(전략|방향|방안)|실행\s*계획|action\s*plan/i, /기대\s*효과|추진\s*일정|마일스톤|timeline|milestone/i],
    minMatch: 2, weight: 8,
  },
  {
    category: 'reference',
    requires: [/가이드|안내|절차|매뉴얼|표준|지침|guide|manual|standard/i, /적용\s*(범위|대상)|문서\s*번호|step\s*\d|단계\s*\d/i, /주의\s*사항|유의\s*사항|참고|비고|FAQ|how\s*to|troubleshoot/i],
    minMatch: 2, weight: 8,
  },
]

// ═══ 3단계: 키워드 패턴 ═══
const KEYWORD_PATTERNS: { category: FolderCategory; patterns: RegExp }[] = [
  { category: 'report', patterns: /보고서?|리포트|report|결과보고|분석보고|실적|성과보고|현황|통계|summary|annual|quarterly|월간|주간|일일|데일리|weekly|monthly|연간|분기|결산|동향|추이|지표|KPI|대시보드|dashboard|진행.?상황|업무.?보고|현장.?보고|출장.?보고|점검.?보고/g },
  { category: 'meeting', patterns: /회의록?|미팅|meeting|agenda|회의.?록|minute|안건|참석자|논의|회의.?자료|회의.?안|워크숍|workshop|세미나|seminar|브리핑|briefing|발표.?자료|프레젠|presentation|토론|토의|협의|간담회|조회|업무.?공유|팀.?공유|내용.?정리|공유.?사항|이번.?주|다음.?주.?계획|금주|차주|예정.?사항|킥오프|kick.?off|피드백.?정리|리뷰.?기록|스프린트.?리뷰|sprint.?review/g },
  { category: 'planning', patterns: /기획서?|계획서?|전략|plan|planning|목표|로드맵|roadmap|일정|schedule|마일스톤|프로젝트.?계획|사업.?계획|운영.?계획|제안서?|proposal|전략.?수립|방안|방침|추진.?계획|액션.?플랜|action.?plan|시행.?계획|연구.?계획|개발.?계획|마케팅.?계획/g },
  { category: 'evaluation', patterns: /평가|심사|리뷰|review|evaluat|검토|피드백|feedback|성과.?평가|인사.?평가|업무.?평가|자체.?평가|품질.?검사|inspection|audit|감사|진단|assessment|테스트.?결과|시험.?결과|검증|validation|승인|approval/g },
  { category: 'reference', patterns: /참고|자료|reference|참조|가이드|guide|매뉴얼|manual|문헌|tutorial|사용법|안내서?|핸드북|handbook|사양서?|spec|규격|표준|standard|절차서?|procedure|지침|교육.?자료|학습.?자료|연구.?자료|기술.?문서|API.?문서/g },
  { category: 'contract', patterns: /계약서?|contract|협약|MOU|약정|조항|서명|체결|갱신|agreement|약관|terms|동의서?|위임장|각서|합의서?|발주서?|purchase.?order|납품|입찰|견적서?|quotation|비밀유지|NDA|라이선스|license/g },
  { category: 'finance', patterns: /재무|예산|budget|finance|회계|매출|비용|손익|수입|지출|세금|invoice|청구서?|영수증|receipt|결제|payment|정산|급여|payroll|세무|tax|감가상각|자산|부채|자본|cash.?flow|현금.?흐름|원가|cost|단가|거래.?명세|전표/g },
]

// ═══ 4단계: 제목 접미사 ═══
const TITLE_SUFFIX_PATTERNS: { category: FolderCategory; pattern: RegExp }[] = [
  { category: 'meeting', pattern: /회의록|미팅노트|meeting\s*minutes|회의\s*결과|회의\s*안건|안건\s*및\s*논의|킥오프|kick\s*off|워크숍\s*결과|피드백\s*정리|리뷰\s*기록|논의\s*정리|검토\s*회의/i },
  { category: 'contract', pattern: /계약서|협약서|합의서|약정서|동의서|위임장|contract|agreement|MOU/i },
  { category: 'report', pattern: /보고서|리포트|결과서|현황서|report|종합\s*분석|실적\s*분석|현황\s*보고|성과\s*보고|운영\s*현황|프로젝트\s*현황|이전\s*현황|전환\s*현황/i },
  { category: 'planning', pattern: /기획서|계획서|제안서|전략서|proposal|plan(?!t)|로드맵|roadmap|3개년|5개년|\d+개년/i },
  { category: 'evaluation', pattern: /평가서|심사서|감사서|검토서|진단서|assessment|evaluation|review\s*report/i },
  { category: 'finance', pattern: /청구서|견적서|영수증|세금계산서|급여명세|거래명세|invoice|receipt|quotation/i },
  { category: 'reference', pattern: /매뉴얼|가이드라인|가이드|안내서|핸드북|지침서|절차서|표준서|프레임워크|manual|guide|handbook|tutorial|guideline|framework|standard|시장\s*동향|인사이트|온보딩/i },
]

// ═══ 충돌 해소 신호 ═══
const REPORT_FORMAT_SIGNAL = new RegExp([
  '(개요|배경|서론|목적)\\s*$',
  '(결론|결어|요약|맺음말|종합\\s*의견)',
  '(시사점|제언|건의\\s*사항|향후\\s*과제)',
  '(분석|검토|조사|파악|확인)\\s*(한|했|하였|된|됨|결과)',
  '(나타났|드러났|확인됨|파악됨|조사됨)',
  '보고\\s*드림', '보고\\s*합니다', '아래와\\s*같이',
  '별첨|첨부\\s*[:\\-]',
  'executive\\s*summary', 'key\\s*findings', 'in\\s*conclusion',
  'as\\s*follows', 'recommendations?',
].join('|'), 'gim')

const EVAL_FORM_SIGNAL = new RegExp([
  '(점수|배점|가중치)\\s*[:\\d/]',
  '\\d+\\s*/\\s*\\d+\\s*(점|점수)?',
  '[SABCD][+\\-]?\\s*등급',
  '평가자\\s*[:\\-]', '피평가자\\s*[:\\-]', '평가\\s*일자\\s*[:\\-]',
  '서명\\s*[:\\-]\\s*$', '확인\\s*[:\\-]\\s*$',
  '(적합|부적합|해당없음|N\\/A)',
  '(우수|양호|보통|미흡|부진)\\s*[☑☐✓✗○●□■]',
  '[☑☐✓✗○●□■]\\s*(우수|양호|보통|미흡|부진)',
  'evaluator\\s*[:\\-]', 'evaluatee\\s*[:\\-]',
  'score\\s*[:\\d/]', '\\d+\\s*/\\s*\\d+\\s*points?',
  '(pass|fail|N\\/A|satisfactory|unsatisfactory)',
].join('|'), 'gim')

const MEETING_FORM_SIGNAL = new RegExp([
  '참석자\\s*[:\\-]', '불참자?\\s*[:\\-]',
  '안건\\s*[\\d:\\.]', '논의\\s*내용',
  '결정\\s*사항\\s*[:\\-\\d]', '조치\\s*사항\\s*[:\\-\\d]',
  '회의\\s*일시\\s*[:\\-]', '회의\\s*장소\\s*[:\\-]',
  '다음\\s*회의\\s*[:\\-]',
  'attendees?\\s*[:\\-]', 'agenda\\s*[:\\d]',
  'action\\s*items?\\s*[:\\-\\d]', 'minutes?\\s*of',
].join('|'), 'gim')

const PLANNING_FORM_SIGNAL = new RegExp([
  '추진\\s*(전략|방향|방안|체계)',
  '실행\\s*(계획|방안)',
  '단계별\\s*(추진|실행)',
  '기대\\s*효과', '예상\\s*성과',
  '추진\\s*일정', '마일스톤',
  '소요\\s*예산', '투입\\s*인력',
  '(1|2|3)\\s*(단계|phase)',
  'action\\s*plan', 'roadmap', 'milestone',
  'deliverables?', 'work\\s*breakdown',
].join('|'), 'gim')

// ═══ disambiguate (원본 그대로) ═══
function disambiguate(contentText: string, scores: Map<FolderCategory, number>): void {
  const sorted = [...scores.entries()].filter(([, s]) => s > 0).sort((a, b) => b[1] - a[1])
  if (sorted.length < 2) return
  const [first, second] = sorted
  const [cat1, score1] = first
  const [cat2, score2] = second
  if (score1 > score2 * 2) return

  const reportSignal = (contentText.match(REPORT_FORMAT_SIGNAL) || []).length
  const evalSignal = (contentText.match(EVAL_FORM_SIGNAL) || []).length
  const meetingSignal = (contentText.match(MEETING_FORM_SIGNAL) || []).length
  const planningSignal = (contentText.match(PLANNING_FORM_SIGNAL) || []).length
  const pair = new Set([cat1, cat2])
  const BOOST = 10

  if (pair.has('evaluation') && pair.has('report')) {
    if (reportSignal > evalSignal) scores.set('report', (scores.get('report') || 0) + BOOST)
    else if (evalSignal > reportSignal) scores.set('evaluation', (scores.get('evaluation') || 0) + BOOST)
    return
  }
  if (pair.has('meeting') && pair.has('report')) {
    if (meetingSignal > reportSignal) scores.set('meeting', (scores.get('meeting') || 0) + BOOST)
    else if (reportSignal > meetingSignal) scores.set('report', (scores.get('report') || 0) + BOOST)
    return
  }
  if (pair.has('finance') && pair.has('report')) {
    const pureFinanceSignal = (contentText.match(/재무\s*상태표|손익\s*계산서|현금\s*흐름표|대차\s*대조표|기본급|수당|공제|실수령|원천\s*징수|예산\s*편성|예산\s*집행|정산\s*내역|세금\s*계산서|투자\s*수익|수익\s*[율률]|ROI|집행\s*잔액|배정\s*[액금]|invoice|receipt/gi) || []).length
    if (pureFinanceSignal >= 2) scores.set('finance', (scores.get('finance') || 0) + BOOST)
    else scores.set('report', (scores.get('report') || 0) + BOOST)
    return
  }
  if (pair.has('planning') && pair.has('report')) {
    if (planningSignal > reportSignal) scores.set('planning', (scores.get('planning') || 0) + BOOST)
    else if (reportSignal > planningSignal) scores.set('report', (scores.get('report') || 0) + BOOST)
    return
  }
  if (pair.has('planning') && pair.has('evaluation')) {
    if (evalSignal > planningSignal) scores.set('evaluation', (scores.get('evaluation') || 0) + BOOST)
    else if (planningSignal > evalSignal) scores.set('planning', (scores.get('planning') || 0) + BOOST)
    return
  }
  if (pair.has('contract') && pair.has('report')) {
    const hasArticles = /제\s*\d+\s*조|article\s*\d/i.test(contentText)
    if (hasArticles) scores.set('contract', (scores.get('contract') || 0) + BOOST)
    else scores.set('report', (scores.get('report') || 0) + BOOST)
    return
  }
  if (pair.has('evaluation') && pair.has('meeting')) {
    if (meetingSignal > evalSignal) scores.set('meeting', (scores.get('meeting') || 0) + BOOST)
    else if (evalSignal > meetingSignal) scores.set('evaluation', (scores.get('evaluation') || 0) + BOOST)
    return
  }
  if (pair.has('finance') && pair.has('evaluation')) {
    if (evalSignal > 2) scores.set('evaluation', (scores.get('evaluation') || 0) + BOOST)
    return
  }
  if (pair.has('finance') && pair.has('meeting')) {
    if (meetingSignal > 2) scores.set('meeting', (scores.get('meeting') || 0) + BOOST)
    else {
      const pf = (contentText.match(/재무\s*상태표|손익\s*계산서|정산|급여|예산\s*편성|세금|invoice/gi) || []).length
      if (pf > meetingSignal) scores.set('finance', (scores.get('finance') || 0) + BOOST)
      else scores.set('meeting', (scores.get('meeting') || 0) + BOOST)
    }
    return
  }
  if (pair.has('finance') && pair.has('planning')) {
    if (planningSignal > 2) scores.set('planning', (scores.get('planning') || 0) + BOOST)
    return
  }
  if (pair.has('finance') && pair.has('reference')) {
    const refFormSignal = (contentText.match(/가이드|안내|절차|표준|규정|지침|매뉴얼|동향|인사이트|벤치마크|프레임워크/gi) || []).length
    if (refFormSignal > 2) scores.set('reference', (scores.get('reference') || 0) + BOOST)
    return
  }
  if (pair.has('reference') && pair.has('evaluation')) {
    const refFormSignal = (contentText.match(/가이드|안내|절차|표준|규정|지침|매뉴얼|온보딩|체크리스트|step\s*\d|단계\s*\d|how\s*to|tutorial/gi) || []).length
    if (refFormSignal > evalSignal) scores.set('reference', (scores.get('reference') || 0) + BOOST)
    else if (evalSignal > refFormSignal) scores.set('evaluation', (scores.get('evaluation') || 0) + BOOST)
    return
  }
  if (pair.has('reference') && pair.has('planning')) {
    const planFormSignal = (contentText.match(/로드맵|roadmap|phase\s*\d|단계\s*\d.*전략|기대\s*효과|추진\s*전략|추진\s*방향|실행\s*계획|마일스톤|milestone|비전|vision|목표\s*달성|투자\s*수익|roi/gi) || []).length
    const refFormSignal = (contentText.match(/가이드|안내|절차|표준|규정|지침|매뉴얼|동향|인사이트|온보딩/gi) || []).length
    if (planFormSignal > refFormSignal) scores.set('planning', (scores.get('planning') || 0) + BOOST)
    else if (refFormSignal > planFormSignal) scores.set('reference', (scores.get('reference') || 0) + BOOST)
    return
  }
  if (pair.has('meeting') && pair.has('planning')) {
    if (meetingSignal > planningSignal) scores.set('meeting', (scores.get('meeting') || 0) + BOOST)
    else if (planningSignal > meetingSignal) scores.set('planning', (scores.get('planning') || 0) + BOOST)
    return
  }
  if (pair.has('reference') && pair.has('report')) {
    const statusReportSignal = (contentText.match(/현황|진행\s*상황|진척\s*[율률]|완료\s*[율률]|달성\s*[율률]|보고\s*대상|보고\s*일|전년\s*대비|전월\s*대비|종합\s*분석/gi) || []).length
    const refFormSignal = (contentText.match(/step\s*\d|단계\s*\d|절차|사용법|가이드|안내|FAQ|자주\s*묻는|작성\s*(방법|원칙|표준)|양식|템플릿|how\s*to|tutorial|troubleshoot/gi) || []).length
    if (statusReportSignal > refFormSignal) scores.set('report', (scores.get('report') || 0) + BOOST)
    else if (refFormSignal > reportSignal) scores.set('reference', (scores.get('reference') || 0) + BOOST)
    else if (reportSignal > refFormSignal) scores.set('report', (scores.get('report') || 0) + BOOST)
    return
  }
  if (pair.has('meeting') && pair.has('evaluation')) {
    if (meetingSignal > evalSignal) scores.set('meeting', (scores.get('meeting') || 0) + BOOST)
    else {
      const informalMeetingSignal = (contentText.match(/업무\s*공유|공유\s*사항|내용\s*정리|다음\s*주|금주|차주|이번\s*주|예정|논의\s*후|결정|합류|킥오프|확정/gi) || []).length
      if (informalMeetingSignal >= 2) scores.set('meeting', (scores.get('meeting') || 0) + BOOST)
      else if (evalSignal > meetingSignal) scores.set('evaluation', (scores.get('evaluation') || 0) + BOOST)
    }
    return
  }
}

// ═══ detectCategory (원본 그대로) ═══
function detectCategory(title: string, content?: string): { category: FolderCategory; confidence: number; scores: Map<FolderCategory, number> } {
  const scores = new Map<FolderCategory, number>()
  const allCategories: FolderCategory[] = ['report', 'meeting', 'planning', 'evaluation', 'reference', 'contract', 'finance']
  for (const cat of allCategories) scores.set(cat, 0)

  const contentText = content ? content.toLowerCase() : ''
  const titleText = title.toLowerCase()
  const hasContent = contentText.length > 20

  // 0단계: 복합 구조 패턴
  if (hasContent) {
    for (const combo of COMBO_PATTERNS) {
      let matched = 0
      for (const req of combo.requires) { if (req.test(contentText)) matched++ }
      if (matched >= combo.minMatch) {
        scores.set(combo.category, (scores.get(combo.category) || 0) + matched * combo.weight)
      }
    }
  }

  // 1단계: 단일 구조 패턴
  if (hasContent) {
    for (const rule of STRUCTURE_PATTERNS) {
      const matches = contentText.match(rule.patterns)
      if (matches) {
        const unique = new Set(matches.map(m => m.trim().toLowerCase()))
        const effectiveCount = unique.size + (matches.length - unique.size) * 0.5
        scores.set(rule.category, (scores.get(rule.category) || 0) + effectiveCount * rule.weight)
      }
    }
  }

  // 2단계: 본문 키워드 빈도
  if (hasContent) {
    for (const rule of KEYWORD_PATTERNS) {
      const matches = contentText.match(rule.patterns)
      if (matches) scores.set(rule.category, (scores.get(rule.category) || 0) + matches.length)
    }
  }

  // 3단계: 제목 접미사
  const titleSuffixWeight = hasContent ? 3 : 6
  for (const rule of TITLE_SUFFIX_PATTERNS) {
    if (rule.pattern.test(titleText)) scores.set(rule.category, (scores.get(rule.category) || 0) + titleSuffixWeight)
  }

  // 4단계: 제목 키워드
  const titleKeywordWeight = hasContent ? 0.3 : 2.0
  for (const rule of KEYWORD_PATTERNS) {
    const matches = titleText.match(rule.patterns)
    if (matches) scores.set(rule.category, (scores.get(rule.category) || 0) + matches.length * titleKeywordWeight)
  }

  // 충돌 해소
  if (hasContent) disambiguate(contentText, scores)

  // 제목 강제 보정
  const titleCorrections: { pattern: RegExp; category: FolderCategory; boost: number }[] = [
    { pattern: /현황$|현황\s*보고|프로젝트\s*현황|운영\s*현황|추진\s*현황/i, category: 'report', boost: 20 },
    { pattern: /로드맵|roadmap|\d+개년/i, category: 'planning', boost: 50 },
    { pattern: /투자.*수익.*분석|ROI.*분석|예산.*(편성|배분|배정)|급여.*정산/i, category: 'finance', boost: 20 },
  ]
  for (const corr of titleCorrections) {
    if (corr.pattern.test(titleText)) scores.set(corr.category, (scores.get(corr.category) || 0) + corr.boost)
  }

  // 결과 산출
  let bestCategory: FolderCategory = 'other'
  let bestScore = 0
  let secondScore = 0
  for (const [cat, score] of scores) {
    if (score > bestScore) { secondScore = bestScore; bestScore = score; bestCategory = cat }
    else if (score > secondScore) secondScore = score
  }

  let confidence = 0
  if (bestScore > 0) {
    const absScore = Math.min(1.0, bestScore / 20)
    const gapRatio = secondScore > 0 ? (bestScore - secondScore) / bestScore : 1.0
    confidence = absScore * 0.6 + gapRatio * 0.4
  }

  return { category: bestCategory, confidence, scores }
}

// ═══ 기대 분류 (사람이 보고 판단한 정답) ═══
const EXPECTED: Record<string, FolderCategory> = {
  '2025_디지털_전환_로드맵': 'planning',
  '2025_하반기_채용_결과': 'report',
  '2026_연간_예산_편성': 'finance',
  '4분기_물류_운송_실적': 'report',
  'AI_챗봇_도입_추진': 'planning',
  'API_연동_기술_규격': 'reference',
  'Q3_마케팅_캠페인_성과': 'report',
  '고객_만족도_조사_분석': 'evaluation',
  '데이터_거버넌스_프레임워크': 'reference',
  '물류센터_자동화_검토': 'evaluation',
  '부서별_투자_수익_분석': 'finance',
  '분기_경영진_브리핑': 'meeting',
  '사내_복리후생_안내': 'reference',
  '상반기_급여_정산': 'finance',
  '서버_이전_킥오프': 'meeting',
  '소프트웨어_유지보수_위탁': 'contract',
  '스마트시티_사업_협력': 'contract',
  '신규_거래처_계약': 'contract',
  '에너지_효율_개선_보고': 'report',
  '연구개발_프로젝트_리뷰': 'meeting',
  '온라인_광고_예산_배분': 'finance',
  '원자재_공급_단가_협약': 'contract',
  '의료데이터_활용_지침': 'reference',
  '전사_비용_절감_현황': 'report',
  '정보보호_교육_매뉴얼': 'reference',
  '제품_품질_평가': 'evaluation',
  '지속가능경영_추진_계획': 'planning',
  '차세대_CRM_구축_전략': 'planning',
  '클라우드_보안_감사_결과': 'evaluation',
  '해외법인_설립_논의': 'meeting',
}

// ═══ 메인 실행 ═══
async function main() {
  const testDir = path.resolve('test_docs')
  const files = fs.readdirSync(testDir).filter(f => f.endsWith('.docx')).sort()

  console.log(`\n${'═'.repeat(110)}`)
  console.log(`  DocuMind 문서 분류 테스트 (${files.length}개 파일)`)
  console.log(`${'═'.repeat(110)}`)

  const results: {
    file: string
    result: FolderCategory
    expected: FolderCategory
    correct: boolean
    confidence: number
    topScores: string
  }[] = []

  for (const file of files) {
    const filePath = path.join(testDir, file)
    const titleName = file.replace('.docx', '')

    // mammoth로 텍스트 추출
    const buffer = fs.readFileSync(filePath)
    let text = ''
    try {
      const extracted = await mammoth.extractRawText({ buffer })
      text = (extracted.value || '').slice(0, 3000)
    } catch (err) {
      console.warn(`  [WARN] ${file}: 텍스트 추출 실패`)
    }

    const { category, confidence, scores } = detectCategory(titleName, text)
    const expected = EXPECTED[titleName] || 'other'
    const correct = category === expected

    // 상위 3개 점수
    const sortedScores = [...scores.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3)
    const topScores = sortedScores
      .filter(([, s]) => s > 0)
      .map(([c, s]) => `${FOLDER_CATEGORY_LABELS[c]}(${s.toFixed(1)})`)
      .join(' > ')

    results.push({ file: titleName, result: category, expected, correct, confidence, topScores })
  }

  // 결과 출력
  console.log('')
  console.log(`  ${'#'.padEnd(3)} ${'파일명'.padEnd(40)} ${'기대'.padEnd(10)} ${'결과'.padEnd(10)} ${'신뢰도'.padEnd(8)} ${'판정'.padEnd(4)} 점수 분포`)
  console.log(`  ${'─'.repeat(106)}`)

  let correctCount = 0
  let wrongItems: typeof results = []

  for (let i = 0; i < results.length; i++) {
    const r = results[i]
    if (r.correct) correctCount++
    else wrongItems.push(r)

    const mark = r.correct ? '✅' : '❌'
    const expectedLabel = FOLDER_CATEGORY_LABELS[r.expected]
    const resultLabel = FOLDER_CATEGORY_LABELS[r.result]
    const confStr = (r.confidence * 100).toFixed(0) + '%'

    console.log(`  ${String(i + 1).padEnd(3)} ${r.file.padEnd(40)} ${expectedLabel.padEnd(10)} ${resultLabel.padEnd(10)} ${confStr.padEnd(8)} ${mark}  ${r.topScores}`)
  }

  // 요약
  const accuracy = ((correctCount / results.length) * 100).toFixed(1)
  console.log(`\n${'═'.repeat(110)}`)
  console.log(`  📊 분류 정확도: ${correctCount}/${results.length} (${accuracy}%)`)
  console.log(`${'═'.repeat(110)}`)

  if (wrongItems.length > 0) {
    console.log(`\n  ❌ 오분류 목록 (${wrongItems.length}건):`)
    console.log(`  ${'─'.repeat(80)}`)
    for (const w of wrongItems) {
      console.log(`  • ${w.file}`)
      console.log(`    기대: ${FOLDER_CATEGORY_LABELS[w.expected]} → 결과: ${FOLDER_CATEGORY_LABELS[w.result]} (신뢰도: ${(w.confidence * 100).toFixed(0)}%)`)
      console.log(`    점수: ${w.topScores}`)
    }
  }

  // 카테고리별 통계
  console.log(`\n  📈 카테고리별 정확도:`)
  console.log(`  ${'─'.repeat(50)}`)
  const categoryStats = new Map<FolderCategory, { total: number; correct: number }>()
  for (const r of results) {
    const stat = categoryStats.get(r.expected) || { total: 0, correct: 0 }
    stat.total++
    if (r.correct) stat.correct++
    categoryStats.set(r.expected, stat)
  }
  for (const [cat, stat] of [...categoryStats.entries()].sort((a, b) => b[1].total - a[1].total)) {
    const pct = ((stat.correct / stat.total) * 100).toFixed(0)
    const bar = '█'.repeat(Math.round(stat.correct / stat.total * 10)) + '░'.repeat(10 - Math.round(stat.correct / stat.total * 10))
    console.log(`  ${FOLDER_CATEGORY_LABELS[cat].padEnd(8)} ${bar} ${stat.correct}/${stat.total} (${pct}%)`)
  }

  console.log(`\n${'═'.repeat(110)}\n`)
}

main().catch(console.error)
