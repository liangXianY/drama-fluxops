export interface AdPlan {
  id: number;
  unit_id: string;
  video_id: number;
  channel: string;
  account_code: string;
  plan_name: string;
  status: 'ACTIVE' | 'PAUSED';
  bid_roi: number;
  daily_budget: number;
  cost: number;
  gmv: number;
  orders: number;
  roi: number;
  marginal_roi_30m: number;
  created_by: string;
}

export interface ShortVideo {
  id: number;
  kwai_photo_id: string;
  title: string;
  account_name: string;
  product_name: string;
  product_price: number;
  margin_rate: number;
  pool_stage: 'OBSERVING' | 'TESTING' | 'SCALING' | 'ELIMINATED';
  cover_slogan: string;
  cover_sub_slogan: string;
  cover_badge: string;
  cover_theme: string;
  hook_3s: string;
  publish_minutes_ago: number;
  organic_views: number;
  organic_views_slope_15m: number;
  impressions: number;
  clicks: number;
  cover_ctr: number;
  completion_3s_rate: number;
  ad_cost: number;
  ad_gmv: number;
  ad_orders: number;
  total_roi: number;
  marginal_cost_30m: number;
  marginal_gmv_30m: number;
  marginal_roi_30m: number;
  active_plan_count: number;
  total_daily_budget: number;
  status_note: string;
  plans: AdPlan[];
}

export interface MaterialAsset {
  id: number;
  material_code: string;
  md5_hash: string;
  file_name: string;
  drama_name: string;
  editor_name: string;
  hook_type: string;
  resolution: string;
  duration_sec: number;
  file_size_mb: number;
  spec_valid: boolean;
  audit_status: 'READY' | 'ACTIVE' | 'PAUSED' | 'REJECTED';
  reject_reason: string;
  kwai_sync_status: string;
  ocean_sync_status: string;
  linked_video_id: number | null;
  pool_stage: string | null;
  cover_ctr: number;
  ad_cost: number;
  ad_gmv: number;
  first_day_roi: number;
  active_plans: number;
  created_time: string;
}

export interface AdAccount {
  id: number;
  account_code: string;
  channel: 'KWAI' | 'OCEAN';
  account_name: string;
  daily_budget_cap: number;
  status: string;
  active_plans: number;
  total_spend: number;
}

export interface UploadBatchResult {
  created_count: number;
  duplicate_count: number;
  warning_count: number;
  results: Array<{
    file_name: string;
    outcome: 'CREATED' | 'DUPLICATE' | 'SPEC_WARNING';
    material_code: string;
    message: string;
  }>;
}

export interface MultidimReportData {
  break_even_roi: number;
  editor_ranking: Array<{
    editor_name: string;
    uploaded_count: number;
    delivered_count: number;
    hit_count: number;
    total_cost: number;
    total_gmv: number;
    hit_rate: number;
    first_day_roi: number;
  }>;
  drama_summary: Array<{
    drama_name: string;
    slice_count: number;
    active_plans: number;
    total_cost: number;
    total_gmv: number;
    orders: number;
    first_day_roi: number;
    est_7d_roi: number;
  }>;
  channel_comparison: Array<{
    channel: string;
    channel_label: string;
    account_count: number;
    active_plans: number;
    total_plans: number;
    total_cost: number;
    total_gmv: number;
    orders: number;
    first_day_roi: number;
  }>;
}

export interface OverviewData {
  config: {
    virtual_time: string;
    gateway_mode: string;
    break_even_roi: number;
    max_plan_daily_budget: number;
    max_hourly_auto_budget_add: number;
    current_hour_budget_added: number;
    kill_switch_active: boolean;
    estimated_saved_loss: number;
    llm_configured: boolean;
    llm_api_base: string;
    llm_model: string;
  };
  kpis: {
    total_cost: number;
    total_gmv: number;
    total_orders: number;
    overall_roi: number;
    marginal_roi_30m: number;
    active_plans: number;
    total_videos: number;
    estimated_saved_loss: number;
    pending_feishu_cards: number;
  };
  stage_counts: Record<string, number>;
  snapshots: Array<{
    time: string;
    total_cost: number;
    total_gmv: number;
    delta_cost_5m: number;
    delta_gmv_5m: number;
    cumulative_roi: number;
    marginal_roi_30m: number;
    organic_views_delta: number;
    active_plans: number;
  }>;
}

export interface AutomationRule {
  id: number;
  rule_code: string;
  name: string;
  stage_scope: string;
  description: string;
  action_type: string;
  params: Record<string, number>;
  enabled: boolean;
  hit_count: number;
}

