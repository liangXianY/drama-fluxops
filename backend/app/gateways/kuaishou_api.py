"""
快手磁力引擎 Marketing API (磁力金牛 / 磁力智投) 双模网关适配器
- SandboxMagneticTaurusGateway: 本地高保真沙盒执行器（MVP 默认激活，零企业密钥直接闭环运行）
- OfficialMagneticTaurusGateway: 快手官方 OpenAPI v2 标准签名与限流调用骨架（接入企业 AppID/Access-Token 即可切换真机）
"""
from abc import ABC, abstractmethod
import random
from typing import Dict, Any, List
import httpx
from sqlalchemy.orm import Session
from ..models import ShortVideo, AdPlan


class BaseMagneticTaurusGateway(ABC):
    @abstractmethod
    def create_test_unit(self, db: Session, video: ShortVideo, budget: float, bid_roi: float, created_by: str = "AUTO_RULE") -> AdPlan:
        pass

    @abstractmethod
    def scale_and_clone_units(self, db: Session, video: ShortVideo, add_budget: float, clone_count: int, max_plan_cap: float) -> List[AdPlan]:
        pass

    @abstractmethod
    def pause_all_units(self, db: Session, video: ShortVideo, reason: str) -> int:
        pass


class SandboxMagneticTaurusGateway(BaseMagneticTaurusGateway):
    """MVP 高保真本地沙盒网关：直接驱动数据库状态并与流量池仿真器联动"""

    def _sync_video_plan_summary(self, video: ShortVideo):
        active_plans = [p for p in video.plans if p.status == "ACTIVE"]
        video.active_plan_count = len(active_plans)
        video.total_daily_budget = round(sum(p.daily_budget for p in active_plans), 2)

    def create_test_unit(
        self,
        db: Session,
        video: ShortVideo,
        budget: float = 100.0,
        bid_roi: float = 1.5,
        created_by: str = "AUTO_RULE",
    ) -> AdPlan:
        unit_id = f"ZT_{random.randint(100000, 999999)}"
        plan = AdPlan(
            unit_id=unit_id,
            video_id=video.id,
            plan_name=f"智投测剧_{video.product_name[:6]}_{unit_id[-4:]}",
            status="ACTIVE",
            bid_roi=bid_roi,
            daily_budget=budget,
            cost=0.0,
            gmv=0.0,
            orders=0,
            roi=0.0,
            marginal_roi_30m=0.0,
            created_by=created_by,
        )
        db.add(plan)
        db.flush()
        db.refresh(video)
        self._sync_video_plan_summary(video)
        return plan

    def scale_and_clone_units(
        self,
        db: Session,
        video: ShortVideo,
        add_budget: float = 800.0,
        clone_count: int = 2,
        max_plan_cap: float = 5000.0,
    ) -> List[AdPlan]:
        created_clones: List[AdPlan] = []
        active_plans = [p for p in video.plans if p.status == "ACTIVE"]

        if active_plans:
            primary = active_plans[0]
            primary.daily_budget = min(max_plan_cap, round(primary.daily_budget + add_budget, 2))
            base_bid = primary.bid_roi
        else:
            base_bid = round(1.0 / max(video.margin_rate, 0.2), 2)
            primary = self.create_test_unit(db, video, budget=min(max_plan_cap, add_budget), bid_roi=base_bid)
            created_clones.append(primary)

        # 阶梯微调出价克隆新计划抢占不同流量池
        bid_offsets = [-0.05, 0.0, 0.08, 0.12]
        for idx in range(clone_count):
            unit_id = f"ZT_{random.randint(100000, 999999)}"
            offset = bid_offsets[idx % len(bid_offsets)]
            clone_plan = AdPlan(
                unit_id=unit_id,
                video_id=video.id,
                plan_name=f"放量裂变#{idx + 1}_{video.product_name[:5]}_{unit_id[-4:]}",
                status="ACTIVE",
                bid_roi=round(max(1.1, base_bid + offset), 2),
                daily_budget=min(max_plan_cap, round(add_budget * 0.75, 2)),
                cost=0.0,
                gmv=0.0,
                orders=0,
                roi=0.0,
                marginal_roi_30m=video.marginal_roi_30m,
                created_by="CLONED",
            )
            db.add(clone_plan)
            created_clones.append(clone_plan)

        db.flush()
        db.refresh(video)
        self._sync_video_plan_summary(video)
        return created_clones

    def pause_all_units(self, db: Session, video: ShortVideo, reason: str = "自动止损关停") -> int:
        paused = 0
        for p in video.plans:
            if p.status == "ACTIVE":
                p.status = "PAUSED"
                paused += 1
        video.active_plan_count = 0
        video.total_daily_budget = 0.0
        video.status_note = reason
        db.flush()
        return paused


class OfficialMagneticTaurusGateway(BaseMagneticTaurusGateway):
    """
    快手磁力引擎官方 OpenAPI 生产级适配器骨架
    文档参考: https://developers.e.kuaishou.com/ (磁力金牛电商营销接口)
    """

    BASE_URL = "https://ad.e.kuaishou.com/rest/openapi"

    def __init__(self, advertiser_id: int, access_token: str):
        self.advertiser_id = advertiser_id
        self.access_token = access_token

    async def _post(self, endpoint: str, payload: Dict[str, Any]) -> Dict[str, Any]:
        headers = {
            "Access-Token": self.access_token,
            "Content-Type": "application/json",
        }
        body = {"advertiser_id": self.advertiser_id, **payload}
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(f"{self.BASE_URL}{endpoint}", headers=headers, json=body)
            resp.raise_for_status()
            data = resp.json()
            if data.get("code") != 0:
                raise RuntimeError(f"Magnetic Taurus OpenAPI Error [{data.get('code')}]: {data.get('message')}")
            return data.get("data", {})

    def create_test_unit(self, db: Session, video: ShortVideo, budget: float, bid_roi: float, created_by: str = "AUTO_RULE") -> AdPlan:
        raise NotImplementedError("生产环境请配置 KUAISHOU_ACCESS_TOKEN 与 ADVERTISER_ID 后切换至异步队列调用 /v2/esp/unit/create")

    def scale_and_clone_units(self, db: Session, video: ShortVideo, add_budget: float, clone_count: int, max_plan_cap: float) -> List[AdPlan]:
        raise NotImplementedError("生产环境调用 /v2/esp/unit/update_budget 与批量复制接口")

    def pause_all_units(self, db: Session, video: ShortVideo, reason: str) -> int:
        raise NotImplementedError("生产环境调用 /v2/esp/unit/update_status (put_status=2 暂停)")
