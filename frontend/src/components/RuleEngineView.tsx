import React, { useState, useEffect } from 'react';
import { AutomationRule, OverviewData, AuditLogItem } from '../api/client';

interface Props {
  overview: OverviewData;
  rules: AutomationRule[];
  logs: AuditLogItem[];
  onToggleRule: (rule: AutomationRule) => void;
  onSaveRuleParams: (ruleId: number, params: Record<string, number>) => void;
  onUpdateConfig: (payload: Record<string, unknown>) => void;
}

const PARAM_LABELS: Record<string, string> = {
  min_organic_views: '触发最低自然播放量',
  min_cover_ctr: '最低 CTR (封面点击率 %)',
  test_budget: '新建测试组日预算 (¥)',
  bid_roi: '目标首日 ROI (回本率) 出价',
  min_test_cost: '晋级评估最低消耗门槛 (¥)',
  min_marginal_roi: '最低近30m边际 ROI (实时回本率)',
  add_budget: '主力组单次上调预算 (¥)',
  clone_count: '自动裂变克隆广告组数',
  zero_order_max_cost: '0充值空耗强制关停线 (¥)',
  low_roi_threshold: '低效止损首日 ROI 红线',
  low_roi_min_cost: '低效止损评估消耗门槛 (¥)',
  min_window_cost: '近30m监控最低消耗门槛 (¥)',
  cut_budget_ratio: '预警建议下调预算比例',
};

