# Drama-FluxOps · 短剧投流自动化运营中台 (MVP)

面向 **快手磁力智投** 与 **抖音巨量广告** 短剧买量发行场景打造的全栈自动化运营平台原型。涵盖 **上游剪辑素材 MD5 去重质检、跨账户笛卡尔积批量建计划、下游四态流量池 5 分钟滑动边际盯盘止损、AI 双列封面裂变与多维绩效报表** 全链路闭环。

---

## 核心功能模块

1. **数据概览大盘 (`DashboardView`)**
   - 实时监控广告总消耗 (Cost)、短剧充值流水 (Gross)、首日累计 ROI 与 **近 30 分钟滑动边际 ROI** 剪刀差曲线。
   - 内置**时间旅行沙盒控制器**：支持一键步进 `+5分钟巡检`、`模拟爆款切片自动追投`、`模拟半夜空耗毫秒级止损`。
2. **素材库与批量基建 (`MaterialHubView`)**
   - 浏览器本地 `Web Crypto API` 视频头尾抽样指纹秒级判重 + 离线 `<video>` 探针 `9:16` 竖屏规格自动质检。
   - **笛卡尔积批量叉乘建组**：勾选 `N 条切片 × M 个跨渠道账户 (快手磁力 / 抖音巨量) × K 档目标 ROI 出价` 一键批量生成计划并自动挂载至测试池。
3. **四态流量池看板 (`TrafficPoolView`)**
   - `自然流观察池 -> 测试池 -> 放量池 / 淘汰池` 自动赛马状态机。
   - 集成 **L2 AI 归因诊断与快手双列封面裂变工坊**（兼容 DeepSeek / 通义千问 / 硅基流动 / 豆包 / GLM / OpenAI 等任意厂商 API Key，同时内置免 Key 离线策略引擎兜底）。
4. **多维报表与规则安全锁 (`AnalyticsAndRulesView`)**
   - 实时聚合 **剪辑师爆款命中率绩效排行**、**短剧剧目首日与预估 7 日回收汇总**、**快手磁力 vs 抖音巨量双渠道对比**。
   - **账户级全局资金安全锁**：保本 ROI 基准线、单广告组日预算硬顶、单小时自动加仓总额上限、一键紧急熔断开关（Kill Switch）与飞书机器人协同审批抽屉。

---

## 技术栈

- **前端**：React 18 + TypeScript + Vite + Tailwind CSS + Recharts + Lucide Icons（简约浅色企业级后台设计）
- **后端**：Python 3.10+ + FastAPI + SQLAlchemy 2.0 + Pydantic v2 + HTTPX
- **存储与测试**：SQLite（启动自动建表并写入演示种子数据，零外部依赖开箱即跑）+ Pytest 单元测试套件

---

## 快速启动（支持任意电脑拉取即跑）

### 方式一：一键脚本启动
- **Windows**：双击运行根目录 `start_mvp.bat`
- **macOS / Linux**：执行 `bash start_mvp.sh`

### 方式二：手动分步启动

```bash
# 1. 启动后端服务 (http://127.0.0.1:8000)
cd backend
python -m pip install -r requirements.txt
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload

# 2. 新开终端启动前端控制台 (http://127.0.0.1:5173)
cd frontend
npm install
npm run dev
```

启动后浏览器访问：**`http://127.0.0.1:5173`**

---

## 运行自动化单元测试

```bash
cd backend
PYTHONPATH=. python -m pytest -v tests/test_fluxops_core.py
```

*(注：仓库根目录内置了 `AGENTS.md` 与 `docs/ARCHITECTURE_AND_RULES.md`，在任意新电脑交给 Cursor / Claude Code / Antigravity 等 AI 助手时，AI 可直接读取上下文零配置启动或二次开发。)*
