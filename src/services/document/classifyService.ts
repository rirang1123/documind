import type { FolderCategory, Folder, FileType, LearnedRule } from '@/types'
import { FOLDER_CATEGORY_LABELS } from '@/types'
import { generateId } from '@/utils/id'
import { createSubFolderOnDisk } from './exportService'

// ═════════════════════════════════════════════════════════════
// 학습 규칙 캐시
// DB에서 한 번 로드하여 메모리에 유지. 새 규칙 추가 시 갱신.
// ═════════════════════════════════════════════════════════════
let learnedRulesCache: LearnedRule[] | null = null

async function loadLearnedRules(): Promise<LearnedRule[]> {
  if (learnedRulesCache) return learnedRulesCache
  const { getLearnedRules } = await import('@/services/db')
  learnedRulesCache = await getLearnedRules()
  return learnedRulesCache
}

/** 캐시 무효화 (새 규칙 추가 후 호출) */
export function invalidateLearnedRulesCache(): void {
  learnedRulesCache = null
}

/** Extract plain text from HTML content */
export function htmlToPlainText(html: string): string {
  const div = document.createElement('div')
  div.innerHTML = html
  return (div.textContent || div.innerText || '').slice(0, 2000)
}

/**
 * 바이너리 파일(docx, xlsx, pptx)에서 텍스트를 추출하여 분류에 사용.
 * 뷰어에서 이미 사용 중인 mammoth, SheetJS, pptxService 활용.
 */
export async function extractTextFromBinary(
  blobData: ArrayBuffer,
  fileType: FileType,
): Promise<string> {
  try {
    switch (fileType) {
      case 'docx': {
        const mammoth = await import('mammoth')
        const result = await mammoth.default.extractRawText({ arrayBuffer: blobData })
        return (result.value || '').slice(0, 3000)
      }
      case 'xlsx': {
        const { parseExcelFromArrayBuffer } = await import('./excelService')
        const parsed = parseExcelFromArrayBuffer(blobData)
        const texts: string[] = []
        for (const sheet of parsed.sheets) {
          texts.push(sheet.name)
          for (const row of sheet.data.slice(0, 50)) {
            texts.push(row.map(String).join(' '))
          }
        }
        return texts.join(' ').slice(0, 3000)
      }
      case 'pptx': {
        const { parsePptxFromArrayBuffer } = await import('./pptxService')
        const slides = await parsePptxFromArrayBuffer(blobData)
        const texts = slides.flatMap((s) => s.texts)
        return texts.join(' ').slice(0, 3000)
      }
      default:
        return ''
    }
  } catch (err) {
    console.warn(`[classifyService] ${fileType} 텍스트 추출 실패:`, err)
    return ''
  }
}