export const RuleEngineView: React.FC<Props> = ({
  overview,
  rules,
  logs,
  onToggleRule,
  onSaveRuleParams,
  onUpdateConfig,
}) => {
  const { config } = overview;
  const [breakEven, setBreakEven] = useState(config.break_even_roi);
  const [maxPlanCap, setMaxPlanCap] = useState(config.max_plan_daily_budget);
  const [maxHourlyAdd, setMaxHourlyAdd] = useState(config.max_hourly_auto_budget_add);
  const [apiBase, setApiBase] = useState(config.llm_api_base || '');
  const [apiKey, setApiKey] = useState('');
  const [llmModel, setLlmModel] = useState(config.llm_model || 'deepseek-chat');
  const [editingParams, setEditingParams] = useState<Record<number, Record<string, number>>>({});

  useEffect(() => {
    setBreakEven(config.break_even_roi);
    setMaxPlanCap(config.max_plan_daily_budget);
    setMaxHourlyAdd(config.max_hourly_auto_budget_add);
    setApiBase(config.llm_api_base || '');
    setLlmModel(config.llm_model || 'deepseek-chat');
  }, [config.break_even_roi, config.max_plan_daily_budget, config.max_hourly_auto_budget_add, config.llm_api_base, config.llm_model]);

  const handleParamChange = (rule: AutomationRule, key: string, val: number) => {
    const base = editingParams[rule.id] || { ...rule.params };
    setEditingParams({
      ...editingParams,
      [rule.id]: { ...base, [key]: val },
    });
  };

  return (
    <div className="space-y-5">
      {/* 账户级全局资金安全锁 */}
      <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-gray-100">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">账户级全局资金安全锁（防跑飞硬边界）</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              确定性风控保护：任何自动化加仓动作均受以下预算硬顶约束，杜绝脚本异常或半夜流量突增造成超额亏损
            </p>
          </div>

          <button
            onClick={() => onUpdateConfig({ kill_switch_active: !config.kill_switch_active })}
            className={`px-4 py-2 rounded-md text-xs font-medium transition ${
              config.kill_switch_active
                ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                : 'bg-red-600 hover:bg-red-700 text-white'
            }`}
          >
            {config.kill_switch_active ? '解除账户熔断状态（恢复巡检）' : '一键紧急熔断（暂停全账户在投计划）'}
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-4 items-end">
          <div>
            <label className="block text-xs text-gray-600 mb-1">短剧首日 ROI (充值回本率) 基准线</label>
            <input
              type="number"
              step="0.05"
              value={breakEven}
              onChange={(e) => setBreakEven(parseFloat(e.target.value) || 0.5)}
              className="w-full bg-white border border-gray-300 focus:border-blue-500 focus:outline-none rounded-md px-3 py-1.5 text-sm text-gray-900"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-600 mb-1">单个广告组日预算上限 (¥)</label>
            <input
              type="number"
              step="100"
              value={maxPlanCap}
              onChange={(e) => setMaxPlanCap(parseFloat(e.target.value) || 1000)}
              className="w-full bg-white border border-gray-300 focus:border-blue-500 focus:outline-none rounded-md px-3 py-1.5 text-sm text-gray-900"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-600 mb-1">单小时自动加仓预算总额上限 (¥)</label>
            <input
              type="number"
              step="100"
              value={maxHourlyAdd}
              onChange={(e) => setMaxHourlyAdd(parseFloat(e.target.value) || 1000)}
              className="w-full bg-white border border-gray-300 focus:border-blue-500 focus:outline-none rounded-md px-3 py-1.5 text-sm text-gray-900"
            />
          </div>
          <button
            onClick={() =>
              onUpdateConfig({
                break_even_roi: breakEven,
                max_plan_daily_budget: maxPlanCap,
                max_hourly_auto_budget_add: maxHourlyAdd,
              })
            }
            className="bg-blue-600 hover:bg-blue-700 text-white font-medium text-xs px-4 py-2 rounded-md transition"
          >
            保存全局安全参数
          </button>
        </div>
      </div>

      {/* L1 确定性自动化规则列表 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {rules.map((rule) => {
          const currentParams = editingParams[rule.id] || rule.params;
          const isDirty = Boolean(editingParams[rule.id]);

          return (
            <div
              key={rule.id}
              className={`bg-white border border-gray-200 rounded-lg p-5 shadow-sm transition ${
                rule.enabled ? '' : 'opacity-60'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-gray-100 text-gray-700 border border-gray-200">
                      {rule.stage_scope}
                    </span>
                    <h4 className="text-sm font-semibold text-gray-900">{rule.name}</h4>
                  </div>
                  <p className="text-xs text-gray-500 mt-1.5 leading-relaxed">{rule.description}</p>
                </div>

                <button
                  onClick={() => onToggleRule(rule)}
                  className={`px-3 py-1 rounded text-xs font-medium shrink-0 border transition ${
                    rule.enabled
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      : 'bg-gray-100 text-gray-500 border-gray-200'
                  }`}
                >
                  {rule.enabled ? '运行中' : '已停用'}
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3 mt-4 bg-gray-50 p-3 rounded-md border border-gray-200/80">
                {Object.entries(currentParams).map(([k, v]) => (
                  <div key={k}>
                    <label className="block text-[11px] text-gray-500 mb-1">{PARAM_LABELS[k] || k}</label>
                    <input
                      type="number"
                      step="0.05"
                      value={v}
                      onChange={(e) => handleParamChange(rule, k, parseFloat(e.target.value) || 0)}
                      className="w-full bg-white border border-gray-300 focus:border-blue-500 focus:outline-none rounded px-2.5 py-1 text-xs text-gray-900"
                    />
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-between mt-3 pt-2 text-xs text-gray-500">
                <span>
                  累计命中执行：<strong className="text-gray-900">{rule.hit_count}</strong> 次
                </span>
                {isDirty && (
                  <button
                    onClick={() => {
                      onSaveRuleParams(rule.id, currentParams);
                      const copy = { ...editingParams };
                      delete copy[rule.id];
                      setEditingParams(copy);
                    }}
                    className="px-3 py-1 rounded bg-blue-600 hover:bg-blue-700 text-white font-medium"
                  >
                    应用阈值修改
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* 外部大模型 API 接入配置 */}
      <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">AI 素材诊断模型接入（支持任意兼容 OpenAI 接口的厂商 API Key）</h3>
            <p className="text-xs text-gray-500 mt-0.5">未配置外部密钥时，系统默认使用内置短剧磁力智投策略库生成诊断与双列封面方案</p>
          </div>
          <span className="text-xs px-2.5 py-1 rounded bg-blue-50 text-blue-700 border border-blue-200">
            {config.llm_configured ? `当前使用外部模型: ${config.llm_model}` : '当前使用：内置短剧策略引擎（免Key可用）'}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 mb-3 text-xs">
          <span className="text-gray-500">快捷填入厂商接口：</span>
          {[
            { label: 'DeepSeek', base: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
            { label: '阿里百炼 (通义千问)', base: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-plus' },
            { label: '硅基流动 SiliconFlow', base: 'https://api.siliconflow.cn/v1', model: 'Qwen/Qwen2.5-72B-Instruct' },
            { label: '智谱 GLM', base: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-4-flash' },
            { label: '火山方舟 (豆包)', base: 'https://ark.cn-beijing.volces.com/api/v3', model: 'doubao-pro-32k' },
            { label: 'Moonshot (Kimi)', base: 'https://api.moonshot.cn/v1', model: 'moonshot-v1-8k' },
            { label: 'OpenAI / 通用中转', base: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
          ].map((preset) => (
            <button
              key={preset.label}
              type="button"
              onClick={() => {
                setApiBase(preset.base);
                setLlmModel(preset.model);
              }}
              className="px-2.5 py-1 rounded bg-gray-100 hover:bg-blue-50 hover:text-blue-700 border border-gray-200 text-gray-700 transition"
            >
              {preset.label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
          <div>
            <label className="block text-xs text-gray-600 mb-1">接口地址 (API Base URL)</label>
            <input
              placeholder="https://api.deepseek.com/v1"
              value={apiBase}
              onChange={(e) => setApiBase(e.target.value)}
              className="w-full bg-white border border-gray-300 rounded-md px-3 py-1.5 text-xs text-gray-900 font-mono"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-600 mb-1">
              密钥 (API Key) {config.llm_configured ? '· 已保存' : ''}
            </label>
            <input
              type="password"
              placeholder={config.llm_configured ? '•••••••• (留空保持不变)' : 'sk-...'}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              className="w-full bg-white border border-gray-300 rounded-md px-3 py-1.5 text-xs text-gray-900 font-mono"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-600 mb-1">模型名称 (Model)</label>
            <input
              placeholder="deepseek-chat"
              value={llmModel}
              onChange={(e) => setLlmModel(e.target.value)}
              className="w-full bg-white border border-gray-300 rounded-md px-3 py-1.5 text-xs text-gray-900 font-mono"
            />
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                onUpdateConfig({ llm_api_base: apiBase, llm_api_key: apiKey, llm_model: llmModel });
                setApiKey('');
              }}
              className="flex-1 bg-gray-900 hover:bg-gray-800 text-white text-xs font-medium px-3 py-2 rounded-md transition"
            >
              保存模型配置
            </button>
            {config.llm_configured && (
              <button
                onClick={() => {
                  onUpdateConfig({ llm_api_key: '__CLEAR__' });
                  setApiKey('');
                }}
                className="bg-white hover:bg-gray-50 text-gray-600 text-xs px-2.5 py-2 rounded-md border border-gray-300 transition"
              >
                切回内置
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 完整执行审计日志 */}
      <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">自动化规则历史审计流水 ({logs.length})</h3>
        <div className="max-h-72 overflow-y-auto divide-y divide-gray-100 border border-gray-200 rounded-md">
          {logs.map((l) => (
            <div key={l.id} className="px-4 py-2.5 text-xs flex flex-wrap items-center justify-between gap-2 hover:bg-gray-50">
              <div>
                <span className="font-mono text-gray-400 mr-2">{l.timestamp_label}</span>
                <span className="font-semibold text-gray-800 mr-2">[{l.rule_name}]</span>
                <span className="text-blue-600 font-medium mr-2">{l.video_title}</span>
                <span className="text-gray-600">{l.action_taken}</span>
              </div>
              <span className="font-mono text-gray-500">{l.metrics_snapshot}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
