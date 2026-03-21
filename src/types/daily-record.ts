export type DailyRecord = {
  id: string;
  user_id: string;
  record_date: string;
  note: string | null;
  total_score: number | null;
  completion_rate: number | null;
  created_at: string;
  updated_at: string;
};

export type DailyRecordItem = {
  id: string;
  daily_record_id: string;
  item_key: string;
  item_name: string;
  value_number: number | null;
  value_duration: number | null;
  value_time: string | null;
  value_text: string | null;
  unit: string | null;
  sort_order: number | null;
  created_at: string;
  updated_at: string;
};

export type DailyRecordWithItems = DailyRecord & {
  items: DailyRecordItem[];
};

export type DailyRecordFormValues = {
  recordDate: string;
  note: string;
  items: {
    vocab_new?: number;
    vocab_review?: number;
    study_practice?: number;
    reading?: number;
    listening?: number;
    speaking?: number;
    exercise?: number;
    meditation?: number;
    entertainment?: number;
    method_task?: number;
    wake_time?: string;
    sleep_time?: string;
  };
};

export type RecordItemType = 'number' | 'duration' | 'time';

export type RecordItemConfig = {
  key: string;
  name: string;
  type: RecordItemType;
  unit?: string;
  group: 'learning' | 'life' | 'time';
};