// ═════════════════════════════════════════════════════════════
// 1단계: 문서 구조 패턴 (가중치 ×6)
// 문서의 "골격"을 보고 문서 유형을 판단하는 가장 강력한 신호.
// 하나만 매칭돼도 문서 성격을 거의 확정할 수 있는 패턴들.
// ═════════════════════════════════════════════════════════════
const STRUCTURE_PATTERNS: { category: FolderCategory; patterns: RegExp; weight: number }[] = [
  // ── 회의록 ──
  // 회의록은 "누가/언제/어디서 모여서/무엇을 논의했고/무엇을 결정했는가" 구조
  {
    category: 'meeting',
    patterns: new RegExp([
      // 참석 정보
      '참석자\\s*[:\\-]', '참석인\\s*[:\\-]', '출석자\\s*[:\\-]', '배석\\s*[:\\-]',
      '불참\\s*[:\\-]', '참석\\s*부서', '외부\\s*참석',
      // 회의 메타
      '회의\\s*일[시자]\\s*[:\\-]', '회의\\s*장소\\s*[:\\-]', '회의\\s*주제\\s*[:\\-]',
      '회의\\s*목적', '회의\\s*유형', '화상\\s*회의', '대면\\s*회의',
      '일시\\s*[:\\-]\\s*\\d{4}', '장소\\s*[:\\-]', '진행\\s*방식\\s*[:\\-]',
      // 안건/논의
      '안건\\s*[:\\d\\.]', '논의\\s*사항\\s*[:\\d]', '보고\\s*사항\\s*[:\\d]',
      '협의\\s*사항', '상정\\s*안건', '주요\\s*논의',
      '논의\\s*후\\s*결정', '논의\\s*내용', '안건\\s*및',
      // 결정/조치
      '결정\\s*사항', '조치\\s*사항', '후속\\s*조치', '담당자\\s*[:\\-]',
      '이행\\s*기한', '완료\\s*기한', '다음\\s*회의\\s*[:\\-]',
      '회의\\s*결과', 'follow\\s*up',
      // 킥오프/워크숍/피드백 회의
      '킥오프\\s*(미팅|회의)?', 'kick\\s*off', '워크숍\\s*결과', '워크숍\\s*내용',
      '피드백\\s*정리', '피드백\\s*내용', '피드백\\s*사항',
      '리뷰\\s*결과', '리뷰\\s*기록', '리뷰\\s*내용',
      '출시\\s*준비\\s*검토', '준비\\s*상황\\s*점검',
      // 영문
      'attendees?\\s*[:\\-]', 'agenda\\s*[:\\d\\.]', 'action\\s*items?',
      'minutes?\\s*of\\s*(the)?\\s*meeting', 'meeting\\s*notes?',
      'decision\\s*log', 'next\\s*meeting',
      'zoom\\s*(링크|link|url)', '화상.*zoom', 'zoom.*회의',
    ].join('|'), 'gi'),
    weight: 6,
  },
  // ── 계약서 ──
  // "갑과 을이 아래 조건에 합의한다" 형식 + 조문 번호 체계
  {
    category: 'contract',
    patterns: new RegExp([
      // 조문 체계
      '제\\s*\\d+\\s*조', '제\\s*\\d+\\s*항', '제\\s*\\d+\\s*호',
      // 당사자
      '갑\\s*[과와]\\s*을', '이하\\s*["\']?갑["\']?', '이하\\s*["\']?을["\']?',
      '갑\\s*[은는이가]', '을\\s*[은는이가]', '병\\s*[은는이가]',
      '위탁자', '수탁자', '발주자', '수급자', '임대인', '임차인',
      // 계약 구조
      '계약\\s*기간\\s*[:\\-]', '계약\\s*금액\\s*[:\\-]', '계약\\s*조건',
      '계약\\s*목적', '계약\\s*범위', '계약\\s*체결일',
      '효력\\s*발생', '계약\\s*해지', '계약\\s*해제', '계약\\s*갱신',
      // 법률 용어
      '위약금', '손해\\s*배상', '분쟁\\s*해결', '관할\\s*법원',
      '준거법', '비밀\\s*유지\\s*의무', '지식\\s*재산', '면책',
      '불가항력', '양도\\s*금지', '통지\\s*의무',
      '서명\\s*날인', '기명\\s*날인', '인감',
      // 영문
      'article\\s*\\d', 'clause\\s*\\d', 'section\\s*\\d',
      'party\\s*[ab]', 'hereinafter', 'whereas',
      'effective\\s*date', 'termination', 'indemnif',
      'governing\\s*law', 'jurisdiction', 'force\\s*majeure',
      'confidential', 'intellectual\\s*property',
    ].join('|'), 'gi'),
    weight: 6,
  },
  // ── 보고서 ──
  // 번호 매긴 섹션 구조 + "현황→분석→결론" 흐름
  {
    category: 'report',
    patterns: new RegExp([
      // 섹션 헤딩 (한글 번호 구조)
      '[1IⅠ일]\\s*\\.?\\s*(개요|배경|현황|서론|목적)',
      '[2IIⅡ이]\\s*\\.?\\s*(현황|본론|분석|조사)',
      '[3IIIⅢ삼]\\s*\\.?\\s*(결론|결과|요약|종합)',
      // 보고서 구조 키워드
      '결론\\s*및\\s*(제언|건의|시사점)', '요약\\s*및\\s*결론',
      '분석\\s*결과', '조사\\s*결과', '검토\\s*결과', '점검\\s*결과',
      '실적\\s*현황', '추진\\s*현황', '이행\\s*현황', '집행\\s*현황',
      '운영\\s*현황', '진행\\s*현황', '활동\\s*현황', '참여\\s*현황',
      '전년\\s*(대비|동기|동월)', '전월\\s*대비', '증감\\s*[율률]',
      '첨부\\s*[:\\-]', '별첨\\s*[:\\-]',
      // 프로젝트/사업 현황 보고
      '(프로젝트|사업|과제)\\s*(현황|진행|상황)',
      '진척\\s*[율률]', '완료\\s*[율률]', '달성\\s*[율률]',
      '보고\\s*대상\\s*[:\\-]', '보고\\s*일\\s*[:\\-]',
      '종합\\s*현황', '종합\\s*분석', '종합\\s*평가',
      // 기간 보고
      '\\d{4}년\\s*\\d{1,2}월\\s*(실적|현황|보고|결과)',
      '(제|\\d)\\s*\\d\\s*(분기|반기)\\s*(실적|현황|보고)',
      // 성과/실적 보고
      '(성과|실적)\\s*(요약|종합|분석|현황)',
      '주요\\s*성과', '핵심\\s*성과',
      // 영문
      'executive\\s*summary', 'key\\s*findings', 'recommendations?',
      'conclusion', 'appendix', 'year[\\-\\s]over[\\-\\s]year',
      'quarter[\\-\\s]over[\\-\\s]quarter', 'highlights?',
    ].join('|'), 'gi'),
    weight: 5,
  },
  // ── 기획서/계획서 ──
  // "목적→전략→실행계획→기대효과" 미래지향적 구조
  {
    category: 'planning',
    patterns: new RegExp([
      // 기획 구조
      '(사업|추진|기획)\\s*목적', '(사업|추진|기획)\\s*배경',
      '추진\\s*(전략|방향|방안|체계)', '실행\\s*(계획|방안|전략)',
      '세부\\s*(추진|실행)\\s*(계획|과제)', '단계별\\s*(추진|실행)',
      '기대\\s*효과', '예상\\s*성과', '성과\\s*목표', '핵심\\s*성과\\s*지표',
      // 일정/마일스톤
      '추진\\s*일정', '세부\\s*일정', '마일스톤',
      '\\d{1,2}월\\s*[~\\-]\\s*\\d{1,2}월', // 기간 표시
      '(1|2|3)\\s*(단계|Phase|phase)',
      // 자원/예산 계획
      '소요\\s*예산', '투입\\s*인력', '필요\\s*자원', '예산\\s*계획',
      // 위험/대응
      '리스크\\s*(관리|요인|분석)', '위험\\s*요인', '대응\\s*방안',
      // SWOT/환경분석
      'SWOT', '강점|약점|기회|위협',
      '내부\\s*환경', '외부\\s*환경', '경쟁\\s*분석', '시장\\s*분석',
      // 제안서
      '제안\\s*개요', '제안\\s*내용', '제안\\s*배경',
      // 영문
      'objectives?\\s*[:\\-]', 'scope\\s*[:\\-]', 'deliverables?',
      'timeline\\s*[:\\-]', 'milestones?', 'risk\\s*assessment',
      'resource\\s*plan', 'budget\\s*plan', 'action\\s*plan',
      'roadmap', 'gantt', 'work\\s*breakdown',
    ].join('|'), 'gi'),
    weight: 5,
  },
  // ── 평가서 ──
  // "기준→측정→등급/점수→피드백" 구조
  {
    category: 'evaluation',
    patterns: new RegExp([
      // 평가 구조
      '평가\\s*항목\\s*[:\\d]', '평가\\s*기준\\s*[:\\d]', '평가\\s*지표',
      '평가\\s*결과\\s*[:\\-]', '평가\\s*대상', '평가\\s*기간',
      '평가\\s*방법', '평가\\s*위원', '심사\\s*위원', '평가\\s*등급',
      // 점수/등급 체계
      '총점\\s*[:\\d]', '배점\\s*[:\\d]', '가중치\\s*[:\\d]',
      '(우수|양호|보통|미흡|부진)\\s*[:\\d]',
      '([SABCD]\\s*등급|[SABCD]\\s*[:\\-]\\s*\\d)',
      '합격|불합격|적합|부적합|pass|fail',
      // 피드백/개선
      '개선\\s*(필요|사항|권고|요청)', '시정\\s*조치', '보완\\s*사항',
      '강점\\s*[:\\-]', '약점\\s*[:\\-]', '개선점\\s*[:\\-]',
      '종합\\s*의견', '심사\\s*소견', '검토\\s*의견',
      // 감사/검사
      '감사\\s*결과', '지적\\s*사항', '조치\\s*계획',
      '내부\\s*감사', '외부\\s*감사', '자체\\s*점검',
      // 영문
      'evaluation\\s*criteria', 'assessment\\s*result',
      'score\\s*[:\\d]', 'rating\\s*[:\\d]', 'grading',
      'compliance', 'non[\\-\\s]?conformance',
      'corrective\\s*action', 'audit\\s*finding',
    ].join('|'), 'gi'),
    weight: 5,
  },
  // ── 재무 ──
  // 숫자 표/금액 패턴 + 회계 용어
  // 주의: 금액 패턴이 비재무 문서에도 자주 등장하므로 가중치를 4로 설정
  {
    category: 'finance',
    patterns: new RegExp([
      // 표 구조 (합계/소계)
      '합\\s*계\\s*[:\\d₩\\\\]', '소\\s*계\\s*[:\\d₩\\\\]',
      '총\\s*액\\s*[:\\d]', '잔\\s*액\\s*[:\\d]',
      // 세금/부가세
      '부가\\s*(가치)?\\s*세', '공급\\s*가액', '세액\\s*[:\\d]',
      '과세\\s*표준', '면세', '영세율',
      // 회계 구조
      '차변\\s*[:\\d]', '대변\\s*[:\\d]', '이월\\s*[:\\d]',
      '전기\\s*이월', '차기\\s*이월', '이월\\s*잔액',
      '당기\\s*순이익', '영업\\s*이익', '매출\\s*총이익',
      // 재무제표
      '재무\\s*상태표', '손익\\s*계산서', '현금\\s*흐름표',
      '자본\\s*변동표', '대차\\s*대조표', 'balance\\s*sheet',
      // 급여/정산
      '기본급', '수당', '공제', '실수령', '4대\\s*보험',
      '원천\\s*징수', '연말\\s*정산',
      // 예산
      '예산\\s*편성', '예산\\s*집행', '예산\\s*잔액', '이용\\s*[율률]',
      '집행\\s*[율률]', '배정\\s*[액금]',
      // 투자/수익 분석 (재무 전용 문맥)
      '투자\\s*수익\\s*(률|율|분석)', '수익\\s*[율률]\\s*(산출|분석|비교)',
      '투자\\s*대비\\s*수익', '집행\\s*잔액',
      '배당\\s*(금|률)', '투자\\s*회수', '순\\s*현재\\s*가치',
      // 영문
      'subtotal', 'amount\\s*[:\\d]',
      'balance\\s*[:\\d]', 'debit', 'credit',
      'revenue', 'expense', 'profit', 'loss',
      'accounts?\\s*(payable|receivable)',
      'invoice\\s*(no|number|#)', 'P\\.?O\\.?\\s*#?\\d',
    ].join('|'), 'gi'),
    weight: 4,
  },
  // ── 참고자료/매뉴얼 ──
  // 설명/절차/단계별 가이드 구조
  {
    category: 'reference',
    patterns: new RegExp([
      // 가이드/매뉴얼 구조
      '(사용|이용|운영|설치|설정|작성)\\s*(방법|절차|가이드|안내|표준|원칙)',
      '양식별\\s*(안내|설명)', '(작성|활용)\\s*(팁|노하우)',
      'step\\s*\\d', '단계\\s*\\d', '절차\\s*\\d',
      '주의\\s*사항\\s*[:\\-]', '유의\\s*사항\\s*[:\\-]',
      '참고\\s*사항\\s*[:\\-]', '비고\\s*[:\\-]',
      'FAQ', '자주\\s*묻는\\s*질문', 'Q\\s*[&:]\\s*A',
      // 기술 문서 / 표준서
      '시스템\\s*요구\\s*사항', '호환성', '버전\\s*정보',
      '업데이트\\s*내역', '변경\\s*이력', 'changelog',
      'release\\s*notes?', 'API\\s*(문서|reference|doc)',
      '파라미터\\s*[:\\-]', '반환\\s*값\\s*[:\\-]',
      '문서\\s*번호\\s*[:\\-]', '문서\\s*분류\\s*[:\\-]',
      '적용\\s*범위\\s*[:\\-]', '적용\\s*대상\\s*[:\\-]',
      '(설계|개발|코딩|네이밍)\\s*(표준|규칙|규약|컨벤션)',
      // 프레임워크/아키텍처 문서
      '(거버넌스|프레임워크|아키텍처)\\s*(구조|체계|개요)',
      '(정책|원칙|기준)\\s*(정의|수립|체계)',
      '(역할|책임)\\s*(정의|분담|체계)',
      // 교육/학습/온보딩
      '학습\\s*목표', '교육\\s*목표', '교육\\s*내용',
      '교육\\s*대상', '커리큘럼', '교안', '학습\\s*자료',
      '온보딩', '체크리스트', '필수\\s*교육',
      '입사\\s*(안내|가이드|절차)', '신규\\s*(입사|직원)\\s*(안내|가이드)',
      // 규정/지침
      '(업무|운영|관리)\\s*규정', '(업무|운영|관리)\\s*지침',
      '표준\\s*운영\\s*절차', 'SOP',
      // 시장 동향/조사 자료
      '시장\\s*(동향|분석|조사|현황)', '(산업|업계)\\s*(동향|분석|전망)',
      '(소비자|고객)\\s*(인사이트|조사|분석)',
      '(트렌드|trend)\\s*(분석|조사|리포트)',
      // 벤치마크는 report에 더 가까우므로 제외
      // 영문
      'how\\s*to\\s', 'tutorial', 'getting\\s*started',
      'prerequisites?', 'installation\\s*guide',
      'user\\s*(guide|manual)', 'reference\\s*(guide|manual)',
      'troubleshoot', 'known\\s*issues?',
    ].join('|'), 'gi'),
    weight: 5,
  },
]

