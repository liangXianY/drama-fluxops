import React, { useEffect, useState, useCallback } from 'react';
import { FastForward, RotateCcw, Bell } from 'lucide-react';
import {
  api,
  OverviewData,
  ShortVideo,
  MaterialAsset,
  AdAccount,
  MultidimReportData,
  AutomationRule,
  AuditLogItem,
  FeishuCard,
  AIDiagnosisResult,
} from './api/client';
import { DashboardView } from './components/DashboardView';
import { MaterialHubView } from './components/MaterialHubView';
import { TrafficPoolView } from './components/TrafficPoolView';
import { AnalyticsAndRulesView } from './components/AnalyticsAndRulesView';
import { AICopilotModal } from './components/AICopilotModal';
import { FeishuCardDrawer } from './components/FeishuCardDrawer';

interface ToastMsg {
  id: number;
  level: string;
  title: string;
  detail: string;
}

type NavTab = 'DASHBOARD' | 'MATERIALS' | 'POOLS' | 'REPORTS_RULES';

async function parseErrMsg(err: unknown): Promise<string> {
  if (err instanceof Error) {
    try {
      const obj = JSON.parse(err.message);
      if (obj.detail) return String(obj.detail);
    } catch {
      return err.message;
    }
    return err.message;
  }
  return '操作执行异常';
}

