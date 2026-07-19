'use client';

import { useRef, useState, type RefObject } from 'react';
import type { Item, Record as TetoRecord, Tag, UserTool } from '@/types/teto';
import type { UserRule } from '@/lib/db/user-rules';
import type { PlanPriority } from '@/lib/activity/plan-priority';
import type {
  ActivitySwitchPayload,
  SessionActionPayload,
} from '@/lib/activity/records-mutation';
import { useDelayedVisible } from '@/hooks/use-delayed-visible';
import { useMinLg } from '@/hooks/use-min-lg';
import { usePersistedRatio } from '@/hooks/use-persisted-ratio';
import ResizableSplit from '@/components/ui/ResizableSplit';
import TodayActivityTimeline from './TodayActivityTimeline';
import CurrentActivityCard from './CurrentActivityCard';
import DiaryActivityCreatePanel from './DiaryActivityCreatePanel';
import RecordsDiaryFooter from './RecordsDiaryFooter';
import DiaryTimelineConnector from './DiaryTimelineConnector';
import { RecordsDayContentSkeleton } from '@/components/ui/PageSkeletons';

interface RecordsPageBodyProps {
  diaryMode: boolean;
  diaryCreateOpen: boolean;
  isOnToday: boolean;
  singleDayDate: string;
  todayStr: string;
  timelineScrollRef: RefObject<HTMLDivElement | null>;
  recordsLoading: boolean;
  recordsCount: number;
  timelineRecords: TetoRecord[];
  singleDayRecords: TetoRecord[];
  allRecords: TetoRecord[];
  items: Item[];
  itemsLoading: boolean;
  tags: Tag[];
  userRules: UserRule[];
  userTools: UserTool[];
  toolsLoading: boolean;
  pageReady: boolean;
  refreshKey: number;
  inBlockSession: boolean;
  timingPanelsExpanded: boolean;
  isRecordDeleted: (id: string) => boolean;
  onDiaryAddRecord: () => void;
  onRecordClick: (record: TetoRecord) => void;
  onPlanComplete: (record: TetoRecord) => void;
  onRecordDeleted: (id: string) => void;
  onDeleteFailed: (record: TetoRecord) => void;
  onError: (message: string) => void;
  onRecordAdded: (record: TetoRecord, replaceOptimistic?: boolean) => void;
  onPlanCompleteFromCard: (record: TetoRecord) => void;
  onPlanPriorityChange: (record: TetoRecord, priority: PlanPriority | null) => void | Promise<void>;
  onItemsChange: () => void | Promise<void>;
  onItemCreated: (item: Item) => void;
  onTagCreated: (tag: Tag) => void;
  onActivitySwitch: (data: ActivitySwitchPayload) => void;
  onFallbackRefresh: () => void;
  onRecordPatched: (record: TetoRecord) => void;
  onSessionAction: (data: SessionActionPayload) => void;
  onToolsChange: (tools: UserTool[]) => void;
  onTimingPanelsExpandedChange: (expanded: boolean) => void;
}

function TimelineSection({
  timelineScrollRef,
  recordsLoading,
  recordsCount,
  children,
}: {
  timelineScrollRef: RefObject<HTMLDivElement | null>;
  recordsLoading: boolean;
  recordsCount: number;
  children: React.ReactNode;
}) {
  return (
    <div ref={timelineScrollRef} className="flex min-h-0 flex-1 flex-col overflow-hidden py-4">
      {recordsLoading && recordsCount === 0 ? <RecordsDayContentSkeleton /> : children}
    </div>
  );
}

