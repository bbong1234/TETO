'use client';

import { useRef } from 'react';
import { genTraceId } from '@/lib/observability/id-registry';
import { jsonHeadersWithTrace, parseClientApiJson } from '@/lib/observability/client-request';
import type { Item } from '@/types/teto';
import type { ParsedSemantic, ClarificationNeeded, ClarificationIssue } from '@/types/semantic';
import { generateContentSummary } from '@/lib/utils/generate-content-summary';
import { matchItemSmart } from '@/lib/utils/item-match';
import type { useEnhancementPipeline } from './useEnhancementPipeline';

interface SplitPreviewData {
  recordId: string;
  inputText: string;
  date: string;
  units: Array<Record<string, unknown>>;
  typeHints: string[];
  batchId: string;
}

interface UseAiEnhanceOptions {
  items: Item[];
  onAiStart?: (recordId: string) => void;
  onAiDone?: (recordId: string) => void;
  onRecordCreated: () => void;
  pipeline: ReturnType<typeof useEnhancementPipeline>;
  setSplitPreview: (preview: SplitPreviewData | null) => void;
  setClarification: (c: ClarificationNeeded | null) => void;
  setDurationInputs: (fn: (prev: Record<string, string>) => Record<string, string>) => void;
  setSelectedClarifyOption: (fn: (prev: Record<string, string>) => Record<string, string>) => void;
  setMetricInputValues: (fn: (prev: Record<string, string>) => Record<string, string>) => void;
  clarificationTimeoutRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>;
}

/**
 * 异步 AI 增强 hook。
 * 支持复合句拆分：若 AI 返回多个 units，自动创建额外记录并建立关联。
 */
