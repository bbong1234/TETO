import type { DiaryReview, DiaryReviewFormValues } from '@/types/diary-review';
import { createClient } from '@/lib/supabase/client';

export async function getDiaryReviewByDate(
  userId: string,
  reviewDate: string
): Promise<DiaryReview | null> {
  console.log("[getDiaryReviewByDate] 查询参数:", { userId, reviewDate });
  const supabase = createClient();

  const { data, error } = await supabase
    .from('diary_reviews')
    .select('*')
    .eq('user_id', userId)
    .eq('review_date', reviewDate)
    .maybeSingle();

  console.log("[getDiaryReviewByDate] 查询结果:", { data, error });

  if (error) {
    console.error("[getDiaryReviewByDate] 查询错误:", {
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
    });
    throw error;
  }

  if (!data) {
    console.log("[getDiaryReviewByDate] 无记录, 返回 null");
    return null;
  }

  return data;
}

export async function saveDiaryReview(
  userId: string,
  values: DiaryReviewFormValues
): Promise<DiaryReview> {
  console.log("[saveDiaryReview] 开始保存, userId:", userId, "values:", values);
  const supabase = createClient();

  const { data: existing, error: selectError } = await supabase
    .from('diary_reviews')
    .select('id')
    .eq('user_id', userId)
    .eq('review_date', values.reviewDate)
    .maybeSingle();

  console.log("[saveDiaryReview] 查询已有记录:", { existing, selectError });

  if (selectError) {
    console.error("[saveDiaryReview] 查询已有记录失败:", {
      message: selectError.message,
      code: selectError.code,
      details: selectError.details,
      hint: selectError.hint,
    });
    throw selectError;
  }

  const recordData = {
    user_id: userId,
    review_date: values.reviewDate,
    did_what: values.did_what || null,
    planned_what: values.planned_what || null,
    completion_rate: values.completion_rate,
    status_label: values.status_label || null,
    emotion_label: values.emotion_label || null,
    biggest_progress: values.biggest_progress || null,
    biggest_problem: values.biggest_problem || null,
    tomorrow_plan: values.tomorrow_plan || null,
  };

  if (existing) {
    console.log("[saveDiaryReview] 更新已有记录, id:", existing.id);
    const { data, error } = await supabase
      .from('diary_reviews')
      .update({
        ...recordData,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id)
      .select()
      .single();

    if (error) {
      console.error("[saveDiaryReview] 更新失败:", {
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint,
      });
      throw error;
    }
    console.log("[saveDiaryReview] 更新成功:", data);
    return data;
  } else {
    console.log("[saveDiaryReview] 插入新记录");
    const { data, error } = await supabase
      .from('diary_reviews')
      .insert(recordData)
      .select()
      .single();

    if (error) {
      console.error("[saveDiaryReview] 插入失败:", {
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint,
      });
      throw error;
    }
    console.log("[saveDiaryReview] 插入成功:", data);
    return data;
  }
}

export function recordToFormValues(
  record: DiaryReview | null,
  reviewDate: string
): DiaryReviewFormValues {
  return {
    reviewDate,
    did_what: record?.did_what || '',
    planned_what: record?.planned_what || '',
    completion_rate: record?.completion_rate ?? null,
    status_label: record?.status_label || '',
    emotion_label: record?.emotion_label || '',
    biggest_progress: record?.biggest_progress || '',
    biggest_problem: record?.biggest_problem || '',
    tomorrow_plan: record?.tomorrow_plan || '',
  };
}
