import React from "react";
import { ChevronDown, ChevronUp, Loader2, Filter, Calendar } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { RECORD_ITEMS } from "@/constants/record-items";
import type { TimeRange, ItemTrendData } from "../types";

interface FixedBehaviorSectionProps {
  isLoading: boolean;
  fixedBehaviorRange: TimeRange;
  itemRanges: Record<string, TimeRange>;
  itemTrends: Record<string, Record<TimeRange, ItemTrendData[]>>;
  itemFilterText: string;
  selectedItems: Set<string>;
  selectedItemKeys: string[];
  collapsed: boolean;
  collapsedSections: Record<string, boolean>;
  onToggle: () => void;
  onFixedBehaviorRangeChange: (range: TimeRange) => void;
  onItemRangeChange: (itemKey: string, range: TimeRange) => void;
  onItemFilterChange: (text: string) => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onToggleItemSelection: (itemKey: string) => void;
  onToggleItemCollapse: (itemKey: string) => void;
  getFilteredItemKeys: () => string[];
}

export function FixedBehaviorSection({ 
  isLoading, 
  fixedBehaviorRange, 
  itemRanges, 
  itemTrends, 
  itemFilterText, 
  selectedItems, 
  selectedItemKeys, 
  collapsed, 
  collapsedSections, 
  onToggle, 
  onFixedBehaviorRangeChange, 
  onItemRangeChange, 
  onItemFilterChange, 
  onSelectAll, 
  onDeselectAll, 
  onToggleItemSelection, 
  onToggleItemCollapse, 
  getFilteredItemKeys 
}: FixedBehaviorSectionProps) {
  const filteredItemKeys = getFilteredItemKeys();

  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden mb-6">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between p-5 sm:p-6 hover:bg-slate-50 transition-colors"
      >
        <h2 className="text-lg font-semibold text-slate-800">固定行为项趋势</h2>
        {collapsed ? (
          <ChevronDown className="h-5 w-5 text-slate-400" />
        ) : (
          <ChevronUp className="h-5 w-5 text-slate-400" />
        )}
      </button>
      {!collapsed && (
        <div className="px-5 sm:px-6 pb-5 sm:pb-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
            </div>
          ) : Object.keys(itemTrends).length === 0 ? (
            <div className="text-center py-16">
              <p className="text-slate-600">暂无数据</p>
            </div>
          ) : (
            <>
              {/* 固定行为项区块时间范围切换器 - 只影响区块默认时间 */}
              <div className="mb-4 p-4 rounded-xl bg-slate-50">
                <div className="flex items-center gap-2 mb-2">
                  <Calendar className="h-4 w-4 text-slate-500" />
                  <span className="text-sm font-medium text-slate-700">区块默认时间范围</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => onFixedBehaviorRangeChange("7days")}
                    className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${fixedBehaviorRange === "7days" ? "bg-slate-900 text-white" : "bg-white text-slate-900 ring-1 ring-slate-200 hover:bg-slate-50"}`}
                  >
                    最近 7 天
                  </button>
                  <button
                    onClick={() => onFixedBehaviorRangeChange("30days")}
                    className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${fixedBehaviorRange === "30days" ? "bg-slate-900 text-white" : "bg-white text-slate-900 ring-1 ring-slate-200 hover:bg-slate-50"}`}
                  >
                    最近 30 天
                  </button>
                </div>
              </div>
              
              {/* 筛选和勾选控制区 */}
              <div className="mb-4 p-4 rounded-xl bg-slate-50 space-y-3">
                <div className="flex items-center gap-2">
                  <Filter className="h-4 w-4 text-slate-500" />
                  <span className="text-sm font-medium text-slate-700">筛选与显示控制</span>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <input
                    type="text"
                    placeholder="搜索行为项..."
                    value={itemFilterText}
                    onChange={(e) => onItemFilterChange(e.target.value)}
                    className="flex-1 min-w-[150px] rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 outline-none transition-colors focus:border-blue-400"
                  />
                  <button
                    onClick={onSelectAll}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors"
                  >
                    全选
                  </button>
                  <button
                    onClick={onDeselectAll}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors"
                  >
                    全不选
                  </button>
                  <span className="text-xs text-slate-500">
                    已选 {selectedItems.size} / {selectedItemKeys.length} 项
                  </span>
                </div>
              </div>

              {/* 分项列表 */}
              <div className="space-y-4">
                {filteredItemKeys.map(itemKey => {
                  const itemConfig = RECORD_ITEMS.find(item => item.key === itemKey);
                  if (!itemConfig) return null;
                  
                  // 单项时间优先使用自己的设置，否则使用区块默认时间
                  const itemRange = itemRanges[itemKey] || fixedBehaviorRange;
                  const trendData = itemTrends[itemKey]?.[itemRange];
                  if (!trendData || trendData.length === 0) return null;
                  const isSelected = selectedItems.has(itemKey);
                  const isCollapsed = collapsedSections[itemKey];

                  return (
                    <div key={itemKey} className="border border-slate-100 rounded-xl overflow-hidden">
                      {/* 分项头部：可折叠、可勾选、时间范围切换 */}
                      <div className="flex items-center gap-3 p-3 bg-slate-50">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => onToggleItemSelection(itemKey)}
                          className="h-4 w-4 rounded border-slate-300 text-blue-500 focus:ring-blue-400"
                        />
                        {/* 项目名称和收缩按钮区域 */}
                        <button
                          type="button"
                          onClick={() => onToggleItemCollapse(itemKey)}
                          className="flex-1 flex items-center justify-between text-left"
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-slate-700">{itemConfig.name}</span>
                            <span className="text-xs text-slate-400">{itemConfig.unit}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            {isCollapsed ? (
                              <ChevronDown className="h-4 w-4 text-slate-400" />
                            ) : (
                              <ChevronUp className="h-4 w-4 text-slate-400" />
                            )}
                          </div>
                        </button>
                        {/* 时间范围切换按钮 - 独立区域，阻止事件冒泡 */}
                        <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onItemRangeChange(itemKey, "7days");
                            }}
                            className={`rounded px-2 py-1 text-xs font-medium transition-all ${(itemRanges[itemKey] || fixedBehaviorRange) === "7days" ? "bg-slate-700 text-white" : "bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50"}`}
                          >
                            7天
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onItemRangeChange(itemKey, "30days");
                            }}
                            className={`rounded px-2 py-1 text-xs font-medium transition-all ${(itemRanges[itemKey] || fixedBehaviorRange) === "30days" ? "bg-slate-700 text-white" : "bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50"}`}
                          >
                            30天
                          </button>
                        </div>
                      </div>
                      
                      {/* 分项内容：勾选且未折叠时显示 */}
                      {isSelected && !isCollapsed && (
                        <div className="p-3 h-48">
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={trendData}>
                              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                              <XAxis dataKey="date" stroke="#64748b" />
                              <YAxis stroke="#64748b" />
                              <Tooltip 
                                formatter={(value) => [value, itemConfig.name]}
                                labelFormatter={(label) => `日期: ${label}`}
                              />
                              <Bar dataKey={itemKey} fill="#3b82f6" radius={[4, 4, 0, 0]} />
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      )}
                      
                      {/* 未勾选时的提示 */}
                      {!isSelected && (
                        <div className="p-3 text-center text-xs text-slate-400">
                          未勾选，不显示图表
                        </div>
                      )}
                    </div>
                  );
                })}
                
                {filteredItemKeys.length === 0 && (
                  <div className="text-center py-8 text-sm text-slate-500">
                    没有匹配的行为项
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
}
