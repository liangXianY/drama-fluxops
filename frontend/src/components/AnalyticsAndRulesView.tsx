import React, { useState } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from 'recharts';
import { MultidimReportData, AutomationRule, OverviewData, AuditLogItem } from '../api/client';
import { RuleEngineView } from './RuleEngineView';

interface Props {
  reports: MultidimReportData | null;
  overview: OverviewData;
  rules: AutomationRule[];
  logs: AuditLogItem[];
  onToggleRule: (rule: AutomationRule) => void;
  onSaveRuleParams: (ruleId: number, params: Record<string, number>) => void;
  onUpdateConfig: (payload: Record<string, unknown>) => void;
}

export const AnalyticsAndRulesView: React.FC<Props> = ({
  reports,
  overview,
  rules,
  logs,
  onToggleRule,
  onSaveRuleParams,
  onUpdateConfig,
}) => {
  const [subTab, setSubTab] = useState<'REPORTS' | 'RULES'>('REPORTS');

  return (
    <div className="space-y-5">
      {/* 二级页签切换器 */}
      <div className="bg-white border border-gray-200 rounded-lg p-1.5 inline-flex items-center gap-1 shadow-sm">
        <button
          onClick={() => setSubTab('REPORTS')}
          className={`px-4 py-1.5 rounded-md text-xs font-medium transition ${
            subTab === 'REPORTS' ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          多维投流统计报表（剪辑师爆款率 / 剧目盈亏 / 双渠道对比）
        </button>
        <button
          onClick={() => setSubTab('RULES')}
          className={`px-4 py-1.5 rounded-md text-xs font-medium transition ${
            subTab === 'RULES' ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          自动化规则引擎 & 账户资金安全锁
        </button>
      </div>

      {subTab === 'RULES' ? (
        <RuleEngineView
          overview={overview}
          rules={rules}
          logs={logs}
          onToggleRule={onToggleRule}
          onSaveRuleParams={onSaveRuleParams}
          onUpdateConfig={onUpdateConfig}
        />
      ) : !reports ? (
        <div className="bg-white border border-gray-200 rounded-lg p-12 text-center text-xs text-gray-400">
          正在汇总多维报表数据...
        </div>
      ) : (
        <div className="space-y-6">
          {/* 第一栏：快手磁力智投 vs 抖音巨量广告 双渠道对比 */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <div className="lg:col-span-2 bg-white border border-gray-200 rounded-lg p-5 shadow-sm">
              <div className="mb-4">
                <h3 className="text-sm font-semibold text-gray-900">跨渠道买量效率对比（快手磁力智投 vs 抖音巨量广告）</h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  实时汇总同一批短剧切片在不同投放渠道的广告花费、充值产出与首日回本表现
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {reports.channel_comparison.map((ch) => (
                  <div key={ch.channel} className="border border-gray-200 rounded-lg p-4 bg-gray-50/50 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-gray-900">{ch.channel_label}</span>
                      <span className="text-[11px] px-2 py-0.5 rounded bg-white border border-gray-200 text-gray-600">
                        {ch.account_count} 个户 · 在投 {ch.active_plans} 组
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-2 pt-2 border-t border-gray-200/80 text-xs">
                      <div>
                        <div className="text-gray-500 text-[11px]">总消耗 (花费)</div>
                        <div className="font-semibold text-gray-900 mt-0.5 font-mono">¥{ch.total_cost.toLocaleString('zh-CN')}</div>
                      </div>
                      <div>
                        <div className="text-gray-500 text-[11px]">充值流水</div>
                        <div className="font-semibold text-emerald-600 mt-0.5 font-mono">¥{ch.total_gmv.toLocaleString('zh-CN')}</div>
                      </div>
                      <div>
                        <div className="text-gray-500 text-[11px]">首日 ROI (回本率)</div>
                        <div
                          className={`font-semibold mt-0.5 font-mono ${
                            ch.first_day_roi >= reports.break_even_roi ? 'text-blue-600' : 'text-red-600'
                          }`}
                        >
                          {ch.first_day_roi.toFixed(2)}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm">
              <div className="mb-2">
                <h3 className="text-sm font-semibold text-gray-900">剪辑师产出消耗与充值对比图</h3>
              </div>
              <div className="h-44">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={reports.editor_ranking}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" vertical={false} />
                    <XAxis dataKey="editor_name" stroke="#6B7280" fontSize={11} tickLine={false} />
                    <YAxis stroke="#6B7280" fontSize={11} tickLine={false} axisLine={false} />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#FFFFFF', borderColor: '#E5E7EB', borderRadius: '6px', fontSize: '12px' }}
                    />
                    <Legend wrapperStyle={{ fontSize: '11px' }} />
                    <Bar dataKey="total_cost" name="累计消耗 (¥)" fill="#94A3B8" radius={[3, 3, 0, 0]} isAnimationActive={false} />
                    <Bar dataKey="total_gmv" name="带动充值 (¥)" fill="#2563EB" radius={[3, 3, 0, 0]} isAnimationActive={false} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* 第二栏：剪辑师绩效与爆款率排行榜 */}
          <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-200 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold text-gray-900">剪辑师爆款率与投产绩效核算表（自动归因提成依据）</h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  爆款切片统计口径：单条切片累计消耗 ≥ ¥1,000 且 首日 ROI (充值回本率) ≥ {reports.break_even_roi.toFixed(2)}
                </p>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-gray-50 text-gray-500 border-b border-gray-200">
                  <tr>
                    <th className="py-3 px-4 font-medium">排名</th>
                    <th className="py-3 px-3 font-medium">责任剪辑师</th>
                    <th className="py-3 px-3 font-medium">上传切片总数</th>
                    <th className="py-3 px-3 font-medium">已投测切片数</th>
                    <th className="py-3 px-3 font-medium">跑出爆款条数</th>
                    <th className="py-3 px-3 font-medium w-44">爆款命中率 (爆款÷已投)</th>
                    <th className="py-3 px-3 font-medium">累计总消耗 (花费)</th>
                    <th className="py-3 px-3 font-medium">带动短剧充值流水</th>
                    <th className="py-3 px-4 font-medium text-right">综合首日 ROI (回本率)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 text-gray-700">
                  {reports.editor_ranking.map((ed, idx) => (
                    <tr key={ed.editor_name} className="hover:bg-gray-50/80">
                      <td className="py-3 px-4 font-mono font-semibold text-gray-900">#{idx + 1}</td>
                      <td className="py-3 px-3 font-semibold text-gray-900">{ed.editor_name}</td>
                      <td className="py-3 px-3 font-mono">{ed.uploaded_count} 条</td>
                      <td className="py-3 px-3 font-mono">{ed.delivered_count} 条</td>
                      <td className="py-3 px-3 font-mono font-semibold text-blue-600">{ed.hit_count} 条</td>
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-blue-600 rounded-full"
                              style={{ width: `${Math.min(100, ed.hit_rate)}%` }}
                            />
                          </div>
                          <span className="font-mono font-semibold text-gray-900 w-12">{ed.hit_rate.toFixed(1)}%</span>
                        </div>
                      </td>
                      <td className="py-3 px-3 font-mono">¥{ed.total_cost.toLocaleString('zh-CN', { minimumFractionDigits: 1 })}</td>
                      <td className="py-3 px-3 font-mono font-semibold text-emerald-600">
                        ¥{ed.total_gmv.toLocaleString('zh-CN', { minimumFractionDigits: 1 })}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-semibold">
                        <span className={ed.first_day_roi >= reports.break_even_roi ? 'text-emerald-600' : 'text-gray-600'}>
                          {ed.total_cost > 0 ? ed.first_day_roi.toFixed(2) : '--'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* 第三栏：短剧剧目盈亏汇总表 */}
          <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-200">
              <h3 className="text-sm font-semibold text-gray-900">在投短剧剧目投产盈亏汇总表</h3>
              <p className="text-xs text-gray-500 mt-0.5">
                结合首日实时充值回本率与 7 日长尾复充经验系数（1.42x），评估单部短剧全周期盈利空间
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-gray-50 text-gray-500 border-b border-gray-200">
                  <tr>
                    <th className="py-3 px-4 font-medium">短剧名称</th>
                    <th className="py-3 px-3 font-medium">储备切片数</th>
                    <th className="py-3 px-3 font-medium">在投广告组数</th>
                    <th className="py-3 px-3 font-medium">累计广告消耗</th>
                    <th className="py-3 px-3 font-medium">首日充值流水 (笔数)</th>
                    <th className="py-3 px-3 font-medium">首日 ROI (当日回本率)</th>
                    <th className="py-3 px-4 font-medium text-right">预估7日累计 ROI (长尾总回本)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 text-gray-700">
                  {reports.drama_summary.map((dr) => (
                    <tr key={dr.drama_name} className="hover:bg-gray-50/80">
                      <td className="py-3 px-4 font-semibold text-gray-900">《{dr.drama_name}》</td>
                      <td className="py-3 px-3 font-mono">{dr.slice_count} 条</td>
                      <td className="py-3 px-3 font-mono">{dr.active_plans} 组</td>
                      <td className="py-3 px-3 font-mono">¥{dr.total_cost.toLocaleString('zh-CN', { minimumFractionDigits: 1 })}</td>
                      <td className="py-3 px-3 font-mono">
                        ¥{dr.total_gmv.toLocaleString('zh-CN', { minimumFractionDigits: 1 })}{' '}
                        <span className="text-gray-400">({dr.orders}笔)</span>
                      </td>
                      <td className="py-3 px-3 font-mono font-semibold">
                        {dr.total_cost > 0 ? (
                          <span className={dr.first_day_roi >= reports.break_even_roi ? 'text-emerald-600' : 'text-red-600'}>
                            {dr.first_day_roi.toFixed(2)}
                          </span>
                        ) : (
                          <span className="text-gray-400 font-normal">待消耗</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-semibold text-blue-600">
                        {dr.est_7d_roi > 0 ? dr.est_7d_roi.toFixed(2) : '--'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
