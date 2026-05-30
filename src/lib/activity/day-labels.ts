function todayDateStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function resolveDayLabels(date: string): {
  timelineTitle: string;
  statsTitle: string;
  timelineEmpty: string;
} {
  const today = todayDateStr();
  if (date === today) {
    return {
      timelineTitle: '今日时间线',
      statsTitle: '今日统计',
      timelineEmpty: '今天还没有记录。添加计划、想法或开始第一件事后会显示在这里。',
    };
  }

  const target = new Date(`${date}T12:00:00`);
  const todayNoon = new Date(`${today}T12:00:00`);
  const diffDays = Math.round((todayNoon.getTime() - target.getTime()) / 86400000);

  if (diffDays === 1) {
    return {
      timelineTitle: '昨日时间线',
      statsTitle: '昨日统计',
      timelineEmpty: '昨天还没有记录。',
    };
  }
  if (diffDays === -1) {
    return {
      timelineTitle: '明日时间线',
      statsTitle: '明日统计',
      timelineEmpty: '明天还没有记录。',
    };
  }

  const display = date.replace(/-/g, '/');
  return {
    timelineTitle: `${display} 时间线`,
    statsTitle: `${display} 统计`,
    timelineEmpty: '该日还没有记录。',
  };
}
