const quickActions = [
  {
    title: "记录今天",
    description: "填写每日核心行为数据",
    href: "/daily-record",
  },
  {
    title: "写复盘",
    description: "记录今天状态、情绪与总结",
    href: "/diary-review",
  },
  {
    title: "更新项目",
    description: "推进长期项目并查看预测",
    href: "/projects",
  },
  {
    title: "查看统计",
    description: "查看最近趋势与阶段结果",
    href: "/stats",
  },
];

const projectList = [
  {
    name: "英语单词计划",
    progress: 320,
    target: 1000,
    unit: "个",
    status: "正常",
    predictedDate: "2026-04-28",
  },
  {
    name: "TETO 1.0 开发",
    progress: 18,
    target: 100,
    unit: "功能点",
    status: "推进中",
    predictedDate: "2026-05-15",
  },
  {
    name: "运动恢复训练",
    progress: 12,
    target: 30,
    unit: "次",
    status: "需关注",
    predictedDate: "2026-04-10",
  },
];

const trendData = [
  { day: "03/14", score: 58 },
  { day: "03/15", score: 65 },
  { day: "03/16", score: 72 },
  { day: "03/17", score: 60 },
  { day: "03/18", score: 78 },
  { day: "03/19", score: 81 },
  { day: "03/20", score: 76 },
];

function getTodayText() {
  return new Date().toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  });
}

function getBarHeight(score: number) {
  return Math.max((score / 100) * 160, 20);
}

function getStatusClass(status: string) {
  if (status === "正常" || status === "推进中") {
    return "bg-emerald-100 text-emerald-700";
  }
  if (status === "需关注") {
    return "bg-amber-100 text-amber-700";
  }
  return "bg-slate-100 text-slate-700";
}