export interface AuditLogItem {
  id: number;
  timestamp_label: string;
  level: 'SUCCESS' | 'DANGER' | 'WARNING' | 'INFO';
  rule_name: string;
  video_title: string;
  action_taken: string;
  metrics_snapshot: string;
  impact_badge: string;
}

export interface FeishuCard {
  id: number;
  timestamp_label: string;
  card_type: string;
  title: string;
  video_id: number;
  video_title: string;
  summary_text: string;
  suggested_action: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
}

export interface AIDiagnosisResult {
  engine_source: string;
  bottleneck_tag: string;
  health_score: number;
  diagnosis_points: string[];
  cover_variants: Array<{
    badge: string;
    main_title: string;
    sub_title: string;
    visual_guide: string;
    predicted_ctr: number;
    theme: string;
  }>;
  script_hooks: Array<{
    hook_type: string;
    visual_action: string;
    audio_line: string;
  }>;
}

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(errText || `HTTP ${res.status}`);
  }
  return res.json();
}

export const api = {
  getOverview: () => request<OverviewData>('/api/overview'),
  getVideos: () => request<ShortVideo[]>('/api/videos'),
  getRules: () => request<AutomationRule[]>('/api/rules'),
  getAuditLogs: () => request<AuditLogItem[]>('/api/audit-logs'),
  getFeishuCards: () => request<FeishuCard[]>('/api/feishu-cards'),

  getMaterials: (params?: { drama?: string; editor?: string; status?: string; q?: string }) => {
    const qs = new URLSearchParams();
    if (params?.drama) qs.set('drama', params.drama);
    if (params?.editor) qs.set('editor', params.editor);
    if (params?.status) qs.set('status', params.status);
    if (params?.q) qs.set('q', params.q);
    const s = qs.toString();
    return request<MaterialAsset[]>(`/api/materials${s ? `?${s}` : ''}`);
  },
  batchUploadMaterials: (items: Array<Record<string, unknown>>) =>
    request<UploadBatchResult>('/api/materials/batch-upload', {
      method: 'POST',
      body: JSON.stringify({ items }),
    }),
  mockImportMaterials: () =>
    request<UploadBatchResult>('/api/materials/mock-import', { method: 'POST' }),
  getAccounts: () => request<AdAccount[]>('/api/accounts'),
  batchBuildPlans: (payload: {
    material_ids: number[];
    account_codes: string[];
    bid_rois: number[];
    daily_budget: number;
  }) =>
    request<{ ok: boolean; created_plans_count: number; touched_videos_count: number; total_budget_added: number }>(
      '/api/materials/batch-build',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    ),
  getMultidimReports: () => request<MultidimReportData>('/api/reports/multidim'),

  simTick: () => request<{ virtual_time: string; triggered_events: Array<{ level: string; title: string; detail: string }> }>('/api/sim/tick', { method: 'POST' }),
  simInjectViral: () => request<{ virtual_time: string; video_title: string; triggered_events: Array<{ level: string; title: string; detail: string }> }>('/api/sim/inject-viral', { method: 'POST' }),
  simInjectRunaway: () => request<{ virtual_time: string; video_title: string; triggered_events: Array<{ level: string; title: string; detail: string }> }>('/api/sim/inject-runaway', { method: 'POST' }),
  simReset: () => request<{ ok: boolean }>('/api/sim/reset', { method: 'POST' }),

  videoAction: (id: number, action: string, budget?: number, clone_count?: number) =>
    request(`/api/videos/${id}/action`, {
      method: 'POST',
      body: JSON.stringify({ action, budget, clone_count }),
    }),
  aiDiagnose: (id: number) => request<AIDiagnosisResult>(`/api/videos/${id}/ai-diagnose`, { method: 'POST' }),
  applyCover: (id: number, cover: Record<string, unknown>) =>
    request(`/api/videos/${id}/apply-cover`, {
      method: 'POST',
      body: JSON.stringify(cover),
    }),
  updateRule: (id: number, payload: { enabled?: boolean; params?: Record<string, number> }) =>
    request(`/api/rules/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  updateConfig: (payload: Record<string, unknown>) =>
    request('/api/config', {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  decideFeishuCard: (id: number, decision: 'APPROVE' | 'REJECT') =>
    request(`/api/feishu-cards/${id}/decide`, {
      method: 'POST',
      body: JSON.stringify(decision ? { decision } : {}),
    }),
};