// ═════════════════════════════════════════════════════════════
// 2단계: 복합 구조 패턴 (가중치 ×8)
// 2개 이상의 구조 요소가 근접해 나타나면 매우 높은 신뢰도.
// 예: "참석자" + "안건" 이 모두 있으면 회의록 거의 확정.
// ═════════════════════════════════════════════════════════════
interface ComboRule {
  category: FolderCategory
  requires: RegExp[]    // 이 중 minMatch개 이상 매칭 필요
  minMatch: number
  weight: number
}

const COMBO_PATTERNS: ComboRule[] = [
  {
    category: 'meeting',
    requires: [
      /참석자|출석자|attendee/i,
      /안건|논의\s*사항|agenda/i,
      /결정\s*사항|조치\s*사항|action\s*item/i,
    ],
    minMatch: 2,
    weight: 8,
  },
  // 회의 메타데이터 패턴 (일시+참석 조합은 거의 확실한 회의록)
  {
    category: 'meeting',
    requires: [
      /일시\s*[:\-]\s*\d|회의\s*일[시자]\s*[:\-]/i,
      /참석\s*[:\-]|참석자\s*[:\-]|attendee/i,
      /장소\s*[:\-]|회의\s*장소|zoom|화상|대면|온라인/i,
    ],
    minMatch: 2,
    weight: 10,
  },
  {
    category: 'contract',
    requires: [
      /제\s*\d+\s*조|article\s*\d/i,
      /갑.*을|party\s*[ab]|위탁자.*수탁자/i,
      /계약\s*(기간|금액|조건)|effective\s*date/i,
    ],
    minMatch: 2,
    weight: 8,
  },
  {
    category: 'evaluation',
    requires: [
      /평가\s*(항목|기준|지표)|evaluation\s*criteria/i,
      /점수|등급|배점|총점|score|rating|grade/i,
      /개선\s*(사항|필요|권고)|종합\s*의견|corrective/i,
    ],
    minMatch: 2,
    weight: 8,
  },
  {
    category: 'finance',
    requires: [
      /합\s*계|소\s*계|total|subtotal/i,
      /부가세|세액|차변|대변|공제|원천\s*징수|정산\s*내역|세금\s*계산/i,
      /재무\s*상태표|손익\s*계산서|예산\s*편성|예산\s*집행|급여\s*명세|revenue|expense/i,
    ],
    minMatch: 2,
    weight: 8,
  },
  // 투자/수익 분석 복합 패턴 (재무 전용 문맥)
  {
    category: 'finance',
    requires: [
      /투자\s*(현황|금액)|investment\s*(amount|status)/i,
      /수익\s*[율률]\s*(산출|분석|비교)|투자\s*대비\s*수익|회수\s*기간/i,
      /집행\s*잔액|배정\s*[액금]|예산\s*(편성|집행|배정)/i,
    ],
    minMatch: 2,
    weight: 8,
  },
  {
    category: 'report',
    requires: [
      /개요|배경|서론|현황|executive\s*summary/i,
      /분석\s*결과|조사\s*결과|검토\s*결과|key\s*findings|종합\s*분석|종합\s*평가/i,
      /결론|제언|건의|시사점|종합|recommendations?|향후\s*(과제|계획|방향)/i,
    ],
    minMatch: 2,
    weight: 8,
  },
  // 현황/진행 보고서 패턴
  {
    category: 'report',
    requires: [
      /현황|진행\s*상황|진척|추진\s*현황|운영\s*현황/i,
      /완료\s*[율률]|달성\s*[율률]|진척\s*[율률]|이행\s*[율률]|전년\s*대비|전월\s*대비/i,
      /주요\s*성과|핵심\s*성과|향후\s*(과제|계획)|개선\s*사항|첨부|별첨/i,
    ],
    minMatch: 2,
    weight: 8,
  },
  {
    category: 'planning',
    requires: [
      /(사업|추진|기획)\s*(목적|배경)|objectives?/i,
      /추진\s*(전략|방향|방안)|실행\s*계획|action\s*plan/i,
      /기대\s*효과|추진\s*일정|마일스톤|timeline|milestone/i,
    ],
    minMatch: 2,
    weight: 8,
  },
  {
    category: 'reference',
    requires: [
      /가이드|안내|절차|매뉴얼|표준|지침|guide|manual|standard/i,
      /적용\s*(범위|대상)|문서\s*번호|step\s*\d|단계\s*\d/i,
      /주의\s*사항|유의\s*사항|참고|비고|FAQ|how\s*to|troubleshoot/i,
    ],
    minMatch: 2,
    weight: 8,
  },
]

// ═════════════════════════════════════════════════════════════
// 3단계: 키워드 패턴 (가중치 ×1)
// 일반적인 단어 빈도 기반. 구조 패턴보다 신뢰도 낮음.
// ═════════════════════════════════════════════════════════════
const KEYWORD_PATTERNS: { category: FolderCategory; patterns: RegExp }[] = [
  {
    category: 'report',
    patterns: /보고서?|리포트|report|결과보고|분석보고|실적|성과보고|현황|통계|summary|annual|quarterly|월간|주간|일일|데일리|weekly|monthly|연간|분기|결산|동향|추이|지표|KPI|대시보드|dashboard|진행.?상황|업무.?보고|현장.?보고|출장.?보고|점검.?보고/g,
  },
  {
    category: 'meeting',
    patterns: /회의록?|미팅|meeting|agenda|회의.?록|minute|안건|참석자|논의|회의.?자료|회의.?안|워크숍|workshop|세미나|seminar|브리핑|briefing|발표.?자료|프레젠|presentation|토론|토의|협의|간담회|조회|업무.?공유|팀.?공유|내용.?정리|공유.?사항|이번.?주|다음.?주.?계획|금주|차주|예정.?사항|킥오프|kick.?off|피드백.?정리|리뷰.?기록|스프린트.?리뷰|sprint.?review/g,
  },
  {
    category: 'planning',
    patterns: /기획서?|계획서?|전략|plan|planning|목표|로드맵|roadmap|일정|schedule|마일스톤|프로젝트.?계획|사업.?계획|운영.?계획|제안서?|proposal|전략.?수립|방안|방침|추진.?계획|액션.?플랜|action.?plan|시행.?계획|연구.?계획|개발.?계획|마케팅.?계획/g,
  },
  {
    category: 'evaluation',
    patterns: /평가|심사|리뷰|review|evaluat|검토|피드백|feedback|성과.?평가|인사.?평가|업무.?평가|자체.?평가|품질.?검사|inspection|audit|감사|진단|assessment|테스트.?결과|시험.?결과|검증|validation|승인|approval/g,
  },
  {
    category: 'reference',
    patterns: /참고|자료|reference|참조|가이드|guide|매뉴얼|manual|문헌|tutorial|사용법|안내서?|핸드북|handbook|사양서?|spec|규격|표준|standard|절차서?|procedure|지침|교육.?자료|학습.?자료|연구.?자료|기술.?문서|API.?문서/g,
  },
  {
    category: 'contract',
    patterns: /계약서?|contract|협약|MOU|약정|조항|서명|체결|갱신|agreement|약관|terms|동의서?|위임장|각서|합의서?|발주서?|purchase.?order|납품|입찰|견적서?|quotation|비밀유지|NDA|라이선스|license/g,
  },
  {
    category: 'finance',
    patterns: /재무|예산|budget|finance|회계|매출|비용|손익|수입|지출|세금|invoice|청구서?|영수증|receipt|결제|payment|정산|급여|payroll|세무|tax|감가상각|자산|부채|자본|cash.?flow|현금.?흐름|원가|cost|단가|거래.?명세|전표/g,
  },
]

