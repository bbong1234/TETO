export interface ActivityContextValue {
  categoryItemId: string;
  categoryTitle?: string;
  itemId: string;
  itemTitle?: string;
  subItemId: string;
  subItemTitle?: string;
  phaseId?: string;
  phaseTitle?: string;
}

export const EMPTY_ACTIVITY_CONTEXT: ActivityContextValue = {
  categoryItemId: '',
  itemId: '',
  subItemId: '',
  phaseId: '',
};

export type ActivityContextCreateLevel = 'category' | 'item' | 'subItem';
