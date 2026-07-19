import { describe, expect, it } from 'vitest';
import {
  buildActivityContextFromAttributionOption,
  buildQuickCreateAttributionOptions,
  pickDefaultAttributionOptionId,
} from '../quick-create-preview';
import type { Item, Tag } from '@/types/teto';

const items: Item[] = [
  {
    id: 'cat-eat',
    user_id: 'u',
    title: '吃饭',
    description: null,
    status: '活跃',
    color: null,
    icon: null,
    is_pinned: false,
    started_at: null,
    ended_at: null,
    folder_id: null,
    parent_item_id: null,
    created_at: '',
    updated_at: '',
  },
  {
    id: 'item-breakfast',
    user_id: 'u',
    title: '早饭',
    description: null,
    status: '活跃',
    color: null,
    icon: null,
    is_pinned: false,
    started_at: null,
    ended_at: null,
    folder_id: null,
    parent_item_id: 'cat-eat',
    created_at: '',
    updated_at: '',
  },
  {
    id: 'item-lunch',
    user_id: 'u',
    title: '午饭',
    description: null,
    status: '活跃',
    color: null,
    icon: null,
    is_pinned: false,
    started_at: null,
    ended_at: null,
    folder_id: null,
    parent_item_id: 'cat-eat',
    created_at: '',
    updated_at: '',
  },
  {
    id: 'item-dinner',
    user_id: 'u',
    title: '晚饭',
    description: null,
    status: '活跃',
    color: null,
    icon: null,
    is_pinned: false,
    started_at: null,
    ended_at: null,
    folder_id: null,
    parent_item_id: 'cat-eat',
    created_at: '',
    updated_at: '',
  },
];