// ═════════════════════════════════════════════════════════════
// 4단계: 제목 전용 패턴 (보조)
// 파일명에서 명확한 문서 유형 접미사를 감지.
// "~회의록", "~계약서" 처럼 파일명 끝에 유형이 있는 경우.
// ═════════════════════════════════════════════════════════════
const TITLE_SUFFIX_PATTERNS: { category: FolderCategory; pattern: RegExp }[] = [
  { category: 'meeting', pattern: /회의록|미팅노트|meeting\s*minutes|회의\s*결과|회의\s*안건|안건\s*및\s*논의|킥오프|kick\s*off|워크숍\s*결과|피드백\s*정리|리뷰\s*기록|논의\s*정리|검토\s*회의/i },
  { category: 'contract', pattern: /계약서|협약서|합의서|약정서|동의서|위임장|contract|agreement|MOU/i },
  { category: 'report', pattern: /보고서|리포트|결과서|현황서|report|종합\s*분석|실적\s*분석|현황\s*보고|성과\s*보고|운영\s*현황|프로젝트\s*현황|이전\s*현황|전환\s*현황/i },
  { category: 'planning', pattern: /기획서|계획서|제안서|전략서|proposal|plan(?!t)|로드맵|roadmap|3개년|5개년|\d+개년/i },
  { category: 'evaluation', pattern: /평가서|심사서|감사서|검토서|진단서|assessment|evaluation|review\s*report/i },
  { category: 'finance', pattern: /청구서|견적서|영수증|세금계산서|급여명세|거래명세|invoice|receipt|quotation/i },
  { category: 'reference', pattern: /매뉴얼|가이드라인|가이드|안내서|핸드북|지침서|절차서|표준서|프레임워크|manual|guide|handbook|tutorial|guideline|framework|standard|시장\s*동향|인사이트|온보딩/i },
]

// ═════════════════════════════════════════════════════════════
// 충돌 해소 (Disambiguation)
//
// 문서에는 "주제(topic)"와 "형식(format)"이 있다.
// - 주제: 무엇에 대한 문서인가 (평가, 재무, 회의, 기획...)
// - 형식: 어떤 형태의 문서인가 (보고서, 평가표, 회의록, 계획서...)
//
// "평가 보고서"는 주제=평가, 형식=보고서 → report로 분류해야 함.
// "회의 결과 보고"는 주제=회의, 형식=보고서 → report로 분류해야 함.
// "기획안 검토 평가표"는 주제=기획, 형식=평가 → evaluation로 분류해야 함.
//
// 핵심 원리: "형식"이 분류 기준이다. 주제는 태그로 남긴다.
// ═════════════════════════════════════════════════════════════

// 보고서 형식 신호: 문서가 "~에 대해 서술/분석/보고" 하고 있는지
const REPORT_FORMAT_SIGNAL = new RegExp([
  // 서술형 섹션 구조 (개요→본론→결론)
  '(개요|배경|서론|목적)\\s*$',           // 섹션 제목으로 등장
  '(결론|결어|요약|맺음말|종합\\s*의견)',
  '(시사점|제언|건의\\s*사항|향후\\s*과제)',
  // 분석/서술 동사 (보고서는 과거형 서술이 많음)
  '(분석|검토|조사|파악|확인)\\s*(한|했|하였|된|됨|결과)',
  '(나타났|드러났|확인됨|파악됨|조사됨)',
  // 보고 구조
  '보고\\s*드림', '보고\\s*합니다', '아래와\\s*같이',
  '별첨|첨부\\s*[:\\-]',
  // 영문
  'executive\\s*summary', 'key\\s*findings', 'in\\s*conclusion',
  'as\\s*follows', 'recommendations?',
].join('|'), 'gim')

// 순수 평가표/채점표 형식 신호: 문서 자체가 "평가 도구"인지
const EVAL_FORM_SIGNAL = new RegExp([
  // 점수 입력란 구조
  '(점수|배점|가중치)\\s*[:\\d/]',
  '\\d+\\s*/\\s*\\d+\\s*(점|점수)?',       // "85/100" 같은 점수 표기
  '[SABCD][+\\-]?\\s*등급',
  // 평가 양식 필드
  '평가자\\s*[:\\-]', '피평가자\\s*[:\\-]', '평가\\s*일자\\s*[:\\-]',
  '서명\\s*[:\\-]\\s*$', '확인\\s*[:\\-]\\s*$',
  // 체크리스트/평가표 구조
  '(적합|부적합|해당없음|N\\/A)',
  '(우수|양호|보통|미흡|부진)\\s*[☑☐✓✗○●□■]',
  '[☑☐✓✗○●□■]\\s*(우수|양호|보통|미흡|부진)',
  // 영문
  'evaluator\\s*[:\\-]', 'evaluatee\\s*[:\\-]',
  'score\\s*[:\\d/]', '\\d+\\s*/\\s*\\d+\\s*points?',
  '(pass|fail|N\\/A|satisfactory|unsatisfactory)',
].join('|'), 'gim')

// 순수 회의록 형식 신호: 문서 자체가 "회의 기록"인지
const MEETING_FORM_SIGNAL = new RegExp([
  '참석자\\s*[:\\-]', '불참자?\\s*[:\\-]',
  '안건\\s*[\\d:\\.]', '논의\\s*내용',
  '결정\\s*사항\\s*[:\\-\\d]', '조치\\s*사항\\s*[:\\-\\d]',
  '회의\\s*일시\\s*[:\\-]', '회의\\s*장소\\s*[:\\-]',
  '다음\\s*회의\\s*[:\\-]',
  'attendees?\\s*[:\\-]', 'agenda\\s*[:\\d]',
  'action\\s*items?\\s*[:\\-\\d]', 'minutes?\\s*of',
].join('|'), 'gim')

// 순수 기획/계획서 형식 신호: 문서가 "미래 행동 계획"인지
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

/**
 * 충돌 해소: 상위 2개 카테고리가 경합할 때 "문서 형식"으로 최종 결정.
 *
 * 규칙:
 * 1. evaluation vs report → 보고서 형식이면 report, 평가표 형식이면 evaluation
 * 2. meeting vs report → 회의록 형식이면 meeting, 서술형이면 report
 * 3. finance vs report → 서술형이면 report, 표/숫자 위주면 finance
 * 4. planning vs report → 계획 구조면 planning, 서술형이면 report
 * 5. planning vs evaluation → 평가표 형식이면 evaluation, 계획 구조면 planning
 * 6. contract vs report → 계약서 조문 구조면 contract, 서술형이면 report
 */
