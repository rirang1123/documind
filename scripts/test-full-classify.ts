/**
 * 4단계 분류 시스템 성능 테스트
 * - Tier 1: 규칙 확정 (신뢰도 >= 85%)
 * - Tier 2/3: AI 검증/전담 → 결과를 JSON으로 출력하여 Haiku Agent가 처리
 *
 * 실행: npx tsx scripts/test-full-classify.ts
 */
import fs from 'fs'
import path from 'path'
import mammoth from 'mammoth'

type FolderCategory = 'planning' | 'evaluation' | 'report' | 'reference' | 'meeting' | 'contract' | 'finance' | 'other'

const LABELS: Record<FolderCategory, string> = {
  planning: '기획', evaluation: '평가', report: '보고', reference: '참고자료',
  meeting: '회의', contract: '계약', finance: '재무', other: '기타',
}

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

// ── detectCategory 핵심 로직 (test-classify.ts에서 가져옴) ──
// 여기서는 import 대신 inline으로 포함 (브라우저 모듈 회피)

// (detectCategory는 test-classify.ts에서 별도 테스트)

async function main() {
  const testDir = path.resolve('test_docs')
  const files = fs.readdirSync(testDir).filter(f => f.endsWith('.docx')).sort()

  // 텍스트 추출
  const docs: { file: string; title: string; text: string }[] = []
  for (const file of files) {
    const buf = fs.readFileSync(path.join(testDir, file))
    const r = await mammoth.extractRawText({ buffer: buf })
    docs.push({
      file,
      title: file.replace('.docx', ''),
      text: (r.value || '').slice(0, 3000),
    })
  }

  // AI 분류 요청 데이터를 JSON 파일로 출력
  const aiRequests = docs.map(d => ({
    file: d.title,
    title: d.title,
    content: d.text.slice(0, 1500),
    expected: EXPECTED[d.title] || 'other',
  }))

  const outPath = path.resolve('scripts/test-docs-data.json')
  fs.writeFileSync(outPath, JSON.stringify(aiRequests, null, 2), 'utf-8')
  console.log(`${docs.length}개 문서 데이터 추출 → ${outPath}`)
}

main().catch(console.error)
