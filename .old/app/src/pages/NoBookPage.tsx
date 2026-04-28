import { useNavigate } from 'react-router-dom';
import { Button } from '../components/ui/button';
import {
  SparkIcon,
  QuillIcon,
  BookIcon,
  PlusIcon,
} from '../components/business/shared/Icons';

type InfoBlock = {
  icon: React.ReactNode;
  title: string;
  description: string;
};

const INFO_BLOCKS: InfoBlock[] = [
  {
    icon: <BookIcon />,
    title: '长篇创作的专属工作台',
    description: '为每部书籍独立管理世界观、大纲、人物与章节，让复杂项目保持井然有序。',
  },
  {
    icon: <QuillIcon />,
    title: '手动创建',
    description: '填写书名、类型与简介，直接进入结构化编辑流程，完全掌控创作节奏。',
  },
  {
    icon: <SparkIcon />,
    title: 'AI 协作创建',
    description: '描述你的想法，AI 导演智能体将协助构思世界观与故事骨架，一键生成项目。',
  },
];

export function NoBookPage() {
  const navigate = useNavigate();

  return (
    <main className="flex-1 bg-background text-foreground h-screen overflow-hidden flex flex-col">
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-6 py-16 flex flex-col gap-12">
          <div className="flex flex-col gap-3">
            <p className="text-xs text-muted-foreground tracking-widest uppercase">
              Novel Local Studio
            </p>
            <h1 className="text-4xl font-semibold text-foreground leading-tight tracking-tight">
              开始你的创作
            </h1>
            <p className="text-base text-muted-foreground leading-relaxed max-w-md">
              新建第一部书籍，开启本地优先的长篇写作体验。
            </p>
            <div className="mt-2">
              <Button
                size="lg"
                onClick={() => navigate('/new-book')}
                className="gap-2"
              >
                <PlusIcon />
                新建书籍
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {INFO_BLOCKS.map((block) => (
              <div
                key={block.title}
                className="flex flex-col gap-2 rounded-xl border border-border bg-card p-5"
              >
                <span className="flex items-center justify-center size-8 rounded-md bg-muted text-muted-foreground">
                  {block.icon}
                </span>
                <p className="text-sm font-medium text-foreground leading-snug">
                  {block.title}
                </p>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {block.description}
                </p>
              </div>
            ))}
          </div>

          <p className="text-xs text-muted-foreground">
            创建完成后可在侧栏切换书籍，每部书籍拥有独立的概览、大纲、世界观与写作区。
          </p>
        </div>
      </div>
    </main>
  );
}