function disambiguate(contentText: string, scores: Map<FolderCategory, number>): void {
  // 상위 2개 카테고리 추출
  const sorted = [...scores.entries()]
    .filter(([, s]) => s > 0)
    .sort((a, b) => b[1] - a[1])

  if (sorted.length < 2) return

  const [first, second] = sorted
  const [cat1, score1] = first
  const [cat2, score2] = second

  // 점수 차이가 매우 크면 (2배 이상) 충돌 없음
  if (score1 > score2 * 2) return

  // 형식 신호 점수 계산
  const reportSignal = (contentText.match(REPORT_FORMAT_SIGNAL) || []).length
  const evalSignal = (contentText.match(EVAL_FORM_SIGNAL) || []).length
  const meetingSignal = (contentText.match(MEETING_FORM_SIGNAL) || []).length
  const planningSignal = (contentText.match(PLANNING_FORM_SIGNAL) || []).length

  const pair = new Set([cat1, cat2])
  const BOOST = 10 // 형식 판정 보너스

  // ── evaluation ↔ report ──
  if (pair.has('evaluation') && pair.has('report')) {
    if (reportSignal > evalSignal) {
      // "평가 보고서" → 보고서 형식
      scores.set('report', (scores.get('report') || 0) + BOOST)
    } else if (evalSignal > reportSignal) {
      // 순수 평가표
      scores.set('evaluation', (scores.get('evaluation') || 0) + BOOST)
    }
    return
  }

  // ── meeting ↔ report ──
  if (pair.has('meeting') && pair.has('report')) {
    if (meetingSignal > reportSignal) {
      scores.set('meeting', (scores.get('meeting') || 0) + BOOST)
    } else if (reportSignal > meetingSignal) {
      // "회의 결과 보고서" → 보고서 형식
      scores.set('report', (scores.get('report') || 0) + BOOST)
    }
    return
  }

  // ── finance ↔ report ──
  if (pair.has('finance') && pair.has('report')) {
    // 순수 재무 문서 신호: 재무제표, 정산, 급여, 예산 편성/집행 등
    // "재무 모듈", "회계 시스템" 등 다른 맥락의 재무 용어는 제외
    const pureFinanceSignal = (contentText.match(
      /재무\s*상태표|손익\s*계산서|현금\s*흐름표|대차\s*대조표|기본급|수당|공제|실수령|원천\s*징수|예산\s*편성|예산\s*집행|정산\s*내역|세금\s*계산서|투자\s*수익|수익\s*[율률]|ROI|집행\s*잔액|배정\s*[액금]|invoice|receipt/gi
    ) || []).length
    if (pureFinanceSignal >= 2) {
      scores.set('finance', (scores.get('finance') || 0) + BOOST)
    } else {
      // 순수 재무 신호가 약하면 report 우선 (금액은 부수적 정보)
      scores.set('report', (scores.get('report') || 0) + BOOST)
    }
    return
  }

  // ── planning ↔ report ──
  if (pair.has('planning') && pair.has('report')) {
    if (planningSignal > reportSignal) {
      scores.set('planning', (scores.get('planning') || 0) + BOOST)
    } else if (reportSignal > planningSignal) {
      // "기획 검토 보고서" → 보고서
      scores.set('report', (scores.get('report') || 0) + BOOST)
    }
    return
  }

  // ── planning ↔ evaluation ──
  if (pair.has('planning') && pair.has('evaluation')) {
    if (evalSignal > planningSignal) {
      // "기획안 평가표" → 평가
      scores.set('evaluation', (scores.get('evaluation') || 0) + BOOST)
    } else if (planningSignal > evalSignal) {
      scores.set('planning', (scores.get('planning') || 0) + BOOST)
    }
    return
  }

  // ── contract ↔ report ──
  if (pair.has('contract') && pair.has('report')) {
    // 조문 구조(제N조)가 있으면 계약서, 없으면 보고서
    const hasArticles = /제\s*\d+\s*조|article\s*\d/i.test(contentText)
    if (hasArticles) {
      scores.set('contract', (scores.get('contract') || 0) + BOOST)
    } else {
      scores.set('report', (scores.get('report') || 0) + BOOST)
    }
    return
  }

  // ── evaluation ↔ meeting ──
  if (pair.has('evaluation') && pair.has('meeting')) {
    if (meetingSignal > evalSignal) {
      scores.set('meeting', (scores.get('meeting') || 0) + BOOST)
    } else if (evalSignal > meetingSignal) {
      scores.set('evaluation', (scores.get('evaluation') || 0) + BOOST)
    }
    return
  }

  // ── evaluation ↔ planning ──
  // (이미 위에서 planning ↔ evaluation 처리)

  // ── finance ↔ evaluation ──
  if (pair.has('finance') && pair.has('evaluation')) {
    // 금액/합계가 주된 내용이면 finance, 점수/등급이면 evaluation
    if (evalSignal > 2) {
      scores.set('evaluation', (scores.get('evaluation') || 0) + BOOST)
    }
    return
  }

  // ── finance ↔ meeting ──
  if (pair.has('finance') && pair.has('meeting')) {
    if (meetingSignal > 2) {
      scores.set('meeting', (scores.get('meeting') || 0) + BOOST)
    } else {
      const pureFinanceSignal = (contentText.match(
        /재무\s*상태표|손익\s*계산서|정산|급여|예산\s*편성|세금|invoice/gi
      ) || []).length
      if (pureFinanceSignal > meetingSignal) {
        scores.set('finance', (scores.get('finance') || 0) + BOOST)
      } else {
        scores.set('meeting', (scores.get('meeting') || 0) + BOOST)
      }
    }
    return
  }

  // ── finance ↔ planning ──
  if (pair.has('finance') && pair.has('planning')) {
    if (planningSignal > 2) {
      scores.set('planning', (scores.get('planning') || 0) + BOOST)
    }
    return
  }

  // ── finance ↔ reference ──
  if (pair.has('finance') && pair.has('reference')) {
    const refFormSignal = (contentText.match(
      /가이드|안내|절차|표준|규정|지침|매뉴얼|동향|인사이트|벤치마크|프레임워크/gi
    ) || []).length
    if (refFormSignal > 2) {
      scores.set('reference', (scores.get('reference') || 0) + BOOST)
    }
    return
  }

  // ── reference ↔ evaluation ──
  if (pair.has('reference') && pair.has('evaluation')) {
    const refFormSignal = (contentText.match(
      /가이드|안내|절차|표준|규정|지침|매뉴얼|온보딩|체크리스트|step\s*\d|단계\s*\d|how\s*to|tutorial/gi
    ) || []).length
    if (refFormSignal > evalSignal) {
      scores.set('reference', (scores.get('reference') || 0) + BOOST)
    } else if (evalSignal > refFormSignal) {
      scores.set('evaluation', (scores.get('evaluation') || 0) + BOOST)
    }
    return
  }

  // ── reference ↔ planning ──
  if (pair.has('reference') && pair.has('planning')) {
    // 로드맵, Phase, 전략, 기대효과 등 미래지향 구조가 있으면 planning 우선
    const planFormSignal = (contentText.match(
      /로드맵|roadmap|phase\s*\d|단계\s*\d.*전략|기대\s*효과|추진\s*전략|추진\s*방향|실행\s*계획|마일스톤|milestone|비전|vision|목표\s*달성|투자\s*수익|roi/gi
    ) || []).length
    const refFormSignal = (contentText.match(
      /가이드|안내|절차|표준|규정|지침|매뉴얼|동향|인사이트|온보딩/gi
    ) || []).length
    if (planFormSignal > refFormSignal) {
      scores.set('planning', (scores.get('planning') || 0) + BOOST)
    } else if (refFormSignal > planFormSignal) {
      scores.set('reference', (scores.get('reference') || 0) + BOOST)
    }
    return
  }

  // ── meeting ↔ planning ──
  if (pair.has('meeting') && pair.has('planning')) {
    if (meetingSignal > planningSignal) {
      scores.set('meeting', (scores.get('meeting') || 0) + BOOST)
    } else if (planningSignal > meetingSignal) {
      scores.set('planning', (scores.get('planning') || 0) + BOOST)
    }
    return
  }

  // ── reference ↔ report ──
  // "보고서 작성 가이드"처럼 보고서가 주제이고 가이드가 형식인 경우
  if (pair.has('reference') && pair.has('report')) {
    // "현황", "진행 상황", "달성률" 등 현황 보고 신호가 있으면 report 우선
    const statusReportSignal = (contentText.match(
      /현황|진행\s*상황|진척\s*[율률]|완료\s*[율률]|달성\s*[율률]|보고\s*대상|보고\s*일|전년\s*대비|전월\s*대비|종합\s*분석/gi
    ) || []).length
    const refFormSignal = (contentText.match(
      /step\s*\d|단계\s*\d|절차|사용법|가이드|안내|FAQ|자주\s*묻는|작성\s*(방법|원칙|표준)|양식|템플릿|how\s*to|tutorial|troubleshoot/gi
    ) || []).length
    if (statusReportSignal > refFormSignal) {
      scores.set('report', (scores.get('report') || 0) + BOOST)
    } else if (refFormSignal > reportSignal) {
      scores.set('reference', (scores.get('reference') || 0) + BOOST)
    } else if (reportSignal > refFormSignal) {
      scores.set('report', (scores.get('report') || 0) + BOOST)
    }
    return
  }

  // ── meeting ↔ evaluation ──
  // "업무 공유", "다음 주 계획" 등 비공식 회의 패턴
  if (pair.has('meeting') && pair.has('evaluation')) {
    if (meetingSignal > evalSignal) {
      scores.set('meeting', (scores.get('meeting') || 0) + BOOST)
    } else {
      // 비공식 회의 신호: 공유/정리/다음 주 등
      const informalMeetingSignal = (contentText.match(
        /업무\s*공유|공유\s*사항|내용\s*정리|다음\s*주|금주|차주|이번\s*주|예정|논의\s*후|결정|합류|킥오프|확정/gi
      ) || []).length
      if (informalMeetingSignal >= 2) {
        scores.set('meeting', (scores.get('meeting') || 0) + BOOST)
      } else if (evalSignal > meetingSignal) {
        scores.set('evaluation', (scores.get('evaluation') || 0) + BOOST)
      }
    }
    return
  }
}