export default function Home() {
  const todayText = getTodayText();

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto max-w-7xl px-6 py-8 lg:px-8">
        {/* 顶部标题区 */}
        <section className="mb-8 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-sm font-medium text-slate-500">TETO 1.0 Dashboard</p>
              <h1 className="mt-2 text-4xl font-bold tracking-tight">每日记录 · 复盘 · 项目推进</h1>
              <p className="mt-3 text-sm text-slate-600">{todayText}</p>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-2xl bg-slate-100 px-4 py-3">
                <p className="text-xs text-slate-500">今日记录</p>
                <p className="mt-1 text-lg font-semibold text-emerald-600">未完成</p>
              </div>
              <div className="rounded-2xl bg-slate-100 px-4 py-3">
                <p className="text-xs text-slate-500">今日复盘</p>
                <p className="mt-1 text-lg font-semibold text-amber-600">待填写</p>
              </div>
              <div className="rounded-2xl bg-slate-100 px-4 py-3">
                <p className="text-xs text-slate-500">今日得分</p>
                <p className="mt-1 text-lg font-semibold">76</p>
              </div>
              <div className="rounded-2xl bg-slate-100 px-4 py-3">
                <p className="text-xs text-slate-500">进行中项目</p>
                <p className="mt-1 text-lg font-semibold">3</p>
              </div>
            </div>
          </div>
        </section>

        {/* 快捷操作 */}
        <section className="mb-8">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xl font-semibold">快捷操作</h2>
            <span className="text-sm text-slate-500">先把主闭环跑通</span>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {quickActions.map((item) => (
              <a
                key={item.title}
                href={item.href}
                className="group rounded-3xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md"
              >
                <div className="flex h-full flex-col justify-between">
                  <div>
                    <h3 className="text-lg font-semibold">{item.title}</h3>
                    <p className="mt-2 text-sm leading-6 text-slate-600">{item.description}</p>
                  </div>
                  <div className="mt-6 text-sm font-medium text-slate-900 group-hover:text-blue-600">
                    进入 →
                  </div>
                </div>
              </a>
            ))}
          </div>
        </section>

        <div className="grid gap-8 xl:grid-cols-[1.2fr_0.8fr]">
          {/* 左侧 */}
          <div className="space-y-8">
            {/* 今日摘要 */}
            <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="mb-5 flex items-center justify-between">
                <h2 className="text-xl font-semibold">今日摘要</h2>
                <span className="text-sm text-slate-500">Dashboard 核心反馈区</span>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-2xl bg-slate-50 p-5">
                  <p className="text-sm text-slate-500">每日记录摘要</p>
                  <div className="mt-4 space-y-2 text-sm text-slate-700">
                    <p>新学单词：30 个</p>
                    <p>读书：40 分钟</p>
                    <p>运动：25 分钟</p>
                    <p>起床时间：07:10</p>
                  </div>
                </div>

                <div className="rounded-2xl bg-slate-50 p-5">
                  <p className="text-sm text-slate-500">复盘摘要</p>
                  <div className="mt-4 space-y-2 text-sm text-slate-700">
                    <p>状态：一般</p>
                    <p>情绪：平静</p>
                    <p>最重要推进：完成首页环境跑通</p>
                    <p>最大问题：初始化阶段报错较多</p>
                  </div>
                </div>

                <div className="rounded-2xl bg-slate-50 p-5">
                  <p className="text-sm text-slate-500">时间结构简版</p>
                  <div className="mt-4 space-y-2 text-sm text-slate-700">
                    <p>学习时间：110 分钟</p>
                    <p>运动时间：25 分钟</p>
                    <p>娱乐时间：40 分钟</p>
                    <p>睡眠估算：7.5 小时</p>
                  </div>
                </div>

                <div className="rounded-2xl bg-slate-50 p-5">
                  <p className="text-sm text-slate-500">提醒</p>
                  <div className="mt-4 space-y-2 text-sm text-slate-700">
                    <p>• 今日复盘还未正式提交</p>
                    <p>• TETO 1.0 项目可继续补基础布局</p>
                    <p>• 建议下一步接入导航与静态页面</p>
                  </div>
                </div>
              </div>
            </section>

            {/* 最近趋势 */}
            <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="mb-5 flex items-center justify-between">
                <h2 className="text-xl font-semibold">最近 7 日趋势</h2>
                <span className="text-sm text-slate-500">先做简版趋势占位</span>
              </div>

              <div className="flex h-64 items-end justify-between gap-3 rounded-2xl bg-slate-50 p-4">
                {trendData.map((item) => (
                  <div key={item.day} className="flex flex-1 flex-col items-center justify-end">
                    <div className="mb-2 text-xs text-slate-500">{item.score}</div>
                    <div
                      className="w-full max-w-[48px] rounded-t-2xl bg-blue-500 transition-all"
                      style={{ height: `${getBarHeight(item.score)}px` }}
                    />
                    <div className="mt-3 text-xs text-slate-500">{item.day}</div>
                  </div>
                ))}
              </div>
            </section>
          </div>

          {/* 右侧 */}
          <div className="space-y-8">
            {/* 项目概览 */}
            <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="mb-5 flex items-center justify-between">
                <h2 className="text-xl font-semibold">项目概览</h2>
                <a href="/projects" className="text-sm font-medium text-blue-600 hover:text-blue-700">
                  查看全部
                </a>
              </div>

              <div className="space-y-4">
                {projectList.map((project) => {
                  const percent = project.target
                    ? Math.min((project.progress / project.target) * 100, 100)
                    : 0;

                  return (
                    <div
                      key={project.name}
                      className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <h3 className="font-semibold">{project.name}</h3>
                          <p className="mt-1 text-sm text-slate-600">
                            {project.progress} / {project.target} {project.unit}
                          </p>
                        </div>

                        <span
                          className={`rounded-full px-3 py-1 text-xs font-medium ${getStatusClass(
                            project.status
                          )}`}
                        >
                          {project.status}
                        </span>
                      </div>

                      <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-slate-200">
                        <div
                          className="h-full rounded-full bg-slate-900"
                          style={{ width: `${percent}%` }}
                        />
                      </div>

                      <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
                        <span>完成度 {percent.toFixed(0)}%</span>
                        <span>预计完成：{project.predictedDate}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* 基础预测摘要 */}
            <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="mb-5 flex items-center justify-between">
                <h2 className="text-xl font-semibold">基础预测摘要</h2>
                <span className="text-sm text-slate-500">1.0 简版</span>
              </div>

              <div className="space-y-4">
                <div className="rounded-2xl bg-slate-50 p-4">
                  <p className="text-sm text-slate-500">单词累计预测</p>
                  <p className="mt-2 text-2xl font-bold">30 天后约 900 个</p>
                  <p className="mt-1 text-sm text-slate-600">
                    按当前日均节奏估算，未来可继续上升。
                  </p>
                </div>

                <div className="rounded-2xl bg-slate-50 p-4">
                  <p className="text-sm text-slate-500">项目完成预测</p>
                  <p className="mt-2 text-2xl font-bold">TETO 1.0 预计 5 月中旬完成</p>
                  <p className="mt-1 text-sm text-slate-600">
                    当前仍处于基础建设阶段，后续取决于页面开发速度。
                  </p>
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}