export default function RecordsPageBody({
  diaryMode,
  diaryCreateOpen,
  isOnToday,
  singleDayDate,
  todayStr,
  timelineScrollRef,
  recordsLoading,
  recordsCount,
  timelineRecords,
  singleDayRecords,
  allRecords,
  items,
  itemsLoading,
  tags,
  userRules,
  userTools,
  toolsLoading,
  pageReady,
  refreshKey,
  inBlockSession,
  timingPanelsExpanded,
  isRecordDeleted,
  onDiaryAddRecord,
  onRecordClick,
  onPlanComplete,
  onRecordDeleted,
  onDeleteFailed,
  onError,
  onRecordAdded,
  onPlanCompleteFromCard,
  onPlanPriorityChange,
  onItemsChange,
  onItemCreated,
  onTagCreated,
  onActivitySwitch,
  onFallbackRefresh,
  onRecordPatched,
  onSessionAction,
  onToolsChange,
  onTimingPanelsExpandedChange,
}: RecordsPageBodyProps) {
  const layoutRootRef = useRef<HTMLDivElement>(null);
  const [focusedRecordId, setFocusedRecordId] = useState<string | null>(null);
  const isLg = useMinLg();
  const [mainColRatio, setMainColRatio] = usePersistedRatio('records-layout-main-col', 0.58);
  const [leftRowRatio, setLeftRowRatio] = usePersistedRatio('records-layout-left-row', 0.58);
  const diaryPanelMounted = useDelayedVisible(diaryMode);
  const showActivityCard = isOnToday;
  const activityExpanded = isOnToday && !diaryMode;
  const activityCardMounted = useDelayedVisible(activityExpanded);
  const showTimelineAddRecord = diaryMode;
  const createPanelOpen = diaryMode && diaryCreateOpen;
  const createPanelMounted = useDelayedVisible(createPanelOpen);

  const timeline = (
    <TodayActivityTimeline
      records={timelineRecords}
      date={singleDayDate}
      items={items}
      onRecordClick={onRecordClick}
      onPlanComplete={onPlanComplete}
      onRecordDeleted={onRecordDeleted}
      onDeleteFailed={onDeleteFailed}
      onError={onError}
      showAddRecord={showTimelineAddRecord}
      onAddRecord={onDiaryAddRecord}
      focusedRecordId={focusedRecordId}
      onFocusRecord={setFocusedRecordId}
    />
  );

  const activityCard = (
    <CurrentActivityCard
      items={items}
      itemsLoading={itemsLoading}
      pageReady={pageReady}
      refreshKey={refreshKey}
      isRecordDeleted={isRecordDeleted}
      userTools={userTools}
      toolsLoading={toolsLoading}
      onToolsChange={onToolsChange}
      onActivitySwitch={onActivitySwitch}
      onRecordAdded={onRecordAdded}
      onRecordDeleted={onRecordDeleted}
      onFallbackRefresh={onFallbackRefresh}
      onItemsChanged={onItemsChange}
      onItemCreated={onItemCreated}
      onCreateError={onError}
      onError={onError}
      todayRecords={singleDayRecords}
      todayDate={todayStr}
      quickSwitchRecords={allRecords.filter((r) => r.type === '发生')}
      tags={tags}
      onPlanComplete={onPlanCompleteFromCard}
      onPlanPriorityChange={onPlanPriorityChange}
      onTagCreated={onTagCreated}
      userRules={userRules}
      onRecordPatched={onRecordPatched}
      onSessionAction={onSessionAction}
      drawerExpanded={inBlockSession ? timingPanelsExpanded : undefined}
      onDrawerExpandedChange={inBlockSession ? onTimingPanelsExpandedChange : undefined}
    />
  );

  const createPanel = createPanelMounted ? (
    <DiaryActivityCreatePanel
      key={singleDayDate}
      date={singleDayDate}
      items={items}
      itemsLoading={itemsLoading}
      tags={tags}
      userRules={userRules}
      dayRecords={singleDayRecords}
      onRecordAdded={onRecordAdded}
      onPlanComplete={onPlanCompleteFromCard}
      onPlanPriorityChange={onPlanPriorityChange}
      onItemsChange={onItemsChange}
      onItemCreated={onItemCreated}
      onTagCreated={onTagCreated}
      onCreateError={onError}
      onError={onError}
    />
  ) : null;

  const timelineBlock = (
    <div className="records-panel-surface flex h-full min-h-0 flex-col">
      <TimelineSection
        timelineScrollRef={timelineScrollRef}
        recordsLoading={recordsLoading}
        recordsCount={recordsCount}
      >
        <div key={singleDayDate} className="records-day-enter h-full min-h-0">
          {timeline}
        </div>
      </TimelineSection>
    </div>
  );

  const leftBottomPanel =
    createPanelOpen && createPanel
      ? createPanel
      : activityExpanded && activityCardMounted && showActivityCard
        ? activityCard
        : null;

  const leftColumn = (
    <ResizableSplit
      direction="vertical"
      ratio={leftRowRatio}
      onRatioChange={setLeftRowRatio}
      first={timelineBlock}
      second={
        leftBottomPanel ? (
          <div className="records-panel-surface flex h-full min-h-0 flex-col overflow-y-auto px-1 py-2">
            {leftBottomPanel}
          </div>
        ) : null
      }
      minFirstPx={160}
      minSecondPx={140}
      handleLabel="拖动调整时间线与输入区"
      className="min-h-0 flex-1"
    />
  );

  const diaryPanel =
    diaryPanelMounted && diaryMode ? (
      <div className="records-panel-surface flex h-full min-h-0 flex-col overflow-hidden">
        <RecordsDiaryFooter
          date={singleDayDate}
          dayRecords={singleDayRecords}
          onError={onError}
          onRecordPatched={onRecordPatched}
          focusedRecordId={focusedRecordId}
          onFocusRecord={setFocusedRecordId}
          layout="panel"
        />
      </div>
    ) : null;

  return (
    <div
      ref={layoutRootRef}
      className="records-page-layout relative flex h-full min-h-0 flex-1 flex-col"
      data-diary={diaryMode ? 'true' : 'false'}
    >
      <DiaryTimelineConnector
        active={diaryMode}
        focusedRecordId={focusedRecordId}
        layoutRootRef={layoutRootRef}
      />

      {diaryMode ? (
        <ResizableSplit
          direction={isLg ? 'horizontal' : 'vertical'}
          ratio={mainColRatio}
          onRatioChange={setMainColRatio}
          first={leftColumn}
          second={diaryPanel}
          minFirstPx={isLg ? 280 : 180}
          minSecondPx={isLg ? 300 : 200}
          handleLabel="拖动调整时间线与日记区"
          className="min-h-0 flex-1"
          firstClassName="flex min-h-0 min-w-0 flex-col"
          secondClassName="flex min-h-0 min-w-0 flex-col"
        />
      ) : (
        <div className="flex min-h-0 min-h-[40vh] flex-1 flex-col lg:min-h-0">{leftColumn}</div>
      )}
    </div>
  );
}
