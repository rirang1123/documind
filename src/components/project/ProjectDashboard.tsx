import { useMemo } from 'react';
import { BarChart3, FileText, FolderOpen, Clock, HardDrive } from 'lucide-react';
import { useAppStore } from '@/stores/useAppStore';
import type { FileType } from '@/types';

const TYPE_LABELS: Record<FileType, string> = {
  docx: '문서', xlsx: '스프레드시트', pptx: '프레젠테이션',
  hwp: 'HWP', pdf: 'PDF', txt: '텍스트', md: '마크다운', unknown: '기타',
};

const TYPE_COLORS: Record<FileType, string> = {
  docx: 'bg-blue-500', xlsx: 'bg-green-500', pptx: 'bg-orange-500',
  hwp: 'bg-teal-500', pdf: 'bg-red-500', txt: 'bg-gray-500', md: 'bg-purple-500', unknown: 'bg-slate-400',
};

export default function ProjectDashboard() {
  const { selectedProjectId, projects, files, folders } = useAppStore();
  const project = projects.find(p => p.id === selectedProjectId);

  const stats = useMemo(() => {
    if (!selectedProjectId) return null;

    const projectFiles = files;
    const totalSize = projectFiles.reduce((sum, f) => sum + (f.size || 0), 0);

    // Type distribution
    const typeCounts: Partial<Record<FileType, number>> = {};
    projectFiles.forEach(f => {
      typeCounts[f.type] = (typeCounts[f.type] || 0) + 1;
    });

    // Recent activity (last 7 days)
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const recentFiles = projectFiles.filter(f => new Date(f.updatedAt) > weekAgo);

    // Most recent file
    const mostRecent = projectFiles.length > 0
      ? projectFiles.reduce((latest, f) =>
          new Date(f.updatedAt) > new Date(latest.updatedAt) ? f : latest
        )
      : null;

    return {
      fileCount: projectFiles.length,
      folderCount: folders.length,
      totalSize,
      typeCounts,
      recentCount: recentFiles.length,
      mostRecent,
    };
  }, [selectedProjectId, files, folders]);

  if (!project || !stats) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        <p className="text-sm">프로젝트를 선택하세요.</p>
      </div>
    );
  }

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const maxCount = Math.max(...Object.values(stats.typeCounts), 1);

  return (
    <div className="h-full overflow-auto p-6">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center gap-2 mb-6">
          <BarChart3 className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold">{project.name} - 프로젝트 통계</h2>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <div className="rounded-lg border border-border p-4 bg-card">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <FileText className="h-4 w-4" />
              <span className="text-xs">파일 수</span>
            </div>
            <p className="text-2xl font-bold">{stats.fileCount}</p>
          </div>
          <div className="rounded-lg border border-border p-4 bg-card">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <FolderOpen className="h-4 w-4" />
              <span className="text-xs">폴더 수</span>
            </div>
            <p className="text-2xl font-bold">{stats.folderCount}</p>
          </div>
          <div className="rounded-lg border border-border p-4 bg-card">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <HardDrive className="h-4 w-4" />
              <span className="text-xs">총 용량</span>
            </div>
            <p className="text-2xl font-bold">{formatSize(stats.totalSize)}</p>
          </div>
          <div className="rounded-lg border border-border p-4 bg-card">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Clock className="h-4 w-4" />
              <span className="text-xs">최근 7일 활동</span>
            </div>
            <p className="text-2xl font-bold">{stats.recentCount}</p>
          </div>
        </div>

        {/* File Type Distribution */}
        <div className="rounded-lg border border-border p-4 bg-card mb-6">
          <h3 className="text-sm font-semibold mb-4">파일 타입 분포</h3>
          {Object.entries(stats.typeCounts).length === 0 ? (
            <p className="text-sm text-muted-foreground">파일이 없습니다.</p>
          ) : (
            <div className="space-y-2">
              {Object.entries(stats.typeCounts).map(([type, count]) => (
                <div key={type} className="flex items-center gap-3">
                  <span className="text-xs w-24 text-muted-foreground">{TYPE_LABELS[type as FileType] || type}</span>
                  <div className="flex-1 h-5 bg-muted rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${TYPE_COLORS[type as FileType] || 'bg-slate-400'} transition-all`}
                      style={{ width: `${(count / maxCount) * 100}%` }}
                    />
                  </div>
                  <span className="text-xs font-medium w-8 text-right">{count}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Most Recent File */}
        {stats.mostRecent && (
          <div className="rounded-lg border border-border p-4 bg-card">
            <h3 className="text-sm font-semibold mb-2">최근 수정 파일</h3>
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm">{stats.mostRecent.name}</span>
              <span className="text-xs text-muted-foreground ml-auto">
                {new Date(stats.mostRecent.updatedAt).toLocaleDateString('ko-KR')}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
