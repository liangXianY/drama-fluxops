import React from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
  Legend,
} from 'recharts';
import { ArrowRight } from 'lucide-react';
import { OverviewData, AuditLogItem } from '../api/client';

interface Props {
  overview: OverviewData;
  logs: AuditLogItem[];
  onNavigatePool: (stage?: string) => void;
}

export const DashboardView: React.FC<Props> = ({ overview, logs, onNavigatePool }) => {
  const { kpis, stage_counts, snapshots, config } = overview;
  const breakEven = config.break_even_roi;
  const isMarginalHealthy = kpis.marginal_roi_30m >= breakEven;

  return (
    <div className="space-y-6">
      {/* 顶部核心业务指标卡（宽敞留白呼吸感排版） */}
      <div className="grid grid-cols-1 sm:grid-cols-2 2xl:grid-cols-4 gap-5">
        <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm">
          <div className="text-xs font-medium text-gray-500">今日广告总消耗 (Cost / 实际花费)</div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-semibold text-gray-900">
              ¥{kpis.total_cost.toLocaleString('zh-CN', { minimumFractionDigits: 1 })}
            </span>
            <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
              在投计划 {kpis.active_plans} 组
            </span>
          </div>
          <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500">
            <span>本小时自动加仓已用额度</span>
            <span className="font-medium text-gray-700">
              ¥{config.current_hour_budget_added} / ¥{config.max_hourly_auto_budget_add}
            </span>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm">
          <div className="text-xs font-medium text-gray-500">今日短剧充值流水 (Gross / 用户解锁付费额)</div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-semibold text-gray-900">
              ¥{kpis.total_gmv.toLocaleString('zh-CN', { minimumFractionDigits: 1 })}
            </span>
            <span className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded">
              充值 {kpis.total_orders} 笔
            </span>
          </div>
          <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between gap-2 text-xs text-gray-500">
            <span className="truncate">首日 ROI (充值回本率)</span>
            <span className="font-semibold text-gray-900 shrink-0">
              {kpis.overall_roi.toFixed(2)} <span className="text-gray-400 font-normal">/ 线 {breakEven.toFixed(2)}</span>
            </span>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm">
          <div className="text-xs font-medium text-gray-500">近30m边际 ROI (实时增量充值回本率)</div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className={`text-2xl font-semibold ${isMarginalHealthy ? 'text-blue-600' : 'text-red-600'}`}>
              {kpis.marginal_roi_30m.toFixed(2)}
            </span>
            <span
              className={`text-xs px-2 py-0.5 rounded border font-medium ${
                isMarginalHealthy
                  ? 'bg-blue-50 text-blue-700 border-blue-200'
                  : 'bg-red-50 text-red-700 border-red-200'
              }`}
            >
              {isMarginalHealthy ? '跑量健康 · 高于回本线' : '边际下滑 · 疑似人群泛化'}
            </span>
          </div>
          <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between gap-2 text-xs text-gray-500">
            <span className="truncate">口径：30m新增充值 ÷ 新增消耗</span>
            <span className="text-gray-700 shrink-0">5m/次核算</span>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm">
          <div className="text-xs font-medium text-gray-500">系统自动止损累计拦截无效空耗</div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-semibold text-emerald-600">
              ¥{kpis.estimated_saved_loss.toLocaleString('zh-CN')}
            </span>
            <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">24h自动巡检</span>
          </div>
          <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500">
            <span>待处理飞书协同审批单</span>
            <span className={`font-semibold ${kpis.pending_feishu_cards > 0 ? 'text-amber-600' : 'text-gray-500'}`}>
              {kpis.pending_feishu_cards} 项待确认
            </span>
          </div>
        </div>
      </div>

      {/* 四态流量池赛马漏斗 */}
      <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">短剧切片四阶流量池状态分布（付免联动赛马漏斗）</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              说明：短剧无实物发货成本且具备 7 日后续复充长尾，行业通常以首日 ROI (首日回本率) ≥ {breakEven.toFixed(2)} 作为放量基准线
            </p>
          </div>
          <button
            onClick={() => onNavigatePool('ALL')}
            className="text-xs font-medium text-blue-600 hover:text-blue-700 flex items-center gap-1 shrink-0"
          >
            查看全部短剧切片 <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          {[
            {
              step: '01',
              key: 'OBSERVING',
              title: '自然流观察池',
              desc: '监测 CTR(封面点击率) ≥ 8% 且播放破千',
              count: stage_counts.OBSERVING || 0,
              dot: 'bg-sky-500',
            },
            {
              step: '02',
              key: 'TESTING',
              title: '测试池 (小额测转化)',
              desc: '自动建组投 ¥120 测卡点集充值率',
              count: stage_counts.TESTING || 0,
              dot: 'bg-indigo-500',
            },
            {
              step: '03',
              key: 'SCALING',
              title: '放量池 (批量裂变抢量)',
              desc: '首日ROI达标自动提预算+克隆广告组',
              count: stage_counts.SCALING || 0,
              dot: 'bg-emerald-500',
            },
            {
              step: '04',
              key: 'ELIMINATED',
              title: '淘汰池 (已关停止损)',
              desc: '空耗0充值自动关停 · 待AI改封面复投',
              count: stage_counts.ELIMINATED || 0,
              dot: 'bg-gray-400',
            },
          ].map((item) => (
            <button
              key={item.key}
              onClick={() => onNavigatePool(item.key)}
              className="text-left p-4 rounded-lg border border-gray-200 bg-gray-50/60 hover:bg-white hover:border-blue-400 transition group"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${item.dot}`} />
                  <span className="text-xs font-semibold text-gray-800">{item.title}</span>
                </div>
                <span className="text-xl font-bold text-gray-900 group-hover:text-blue-600 transition">
                  {item.count}
                </span>
              </div>
              <p className="text-xs text-gray-500 mt-1.5">{item.desc}</p>
            </button>
          ))}
        </div>
      </div>

      {/* 核心监控折线图 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm">
          <div className="mb-4">
            <h3 className="text-sm font-semibold text-gray-900">
              累计 ROI (全天回本率) vs 近30m边际 ROI (实时回本率) 对比曲线
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">
              核心风控逻辑：当蓝色实时线跌破红色首日回本线时，即便绿色全天均值仍达标，系统也会提前预警止损
            </p>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={snapshots}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" vertical={false} />
                <XAxis dataKey="time" stroke="#6B7280" fontSize={11} tickLine={false} />
                <YAxis stroke="#6B7280" fontSize={11} tickLine={false} axisLine={false} domain={[0, 'auto']} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#FFFFFF',
                    borderColor: '#E5E7EB',
                    borderRadius: '6px',
                    fontSize: '12px',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                  }}
                />
                <Legend wrapperStyle={{ fontSize: '12px' }} />
                <ReferenceLine
                  y={breakEven}
                  stroke="#DC2626"
                  strokeDasharray="4 4"
                  label={{ value: `首日回本线 ${breakEven}`, fill: '#DC2626', fontSize: 11, position: 'insideTopRight' }}
                />
                <Line
                  type="monotone"
                  dataKey="cumulative_roi"
                  name="全天累计 ROI (总回本率)"
                  stroke="#059669"
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                />
                <Line
                  type="monotone"
                  dataKey="marginal_roi_30m"
                  name="近30m边际 ROI (实时回本率)"
                  stroke="#2563EB"
                  strokeWidth={2}
                  dot={{ r: 2.5 }}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm">
          <div className="mb-4">
            <h3 className="text-sm font-semibold text-gray-900">每 5 分钟新增广告消耗与新增充值金额趋势</h3>
            <p className="text-xs text-gray-500 mt-0.5">实时追踪短剧广告组放量后的拿量速度与用户付费解锁产出</p>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={snapshots}>
                <defs>
                  <linearGradient id="lightGmvGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2563EB" stopOpacity={0.18} />
                    <stop offset="95%" stopColor="#2563EB" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="lightCostGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#F59E0B" stopOpacity={0.18} />
                    <stop offset="95%" stopColor="#F59E0B" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" vertical={false} />
                <XAxis dataKey="time" stroke="#6B7280" fontSize={11} tickLine={false} />
                <YAxis stroke="#6B7280" fontSize={11} tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#FFFFFF',
                    borderColor: '#E5E7EB',
                    borderRadius: '6px',
                    fontSize: '12px',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                  }}
                />
                <Legend wrapperStyle={{ fontSize: '12px' }} />
                <Area
                  type="monotone"
                  dataKey="delta_gmv_5m"
                  name="5分钟新增充值 (¥)"
                  stroke="#2563EB"
                  fill="url(#lightGmvGrad)"
                  strokeWidth={2}
                  isAnimationActive={false}
                />
                <Area
                  type="monotone"
                  dataKey="delta_cost_5m"
                  name="5分钟新增消耗 (¥)"
                  stroke="#D97706"
                  fill="url(#lightCostGrad)"
                  strokeWidth={2}
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* 最新自动化执行记录表（标准企业后台表格形态） */}
      <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
        <div className="px-5 py-3.5 border-b border-gray-200 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-900">自动化策略引擎最近执行记录</h3>
          <span className="text-xs text-gray-500">点击右上角「步进巡检 (+5m)」可模拟下一个 5 分钟周期自动判别</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-gray-50 text-gray-500 border-b border-gray-200">
              <tr>
                <th className="py-2.5 px-4 font-medium w-20">时间</th>
                <th className="py-2.5 px-3 font-medium w-24">动作类型</th>
                <th className="py-2.5 px-3 font-medium w-56">触发规则</th>
                <th className="py-2.5 px-3 font-medium">关联短剧切片与执行结果</th>
                <th className="py-2.5 px-4 font-medium text-right">触发时指标快照</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 text-gray-700">
              {logs.slice(0, 6).map((log) => (
                <tr key={log.id} className="hover:bg-gray-50/80">
                  <td className="py-2.5 px-4 font-mono text-gray-500">{log.timestamp_label}</td>
                  <td className="py-2.5 px-3">
                    <span
                      className={`inline-block px-2 py-0.5 rounded text-[11px] font-medium border ${
                        log.level === 'DANGER'
                          ? 'bg-red-50 text-red-700 border-red-200'
                          : log.level === 'WARNING'
                          ? 'bg-amber-50 text-amber-700 border-amber-200'
                          : log.level === 'SUCCESS'
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : 'bg-blue-50 text-blue-700 border-blue-200'
                      }`}
                    >
                      {log.impact_badge || '规则执行'}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 font-medium text-gray-900">{log.rule_name}</td>
                  <td className="py-2.5 px-3">
                    <span className="font-medium text-gray-900 mr-1.5">{log.video_title}</span>
                    <span className="text-gray-600">{log.action_taken}</span>
                  </td>
                  <td className="py-2.5 px-4 text-right font-mono text-gray-500">{log.metrics_snapshot}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
