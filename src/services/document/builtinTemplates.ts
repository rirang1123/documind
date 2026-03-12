export interface BuiltinTemplate {
  id: string
  name: string
  category: string
  content: string
}

export const BUILTIN_TEMPLATES: BuiltinTemplate[] = [
  {
    id: 'tpl-report',
    name: '업무 보고서',
    category: '업무',
    content: '<h1>업무 보고서</h1><h2>1. 개요</h2><p>보고 기간과 목적을 작성하세요.</p><h2>2. 주요 업무 내용</h2><p>수행한 업무를 기술하세요.</p><h2>3. 성과 및 결과</h2><p>업무 성과를 정리하세요.</p><h2>4. 향후 계획</h2><p>다음 기간 계획을 작성하세요.</p>',
  },
  {
    id: 'tpl-meeting',
    name: '회의록',
    category: '업무',
    content: '<h1>회의록</h1><h2>회의 정보</h2><p><strong>일시:</strong> </p><p><strong>장소:</strong> </p><p><strong>참석자:</strong> </p><h2>안건</h2><p>회의 안건을 작성하세요.</p><h2>논의 내용</h2><p>주요 논의 사항을 기록하세요.</p><h2>결정 사항</h2><p>결정된 사항을 정리하세요.</p><h2>향후 일정</h2><p>다음 일정을 기입하세요.</p>',
  },
  {
    id: 'tpl-proposal',
    name: '기획서',
    category: '기획',
    content: '<h1>기획서</h1><h2>1. 프로젝트 개요</h2><p>프로젝트 배경과 목적을 설명하세요.</p><h2>2. 목표</h2><p>달성하고자 하는 목표를 구체적으로 작성하세요.</p><h2>3. 세부 계획</h2><h3>3.1 일정</h3><p>주요 마일스톤과 일정을 기입하세요.</p><h3>3.2 예산</h3><p>예상 비용을 정리하세요.</p><h3>3.3 인력</h3><p>필요한 인력 구성을 작성하세요.</p><h2>4. 기대 효과</h2><p>기대되는 성과를 설명하세요.</p>',
  },
  {
    id: 'tpl-email-formal',
    name: '공식 이메일',
    category: '커뮤니케이션',
    content: '<p>수신: </p><p>참조: </p><p>제목: </p><br/><p>안녕하세요,</p><br/><p>본문 내용을 작성하세요.</p><br/><p>감사합니다.</p><p>[이름]</p><p>[직함/부서]</p>',
  },
  {
    id: 'tpl-weekly',
    name: '주간 보고서',
    category: '업무',
    content: '<h1>주간 보고서</h1><p><strong>기간:</strong> 20XX.XX.XX ~ 20XX.XX.XX</p><h2>이번 주 완료 사항</h2><ul><li>항목 1</li><li>항목 2</li></ul><h2>진행 중</h2><ul><li>항목 1</li></ul><h2>다음 주 계획</h2><ul><li>항목 1</li></ul><h2>이슈 및 건의</h2><p>특이사항을 기록하세요.</p>',
  },
  {
    id: 'tpl-resume',
    name: '이력서',
    category: '개인',
    content: '<h1>이력서</h1><h2>인적사항</h2><p><strong>이름:</strong> </p><p><strong>연락처:</strong> </p><p><strong>이메일:</strong> </p><h2>학력</h2><p>학력 정보를 작성하세요.</p><h2>경력</h2><p>경력 사항을 기입하세요.</p><h2>자격증 / 스킬</h2><p>보유 자격증과 기술을 나열하세요.</p><h2>자기소개</h2><p>간단한 자기소개를 작성하세요.</p>',
  },
]
