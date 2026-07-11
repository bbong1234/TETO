/** 轻量 Markdown 渲染（无外部依赖） */

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function renderSimpleMarkdown(text: string): string {
  if (!text.trim()) return '';

  let html = escapeHtml(text);

  // 代码块
  html = html.replace(/```([\s\S]*?)```/g, '<pre class="rounded bg-slate-100 px-2 py-1 text-[11px] overflow-x-auto"><code>$1</code></pre>');
  // 行内代码
  html = html.replace(/`([^`]+)`/g, '<code class="rounded bg-slate-100 px-1 text-[11px]">$1</code>');
  // 粗体
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  // 斜体
  html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  // 无序列表行
  html = html.replace(/^- (.+)$/gm, '<li class="ml-3 list-disc">$1</li>');
  // 换行
  html = html.replace(/\n/g, '<br />');

  return html;
}