/**
 * 내용 우선 문서 분류 (v0.4.8)
 *
 * 분류 우선순위:
 * 0) 복합 구조 패턴 (×8) - 2개 이상의 구조 요소가 함께 출현
 * 1) 단일 구조 패턴 (×6~5) - 문서 골격의 확실한 단서
 * 2) 본문 키워드 빈도 (×1) - 일반 키워드 매칭
 * 3) 제목 접미사 (×3) - 파일명 끝의 명확한 유형명
 * 4) 제목 키워드 (×0.3) - 최후의 보조 수단
 * 5) 충돌 해소 - 상위 2개 카테고리 경합 시 "문서 형식"으로 최종 결정
 *
 * 내용이 없으면 제목 가중치를 올려서 보정.
 * 신뢰도가 낮으면 AI fallback.
 */
export function detectCategory(title: string, content?: string): { category: FolderCategory; confidence: number; scores: Map<FolderCategory, number> } {
  const scores = new Map<FolderCategory, number>()
  const allCategories: FolderCategory[] = ['report', 'meeting', 'planning', 'evaluation', 'reference', 'contract', 'finance']
  for (const cat of allCategories) {
    scores.set(cat, 0)
  }

  const contentText = content ? content.toLowerCase() : ''
  const titleText = title.toLowerCase()
  const hasContent = contentText.length > 20

  // ── 0단계: 복합 구조 패턴 (가장 신뢰도 높음) ──
  if (hasContent) {
    for (const combo of COMBO_PATTERNS) {
      let matched = 0
      for (const req of combo.requires) {
        if (req.test(contentText)) matched++
      }
      if (matched >= combo.minMatch) {
        const current = scores.get(combo.category) || 0
        scores.set(combo.category, current + matched * combo.weight)
      }
    }
  }

  // ── 1단계: 단일 구조 패턴 ──
  if (hasContent) {
    for (const rule of STRUCTURE_PATTERNS) {
      const matches = contentText.match(rule.patterns)
      if (matches) {
        // 고유 매칭 수로 계산 (같은 단어 반복은 1.5배까지만)
        const unique = new Set(matches.map(m => m.trim().toLowerCase()))
        const effectiveCount = unique.size + (matches.length - unique.size) * 0.5
        const current = scores.get(rule.category) || 0
        scores.set(rule.category, current + effectiveCount * rule.weight)
      }
    }
  }

  // ── 2단계: 본문 키워드 빈도 ──
  if (hasContent) {
    for (const rule of KEYWORD_PATTERNS) {
      const matches = contentText.match(rule.patterns)
      if (matches) {
        const current = scores.get(rule.category) || 0
        scores.set(rule.category, current + matches.length)
      }
    }
  }

  // ── 3단계: 제목 접미사 (명확한 유형명이 파일명에 있으면 가산) ──
  const titleSuffixWeight = hasContent ? 3 : 6
  for (const rule of TITLE_SUFFIX_PATTERNS) {
    if (rule.pattern.test(titleText)) {
      const current = scores.get(rule.category) || 0
      scores.set(rule.category, current + titleSuffixWeight)
    }
  }

  // ── 4단계: 제목 키워드 (최후의 보조) ──
  const titleKeywordWeight = hasContent ? 0.3 : 2.0
  for (const rule of KEYWORD_PATTERNS) {
    const matches = titleText.match(rule.patterns)
    if (matches) {
      const current = scores.get(rule.category) || 0
      scores.set(rule.category, current + matches.length * titleKeywordWeight)
    }
  }

  // ── 충돌 해소 (Disambiguation) ──
  // "주제(topic)"와 "문서 형식(format)"이 다를 때 형식을 우선.
  // 예: 평가가 주제지만, 문서 형식이 보고서면 → report
  if (hasContent) {
    disambiguate(contentText, scores)
  }

  // ── 5단계: 제목 강제 보정 ──
  // 제목에 매우 강력한 문서 유형 신호가 있으면 최종 보정
  // (disambiguate 이후에 적용하여 오분류를 최종 교정)
  const titleCorrections: { pattern: RegExp; category: FolderCategory; boost: number }[] = [
    // "~현황"으로 끝나는 제목은 보고서 성격이 강함
    { pattern: /현황$|현황\s*보고|프로젝트\s*현황|운영\s*현황|추진\s*현황/i, category: 'report', boost: 20 },
    // 로드맵은 기획서 (내용에 reference/finance 패턴이 많아도 로드맵은 명백한 기획)
    { pattern: /로드맵|roadmap|\d+개년/i, category: 'planning', boost: 50 },
    // 투자_수익_분석, ROI_분석, 예산_편성, 예산_배분 등은 재무
    { pattern: /투자.*수익.*분석|ROI.*분석|예산.*(편성|배분|배정)|급여.*정산/i, category: 'finance', boost: 20 },
  ]
  for (const corr of titleCorrections) {
    if (corr.pattern.test(titleText)) {
      const current = scores.get(corr.category) || 0
      scores.set(corr.category, current + corr.boost)
    }
  }

  // ── 결과 산출 ──
  let bestCategory: FolderCategory = 'other'
  let bestScore = 0
  let secondScore = 0

  for (const [cat, score] of scores) {
    if (score > bestScore) {
      secondScore = bestScore
      bestScore = score
      bestCategory = cat
    } else if (score > secondScore) {
      secondScore = score
    }
  }

  // 신뢰도 계산
  let confidence = 0
  if (bestScore > 0) {
    // 절대 점수 기여 (높을수록 좋음, 20점 이상이면 만점 기여)
    const absScore = Math.min(1.0, bestScore / 20)
    // 격차 기여 (1위와 2위 차이가 클수록 좋음)
    const gapRatio = secondScore > 0 ? (bestScore - secondScore) / bestScore : 1.0
    confidence = absScore * 0.6 + gapRatio * 0.4
  }

  return { category: bestCategory, confidence, scores }
}

// ═════════════════════════════════════════════════════════════
// 신뢰도 기반 3단계 분류 시스템 (v0.4.9)
//
// Tier 1: 신뢰도 >= 0.85 → 규칙 결과 확정 (AI 스킵)
// Tier 2: 신뢰도 0.35~0.85 → AI 2차 검증 (규칙 결과를 힌트로 제공)
// Tier 3: 신뢰도 < 0.35 또는 'other' → AI 전담 분류
// ═════════════════════════════════════════════════════════════

const TIER1_THRESHOLD = 0.85  // 이상이면 규칙 확정
const TIER2_THRESHOLD = 0.35  // 이상이면 AI 검증, 미만이면 AI 전담

/** AI 공통: provider 가져오기 */
async function getActiveProvider() {
  const { useAppStore } = await import('@/stores/useAppStore')
  const settings = useAppStore.getState().settings
  if (!settings) return null

  return settings.aiProviders.find(
    (p) => p.id === settings.activeProviderId
  ) || null
}

/** AI 결과의 category 문자열을 FolderCategory로 매핑 */
function mapToFolderCategory(raw: string): FolderCategory {
  const categoryMap: Record<string, FolderCategory> = {}
  for (const [key, label] of Object.entries(FOLDER_CATEGORY_LABELS)) {
    categoryMap[label] = key as FolderCategory
    categoryMap[key] = key as FolderCategory
  }
  return categoryMap[raw] || 'other'
}

/** 규칙 엔진의 점수 분포에서 상위 N개 추출 */
/**
 * 커스텀 폴더 패턴 매칭 (folder-pattern 규칙)
 * smartClassify보다 먼저 실행 — 매칭되면 카테고리 분류 건너뜀
 */