export default function App() {
  const [activeTab, setActiveTab] = useState<NavTab>('DASHBOARD');
  const [poolStageFilter, setPoolStageFilter] = useState<string>('ALL');

  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [videos, setVideos] = useState<ShortVideo[]>([]);
  const [materials, setMaterials] = useState<MaterialAsset[]>([]);
  const [accounts, setAccounts] = useState<AdAccount[]>([]);
  const [reports, setReports] = useState<MultidimReportData | null>(null);
  const [rules, setRules] = useState<AutomationRule[]>([]);
  const [logs, setLogs] = useState<AuditLogItem[]>([]);
  const [feishuCards, setFeishuCards] = useState<FeishuCard[]>([]);

  const [feishuOpen, setFeishuOpen] = useState(false);
  const [aiTargetVideo, setAiTargetVideo] = useState<ShortVideo | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState<AIDiagnosisResult | null>(null);

  const [busySim, setBusySim] = useState(false);
  const [toasts, setToasts] = useState<ToastMsg[]>([]);

  const pushToasts = (events: Array<{ level: string; title: string; detail: string }>) => {
    if (!events || events.length === 0) return;
    const now = Date.now();
    const added = events.map((e, i) => ({ id: now + i, ...e }));
    setToasts((prev) => [...added, ...prev].slice(0, 5));
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => !added.some((a) => a.id === t.id)));
    }, 6000);
  };

  const refreshAll = useCallback(async () => {
    const [ov, vids, mats, accs, rpts, rls, lgs, cards] = await Promise.all([
      api.getOverview(),
      api.getVideos(),
      api.getMaterials(),
      api.getAccounts(),
      api.getMultidimReports(),
      api.getRules(),
      api.getAuditLogs(),
      api.getFeishuCards(),
    ]);
    setOverview(ov);
    setVideos(vids);
    setMaterials(mats);
    setAccounts(accs);
    setReports(rpts);
    setRules(rls);
    setLogs(lgs);
    setFeishuCards(cards);
  }, []);

  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  const handleSimTick = async () => {
    setBusySim(true);
    try {
      const res = await api.simTick();
      if (res.triggered_events.length > 0) {
        pushToasts(res.triggered_events);
      } else {
        pushToasts([{ level: 'INFO', title: `已完成 ${res.virtual_time} 周期巡检`, detail: '短剧切片数据、素材回流指标与报表已同步更新' }]);
      }
      await refreshAll();
    } finally {
      setBusySim(false);
    }
  };

  const handleInjectViral = async () => {
    setBusySim(true);
    try {
      const res = await api.simInjectViral();
      pushToasts(
        res.triggered_events.length > 0
          ? res.triggered_events
          : [{ level: 'SUCCESS', title: '已新增高潜短剧切片', detail: res.video_title }]
      );
      await refreshAll();
    } finally {
      setBusySim(false);
    }
  };

  const handleInjectRunaway = async () => {
    setBusySim(true);
    try {
      const res = await api.simInjectRunaway();
      pushToasts(res.triggered_events);
      await refreshAll();
    } finally {
      setBusySim(false);
    }
  };

  const handleReset = async () => {
    setBusySim(true);
    try {
      await api.simReset();
      pushToasts([{ level: 'INFO', title: '演示数据已重置', detail: '已恢复 18:00 短剧素材库与流量池基准状态' }]);
      await refreshAll();
    } finally {
      setBusySim(false);
    }
  };

  const handleOpenAICopilot = async (video: ShortVideo) => {
    setAiTargetVideo(video);
    setAiResult(null);
    setAiLoading(true);
    try {
      const diag = await api.aiDiagnose(video.id);
      setAiResult(diag);
    } finally {
      setAiLoading(false);
    }
  };

  const handleApplyCover = async (videoId: number, cover: Record<string, unknown>) => {
    await api.applyCover(videoId, cover);
    setAiTargetVideo(null);
    pushToasts([{ level: 'SUCCESS', title: '双列封面更新成功', detail: '切片已换用新封面并重新进入流量池测流' }]);
    await refreshAll();
  };

  const pendingCardCount = feishuCards.filter((c) => c.status === 'PENDING').length;

  const tabMeta: Record<NavTab, { title: string; subtitle: string }> = {
    DASHBOARD: { title: '数据概览大盘', subtitle: '实时追踪磁力智投/巨量广告短剧消耗、充值回本率与自动止损记录' },
    MATERIALS: { title: '素材库与批量基建', subtitle: '剪辑切片本地 MD5 指纹去重、9:16 竖屏校验与跨账户笛卡尔积批量建组' },
    POOLS: { title: '四态流量池看板', subtitle: '监控自然流观察池、测试池、放量池与淘汰池切片状态自动赛马跃迁' },
    REPORTS_RULES: { title: '多维报表与规则锁', subtitle: '剪辑师爆款率绩效核算、剧目7日回收报表及确定性风控熔断参数' },
  };

  return (
    <div className="min-h-screen bg-[#F5F7FA] text-gray-900 flex flex-col">
      {/* 第一层：清爽全局顶部导航栏 */}
      <header className="sticky top-0 z-30 bg-white border-b border-gray-200 shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
        <div className="max-w-7xl w-full mx-auto px-5 lg:px-8 py-3 flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-6 lg:gap-8">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-md bg-blue-600 flex items-center justify-center font-bold text-xs text-white shrink-0">
                智投
              </div>
              <span className="text-[15px] font-semibold text-gray-900 tracking-tight">短剧投流自动化运营中台</span>
            </div>

            <nav className="flex flex-wrap items-center gap-1">
              {[
                { key: 'DASHBOARD', label: '数据概览大盘' },
                { key: 'MATERIALS', label: '素材库与批量基建' },
                { key: 'POOLS', label: '四态流量池看板' },
                { key: 'REPORTS_RULES', label: '多维报表与规则锁' },
              ].map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key as NavTab)}
                  className={`px-3.5 py-1.5 rounded-md text-[13px] font-medium transition ${
                    activeTab === tab.key
                      ? 'bg-blue-50 text-blue-600'
                      : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </nav>
          </div>

          <button
            onClick={() => setFeishuOpen(true)}
            className="px-3.5 py-1.5 rounded-md bg-gray-50 hover:bg-gray-100 border border-gray-200 text-xs font-medium text-gray-700 flex items-center gap-2 transition shrink-0"
          >
            <Bell className="w-3.5 h-3.5 text-gray-500" />
            <span>飞书协同审批</span>
            {pendingCardCount > 0 && (
              <span className="bg-red-600 text-white text-[10px] font-semibold px-1.5 py-0.5 leading-none rounded-full">
                {pendingCardCount}
              </span>
            )}
          </button>
        </div>
      </header>

      {/* 右上角轻量白底通知条 */}
      {toasts.length > 0 && (
        <div className="fixed top-20 right-6 z-40 space-y-2.5 max-w-sm w-full pointer-events-none">
          {toasts.map((t) => (
            <div
              key={t.id}
              className={`pointer-events-auto bg-white rounded-lg p-3.5 shadow-lg border border-gray-200 border-l-4 text-xs ${
                t.level === 'DANGER'
                  ? 'border-l-red-600'
                  : t.level === 'SUCCESS'
                  ? 'border-l-emerald-600'
                  : t.level === 'WARNING'
                  ? 'border-l-amber-500'
                  : 'border-l-blue-600'
              }`}
            >
              <div className="font-semibold text-gray-900">{t.title}</div>
              {t.detail && <div className="text-gray-600 mt-1 leading-relaxed">{t.detail}</div>}
            </div>
          ))}
        </div>
      )}

      {/* 主体内容区 */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-5 lg:px-8 py-6 space-y-6">
        <div className="bg-white border border-gray-200 rounded-lg px-5 py-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4 shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
          <div>
            <h1 className="text-base font-semibold text-gray-900">{tabMeta[activeTab].title}</h1>
            <p className="text-xs text-gray-500 mt-1">{tabMeta[activeTab].subtitle}</p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <div className="text-xs text-gray-600 bg-gray-100 border border-gray-200/80 px-3 py-1.5 rounded-md font-mono flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              <span>巡检时钟 {overview?.config.virtual_time || '18:00'}</span>
            </div>

            <button
              disabled={busySim}
              onClick={handleSimTick}
              className="px-3.5 py-1.5 rounded-md bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-medium flex items-center gap-1.5 transition shadow-sm"
            >
              <FastForward className="w-3.5 h-3.5" /> 步进巡检 (+5m)
            </button>

            <button
              disabled={busySim}
              onClick={handleInjectViral}
              className="px-3 py-1.5 rounded-md bg-white hover:bg-gray-50 text-gray-700 border border-gray-300 text-xs font-medium transition"
            >
              模拟爆款切片
            </button>

            <button
              disabled={busySim}
              onClick={handleInjectRunaway}
              className="px-3 py-1.5 rounded-md bg-white hover:bg-red-50 text-red-600 border border-gray-300 text-xs font-medium transition"
            >
              模拟空耗止损
            </button>

            <button
              disabled={busySim}
              onClick={handleReset}
              className="px-2.5 py-1.5 rounded-md bg-white hover:bg-gray-100 text-gray-600 border border-gray-300 text-xs flex items-center gap-1 transition"
            >
              <RotateCcw className="w-3.5 h-3.5" /> 重置
            </button>
          </div>
        </div>

        {!overview ? (
          <div className="text-center py-20 text-gray-400 text-sm">正在加载投流监控数据...</div>
        ) : (
          <>
            {overview.config.kill_switch_active && (
              <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 flex items-center justify-between text-xs text-red-800">
                <span>账户级紧急熔断已开启：全部在投短剧广告组已暂停，自动加仓与批量叉乘建组均已锁定。</span>
                <button
                  onClick={async () => {
                    await api.updateConfig({ kill_switch_active: false });
                    await refreshAll();
                  }}
                  className="px-3 py-1 rounded bg-red-600 hover:bg-red-700 text-white font-medium"
                >
                  解除紧急熔断
                </button>
              </div>
            )}

            {activeTab === 'DASHBOARD' && (
              <DashboardView
                overview={overview}
                logs={logs}
                onNavigatePool={(stage) => {
                  setPoolStageFilter(stage || 'ALL');
                  setActiveTab('POOLS');
                }}
              />
            )}

            {activeTab === 'MATERIALS' && (
              <MaterialHubView
                materials={materials}
                accounts={accounts}
                breakEvenRoi={overview.config.break_even_roi}
                onUploadFiles={async (items) => {
                  const res = await api.batchUploadMaterials(items);
                  pushToasts([
                    {
                      level: 'SUCCESS',
                      title: '本地视频批次处理完成',
                      detail: `入库 ${res.created_count} 条，MD5去重拦截 ${res.duplicate_count} 条，规格告警 ${res.warning_count} 条`,
                    },
                  ]);
                  await refreshAll();
                  return res;
                }}
                onMockImport={async () => {
                  const res = await api.mockImportMaterials();
                  pushToasts([
                    {
                      level: 'INFO',
                      title: '模拟批次质检完成',
                      detail: `新增 ${res.created_count} 条，MD5重复复用 ${res.duplicate_count} 条，横屏告警 ${res.warning_count} 条`,
                    },
                  ]);
                  await refreshAll();
                  return res;
                }}
                onBatchBuild={async (payload) => {
                  try {
                    const res = await api.batchBuildPlans(payload);
                    pushToasts([
                      {
                        level: 'SUCCESS',
                        title: `成功批量创建 ${res.created_plans_count} 个广告组`,
                        detail: `新增总日预算 ¥${res.total_budget_added}，已挂载至四态流量池【测试池】自动巡检`,
                      },
                    ]);
                    await refreshAll();
                  } catch (err) {
                    pushToasts([{ level: 'DANGER', title: '批量叉乘被风控拦截', detail: await parseErrMsg(err) }]);
                    throw err;
                  }
                }}
                onJumpToTrafficPool={() => {
                  setPoolStageFilter('ALL');
                  setActiveTab('POOLS');
                }}
              />
            )}

            {activeTab === 'POOLS' && (
              <TrafficPoolView
                videos={videos}
                selectedStage={poolStageFilter}
                onSelectStage={setPoolStageFilter}
                breakEvenRoi={overview.config.break_even_roi}
                onManualAction={async (vid, act) => {
                  try {
                    await api.videoAction(vid, act);
                    await refreshAll();
                  } catch (err) {
                    pushToasts([{ level: 'DANGER', title: '操作已被安全锁拦截', detail: await parseErrMsg(err) }]);
                  }
                }}
                onOpenAICopilot={handleOpenAICopilot}
              />
            )}

            {activeTab === 'REPORTS_RULES' && (
              <AnalyticsAndRulesView
                reports={reports}
                overview={overview}
                rules={rules}
                logs={logs}
                onToggleRule={async (rule) => {
                  await api.updateRule(rule.id, { enabled: !rule.enabled });
                  await refreshAll();
                }}
                onSaveRuleParams={async (ruleId, params) => {
                  try {
                    await api.updateRule(ruleId, { params });
                    pushToasts([{ level: 'SUCCESS', title: '规则阈值已保存', detail: '下一轮 5 分钟巡检将按新参数执行' }]);
                    await refreshAll();
                  } catch (err) {
                    pushToasts([{ level: 'DANGER', title: '参数校验未通过', detail: await parseErrMsg(err) }]);
                  }
                }}
                onUpdateConfig={async (payload) => {
                  try {
                    await api.updateConfig(payload);
                    pushToasts([{ level: 'INFO', title: '全局配置已生效', detail: '账户安全边界与模型设置已更新' }]);
                    await refreshAll();
                  } catch (err) {
                    pushToasts([{ level: 'DANGER', title: '配置校验拦截', detail: await parseErrMsg(err) }]);
                  }
                }}
              />
            )}
          </>
        )}
      </main>

      <AICopilotModal
        video={aiTargetVideo}
        loading={aiLoading}
        result={aiResult}
        onClose={() => setAiTargetVideo(null)}
        onApplyCover={handleApplyCover}
      />

      <FeishuCardDrawer
        open={feishuOpen}
        cards={feishuCards}
        onClose={() => setFeishuOpen(false)}
        onDecide={async (cardId, decision) => {
          try {
            await api.decideFeishuCard(cardId, decision);
            pushToasts([
              {
                level: decision === 'APPROVE' ? 'SUCCESS' : 'INFO',
                title: decision === 'APPROVE' ? '审批动作已执行' : '已忽略该预警 (30分钟冷却)',
                detail: decision === 'APPROVE' ? '已调用媒体网关同步调整广告组预算' : '冷却期内不再重复推送相同告警',
              },
            ]);
            await refreshAll();
          } catch (err) {
            pushToasts([{ level: 'DANGER', title: '审批执行被拦截', detail: await parseErrMsg(err) }]);
          }
        }}
      />
    </div>
  );
}