export function useAiEnhance(options: UseAiEnhanceOptions) {
  const {
    items, onAiStart, onAiDone, onRecordCreated,
    pipeline,
    setSplitPreview, setClarification,
    setDurationInputs, setSelectedClarifyOption, setMetricInputValues,
    clarificationTimeoutRef,
  } = options;

  const lastInteractionRef = useRef(Date.now());

  /** 从时间关键词解析目标日期 */
  const resolveAnchorDate = (rawAnchor: string, baseDate: string): string | null => {
    const today = new Date(baseDate);
    if (rawAnchor.includes('明天')) {
      const d = new Date(today); d.setDate(d.getDate() + 1);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }
    if (rawAnchor.includes('后天')) {
      const d = new Date(today); d.setDate(d.getDate() + 2);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }
    if (rawAnchor.includes('昨天')) {
      const d = new Date(today); d.setDate(d.getDate() - 1);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }
    return null;
  };

  const enhanceWithAi = async (recordId: string, inputText: string, date: string, chainTraceId?: string) => {
    const traceId = chainTraceId ?? genTraceId();
    const aiHdr = jsonHeadersWithTrace(traceId);
    onAiStart?.(recordId);
    try {
      // --- 获取近 3 天记录作为近期记忆上下文 ---
      let recentRecords: Array<{ id: string; content: string; date: string; type: string }> | undefined;
      try {
        const now = new Date();
        const threeDaysAgo = new Date(now);
        threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
        const fmtDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        const fromDate = fmtDate(threeDaysAgo);
        const toDate = fmtDate(now);
        const recentRes = await fetch(`/api/v2/records?date_from=${fromDate}&date_to=${toDate}`, {
          headers: { 'x-trace-id': traceId },
        });
        if (recentRes.ok) {
          const recentJson = await recentRes.json();
          if (Array.isArray(recentJson.data)) {
            recentRecords = recentJson.data.map((r: Record<string, unknown>) => ({
              id: r.id as string,
              content: r.content as string,
              date: r.date as string,
              type: r.type as string,
            }));
          }
        }
      } catch { /* 获取近期记录失败不影响主流程 */ }

      const parseRes = await fetch('/api/v2/parse', {
        method: 'POST',
        headers: aiHdr,
        body: JSON.stringify({
          input: inputText,
          date,
          recent_records: recentRecords,
          items: items.map(i => ({ id: i.id, title: i.title })),
        }),
      });
      if (!parseRes.ok) return;
      const parseJson = await parseRes.json();
      const env = parseClientApiJson(parseJson);
      const payload = env.data as {
        parsed: { is_compound: boolean; units: Array<Record<string, unknown>>; relations: unknown[]; confidence: number };
        type_hints: string[];
      } | undefined;
      if (!payload?.parsed) return;

      const llmResult = payload.parsed;
      const type_hints = payload.type_hints ?? [];

      const unit = llmResult.units[0];
      if (!unit) return;

      console.log('[AI增强] unit原始字段:', {
        action_text: unit.action_text, event_text: unit.event_text, object_text: unit.object_text,
        cause_text: unit.cause_text, result_text: unit.result_text,
        state: unit.state, body_state: unit.body_state,
        outcome_type: unit.outcome_type, outcome_direction: unit.outcome_direction,
        time_text: unit.time_text, time_precision: unit.time_precision,
        place_type: unit.place_type, money_direction: unit.money_direction,
        place_text: unit.place_text, location: unit.location,
      });

      const batchId = llmResult.is_compound && llmResult.units.length > 1
        ? crypto.randomUUID()
        : undefined;

      // --- 第一条记录：更新原记录 ---
      const update = pipeline.buildUnitUpdate(unit, type_hints[0], batchId);
      await pipeline.applyAutoThreading(update, unit);
      update.parsed_semantic = unit;

      // --- 事项匹配 ---
      const itemHint = typeof unit.item_hint === 'string' ? unit.item_hint.trim() : '';
      if (itemHint) {
        const matchResult = matchItemSmart(itemHint, items, inputText);
        if (matchResult && matchResult.confidence === 'high') {
          update.item_id = matchResult.itemId;
        }
      }
      if (!itemHint) {
        const fallbackResult = matchItemSmart('', items, inputText);
        if (fallbackResult && fallbackResult.confidence === 'high') {
          update.item_id = fallbackResult.itemId;
        }
      }

      // 复合句拆分时：清除主记录上由本地解析错误设置的专属字段
      if (batchId && llmResult.units.length > 1) {
        if ((unit.cost == null && unit.money_amount == null) && !('cost' in update)) {
          update.cost = null;
        }
        if (unit.duration_minutes == null && !('duration_minutes' in update)) {
          update.duration_minutes = null;
        }
      }

      const aiSummary = generateContentSummary(unit as unknown as ParsedSemantic, inputText);
      if (aiSummary && aiSummary !== inputText) {
        update.content = aiSummary;
      }

      // 处理第一条记录的 time_anchor
      if (unit.time_anchor && typeof unit.time_anchor === 'object') {
        const anchor = unit.time_anchor as Record<string, unknown>;
        if (anchor.direction === 'future' || anchor.direction === 'past') {
          const rawAnchor = typeof anchor.raw === 'string' ? anchor.raw : '';
          const resolvedDate = resolveAnchorDate(rawAnchor, date);
          if (resolvedDate && resolvedDate !== date) {
            update.time_anchor_date = resolvedDate;
          }
        }
      }

      if (Object.keys(update).length > 0) {
        console.log('[AI增强] buildUnitUpdate结果:', JSON.stringify(update, null, 2));
        const putRes = await fetch(`/api/v2/records/${recordId}`, {
          method: 'PUT',
          headers: aiHdr,
          body: JSON.stringify(update),
        });
        if (!putRes.ok) {
          console.error('[AI增强] PUT失败:', putRes.status, await putRes.text());
        }
      } else {
        console.warn('[AI增强] buildUnitUpdate返回空对象，无可写入字段');
      }

      // --- AI 语义关联 + 双向数据互补 ---
      if (unit.record_link_hint && typeof unit.record_link_hint === 'object') {
        const hint = unit.record_link_hint as { target_id?: string; link_type?: string; reason?: string };
        const shouldCreateLink = hint.target_id && (() => {
          const lt = hint.link_type || 'related_to';
          if (lt === 'completes' || lt === 'derived_from' || lt === 'postponed_from') return true;
          if (lt === 'related_to' && hint.reason) {
            const timeWords = ['昨天', '前天', '昨天', '上次', '之前', '之前那次', '那次', '早上的', '上午的', '下午的', '晚上的'];
            return timeWords.some(w => hint.reason!.includes(w));
          }
          return false;
        })();

        if (shouldCreateLink) {
          try {
            await fetch('/api/v2/record-links', {
              method: 'POST',
              headers: aiHdr,
              body: JSON.stringify({
                source_id: recordId,
                target_id: hint.target_id,
                link_type: hint.link_type || 'related_to',
              }),
            });
          } catch { /* 关联创建失败静默处理 */ }

          // 双向数据互补
          try {
            const targetRes = await fetch(`/api/v2/records/${hint.target_id}`, { headers: { 'x-trace-id': traceId } });
            if (targetRes.ok) {
              const targetJson = await targetRes.json();
              const target = targetJson.data as Record<string, unknown> | null;
              if (target) {
                const complementFields = [
                  'cost', 'location', 'people', 'mood', 'energy',
                  'duration_minutes', 'item_id'
                ] as const;

                const currentFields: Record<string, unknown> = { ...update };

                const complementForCurrent: Record<string, unknown> = {};
                for (const f of complementFields) {
                  const targetVal = target[f];
                  const currentVal = currentFields[f];
                  if (targetVal != null && (currentVal == null || currentVal === '')) {
                    if (f === 'people') {
                      if (Array.isArray(targetVal) && targetVal.length > 0) complementForCurrent[f] = targetVal;
                    } else {
                      complementForCurrent[f] = targetVal;
                    }
                  }
                }
                if (Object.keys(complementForCurrent).length > 0) {
                  await fetch(`/api/v2/records/${recordId}`, {
                    method: 'PUT',
                    headers: aiHdr,
                    body: JSON.stringify(complementForCurrent),
                  });
                }

                const complementForTarget: Record<string, unknown> = {};
                for (const f of complementFields) {
                  const currentVal = currentFields[f];
                  const targetVal = target[f];
                  if (currentVal != null && currentVal !== '' && (targetVal == null || targetVal === '')) {
                    if (f === 'people') {
                      if (Array.isArray(currentVal) && currentVal.length > 0) complementForTarget[f] = currentVal;
                    } else {
                      complementForTarget[f] = currentVal;
                    }
                  }
                }
                if (Object.keys(complementForTarget).length > 0) {
                  await fetch(`/api/v2/records/${hint.target_id}`, {
                    method: 'PUT',
                    headers: aiHdr,
                    body: JSON.stringify(complementForTarget),
                  });
                }
              }
            }
          } catch (err) {
            console.error('双向互补失败:', err);
          }
        }
      }

      // --- 复合句：直接展示拆分预览 ---
      if (batchId && llmResult.units.length > 1) {
        setSplitPreview({
          recordId,
          inputText,
          date,
          units: llmResult.units as Array<Record<string, unknown>>,
          typeHints: type_hints,
          batchId,
        });
        onRecordCreated();
        return;
      }

      // --- 非复合句：调用完整增强管道，收集澄清问题 ---
      const pipelineIssues = await pipeline.enhanceRecordPipeline(recordId, unit, inputText, date, {
        confidence: llmResult.confidence,
        existingUpdate: update,
      });

      if (pipelineIssues.length > 0) {
        const clarify: ClarificationNeeded = {
          cardType: pipelineIssues.some(i => i.type === 'shared_duration')
            ? 'split'
            : pipelineIssues.some(i => i.type === 'sub_item_ambiguous')
              ? 'attribution'
              : 'clarify',
          recordId,
          recordIds: [recordId],
          issues: pipelineIssues,
          timestamp: Date.now(),
          originalInput: inputText,
        };

        const timeSinceInteraction = Date.now() - lastInteractionRef.current;
        if (timeSinceInteraction <= 15000) {
          setClarification(clarify);
          const tid = setTimeout(() => {
            setClarification(null);
            setDurationInputs(() => ({}));
            setSelectedClarifyOption(() => ({}));
            setMetricInputValues(() => ({}));
          }, 30000);
          clarificationTimeoutRef.current = tid;
        }
      }

      onRecordCreated();
    } catch (err) {
      console.error('AI 解析失败:', err);
    } finally {
      onAiDone?.(recordId);
    }
  };

  return { enhanceWithAi, lastInteractionRef };
}
