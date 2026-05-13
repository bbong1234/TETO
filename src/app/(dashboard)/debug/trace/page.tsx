'use client';

import { Suspense, useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { token } from '@/design/loader';

// ═══════════════════════════════════════════════════════════
// 类型
// ═══════════════════════════════════════════════════════════

interface SpanNode {
  spanId: string;
  stage: string;
  stageIndex: number;
  status: string;
  inputSummary: string;
  outputSummary: string;
  durationMs: number;
  errorCode: string | null;
}

interface DiagnosisResult {
  traceId: string;
  status: string;
  breakPoint: {
    stage: number;
    stageName: string;
    spanId: string;
    errorCode: string | null;
    errorMessage: string | null;
    inputSummary: string;
    outputSummary: string;
    durationMs: number;
  } | null;
  spans: SpanNode[];
  relatedDecisions: unknown[];
  relatedRules: { ruleId: string; ruleCode: string; stage: string }[];
  suggestedFixes: { targetFile: string; targetFunction: string; errorCategory: string }[];
  aiPromptSummary: string;
}

// ═══════════════════════════════════════════════════════════
// 页面主体
// ═══════════════════════════════════════════════════════════

function TraceDebugContent() {
  const searchParams = useSearchParams();
  const traceId = searchParams.get('trace_id') ?? '';
  const [inputId, setInputId] = useState(traceId);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<DiagnosisResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchDiagnosis = async (id: string) => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/v2/diagnose?trace_id=${encodeURIComponent(id)}`);
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData?.error?.message ?? `HTTP ${res.status}`);
      }
      const json = await res.json();
      setResult(json.data as DiagnosisResult);
    } catch (e) {
      setError(e instanceof Error ? e.message : '请求失败');
      setResult(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (traceId) fetchDiagnosis(traceId);
  }, [traceId]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputId) {
      const url = new URL(window.location.href);
      url.searchParams.set('trace_id', inputId);
      window.history.pushState({}, '', url.toString());
      fetchDiagnosis(inputId);
    }
  };

  // ═══ 渲染 ═══

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ok': return token('color.semantic.success')!;
      case 'failed': return token('color.semantic.error')!;
      case 'partial': return token('color.semantic.warning')!;
      default: return token('color.neutral.500')!;
    }
  };

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', padding: '24px 16px', fontFamily: 'monospace', fontSize: 14, color: token('color.neutral.200'), background: token('color.neutral.900'), minHeight: '100vh' }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8, color: token('color.neutral.50') }}>Debug Trace</h1>
      <p style={{ color: token('color.neutral.400'), marginBottom: 24 }}>输入 trace_id 查看完整链路诊断。</p>

      <form onSubmit={handleSubmit} style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
        <input
          type="text"
          value={inputId}
          onChange={(e) => setInputId(e.target.value)}
          placeholder="trace_id (e.g. T-abc123)"
          style={{
            flex: 1, padding: '8px 12px', borderRadius: 6, border: `1px solid ${token('color.neutral.700')}`,
            background: token('color.neutral.800'), color: token('color.neutral.50'), fontSize: 14, fontFamily: 'monospace',
          }}
        />
        <button type="submit" disabled={loading} style={{
          padding: '8px 16px', borderRadius: 6, border: 'none', background: token('color.status.active'),
          color: '#fff', fontWeight: 600, cursor: 'pointer', fontFamily: 'monospace',
        }}>
          {loading ? '...' : '查询'}
        </button>
      </form>

      {error && (
        <div style={{ padding: 12, borderRadius: 6, background: token('color.semantic.error'), color: token('color.neutral.100'), marginBottom: 16 }}>
          {error}
        </div>
      )}

      {result && (
        <>
          {/* Status Bar */}
          <div style={{
            padding: 16, borderRadius: 6, marginBottom: 20, border: `2px solid ${getStatusColor(result.status)}`,
            background: token('color.neutral.800'),
          }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: getStatusColor(result.status) }}>
              {result.status.toUpperCase()} — {result.aiPromptSummary}
            </div>
          </div>

          {/* Break Point */}
          {result.breakPoint && (
            <section style={{ marginBottom: 24 }}>
              <h2 style={{ fontSize: 18, fontWeight: 700, color: token('color.semantic.error'), marginBottom: 12 }}>断点定位</h2>
              <div style={{ background: token('color.neutral.800'), borderRadius: 6, padding: 16 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <tbody>
                    {[
                      ['Stage', result.breakPoint.stageName],
                      ['Span ID', result.breakPoint.spanId],
                      ['Error Code', result.breakPoint.errorCode ?? '-'],
                      ['Error Message', result.breakPoint.errorMessage ?? '-'],
                      ['Duration', `${result.breakPoint.durationMs}ms`],
                      ['Input', result.breakPoint.inputSummary],
                      ['Output', result.breakPoint.outputSummary],
                    ].map(([label, value]) => (
                      <tr key={label} style={{ borderBottom: `1px solid ${token('color.neutral.700')}` }}>
                        <td style={{ padding: '6px 12px', color: token('color.neutral.400'), fontWeight: 600, whiteSpace: 'nowrap', verticalAlign: 'top' }}>{label}</td>
                        <td style={{ padding: '6px 12px', color: token('color.neutral.50'), wordBreak: 'break-all' }}>{value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* Spans */}
          <section style={{ marginBottom: 24 }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 12, color: token('color.neutral.50') }}>
              Span 树 ({result.spans.length} spans)
            </h2>
            {result.spans.map((span, i) => (
              <div key={span.spanId} style={{
                padding: '10px 16px', marginBottom: 4, borderRadius: 4,
                background: span.status === 'failed' ? `${token('color.semantic.error')}22` : span.status === 'partial' ? `${token('color.semantic.warning')}22` : token('color.neutral.800'),
                borderLeft: `4px solid ${getStatusColor(span.status)}`,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontWeight: 700, color: getStatusColor(span.status) }}>
                    [{span.stageIndex}] {span.stage}
                  </span>
                  <span style={{ color: token('color.neutral.400') }}>
                    {span.durationMs}ms — {span.spanId}
                  </span>
                </div>
                <div style={{ fontSize: 12, color: token('color.neutral.400') }}>
                  in: {span.inputSummary || '-'}
                </div>
                <div style={{ fontSize: 12, color: token('color.neutral.300') }}>
                  out: {span.outputSummary || '-'}
                </div>
                {span.errorCode && (
                  <div style={{ fontSize: 12, color: token('color.semantic.error'), marginTop: 4 }}>
                    ERR: {span.errorCode}
                  </div>
                )}
              </div>
            ))}
          </section>

          {/* Related Rules */}
          {result.relatedRules.length > 0 && (
            <section style={{ marginBottom: 24 }}>
              <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 12, color: token('color.neutral.50') }}>关联规则</h2>
              {result.relatedRules.map((rule) => (
                <div key={rule.ruleId} style={{ padding: '8px 12px', marginBottom: 4, borderRadius: 4, background: token('color.neutral.800') }}>
                  <span style={{ color: token('color.status.active'), fontWeight: 600 }}>{rule.ruleId}</span>
                  <span style={{ color: token('color.neutral.400'), marginLeft: 8 }}>{rule.ruleCode}</span>
                  <span style={{ color: token('color.neutral.500'), marginLeft: 8 }}>@ {rule.stage}</span>
                </div>
              ))}
            </section>
          )}

          {/* Suggested Fixes */}
          {result.suggestedFixes.length > 0 && (
            <section style={{ marginBottom: 24 }}>
              <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 12, color: token('color.neutral.50') }}>建议修复</h2>
              {result.suggestedFixes.map((fix, i) => (
                <div key={i} style={{ padding: '10px 16px', marginBottom: 4, borderRadius: 4, background: token('color.neutral.800') }}>
                  <div style={{ color: token('color.neutral.50'), fontWeight: 600 }}>{fix.targetFile}</div>
                  <div style={{ color: token('color.semantic.warning'), fontSize: 13, marginTop: 2 }}>{fix.targetFunction}</div>
                  <div style={{ color: token('color.neutral.400'), fontSize: 12, marginTop: 2 }}>类别: {fix.errorCategory}</div>
                </div>
              ))}
            </section>
          )}
        </>
      )}

      {!result && !loading && !error && (
        <div style={{ color: token('color.neutral.500'), padding: 40, textAlign: 'center' }}>
          输入 trace_id 并点击"查询"查看诊断结果
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// 外层 Suspense 包装（useSearchParams 需要）
// ═══════════════════════════════════════════════════════════

export default function TraceDebugPage() {
  return (
    <Suspense fallback={<div style={{ padding: 40, color: token('color.neutral.400'), fontFamily: 'monospace' }}>Loading...</div>}>
      <TraceDebugContent />
    </Suspense>
  );
}
