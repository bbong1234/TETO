export type DiaryReview = {
  id: string;
  user_id: string;
  review_date: string;
  did_what: string | null;
  planned_what: string | null;
  completion_rate: number | null;
  status_label: string | null;
  emotion_label: string | null;
  biggest_progress: string | null;
  biggest_problem: string | null;
  tomorrow_plan: string | null;
  created_at: string;
  updated_at: string;
};

export type DiaryReviewFormValues = {
  reviewDate: string;
  did_what: string;
  planned_what: string;
  completion_rate: number | null;
  status_label: string;
  emotion_label: string;
  biggest_progress: string;
  biggest_problem: string;
  tomorrow_plan: string;
};
