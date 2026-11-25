import React, { useState } from 'react';
import { ChevronDown, ChevronUp, Eye } from 'lucide-react';
import { ShortVideo } from '../api/client';

interface Props {
  videos: ShortVideo[];
  selectedStage: string;
  onSelectStage: (stage: string) => void;
  onManualAction: (videoId: number, action: string) => void;
  onOpenAICopilot: (video: ShortVideo) => void;
  breakEvenRoi: number;
}

const COVER_ACCENTS: Record<string, string> = {
  orange: 'from-slate-800 via-stone-800 to-neutral-900',
  red: 'from-rose-900 via-stone-900 to-neutral-950',
  emerald: 'from-teal-900 via-slate-900 to-neutral-950',
  purple: 'from-indigo-950 via-slate-900 to-neutral-950',
  blue: 'from-slate-800 via-slate-900 to-neutral-950',
  amber: 'from-amber-950 via-stone-900 to-neutral-950',
};

const STAGE_META: Record<string, { label: string; badgeCls: string }> = {
  OBSERVING: { label: '自然流观察池', badgeCls: 'bg-sky-50 text-sky-700 border-sky-200' },
  TESTING: { label: '测试池 (测付费率)', badgeCls: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  SCALING: { label: '放量池 (矩阵抢量)', badgeCls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  ELIMINATED: { label: '淘汰池 (已关停止损)', badgeCls: 'bg-gray-100 text-gray-600 border-gray-200' },
};

export const TrafficPoolView: React.FC<Props> = ({
  videos,
  selectedStage,
  onSelectStage,
  onManualAction,
  onOpenAICopilot,
  breakEvenRoi,
}) => {
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const filtered = selectedStage === 'ALL' ? videos : videos.filter((v) => v.pool_stage === selectedStage);

  const tabs = [
    { key: 'ALL', label: `全部切片 (${videos.length})` },
    { key: 'OBSERVING', label: `自然流观察池 (${videos.filter((v) => v.pool_stage === 'OBSERVING').length})` },
    { key: 'TESTING', label: `测试池 (${videos.filter((v) => v.pool_stage === 'TESTING').length})` },
    { key: 'SCALING', label: `放量池 (${videos.filter((v) => v.pool_stage === 'SCALING').length})` },
    { key: 'ELIMINATED', label: `淘汰池 (${videos.filter((v) => v.pool_stage === 'ELIMINATED').length})` },
  ];

  return (
    <div className="space-y-4">
      {/* 筛选控制条 */}
      <div className="bg-white border border-gray-200 rounded-lg p-3.5 flex flex-wrap items-center justify-between gap-3 shadow-sm">
        <div className="flex flex-wrap gap-1.5">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => onSelectStage(t.key)}
              className={`px-3.5 py-1.5 rounded-md text-xs font-medium transition ${
                selectedStage === t.key
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <span className="text-xs text-gray-500">
          短剧首日回本基准线：<strong className="text-gray-900">ROI ≥ {breakEvenRoi.toFixed(2)}</strong>（左侧模拟快手发现页双列剧集封面）
        </span>
      </div>

      {/* 切片监控卡片列表（分屏模式下单列宽敞展示，超宽大屏双列展示） */}
      <div className="grid grid-cols-1 2xl:grid-cols-2 gap-5">
        {filtered.map((video) => {
          const stageInfo = STAGE_META[video.pool_stage] || STAGE_META.OBSERVING;
          const coverBg = COVER_ACCENTS[video.cover_theme] || COVER_ACCENTS.orange;
          const isExpanded = expandedId === video.id;

          return (
            <div
              key={video.id}
              className="bg-white border border-gray-200 hover:border-gray-300 rounded-lg p-4 flex flex-col gap-3.5 shadow-sm transition"
            >
              <div className="flex flex-col sm:flex-row gap-4">
                {/* 左侧：克制写实的快手竖屏短剧双列封面缩略卡 */}
                <div
                  className={`w-full sm:w-36 h-48 shrink-0 rounded-md bg-gradient-to-b ${coverBg} p-2.5 flex flex-col justify-between text-white border border-gray-200`}
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="bg-white/15 backdrop-blur px-1.5 py-0.5 rounded text-[10px] font-medium text-white">
                      {video.cover_badge}
                    </span>
                    <span
                      className="bg-black/45 px-1.5 py-0.5 rounded text-[10px] text-amber-200"
                      title="用户付费解锁单部短剧或充值包的平均客单金额"
                    >
                      解锁 ¥{video.product_price}
                    </span>
                  </div>

                  <div className="my-auto">
                    <div className="bg-amber-300 text-gray-950 font-bold text-[11px] px-1.5 py-1 rounded leading-snug">
                      {video.cover_slogan}
                    </div>
                    <div className="mt-1 text-[10px] text-gray-200 leading-tight line-clamp-2">
                      {video.cover_sub_slogan}
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-[10px] text-gray-300 border-t border-white/15 pt-1.5">
                    <span className="truncate max-w-[76px]">{video.account_name}</span>
                    <span className="flex items-center gap-0.5 font-mono">
                      <Eye className="w-3 h-3" />
                      {video.organic_views >= 10000
                        ? `${(video.organic_views / 10000).toFixed(1)}w`
                        : video.organic_views}
                    </span>
                  </div>
                </div>

                {/* 右侧：短剧业务与投放指标 */}
                <div className="flex-1 flex flex-col justify-between min-w-0">
                  <div>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className={`text-xs px-2.5 py-0.5 rounded border font-medium ${stageInfo.badgeCls}`}>
                        {stageInfo.label}
                      </span>
                      <span className="text-xs text-gray-400 font-mono">
                        ID: {video.kwai_photo_id} · 发布 {video.publish_minutes_ago}分钟
                      </span>
                    </div>

                    <h3 className="text-sm font-semibold text-gray-900 mt-1.5 line-clamp-1" title={video.title}>
                      {video.title}
                    </h3>
                    <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">
                      前3秒剧情钩子：{video.hook_3s}
                    </p>

                    {/* 6项关键指标（全部带中文括号释义） */}
                    <div className="grid grid-cols-3 gap-2.5 mt-3 bg-gray-50 border border-gray-200/80 rounded-md p-2.5 text-xs">
                      <div>
                        <div className="text-gray-500 text-[11px]">CTR (封面点击率)</div>
                        <div
                          className={`font-semibold text-sm mt-0.5 ${
                            video.cover_ctr >= 8.0
                              ? 'text-emerald-600'
                              : video.cover_ctr < 6.0
                              ? 'text-red-600'
                              : 'text-gray-900'
                          }`}
                        >
                          {video.cover_ctr.toFixed(1)}%
                        </div>
                      </div>
                      <div>
                        <div className="text-gray-500 text-[11px]">3秒完播 (开头留存)</div>
                        <div
                          className={`font-semibold text-sm mt-0.5 ${
                            video.completion_3s_rate >= 60
                              ? 'text-emerald-600'
                              : video.completion_3s_rate < 45
                              ? 'text-red-600'
                              : 'text-gray-900'
                          }`}
                        >
                          {video.completion_3s_rate.toFixed(1)}%
                        </div>
                      </div>
                      <div>
                        <div className="text-gray-500 text-[11px]">15m播放增速</div>
                        <div className="font-semibold text-sm text-blue-600 mt-0.5">
                          +{video.organic_views_slope_15m}
                        </div>
                      </div>

                      <div className="border-t border-gray-200/80 pt-1.5">
                        <div className="text-gray-500 text-[11px]">消耗 / 充值金额</div>
                        <div className="font-semibold text-gray-900 mt-0.5">
                          ¥{video.ad_cost.toFixed(0)} / <span className="text-emerald-600">¥{video.ad_gmv.toFixed(0)}</span>
                        </div>
                      </div>
                      <div className="border-t border-gray-200/80 pt-1.5">
                        <div className="text-gray-500 text-[11px]">首日ROI (总回本率)</div>
                        <div
                          className={`font-semibold text-sm mt-0.5 ${
                            video.total_roi >= breakEvenRoi
                              ? 'text-emerald-600'
                              : video.ad_cost > 0
                              ? 'text-red-600'
                              : 'text-gray-400'
                          }`}
                        >
                          {video.ad_cost > 0 ? video.total_roi.toFixed(2) : '--'}
                        </div>
                      </div>
                      <div className="border-t border-gray-200/80 pt-1.5">
                        <div className="text-gray-500 text-[11px]">边际ROI (近30m回本)</div>
                        <div
                          className={`font-semibold text-sm mt-0.5 ${
                            video.marginal_roi_30m >= breakEvenRoi
                              ? 'text-blue-600'
                              : video.marginal_cost_30m > 0
                              ? 'text-red-600'
                              : 'text-gray-400'
                          }`}
                        >
                          {video.marginal_cost_30m > 0 ? video.marginal_roi_30m.toFixed(2) : '--'}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="mt-2 text-xs px-2.5 py-1.5 rounded bg-gray-50 border border-gray-100 text-gray-600 flex items-center justify-between">
                    <span className="truncate">{video.status_note}</span>
                    <span className="font-medium text-gray-800 shrink-0 ml-2">
                      在投 {video.active_plan_count} 组 (日预算 ¥{video.total_daily_budget})
                    </span>
                  </div>
                </div>
              </div>

              {/* 底部操作按钮区（克制清晰的企业级次级按钮） */}
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 pt-3">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => onOpenAICopilot(video)}
                    className="px-3 py-1.5 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium transition"
                  >
                    智能归因诊断 & 封面裂变
                  </button>

                  {video.pool_stage === 'OBSERVING' && (
                    <button
                      onClick={() => onManualAction(video.id, 'BOOST_TEST')}
                      className="px-2.5 py-1.5 rounded-md bg-white hover:bg-gray-50 text-gray-700 border border-gray-300 text-xs font-medium transition"
                    >
                      手动建组测剧 (¥120)
                    </button>
                  )}

                  {(video.pool_stage === 'TESTING' || video.pool_stage === 'SCALING') && (
                    <>
                      <button
                        onClick={() => onManualAction(video.id, 'SCALE_UP')}
                        className="px-2.5 py-1.5 rounded-md bg-white hover:bg-blue-50 text-blue-600 border border-blue-200 text-xs font-medium transition"
                      >
                        提预算 + 克隆广告组
                      </button>
                      {video.active_plan_count > 0 ? (
                        <button
                          onClick={() => onManualAction(video.id, 'PAUSE_ALL')}
                          className="px-2.5 py-1.5 rounded-md bg-white hover:bg-red-50 text-red-600 border border-red-200 text-xs font-medium transition"
                        >
                          一键关停止损
                        </button>
                      ) : video.plans.length > 0 ? (
                        <button
                          onClick={() => onManualAction(video.id, 'RESUME_PLANS')}
                          className="px-2.5 py-1.5 rounded-md bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 text-xs font-medium transition"
                        >
                          恢复已暂停计划
                        </button>
                      ) : null}
                    </>
                  )}

                  {video.pool_stage === 'ELIMINATED' && video.plans.length > 0 && (
                    <button
                      onClick={() => onManualAction(video.id, 'RESUME_PLANS')}
                      className="px-2.5 py-1.5 rounded-md bg-white hover:bg-gray-50 text-gray-600 border border-gray-300 text-xs transition"
                    >
                      恢复原广告组
                    </button>
                  )}
                </div>

                {video.plans.length > 0 && (
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : video.id)}
                    className="text-xs text-gray-500 hover:text-gray-900 flex items-center gap-1"
                  >
                    磁力智投广告组明细 ({video.plans.length})
                    {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  </button>
                )}
              </div>

              {/* 展开的磁力智投广告组明细表 */}
              {isExpanded && video.plans.length > 0 && (
                <div className="border border-gray-200 rounded-md overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-gray-50 text-gray-500 border-b border-gray-200">
                      <tr>
                        <th className="py-2 px-3 font-medium">广告组ID / 名称</th>
                        <th className="py-2 px-2 font-medium">状态</th>
                        <th className="py-2 px-2 font-medium">创建方式</th>
                        <th className="py-2 px-2 font-medium">目标ROI出价</th>
                        <th className="py-2 px-2 font-medium">日预算</th>
                        <th className="py-2 px-2 font-medium">消耗 / 充值额</th>
                        <th className="py-2 px-2 font-medium">首日ROI (回本率)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 text-gray-700">
                      {video.plans.map((p) => (
                        <tr key={p.id} className="hover:bg-gray-50">
                          <td className="py-2 px-3 font-mono text-gray-800">
                            <span
                              className={`inline-block mr-1.5 px-1.5 py-0.2 rounded font-sans text-[10px] ${
                                p.channel === 'OCEAN'
                                  ? 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                                  : 'bg-orange-50 text-orange-700 border border-orange-200'
                              }`}
                            >
                              {p.channel === 'OCEAN' ? '巨量' : '磁力'}
                            </span>
                            {p.unit_id} <span className="font-sans text-gray-500 ml-1">{p.plan_name}</span>
                          </td>
                          <td className="py-2 px-2">
                            <span
                              className={`px-1.5 py-0.5 rounded text-[11px] font-medium ${
                                p.status === 'ACTIVE' ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500'
                              }`}
                            >
                              {p.status === 'ACTIVE' ? '投放中' : '已暂停'}
                            </span>
                          </td>
                          <td className="py-2 px-2 text-gray-500">{p.created_by}</td>
                          <td className="py-2 px-2 font-mono">{p.bid_roi.toFixed(2)}</td>
                          <td className="py-2 px-2 font-mono">¥{p.daily_budget}</td>
                          <td className="py-2 px-2 font-mono">
                            ¥{p.cost.toFixed(1)} / ¥{p.gmv.toFixed(1)}
                          </td>
                          <td className={`py-2 px-2 font-mono font-semibold ${p.roi >= breakEvenRoi ? 'text-emerald-600' : 'text-red-600'}`}>
                            {p.cost > 0 ? p.roi.toFixed(2) : '--'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