async function matchFolderPattern(
  title: string,
  content?: string,
  projectId?: string,
): Promise<{ folderId: string; folderName: string; category: FolderCategory | null; confidence: number } | null> {
  const rules = await loadLearnedRules()
  const folderRules = rules.filter(r => r.type === 'folder-pattern' && (!projectId || r.projectId === projectId))
  if (folderRules.length === 0) return null

  const titleLower = title.toLowerCase()
  const textLower = `${title} ${content || ''}`.toLowerCase()

  let bestMatch: typeof folderRules[0] | null = null
  let bestScore = 0

  for (const rule of folderRules) {
    let score = 0

    // 파일명 패턴 매칭 (가중치 높음)
    const titleHits = rule.titlePatterns.filter(p => titleLower.includes(p.toLowerCase()))
    score += titleHits.length * rule.weight * 2

    // 내용 키워드 매칭
    const keywordHits = rule.keywords.filter(kw => textLower.includes(kw.toLowerCase()))
    score += keywordHits.length * rule.weight

    if (score > bestScore) {
      bestScore = score
      bestMatch = rule
    }
  }

  // 최소 1개 이상 매칭되어야 함
  if (!bestMatch || bestScore < bestMatch.weight) return null

  // hitCount 증가
  import('@/services/db').then(({ incrementRuleHitCount }) => {
    incrementRuleHitCount(bestMatch!.id)
  })

  const confidence = Math.min(1.0, bestScore / (bestMatch.weight * 4))
  console.log(`[FolderPattern] "${title}" → "${bestMatch.folderName}" (점수: ${bestScore}, 신뢰도: ${(confidence * 100).toFixed(0)}%)`)

  return {
    folderId: bestMatch.folderId!,
    folderName: bestMatch.folderName!,
    category: bestMatch.toCategory,
    confidence,
  }
}

/**
 * 오분류 교정 규칙 적용 (correction 규칙)
 * detectCategory 결과에 학습된 교정 가중치를 적용
 */
async function getTopScores(title: string, content?: string): Promise<{
  category: FolderCategory
  confidence: number
  topScores: { category: string; label: string; score: number }[]
}> {
  const result = detectCategory(title, content)

  // correction 규칙만 적용
  const rules = await loadLearnedRules()
  const correctionRules = rules.filter(r => r.type === 'correction')

  if (correctionRules.length > 0) {
    const textToMatch = `${title} ${content || ''}`.toLowerCase()

    for (const rule of correctionRules) {
      // 파일명 패턴 + 내용 키워드 모두 체크
      const titleHits = rule.titlePatterns.filter(p => title.toLowerCase().includes(p.toLowerCase()))
      const keywordHits = rule.keywords.filter(kw => textToMatch.includes(kw.toLowerCase()))
      const totalHits = titleHits.length + keywordHits.length

      if (totalHits > 0) {
        const boost = totalHits * rule.weight
        // fromCategory 감점, toCategory 가점
        if (rule.fromCategory) {
          const fromScore = result.scores.get(rule.fromCategory) || 0
          result.scores.set(rule.fromCategory, Math.max(0, fromScore - boost * 0.5))
        }
        if (rule.toCategory) {
          const toScore = result.scores.get(rule.toCategory) || 0
          result.scores.set(rule.toCategory, toScore + boost)
        }

        import('@/services/db').then(({ incrementRuleHitCount }) => {
          incrementRuleHitCount(rule.id)
        })

        console.log(`[Correction] "${rule.sourceTitle}" 규칙 적용: ${rule.fromCategory}→${rule.toCategory} (매칭: ${[...titleHits, ...keywordHits].join(', ')})`)
      }
    }

    // best category 재계산
    let bestCategory: FolderCategory = 'other'
    let bestScore = 0
    let secondScore = 0
    for (const [cat, score] of result.scores) {
      if (score > bestScore) { secondScore = bestScore; bestScore = score; bestCategory = cat }
      else if (score > secondScore) secondScore = score
    }
    result.category = bestCategory
    if (bestScore > 0) {
      const absScore = Math.min(1.0, bestScore / 20)
      const gapRatio = secondScore > 0 ? (bestScore - secondScore) / bestScore : 1.0
      result.confidence = absScore * 0.6 + gapRatio * 0.4
    }
  }

  const sorted = [...result.scores.entries()]
    .filter(([, s]) => s > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([cat, score]) => ({
      category: cat,
      label: FOLDER_CATEGORY_LABELS[cat],
      score,
    }))

  return {
    category: result.category,
    confidence: result.confidence,
    topScores: sorted,
  }
}

/** Tier 3: AI 전담 분류 (규칙 결과 없이 AI가 독립 판단) */
async function classifyWithAI(
  title: string,
  content?: string,
): Promise<{ category: FolderCategory; tags: string[] }> {
  try {
    const provider = await getActiveProvider()
    if (!provider) return { category: 'other', tags: [] }

    const { aiService } = await import('@/services/ai-provider/aiService')
    const categories = Object.entries(FOLDER_CATEGORY_LABELS)
      .map(([key, label]) => `${key}(${label})`)
    const result = await aiService.classifyDocument(
      provider,
      `제목: ${title}\n\n내용:\n${content?.slice(0, 2000) || '(내용 없음)'}`,
      [],
      categories,
    )

    return { category: mapToFolderCategory(result.category), tags: result.tags || [] }
  } catch (err) {
    console.warn('[Tier3] AI 전담 분류 실패:', err)
    return { category: 'other', tags: [] }
  }
}

/** Tier 2: AI 2차 검증 (규칙 결과를 힌트로 제공하여 동의/교정) */
async function validateWithAI(
  title: string,
  content?: string,
  ruleResult?: {
    category: FolderCategory
    confidence: number
    topScores: { category: string; label: string; score: number }[]
  },
): Promise<{ category: FolderCategory; tags: string[] }> {
  if (!ruleResult) return classifyWithAI(title, content)

  try {
    const provider = await getActiveProvider()
    if (!provider) return { category: ruleResult.category, tags: [] }

    const { aiService } = await import('@/services/ai-provider/aiService')
    const categories = Object.entries(FOLDER_CATEGORY_LABELS)
      .map(([key, label]) => `${key}(${label})`)
    const result = await aiService.validateClassification(
      provider,
      `제목: ${title}\n\n내용:\n${content?.slice(0, 2000) || '(내용 없음)'}`,
      {
        category: ruleResult.category,
        confidence: ruleResult.confidence,
        topScores: ruleResult.topScores,
      },
      categories,
    )

    const mapped = mapToFolderCategory(result.category)
    console.log(
      `[Tier2] 규칙: ${ruleResult.category} → AI: ${mapped} (${result.agreed ? '동의' : '교정'})`
    )
    return { category: mapped, tags: result.tags || [] }
  } catch (err) {
    console.warn('[Tier2] AI 검증 실패, 규칙 결과 사용:', err)
    return { category: ruleResult.category, tags: [] }
  }
}

/**
 * 스마트 분류 — 신뢰도 기반 3단계 (v0.4.9)
 *
 * Tier 1: 신뢰도 >= 0.85 → 규칙 결과 확정 (AI 호출 없음)
 * Tier 2: 신뢰도 0.35~0.85 → AI가 규칙 결과를 검증/교정
 * Tier 3: 신뢰도 < 0.35 또는 'other' → AI가 독립 분류
 */
/**
 * 스마트 분류 — 학습 + 신뢰도 기반 4단계 (v0.5.0)
 *
 * Tier 0: 커스텀 폴더 패턴 매칭 (학습된 유저 패턴 우선)
 * Tier 1: 신뢰도 >= 0.85 → 규칙 결과 확정 (AI 호출 없음)
 * Tier 2: 신뢰도 0.35~0.85 → AI가 규칙 결과를 검증/교정
 * Tier 3: 신뢰도 < 0.35 또는 'other' → AI가 독립 분류
 */
