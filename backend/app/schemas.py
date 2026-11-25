from typing import List, Optional, Dict, Any
from pydantic import BaseModel


class AdPlanOut(BaseModel):
    id: int
    unit_id: str
    video_id: int
    channel: str
    account_code: str
    plan_name: str
    status: str
    bid_roi: float
    daily_budget: float
    cost: float
    gmv: float
    orders: int
    roi: float
    marginal_roi_30m: float
    created_by: str

    class Config:
        from_attributes = True


class ShortVideoOut(BaseModel):
    id: int
    kwai_photo_id: str
    title: str
    account_name: str
    product_name: str
    product_price: float
    margin_rate: float
    pool_stage: str
    cover_slogan: str
    cover_sub_slogan: str
    cover_badge: str
    cover_theme: str
    hook_3s: str
    publish_minutes_ago: int
    organic_views: int
    organic_views_slope_15m: int
    impressions: int
    clicks: int
    cover_ctr: float
    completion_3s_rate: float
    ad_cost: float
    ad_gmv: float
    ad_orders: int
    total_roi: float
    marginal_cost_30m: float
    marginal_gmv_30m: float
    marginal_roi_30m: float
    active_plan_count: int
    total_daily_budget: float
    status_note: str
    plans: List[AdPlanOut] = []

    class Config:
        from_attributes = True


class SystemConfigUpdate(BaseModel):
    break_even_roi: Optional[float] = None
    max_plan_daily_budget: Optional[float] = None
    max_hourly_auto_budget_add: Optional[float] = None
    kill_switch_active: Optional[bool] = None
    llm_api_base: Optional[str] = None
    llm_api_key: Optional[str] = None
    llm_model: Optional[str] = None


class RuleUpdate(BaseModel):
    enabled: Optional[bool] = None
    params: Optional[Dict[str, Any]] = None


class ManualActionRequest(BaseModel):
    action: str
    budget: Optional[float] = 120.0
    clone_count: Optional[int] = 2


class MaterialUploadItem(BaseModel):
    file_name: str
    md5_hash: str
    drama_name: str
    editor_name: str
    hook_type: str = "身份反差"
    width: int = 1080
    height: int = 1920
    duration_sec: float = 45.0
    file_size_mb: float = 52.0


class BatchMaterialUploadRequest(BaseModel):
    items: List[MaterialUploadItem]


class BatchBuildPlansRequest(BaseModel):
    material_ids: List[int]
    account_codes: List[str]
    bid_rois: List[float]
    daily_budget: float = 150.0