describe('buildQuickCreateAttributionOptions', () => {
  it('带当天时间的早餐句仍推荐吃饭-早饭', () => {
    const options = buildQuickCreateAttributionOptions(
      '早上9点吃了早饭',
      items,
      []
    );
    expect(options[0]).toMatchObject({
      label: '吃饭-早饭',
      itemId: 'item-breakfast',
      recommended: true,
    });
  });

  it('跟进 teto 项目时推荐编程-TETO开发', () => {
    const programmingItems: Item[] = [
      {
        ...items[0],
        id: 'cat-programming',
        title: '编程',
        parent_item_id: null,
      },
      {
        ...items[1],
        id: 'item-teto',
        title: 'TETO开发',
        parent_item_id: 'cat-programming',
      },
    ];
    const options = buildQuickCreateAttributionOptions(
      '跟进teto项目',
      programmingItems,
      []
    );
    expect(options[0]).toMatchObject({
      label: '编程-TETO开发',
      itemId: 'item-teto',
      recommended: true,
    });
  });

  it('吃早饭：推荐二类早饭，一类吃饭不重复，无三类', () => {
    const options = buildQuickCreateAttributionOptions(
      '吃早饭两个蛋',
      items,
      [
        {
          trigger_pattern: '早饭',
          target_id: 'cat-eat',
          rule_type: 'item_mapping',
          is_active: true,
        },
      ]
    );

    expect(options.map((o) => o.shortLabel)).toEqual(['早饭', '吃饭', '未归类']);
    expect(options[0]).toMatchObject({
      label: '吃饭-早饭',
      itemId: 'item-breakfast',
      recommended: true,
    });
    expect(options[1]).toMatchObject({
      label: '吃饭',
      itemId: 'cat-eat',
      recommended: false,
    });
  });

  it('itemId 不重复', () => {
    const options = buildQuickCreateAttributionOptions('早饭', items, [
      {
        trigger_pattern: '早饭',
        target_id: 'cat-eat',
        rule_type: 'item_mapping',
        is_active: true,
      },
    ]);
    const itemIds = options.map((o) => o.itemId).filter(Boolean);
    expect(new Set(itemIds).size).toBe(itemIds.length);
  });

  it('内置词典在无 DB 规则时仍可生成选项', () => {
    const options = buildQuickCreateAttributionOptions('刚吃完早饭', items, []);
    expect(options.map((o) => o.shortLabel)).toEqual(['早饭', '吃饭', '未归类']);
  });

  it('function_mapping 通过本地规则推荐动作标签', () => {
    const tags: Tag[] = [
      {
        id: 'tag-follow-up',
        user_id: 'u',
        name: '跟进',
        color: null,
        type: 'function',
        created_at: '',
      },
    ];
    const options = buildQuickCreateAttributionOptions(
      '跟进早餐计划',
      items,
      [
        {
          trigger_pattern: '跟进',
          target_id: 'tag-follow-up',
          rule_type: 'function_mapping',
          is_active: true,
        },
      ],
      tags
    );

    expect(options.find((option) => option.functionTagId === 'tag-follow-up')).toBeDefined();
  });

  it('不会把其他一类范围内的动作标签自动匹配到当前事项', () => {
    const tags: Tag[] = [
      {
        id: 'tag-dictation',
        user_id: 'u',
        name: '听写',
        color: null,
        type: 'function',
        scope_item_id: 'cat-english',
        created_at: '',
      },
    ];
    const options = buildQuickCreateAttributionOptions(
      '吃早饭后听写',
      items,
      [
        {
          trigger_pattern: '听写',
          target_id: 'tag-dictation',
          rule_type: 'function_mapping',
          is_active: true,
        },
      ],
      tags
    );

    expect(options.some((option) => option.functionTagId === 'tag-dictation')).toBe(false);
  });

  it('按当前一类范围自动匹配动作标签名称', () => {
    const english = { ...items[0], id: 'cat-english', title: '英语', parent_item_id: null };
    const studyEnglish = { ...items[1], id: 'item-english-study', title: '学习英语', parent_item_id: 'cat-english' };
    const tags: Tag[] = [
      {
        id: 'tag-dictation',
        user_id: 'u',
        name: '听写',
        color: null,
        type: 'function',
        scope_item_id: 'cat-english',
        created_at: '',
      },
    ];
    const options = buildQuickCreateAttributionOptions('学习英语后听写', [english, studyEnglish], [], tags);

    expect(options[0]).toMatchObject({
      itemId: 'item-english-study',
      functionTagId: 'tag-dictation',
    });
  });

  it('空输入不展示', () => {
    expect(buildQuickCreateAttributionOptions('  ', items, [])).toEqual([]);
  });

  it('单字符输入不展示归属选项', () => {
    expect(buildQuickCreateAttributionOptions('t', items, [])).toEqual([]);
    expect(buildQuickCreateAttributionOptions('吃', items, [])).toEqual([]);
  });

  it('两个字符起才生成归属选项', () => {
    const options = buildQuickCreateAttributionOptions('te', items, []);
    expect(options.length).toBeGreaterThan(0);
    expect(options.some((o) => o.recommended)).toBe(true);
  });

  it('pickDefaultAttributionOptionId 选中推荐项', () => {
    const options = buildQuickCreateAttributionOptions('早饭', items, []);
    const id = pickDefaultAttributionOptionId(options);
    const opt = options.find((o) => o.id === id);
    expect(opt?.recommended).toBe(true);
    expect(opt?.itemId).toBe('item-breakfast');
  });

  it('buildActivityContextFromAttributionOption 同步 L1+L2 到标签栏', () => {
    const options = buildQuickCreateAttributionOptions('吃早饭', items, []);
    const id = pickDefaultAttributionOptionId(options);
    const opt = options.find((o) => o.id === id)!;
    const ctx = buildActivityContextFromAttributionOption(items, opt, id);
    expect(ctx).toMatchObject({
      categoryItemId: 'cat-eat',
      itemId: 'item-breakfast',
    });
  });

  it('输入 teto 时 context 一类=编程、三类=item-proj（有 L3 时优先三类）', () => {
    const prog = {
      id: 'cat-prog',
      user_id: 'u',
      title: '编程',
      description: null,
      status: '活跃' as const,
      color: null,
      icon: null,
      is_pinned: false,
      started_at: null,
      ended_at: null,
      folder_id: null,
      parent_item_id: null,
      created_at: '',
      updated_at: '',
    };
    const teto = {
      id: 'item-teto',
      user_id: 'u',
      title: 'TETO开发',
      description: null,
      status: '活跃' as const,
      color: null,
      icon: null,
      is_pinned: false,
      started_at: null,
      ended_at: null,
      folder_id: null,
      parent_item_id: 'cat-prog',
      created_at: '',
      updated_at: '',
    };
    const proj = {
      id: 'item-proj',
      user_id: 'u',
      title: 'TETO项目1.7版本',
      description: null,
      status: '活跃' as const,
      color: null,
      icon: null,
      is_pinned: false,
      started_at: null,
      ended_at: null,
      folder_id: null,
      parent_item_id: 'item-teto',
      created_at: '',
      updated_at: '',
    };
    const progItems = [prog, teto, proj];
    const options = buildQuickCreateAttributionOptions('teto', progItems, []);
    const id = pickDefaultAttributionOptionId(options)!;
    expect(id).toBe('l2:item-proj');
    const opt = options.find((o) => o.id === id)!;
    const ctx = buildActivityContextFromAttributionOption(progItems, opt, id);
    expect(ctx?.categoryItemId).toBe('cat-prog');
    expect(ctx?.itemId).toBe('item-proj');
  });

  it('输入 teto项目 时一类仍为编程，不会把 teto开发 放到第一行', () => {
    const prog = {
      id: 'cat-prog',
      user_id: 'u',
      title: '编程',
      description: null,
      status: '活跃' as const,
      color: null,
      icon: null,
      is_pinned: false,
      started_at: null,
      ended_at: null,
      folder_id: null,
      parent_item_id: null,
      created_at: '',
      updated_at: '',
    };
    const teto = {
      id: 'item-teto',
      user_id: 'u',
      title: 'TETO开发',
      description: null,
      status: '活跃' as const,
      color: null,
      icon: null,
      is_pinned: false,
      started_at: null,
      ended_at: null,
      folder_id: null,
      parent_item_id: 'cat-prog',
      created_at: '',
      updated_at: '',
    };
    const proj = {
      id: 'item-proj',
      user_id: 'u',
      title: 'TETO项目1.7版本',
      description: null,
      status: '活跃' as const,
      color: null,
      icon: null,
      is_pinned: false,
      started_at: null,
      ended_at: null,
      folder_id: null,
      parent_item_id: 'item-teto',
      created_at: '',
      updated_at: '',
    };
    const orphan = {
      id: 'orphan-teto',
      user_id: 'u',
      title: 'TETO开发',
      description: null,
      status: '活跃' as const,
      color: null,
      icon: null,
      is_pinned: false,
      started_at: null,
      ended_at: null,
      folder_id: null,
      parent_item_id: null,
      created_at: '',
      updated_at: '',
    };
    const all = [prog, teto, proj, orphan];
    const options = buildQuickCreateAttributionOptions('teto项目', all, []);
    const id = pickDefaultAttributionOptionId(options)!;
    const opt = options.find((o) => o.id === id)!;
    const ctx = buildActivityContextFromAttributionOption(all, opt, id);
    expect(ctx?.categoryItemId).toBe('cat-prog');
    expect(ctx?.categoryItemId).not.toBe('item-teto');
    expect(ctx?.categoryItemId).not.toBe('orphan-teto');
    expect(ctx?.itemId).toBe('item-proj');
  });

  it('teto项目1.7版本 同步到三类标签', () => {
    const prog = {
      id: 'cat-prog',
      user_id: 'u',
      title: '编程',
      description: null,
      status: '活跃' as const,
      color: null,
      icon: null,
      is_pinned: false,
      started_at: null,
      ended_at: null,
      folder_id: null,
      parent_item_id: null,
      created_at: '',
      updated_at: '',
    };
    const teto = {
      id: 'item-teto',
      user_id: 'u',
      title: 'TETO开发',
      description: null,
      status: '活跃' as const,
      color: null,
      icon: null,
      is_pinned: false,
      started_at: null,
      ended_at: null,
      folder_id: null,
      parent_item_id: 'cat-prog',
      created_at: '',
      updated_at: '',
    };
    const proj = {
      id: 'item-proj',
      user_id: 'u',
      title: 'TETO项目1.7版本',
      description: null,
      status: '活跃' as const,
      color: null,
      icon: null,
      is_pinned: false,
      started_at: null,
      ended_at: null,
      folder_id: null,
      parent_item_id: 'item-teto',
      created_at: '',
      updated_at: '',
    };
    const all = [prog, teto, proj];
    for (const text of ['teto项目1.7版本', 'teto 1.7']) {
      const options = buildQuickCreateAttributionOptions(text, all, []);
      const id = pickDefaultAttributionOptionId(options)!;
      const opt = options.find((o) => o.id === id)!;
      const ctx = buildActivityContextFromAttributionOption(all, opt, id);
      expect(ctx?.categoryItemId).toBe('cat-prog');
      expect(ctx?.itemId).toBe('item-proj');
    }
  });
});
