# TETO Eval Harness

TETO 1.6 自动化测试基础设施。

## 目录结构

```
eval/
├── test-cases/
│   ├── from-production/   # 自动生成（纠错/错误转测试）
│   ├── golden/            # Golden tests（已知正确行为）
│   └── regression/        # 手动编写的回归测试
├── scenarios/             # 场景模板
├── runners/               # 测试运行器
└── reports/               # 测试报告输出
```

## 运行

```bash
npm run test:contract     # API 契约测试
npm run test:eval         # 全部 Eval 测试
npm run test:replay       # 从生产回放测试
npm run diagnose          # 诊断近期错误
```

## 测试用例格式

```json
{
  "testCaseId": "TCASE-golden-001",
  "source": "golden",
  "status": "pending_verification",
  "description": "单动作输入正确归类",
  "input": { "endpoint": "POST /api/v2/parse", "body": { "input": "今天跑步5公里" } },
  "expected": { "status": 200, "type": "发生" }
}
```