export async function smartClassify(
  title: string,
  content?: string,
  projectId?: string,
): Promise<{
  category: FolderCategory
  tags: string[]
  suggestedFolderId?: string    // 커스텀 폴더 패턴 매칭 시
  suggestedFolderName?: string
}> {
  // ── Tier 0: 커스텀 폴더 패턴 매칭 ──
  const folderMatch = await matchFolderPattern(title, content, projectId)
  if (folderMatch && folderMatch.confidence >= 0.5) {
    console.log(`[Tier0] 커스텀 폴더 매칭: "${folderMatch.folderName}" (${(folderMatch.confidence * 100).toFixed(0)}%)`)
    return {
      category: folderMatch.category || 'other',
      tags: [],
      suggestedFolderId: folderMatch.folderId,
      suggestedFolderName: folderMatch.folderName,
    }
  }

  // ── Tier 1~3: 카테고리 기반 분류 ──
  const ruleResult = await getTopScores(title, content)

  // Tier 1: 높은 신뢰도 → 규칙 확정
  if (ruleResult.category !== 'other' && ruleResult.confidence >= TIER1_THRESHOLD) {
    console.log(`[Tier1] 규칙 확정: ${ruleResult.category} (${(ruleResult.confidence * 100).toFixed(0)}%)`)
    return { category: ruleResult.category, tags: [] }
  }

  // Tier 2: 중간 신뢰도 → AI 검증
  if (ruleResult.category !== 'other' && ruleResult.confidence >= TIER2_THRESHOLD) {
    console.log(`[Tier2] AI 검증 요청: ${ruleResult.category} (${(ruleResult.confidence * 100).toFixed(0)}%)`)
    return validateWithAI(title, content, ruleResult)
  }

  // Tier 3: 낮은 신뢰도 → AI 전담
  console.log(`[Tier3] AI 전담 분류 (규칙 신뢰도: ${(ruleResult.confidence * 100).toFixed(0)}%)`)
  const aiResult = await classifyWithAI(title, content)

  if (aiResult.category === 'other' && ruleResult.category !== 'other') {
    return { category: ruleResult.category, tags: [] }
  }

  return aiResult
}

// ═════════════════════════════════════════════════════════════
// 사용자 피드백 학습
// ═════════════════════════════════════════════════════════════

/**
 * 오분류 교정 학습 (type='correction')
 *
 * 카테고리 폴더 간 이동 시 호출.
 * AI가 오분류 원인을 분석하고 교정 규칙을 생성.
 */
export async function learnFromCategoryCorrection(
  documentTitle: string,
  documentContent: string,
  originalCategory: FolderCategory,
  correctedCategory: FolderCategory,
): Promise<LearnedRule | null> {
  if (originalCategory === correctedCategory) return null
  if (originalCategory === 'other') return null

  try {
    const provider = await getActiveProvider()
    if (!provider) {
      console.warn('[Learn:correction] AI provider 없음 — 학습 건너뜀')
      return null
    }

    const { aiService } = await import('@/services/ai-provider/aiService')
    const categories = Object.entries(FOLDER_CATEGORY_LABELS)
      .map(([key, label]) => `${key}(${label})`)

    const analysis = await aiService.analyzeMisclassification(
      provider,
      documentTitle,
      documentContent,
      `${originalCategory}(${FOLDER_CATEGORY_LABELS[originalCategory]})`,
      `${correctedCategory}(${FOLDER_CATEGORY_LABELS[correctedCategory]})`,
      categories,
    )

    if (analysis.keywords.length === 0) {
      console.warn('[Learn:correction] AI가 키워드를 생성하지 못함')
      return null
    }

    const rule: LearnedRule = {
      id: generateId(),
      type: 'correction',
      fromCategory: originalCategory,
      toCategory: correctedCategory,
      folderId: null,
      folderName: null,
      projectId: null,
      titlePatterns: [],
      keywords: analysis.keywords,
      weight: 8,
      reason: analysis.reason,
      sampleTitles: [documentTitle],
      sourceTitle: documentTitle,
      sourceContentSnippet: (documentContent || '').slice(0, 500),
      analysisPrompt: analysis.prompt,
      analysisResponse: analysis.response,
      hitCount: 0,
      createdAt: new Date(),
    }

    const { addLearnedRule } = await import('@/services/db')
    await addLearnedRule(rule)
    invalidateLearnedRulesCache()

    console.log(`[Learn:correction] "${documentTitle}" ${originalCategory}→${correctedCategory} (키워드: ${analysis.keywords.join(', ')})`)
    return rule
  } catch (err) {
    console.warn('[Learn:correction] 학습 실패:', err)
    return null
  }
}

/**
 * 커스텀 폴더 패턴 학습 (type='folder-pattern')
 *
 * 사용자가 파일을 커스텀 폴더(카테고리 없는 폴더)로 이동 시 호출.
 * AI가 폴더 내 기존 파일들과 새 파일의 패턴을 분석하여 규칙 생성.
 */
export async function learnFromFolderAssignment(
  documentTitle: string,
  documentContent: string,
  targetFolder: Folder,
  existingFileTitles: string[],
): Promise<LearnedRule | null> {
  try {
    const provider = await getActiveProvider()
    if (!provider) {
      console.warn('[Learn:folder] AI provider 없음 — 학습 건너뜀')
      return null
    }

    // 이미 이 폴더에 대한 규칙이 있으면 sampleTitles만 업데이트
    const rules = await loadLearnedRules()
    const existingRule = rules.find(
      r => r.type === 'folder-pattern' && r.folderId === targetFolder.id
    )
    if (existingRule) {
      // 샘플에 새 제목 추가 (최대 10개)
      const updatedSamples = [...new Set([...existingRule.sampleTitles, documentTitle])].slice(0, 10)
      const { addLearnedRule } = await import('@/services/db')
      await addLearnedRule({ ...existingRule, sampleTitles: updatedSamples })
      invalidateLearnedRulesCache()
      console.log(`[Learn:folder] "${targetFolder.name}" 규칙 업데이트 (샘플 ${updatedSamples.length}개)`)
      return existingRule
    }

    const { aiService } = await import('@/services/ai-provider/aiService')
    const analysis = await aiService.analyzeFolderPattern(
      provider,
      targetFolder.name,
      existingFileTitles,
      documentTitle,
      documentContent,
    )

    if (analysis.titlePatterns.length === 0 && analysis.keywords.length === 0) {
      console.warn('[Learn:folder] AI가 패턴을 추출하지 못함')
      return null
    }

    const rule: LearnedRule = {
      id: generateId(),
      type: 'folder-pattern',
      fromCategory: null,
      toCategory: null,
      folderId: targetFolder.id,
      folderName: targetFolder.name,
      projectId: targetFolder.projectId,
      titlePatterns: analysis.titlePatterns,
      keywords: analysis.keywords,
      weight: 10,
      reason: analysis.reason,
      sampleTitles: [...existingFileTitles.slice(0, 4), documentTitle],
      sourceTitle: documentTitle,
      sourceContentSnippet: (documentContent || '').slice(0, 500),
      analysisPrompt: analysis.prompt,
      analysisResponse: analysis.response,
      hitCount: 0,
      createdAt: new Date(),
    }

    const { addLearnedRule } = await import('@/services/db')
    await addLearnedRule(rule)
    invalidateLearnedRulesCache()

    console.log(`[Learn:folder] "${targetFolder.name}" 패턴 학습 (제목: ${analysis.titlePatterns.join(', ')} / 키워드: ${analysis.keywords.join(', ')})`)
    return rule
  } catch (err) {
    console.warn('[Learn:folder] 학습 실패:', err)
    return null
  }
}

/**
 * 통합 학습 트리거 — moveFile에서 호출
 *
 * 이전 폴더와 새 폴더를 비교하여 적절한 학습 유형을 자동 선택:
 * - 카테고리 폴더 → 카테고리 폴더: correction (오분류 교정)
 * - 어디서든 → 커스텀 폴더: folder-pattern (폴더 패턴)
 */
export async function learnFromUserCorrection(
  documentTitle: string,
  documentContent: string,
  oldFolder: Folder | null,
  newFolder: Folder,
  existingFileTitles: string[],
): Promise<LearnedRule | null> {
  // 커스텀 폴더(카테고리 없음)로 이동 → 폴더 패턴 학습
  if (!newFolder.category) {
    return learnFromFolderAssignment(
      documentTitle, documentContent, newFolder, existingFileTitles
    )
  }

  // 카테고리 폴더 간 이동 → 오분류 교정 학습
  if (oldFolder?.category && newFolder.category) {
    return learnFromCategoryCorrection(
      documentTitle, documentContent, oldFolder.category, newFolder.category
    )
  }

  return null
}

export async function ensureCategoryFolder(
  projectId: string,
  projectPath: string,
  category: FolderCategory,
  existingFolders: Folder[],
  addFolder: (folder: Folder) => Promise<void>,
): Promise<string> {
  const existing = existingFolders.find(
    (f) => f.projectId === projectId && f.category === category
  )
  if (existing) return existing.id

  const folderName = FOLDER_CATEGORY_LABELS[category]
  const folder: Folder = {
    id: generateId(),
    name: folderName,
    projectId,
    parentId: null,
    category,
    createdAt: new Date(),
  }

  if (projectPath) {
    try {
      await createSubFolderOnDisk(projectPath, folderName)
    } catch (err) {
      console.error('디스크 폴더 생성 실패:', err)
    }
  }

  await addFolder(folder)
  return folder.id
}
