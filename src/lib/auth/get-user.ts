'use client';

import { createClient } from '@/lib/supabase/client';

export async function getCurrentUser() {
  const supabase = createClient();
  const { data, error } = await supabase.auth.getUser();

  if (error) {
    console.error('getCurrentUser error:', error);
    return null;
  }

  return data.user;
}

export async function requireAuth() {
  const user = await getCurrentUser();
  return user;
}