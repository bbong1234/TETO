export type TimeRange = "7days" | "30days";

export interface ItemTrendData {
  date: string;
  [key: string]: string | number;
}

export interface RecordTrendData {
  date: string;
  hasRecord: number;
}

export interface ReviewTrendData {
  date: string;
  hasReview: number;
}
