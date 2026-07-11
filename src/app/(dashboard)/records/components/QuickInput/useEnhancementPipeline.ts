'use client';

import type { Item } from '@/types/teto';
import type { ClarificationIssue, SharedContextItem } from '@/types/semantic';
import { matchItemSmart } from '@/lib/utils/item-match';
import { buildUnitUpdate } from '@/lib/activity/build-unit-update';

/**
 * 记录增强管道 hook。
 * 不调用 LLM，基于预解析的 unit 数据运行完整的后处理管道。
 * 包含：事项匹配、子项匹配、归属检测、metric_prompt、metric_name 对齐、共享时长检测、时间合理性校验。
 */
export function useEnhancementPipeline(items: Item[]) {
  /** metric_name 对齐：把记录的 metric_name 对齐到该事项目标里最接近的 metric_name */
  const alignMetricName = async (recordId: string, itemId: string, currentMetricName: string) => {
    try {
      const res = await fetch(`/api/v2/goals?item_id=${itemId}`);
      if (!res.ok) return;
      const json = await res.json();
      const goals: Array<{ metric_name: string | null; rule_type: string }> = json.data ?? [];
      const candidates = goals
        .filter(g => (g.rule_type === '周期性达成' || g.rule_type === '周期性限制') && g.metric_name)
        .map(g => g.metric_name as string);
      if (candidates.length === 0) return;

      const needle = currentMetricName.toLowerCase();
      let aligned = candidates.find(c => c.toLowerCase() === needle);
      if (!aligned) aligned = candidates.find(c => c.toLowerCase().includes(needle) || needle.includes(c.toLowerCase()));
      if (!aligned || aligned === currentMetricName) return;

      await fetch(`/api/v2/records/${recordId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ metric_name: aligned }),
      });
    } catch (err) {
      console.error('metric_name 对齐失败:', err);
    }
  };

  /** 从单个 unit 构建更新载荷（AI 增强用，不覆盖用户已输入的内容和量化字段） */
  const buildUnitUpdateForRecord = buildUnitUpdate;

  /** Auto-Threading（已废弃，保留空函数避免调用方报错） */
  const applyAutoThreading = async (_update: Record<string, unknown>, _unit: Record<string, unknown>) => {
    // 已移除
  };

  /** 记录增强管道（从 enhanceWithAi 提取，可被拆分记录复用） */
  const enhanceRecordPipeline = async (
    recordId: string,
    unit: Record<string, unknown>,
    inputText: string,
    _date: string,
    options?: {
      resolvedSubItemId?: string | null;
      confidence?: number;
      existingUpdate?: Record<string, unknown>;
    }
  ): Promise<ClarificationIssue[]> => {
    const clarifyIssues: ClarificationIssue[] = [];
    const inputLower = inputText.toLowerCase();
    const existingUpdate = options?.existingUpdate || {};

    // --- 1. 事项匹配 ---
    const itemSuggestIssues: ClarificationIssue[] = [];
    const resolvedItemId0 = (existingUpdate.item_id as string | undefined) ?? undefined;

    if (!resolvedItemId0) {
      const itemHint = typeof unit.item_hint === 'string' ? unit.item_hint.trim() : '';
      if (itemHint) {
        const matchResult = matchItemSmart(itemHint, items, inputText);
        if (matchResult) {
          if (matchResult.confidence === 'high') {
            await fetch(`/api/v2/records/${recordId}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ item_id: matchResult.itemId }),
            });
            existingUpdate.item_id = matchResult.itemId;
          } else {
            itemSuggestIssues.push({
              type: 'item_suggestion', unitIndex: 0,
              message: `这条记录是否属于事项「${matchResult.itemTitle}」？`,
              reason: `AI推测可能与「${matchResult.itemTitle}」相关，但不确定`,
              options: [
                { label: matchResult.itemTitle, value: matchResult.itemId },
                { label: '不属于任何事项', value: 'none' },
              ],
            });
          }
        }
      }
      if (!itemHint) {
        const fallbackResult = matchItemSmart('', items, inputText);
        if (fallbackResult && fallbackResult.confidence === 'medium') {
          itemSuggestIssues.push({
            type: 'item_suggestion', unitIndex: 0,
            message: `这条记录是否属于事项「${fallbackResult.itemTitle}」？`,
            reason: `检测到输入中包含「${fallbackResult.itemTitle}」相关关键词`,
            options: [
              { label: fallbackResult.itemTitle, value: fallbackResult.itemId },
              { label: '不属于任何事项', value: 'none' },
            ],
          });
        }
      }
    }

    // --- 2. 子项自动匹配 ---
    const resolvedItemId = (existingUpdate.item_id as string | undefined) ?? undefined;
    let autoMatchedSubItemId: string | undefined;
    if (resolvedItemId) {
      try {
        const subRes = await fetch(`/api/v2/sub-items?item_id=${resolvedItemId}`);
        if (subRes.ok) {
          const subJson = await subRes.json();
          const subs: Array<{ id: string; title: string }> = subJson.data || [];
          if (subs.length > 0) {
            let subMatch: { id: string; title: string } | undefined;

            const subItemHint = typeof unit.sub_item_hint === 'string' ? unit.sub_item_hint : '';
            if (subItemHint) {
              const hintLower = subItemHint.toLowerCase();
              subMatch = subs.find(s => s.title.toLowerCase() === hintLower)
                || subs.find(s => s.title.toLowerCase().includes(hintLower) || hintLower.includes(s.title.toLowerCase()));
            }
            if (!subMatch) {
              const action = typeof unit.action === 'string' ? unit.action : '';
              if (action) {
                const actionLower = action.toLowerCase();
                subMatch = subs.find(s => s.title.toLowerCase().includes(actionLower));
              }
            }
            if (!subMatch) {
              const metricName = typeof unit.metric === 'object' && unit.metric !== null
                ? (unit.metric as Record<string, unknown>).name as string | undefined
                : undefined;
              if (metricName) {
                const metricLower = metricName.toLowerCase();
                subMatch = subs.find(s => s.title.toLowerCase() === metricLower)
                  || subs.find(s => s.title.toLowerCase().includes(metricLower))
                  || subs.find(s => metricLower.includes(s.title.toLowerCase()) && s.title.length >= 2);
              }
            }

            if (subMatch) {
              autoMatchedSubItemId = subMatch.id;
              await fetch(`/api/v2/records/${recordId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sub_item_id: subMatch.id }),
              });
            }
          }
        }
      } catch { /* 子项匹配失败不影响主流程 */ }
    }

    // --- 3. 子项归属检测 ---
    const subItemClarifyIssues: ClarificationIssue[] = [];
    if (resolvedItemId && !autoMatchedSubItemId && !options?.resolvedSubItemId) {
      try {
        const subCheckRes = await fetch(`/api/v2/sub-items?item_id=${resolvedItemId}`);
        if (subCheckRes.ok) {
          const subCheckJson = await subCheckRes.json();
          const subCheckItems: Array<{ id: string; title: string }> = subCheckJson.data || [];
          if (subCheckItems.length > 0) {
            const recCheckRes = await fetch(`/api/v2/records/${recordId}`);
            if (recCheckRes.ok) {
              const recCheckJson = await recCheckRes.json();
              const existingSubItemId = recCheckJson.data?.sub_item_id;
              if (!existingSubItemId) {
                subItemClarifyIssues.push({
                  type: 'sub_item_ambiguous', unitIndex: 0,
                  message: '请选择这条记录属于哪个子项',
                  reason: `事项「${items.find(it => it.id === resolvedItemId)?.title || ''}」有${subCheckItems.length}个子项，需要指定归属`,
                  options: subCheckItems.map(s => ({ label: s.title, value: s.id })),
                });
              }
            }
          }
        }
      } catch { /* 子项归属检测失败不影响主流程 */ }
    }

    // --- 4. metric_prompt 收集 ---
    const metricPromptIssues: ClarificationIssue[] = [];
    const hasSubItemAmbiguous = subItemClarifyIssues.some(i => i.type === 'sub_item_ambiguous');
    if (resolvedItemId && !hasSubItemAmbiguous) {
      try {
        let recordHasMetricValue = false;
        const recMetricRes = await fetch(`/api/v2/records/${recordId}`);
        if (recMetricRes.ok) {
          const recMetricJson = await recMetricRes.json();
          recordHasMetricValue = recMetricJson.data?.metric_value != null;
        }

        if (!recordHasMetricValue) {
          const goalRes = await fetch(`/api/v2/goals?item_id=${resolvedItemId}&status=进行中`);
          if (goalRes.ok) {
            const goalJson = await goalRes.json();
            const activeGoals: Array<{
              id: string; title: string; rule_type: string;
              metric_name: string | null; unit: string | null; target_min: number | null;
              sub_item_id: string | null;
            }> = (goalJson.data || []).filter((g: Record<string, unknown>) =>
              g.rule_type === '一次性完成' || g.rule_type === '周期性达成'
            );

            const effectiveSubItemId = options?.resolvedSubItemId ?? autoMatchedSubItemId ?? null;
            const filteredGoals = activeGoals.filter(g =>
              g.sub_item_id === null || g.sub_item_id === effectiveSubItemId
            );

            for (const goal of filteredGoals) {
              const displayMetricName = goal.metric_name || goal.title;
              metricPromptIssues.push({
                type: 'metric_prompt', unitIndex: 0,
                message: `请填写「${displayMetricName}」的完成数量`,
                reason: `事项关联了量化目标「${goal.title}」${goal.target_min ? `，目标 ${goal.target_min}${goal.unit || ''}` : ''}`,
                metricGoalId: goal.id,
                metricName: displayMetricName,
                metricUnit: goal.unit || undefined,
                metricDailyTarget: goal.target_min ?? undefined,
              });
            }
          }
        }
      } catch { /* 量化目标提示失败不影响主流程 */ }
    }

    // --- 5. metric_name 对齐 ---
    if (resolvedItemId) {
      const localMetricName = typeof unit.metric === 'object' && unit.metric !== null
        ? (unit.metric as Record<string, unknown>).name as string | undefined
        : undefined;
      try {
        const recRes = await fetch(`/api/v2/records/${recordId}`);
        if (recRes.ok) {
          const recJson = await recRes.json();
          const savedMetricName: string | null = recJson.data?.metric_name ?? null;
          const metricNameToAlign = savedMetricName || localMetricName;
          if (metricNameToAlign) {
            await alignMetricName(recordId, resolvedItemId, metricNameToAlign);
          }
        }
      } catch { /* 对齐失败不影响主流程 */ }
    }

    // --- 6. 共享时长检测 ---
    const sharedDuration = (unit as Record<string, unknown>).shared_context as Array<SharedContextItem> | null | undefined;
    const sharedDurItem = sharedDuration?.find(sc => sc.field === 'duration_minutes');
    if (sharedDurItem) {
      clarifyIssues.push({
        type: 'shared_duration', unitIndex: 0,
        message: `"${sharedDurItem.raw}"无法确定如何分配`,
        reason: `原话中"${sharedDurItem.raw}"无法确定属于哪个子行动`,
        sharedContext: sharedDurItem,
      });
    }

    // --- 6.5. 时间合理性校验 ---
    const timeText = typeof unit.time_text === 'string' ? unit.time_text : '';
    const timePeriodMap: Record<string, string[]> = {
      '早上': ['6', '7', '8', '9', '10', '11'],
      '上午': ['6', '7', '8', '9', '10', '11'],
      '中午': ['11', '12', '13'],
      '下午': ['13', '14', '15', '16', '17', '18'],
      '傍晚': ['17', '18', '19'],
      '晚上': ['18', '19', '20', '21', '22', '23'],
      '凌晨': ['0', '1', '2', '3', '4', '5'],
    };
    const inputPeriods = Object.keys(timePeriodMap).filter(p => inputLower.includes(p));
    const hourMatch = timeText.match(/(\d{1,2}):(\d{2})/);
    if (inputPeriods.length > 0 && hourMatch) {
      const parsedHour = parseInt(hourMatch[1], 10);
      const inputPeriod = inputPeriods[0];
      const validHours = timePeriodMap[inputPeriod];
      if (validHours && !validHours.includes(String(parsedHour))) {
        clarifyIssues.push({
          type: 'low_confidence', unitIndex: 0,
          message: `时间可能不正确：输入"${inputPeriod}"但解析为${hourMatch[1]}:${hourMatch[2]}`,
          reason: `"${inputPeriod}"通常对应${validHours[0]}:00-${validHours[validHours.length - 1]}:59，解析结果可能不合理`,
        });
      }
    }

    // --- 7. 按优先级收集所有澄清问题 ---
    if (subItemClarifyIssues.length > 0) clarifyIssues.push(...subItemClarifyIssues);
    const metricObj = (unit as Record<string, unknown>).metric as Record<string, unknown> | null;
    const metricName = metricObj?.name as string | undefined;
    if (metricName && resolvedItemId) {
      try {
        const subRes4Clarify = await fetch(`/api/v2/sub-items?item_id=${resolvedItemId}`);
        if (subRes4Clarify.ok) {
          const subJson4Clarify = await subRes4Clarify.json();
          const clarifySubItems: Array<{ id: string; title: string }> = subJson4Clarify.data || [];
          if (clarifySubItems.length > 1) {
            const needle = metricName.toLowerCase();
            const matchedSubs = clarifySubItems.filter(s =>
              s.title.toLowerCase().includes(needle) || needle.includes(s.title.toLowerCase())
            );
            if (matchedSubs.length > 1) {
              clarifyIssues.push({
                type: 'sub_item_ambiguous', unitIndex: 0,
                message: `"${metricName}"属于哪个子项？`,
                reason: `"${metricName}"同时匹配到${matchedSubs.map(s => '"' + s.title + '"').join('和')}两个子项`,
                options: matchedSubs.map(s => ({ label: s.title, value: s.id })),
              });
            }
          }
        }
      } catch { /* 获取子项失败不影响主流程 */ }
    }
    if (itemSuggestIssues.length > 0) clarifyIssues.push(...itemSuggestIssues);
    if (metricPromptIssues.length > 0) clarifyIssues.push(...metricPromptIssues);
    const confidence = options?.confidence ?? 1;
    if (clarifyIssues.length === 0 && confidence < 0.7) {
      const fc = (unit as Record<string, unknown>).field_confidence as Record<string, string> | undefined;
      const guessFields = fc ? Object.entries(fc).filter(([, v]) => v === 'guess').map(([k]) => k) : [];
      if (guessFields.length > 0 || !(unit as Record<string, unknown>).action) {
        const fieldNameMap: Record<string, string> = {
          action_text: '行为', event_text: '事件', object_text: '对象',
          cause_text: '原因', result_text: '结果', cost: '花费',
          duration_minutes: '时长', location: '地点', mood: '心情',
        };
        const uncertainFields = guessFields.map(f => fieldNameMap[f] || f).join('、');
        clarifyIssues.push({
          type: 'low_confidence', unitIndex: 0,
          message: uncertainFields ? `AI 不太确定以下字段：${uncertainFields}` : '部分信息AI不太确定',
          reason: uncertainFields ? `字段 ${uncertainFields} 是AI猜测的，可能不准确` : '输入过于模糊，AI无法准确识别关键字段',
        });
      }
    }

    return clarifyIssues;
  };

  return { enhanceRecordPipeline, buildUnitUpdate, alignMetricName, applyAutoThreading };
}
