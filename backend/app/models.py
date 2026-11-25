from sqlalchemy import Column, Integer, String, Float, Boolean, Text, ForeignKey
from sqlalchemy.orm import relationship
from .database import Base


class SystemConfig(Base):
    __tablename__ = "system_config"

    id = Column(Integer, primary_key=True, index=True)
    virtual_time = Column(String, default="18:00")
    tick_count = Column(Integer, default=0)
    gateway_mode = Column(String, default="SANDBOX")
    break_even_roi = Column(Float, default=0.90)
    max_plan_daily_budget = Column(Float, default=5000.0)
    max_hourly_auto_budget_add = Column(Float, default=4000.0)
    current_hour_budget_added = Column(Float, default=600.0)
    kill_switch_active = Column(Boolean, default=False)
    estimated_saved_loss = Column(Float, default=3120.0)
    llm_api_base = Column(String, default="")
    llm_api_key = Column(String, default="")
    llm_model = Column(String, default="deepseek-chat")


class AdAccount(Base):
    __tablename__ = "ad_accounts"

    id = Column(Integer, primary_key=True, index=True)
    account_code = Column(String, unique=True, index=True, nullable=False)
    channel = Column(String, index=True, nullable=False)  # KWAI (快手磁力智投) | OCEAN (抖音巨量广告)
    account_name = Column(String, nullable=False)
    daily_budget_cap = Column(Float, default=30000.0)
    status = Column(String, default="ACTIVE")


class ShortVideo(Base):
    __tablename__ = "short_videos"

    id = Column(Integer, primary_key=True, index=True)
    kwai_photo_id = Column(String, unique=True, index=True)
    title = Column(String, nullable=False)
    account_name = Column(String, nullable=False)
    product_name = Column(String, nullable=False)
    product_price = Column(Float, default=39.9)
    margin_rate = Column(Float, default=0.90)

    # OBSERVING | TESTING | SCALING | ELIMINATED
    pool_stage = Column(String, default="OBSERVING", index=True)

    cover_slogan = Column(String, nullable=False)
    cover_sub_slogan = Column(String, default="")
    cover_badge = Column(String, default="热播短剧")
    cover_theme = Column(String, default="orange")
    hook_3s = Column(String, default="")

    publish_minutes_ago = Column(Integer, default=30)
    organic_views = Column(Integer, default=0)
    organic_views_slope_15m = Column(Integer, default=0)
    impressions = Column(Integer, default=0)
    clicks = Column(Integer, default=0)
    cover_ctr = Column(Float, default=0.0)
    completion_3s_rate = Column(Float, default=0.0)

    ad_cost = Column(Float, default=0.0)
    ad_gmv = Column(Float, default=0.0)
    ad_orders = Column(Integer, default=0)
    total_roi = Column(Float, default=0.0)

    marginal_cost_30m = Column(Float, default=0.0)
    marginal_gmv_30m = Column(Float, default=0.0)
    marginal_roi_30m = Column(Float, default=0.0)

    active_plan_count = Column(Integer, default=0)
    total_daily_budget = Column(Float, default=0.0)
    status_note = Column(String, default="冷启动观察中")

    plans = relationship("AdPlan", back_populates="video", cascade="all, delete-orphan")


class MaterialAsset(Base):
    __tablename__ = "material_assets"

    id = Column(Integer, primary_key=True, index=True)
    material_code = Column(String, unique=True, index=True, nullable=False)
    md5_hash = Column(String, unique=True, index=True, nullable=False)
    file_name = Column(String, nullable=False)
    drama_name = Column(String, index=True, nullable=False)
    editor_name = Column(String, index=True, nullable=False)
    hook_type = Column(String, default="身份反差")
    resolution = Column(String, default="1080x1920")
    duration_sec = Column(Float, default=42.0)
    file_size_mb = Column(Float, default=48.5)
    spec_valid = Column(Boolean, default=True)

    # READY (待首投) | ACTIVE (在投跑量) | PAUSED (衰退停投) | REJECTED (审核驳回)
    audit_status = Column(String, default="READY", index=True)
    reject_reason = Column(String, default="")
    kwai_sync_status = Column(String, default="SYNCED")  # SYNCED | PENDING | REJECTED
    ocean_sync_status = Column(String, default="SYNCED")

    linked_video_id = Column(Integer, ForeignKey("short_videos.id"), nullable=True)
    created_time = Column(String, default="14:30")

    linked_video = relationship("ShortVideo")


class AdPlan(Base):
    __tablename__ = "ad_plans"

    id = Column(Integer, primary_key=True, index=True)
    unit_id = Column(String, unique=True, index=True)
    video_id = Column(Integer, ForeignKey("short_videos.id"))
    channel = Column(String, default="KWAI", index=True)  # KWAI | OCEAN
    account_code = Column(String, default="KWAI_101")
    plan_name = Column(String, nullable=False)
    status = Column(String, default="ACTIVE", index=True)  # ACTIVE | PAUSED
    bid_roi = Column(Float, default=0.90)
    daily_budget = Column(Float, default=120.0)
    cost = Column(Float, default=0.0)
    gmv = Column(Float, default=0.0)
    orders = Column(Integer, default=0)
    roi = Column(Float, default=0.0)
    marginal_roi_30m = Column(Float, default=0.0)
    created_by = Column(String, default="AUTO_RULE")

    video = relationship("ShortVideo", back_populates="plans")


class MetricSnapshot(Base):
    __tablename__ = "metric_snapshots"

    id = Column(Integer, primary_key=True, index=True)
    time_label = Column(String, nullable=False)
    total_cost = Column(Float, default=0.0)
    total_gmv = Column(Float, default=0.0)
    delta_cost_5m = Column(Float, default=0.0)
    delta_gmv_5m = Column(Float, default=0.0)
    cumulative_roi = Column(Float, default=0.0)
    marginal_roi_30m = Column(Float, default=0.0)
    organic_views_delta = Column(Integer, default=0)
    active_plans = Column(Integer, default=0)


class AutomationRule(Base):
    __tablename__ = "automation_rules"

    id = Column(Integer, primary_key=True, index=True)
    rule_code = Column(String, unique=True, index=True)
    name = Column(String, nullable=False)
    stage_scope = Column(String, nullable=False)
    description = Column(String, nullable=False)
    action_type = Column(String, nullable=False)
    params_json = Column(Text, nullable=False)
    enabled = Column(Boolean, default=True)
    hit_count = Column(Integer, default=0)


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, index=True)
    timestamp_label = Column(String, nullable=False)
    level = Column(String, default="INFO")
    rule_name = Column(String, nullable=False)
    video_title = Column(String, nullable=False)
    action_taken = Column(String, nullable=False)
    metrics_snapshot = Column(String, nullable=False)
    impact_badge = Column(String, default="")


class FeishuApprovalCard(Base):
    __tablename__ = "feishu_approval_cards"

    id = Column(Integer, primary_key=True, index=True)
    timestamp_label = Column(String, nullable=False)
    card_type = Column(String, nullable=False)
    title = Column(String, nullable=False)
    video_id = Column(Integer, nullable=False)
    video_title = Column(String, nullable=False)
    summary_text = Column(Text, nullable=False)
    suggested_action = Column(String, nullable=False)
    action_payload_json = Column(Text, nullable=False)
    status = Column(String, default="PENDING")
