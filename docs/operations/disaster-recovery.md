# TETO 灾难恢复计划 (Disaster Recovery)

## PITR 备份状态

- **服务**: Supabase PITR (Point-in-Time Recovery)
- **保留天数**: 至少 7 天（需在 Supabase Dashboard 确认已启用）
- **确认方式**: Supabase Dashboard → Database → Backups → PITR Enabled

## 回滚触发条件

1. **数据损坏**: 错误 migration 导致数据丢失或损坏
2. **误删除**: 批量删除操作超出预期范围
3. **安全事件**: 未授权访问导致数据被篡改

## 回滚步骤

1. **确认影响范围**: 查询 trace_summaries + decision_logs 确认具体时间点
2. **通知团队**: 通过预设通知渠道告知维护窗口
3. **执行 PITR**: 
   - 登录 Supabase Dashboard
   - 选择目标时间点（出问题前最后正常状态）
   - 执行 PITR 恢复到临时数据库
   - 验证数据完整性
4. **切换**: 确认恢复数据正确后切换应用连接
5. **验证**: 运行 `npm run test:contract` + 核心业务 smoke test
6. **通知**: 确认恢复完成，通知团队

## Migration 回滚

如果 migration 执行后发现问题：
1. **切勿修改已执行的 migration 文件** — 始终新建 migration 修复
2. 新建 `sql/xxx_fix.sql` 修复问题
3. 记录到 `sql/migrations_history.txt`

## 定期验证

- 每月执行一次恢复演练（P2）
- 验证 PITR 可用性和恢复时间
