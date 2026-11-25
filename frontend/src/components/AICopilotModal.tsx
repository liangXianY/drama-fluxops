import React from 'react';
import { X, Loader2 } from 'lucide-react';
import { ShortVideo, AIDiagnosisResult } from '../api/client';

interface Props {
  video: ShortVideo | null;
  loading: boolean;
  result: AIDiagnosisResult | null;
  onClose: () => void;
  onApplyCover: (videoId: number, cover: Record<string, unknown>) => void;
}

const COVER_PREVIEW_BG: Record<string, string> = {
  orange: 'from-slate-800 via-stone-800 to-neutral-900',
  red: 'from-rose-900 via-stone-900 to-neutral-950',
  emerald: 'from-teal-900 via-slate-900 to-neutral-950',
};

export const AICopilotModal: React.FC<Props> = ({ video, loading, result, onClose, onApplyCover }) => {
  if (!video) return null;

  return (
    <div className="fixed inset-0 z-50 bg-gray-900/40 backdrop-blur-[1px] flex items-center justify-center p-4">
      <div className="bg-white border border-gray-200 rounded-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto shadow-xl">
        {/* 弹窗头部 */}
        <div className="sticky top-0 z-20 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-gray-900">短剧切片智能归因诊断 & 双列封面裂变方案</h2>
            <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">
              当前分析切片：{video.title} ({video.kwai_photo_id})
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {loading || !result ? (
            <div className="py-16 flex flex-col items-center justify-center text-gray-500 gap-2.5">
              <Loader2 className="w-6 h-6 text-blue-600 animate-spin" />
              <p className="text-xs">正在分析 CTR (双列点击率)、前 3 秒留存与付费解锁转化漏斗...</p>
            </div>
          ) : (
            <>
              {/* 诊断结论摘要 */}
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-gray-200">
                  <div className="flex items-center gap-3">
                    <span
                      className={`text-xl font-bold px-3 py-1 rounded border ${
                        result.health_score >= 80
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : result.health_score >= 55
                          ? 'bg-amber-50 text-amber-700 border-amber-200'
                          : 'bg-red-50 text-red-700 border-red-200'
                      }`}
                    >
                      健康度 {result.health_score}分
                    </span>
                    <div>
                      <div className="text-xs text-gray-500">核心转化瓶颈定位</div>
                      <div className="text-sm font-semibold text-gray-900">{result.bottleneck_tag}</div>
                    </div>
                  </div>
                  <span className="text-xs px-2.5 py-1 rounded bg-white text-gray-600 border border-gray-200">
                    诊断引擎：{result.engine_source}
                  </span>
                </div>

                <ul className="space-y-2 mt-3">
                  {result.diagnosis_points.map((pt, i) => (
                    <li key={i} className="text-xs text-gray-700 flex items-start gap-2 leading-relaxed">
                      <span className="font-semibold text-blue-600 shrink-0">{i + 1}.</span>
                      <span>{pt}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* 3组快手双列封面 A/B 测试方案 */}
              <div>
                <h3 className="text-sm font-semibold text-gray-900 mb-1">
                  快手发现页「双列封面」A/B 赛马裂变方案
                </h3>
                <p className="text-xs text-gray-500 mb-3">
                  点击下方按钮可将该封面同步替换至切片，若切片原处于淘汰池将自动重新投入自然流观察池测流
                </p>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {result.cover_variants.map((cv, idx) => {
                    const bg = COVER_PREVIEW_BG[cv.theme] || COVER_PREVIEW_BG.orange;
                    return (
                      <div key={idx} className="bg-white border border-gray-200 rounded-lg p-3.5 flex flex-col justify-between gap-3">
                        <div className={`h-40 rounded-md bg-gradient-to-b ${bg} p-3 flex flex-col justify-between text-white`}>
                          <div className="flex items-center justify-between">
                            <span className="bg-white/15 px-2 py-0.5 rounded text-[10px]">{cv.badge}</span>
                            <span className="bg-emerald-500 text-white text-[10px] font-semibold px-1.5 py-0.5 rounded">
                              预估 CTR {cv.predicted_ctr}%
                            </span>
                          </div>
                          <div>
                            <div className="bg-amber-300 text-gray-950 font-bold text-xs px-2 py-1 rounded leading-snug">
                              {cv.main_title}
                            </div>
                            <div className="mt-1 text-[11px] text-gray-200">{cv.sub_title}</div>
                          </div>
                        </div>

                        <p className="text-xs text-gray-600 leading-relaxed">
                          <strong className="text-gray-900">画面排版建议：</strong>
                          {cv.visual_guide}
                        </p>

                        <button
                          onClick={() => onApplyCover(video.id, cv)}
                          className="w-full py-2 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium transition"
                        >
                          应用此封面并重测流量池
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* 黄金前3秒与结尾卡点重剪脚本 */}
              <div>
                <h3 className="text-sm font-semibold text-gray-900 mb-3">短剧切片前 3 秒钩子与付费卡点优化脚本</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {result.script_hooks.map((sh, i) => (
                    <div key={i} className="bg-gray-50 border border-gray-200 rounded-lg p-4 space-y-2 text-xs">
                      <div className="font-semibold text-gray-900">{sh.hook_type}</div>
                      <div className="text-gray-600">
                        <span className="text-gray-900 font-medium">剪辑画面：</span>
                        {sh.visual_action}
                      </div>
                      <div className="bg-white border border-gray-200 rounded p-2.5 text-gray-800">
                        {sh.audio_line}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
