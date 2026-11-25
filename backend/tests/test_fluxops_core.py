"""
短剧投流自动化中台 · 核心业务规则与风控边界单元测试套件 (pytest)
覆盖范围：
1. 素材 MD5 指纹判重复用与 9:16 竖屏规格告警校验
2. 审核驳回 (REJECTED) 异常素材参与叉乘建组的防呆拦截
3. 笛卡尔积批量叉乘建组数量准确性及下游【测试池】自动挂载联动
4. 账户级全局紧急熔断锁 (Kill Switch) 对手动加仓与批量建组的强阻断
5. R3 零充值空耗计划毫秒级自动关停止损与资损挽回核算
6. 剪辑师爆款率、剧目7日长尾预估与快手/巨量双渠道多维聚合统计准确性
"""
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base
from app.models import MaterialAsset, ShortVideo, AdPlan, SystemConfig
from app.schemas import BatchMaterialUploadRequest, MaterialUploadItem, BatchBuildPlansRequest, SystemConfigUpdate
from app.seed import seed_initial_data
from app.main import (
    batch_upload_materials,
    batch_build_plans,
    update_system_config,
    sim_inject_runaway,
    get_multidim_reports,
)
from fastapi import HTTPException


@pytest.fixture()
def db_session():
    test_engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)
    Base.metadata.create_all(bind=test_engine)
    db = TestingSessionLocal()
    seed_initial_data(db)
    try:
        yield db
    finally:
        db.close()


def test_material_md5_deduplication_and_spec_check(db_session):
    """验证相同MD5素材二次上传精准拦截复用，横屏视频触发规格告警"""
    req = BatchMaterialUploadRequest(
        items=[
            MaterialUploadItem(
                file_name="新切片_竖屏合规.mp4",
                md5_hash="unique_hash_999111",
                drama_name="无双龙帅归来",
                editor_name="阿杰",
                width=1080,
                height=1920,
                duration_sec=40.0,
            ),
            MaterialUploadItem(
                file_name="重复切片_同MD5副本.mp4",
                md5_hash="a1f09e88c101b234",  # 与种子 MAT_2001 相同
                drama_name="除夕夜真千金杀疯了",
                editor_name="阿杰",
                width=1080,
                height=1920,
                duration_sec=46.0,
            ),
            MaterialUploadItem(
                file_name="横屏未裁切粗剪.mp4",
                md5_hash="landscape_hash_888222",
                drama_name="重生八零嫁糙汉",
                editor_name="林晓",
                width=1920,
                height=1080,
                duration_sec=50.0,
            ),
        ]
    )
    res = batch_upload_materials(req, db=db_session)
    assert res["created_count"] == 2
    assert res["duplicate_count"] == 1
    assert res["warning_count"] == 1
    assert res["results"][1]["outcome"] == "DUPLICATE"
    assert res["results"][1]["material_code"] == "MAT_2001"
    assert res["results"][2]["outcome"] == "SPEC_WARNING"


def test_rejected_material_blocked_in_batch_build(db_session):
    """验证审核驳回状态的素材被禁止参与批量叉乘建计划"""
    rejected_mat = db_session.query(MaterialAsset).filter(MaterialAsset.audit_status == "REJECTED").first()
    assert rejected_mat is not None

    req = BatchBuildPlansRequest(
        material_ids=[rejected_mat.id],
        account_codes=["KWAI_101"],
        bid_rois=[0.90],
        daily_budget=120.0,
    )
    with pytest.raises(HTTPException) as exc_info:
        batch_build_plans(req, db=db_session)
    assert exc_info.value.status_code == 400
    assert "审核驳回" in exc_info.value.detail


def test_cartesian_product_plan_count_and_pool_sync(db_session):
    """验证 2素材 x 2账户(快手+巨量) x 2出价 = 8组计划准确生成并挂载至测试池"""
    ready_mats = (
        db_session.query(MaterialAsset)
        .filter(MaterialAsset.linked_video_id.is_(None), MaterialAsset.audit_status == "READY")
        .all()
    )
    assert len(ready_mats) >= 2
    picked = ready_mats[:2]

    req = BatchBuildPlansRequest(
        material_ids=[m.id for m in picked],
        account_codes=["KWAI_101", "OCEAN_201"],
        bid_rois=[0.88, 0.92],
        daily_budget=150.0,
    )
    res = batch_build_plans(req, db=db_session)
    assert res["created_plans_count"] == 8
    assert res["touched_videos_count"] == 2
    assert res["total_budget_added"] == 1200.0

    db_session.refresh(picked[0])
    assert picked[0].linked_video_id is not None
    linked_v = db_session.query(ShortVideo).filter(ShortVideo.id == picked[0].linked_video_id).first()
    assert linked_v.pool_stage == "TESTING"
    assert linked_v.active_plan_count == 4
    channels = {p.channel for p in linked_v.plans}
    assert channels == {"KWAI", "OCEAN"}


def test_kill_switch_blocks_batch_build_and_freezes_plans(db_session):
    """验证全局紧急熔断开启后立即冻结在投计划并拦截后续批量建组"""
    update_system_config(SystemConfigUpdate(kill_switch_active=True), db=db_session)
    active_cnt = db_session.query(AdPlan).filter(AdPlan.status == "ACTIVE").count()
    assert active_cnt == 0

    ready_mat = db_session.query(MaterialAsset).filter(MaterialAsset.audit_status == "READY").first()
    req = BatchBuildPlansRequest(
        material_ids=[ready_mat.id],
        account_codes=["KWAI_101"],
        bid_rois=[0.90],
        daily_budget=100.0,
    )
    with pytest.raises(HTTPException) as exc_info:
        batch_build_plans(req, db=db_session)
    assert exc_info.value.status_code == 400
    assert "紧急熔断" in exc_info.value.detail


def test_r3_zero_conversion_stop_loss(db_session):
    """验证突发空耗0充值计划立即被R3规则毫秒级关停止损"""
    before_saved = db_session.query(SystemConfig).first().estimated_saved_loss
    res = sim_inject_runaway(db=db_session)
    after_saved = db_session.query(SystemConfig).first().estimated_saved_loss

    assert any(ev["level"] == "DANGER" for ev in res["triggered_events"])
    assert after_saved > before_saved


def test_multidim_report_editor_hit_rate_and_channels(db_session):
    """验证剪辑师爆款率排行、剧目7日预估回收与双渠道统计口径"""
    rpt = get_multidim_reports(db=db_session)
    assert len(rpt["editor_ranking"]) == 3
    ajie = next(e for e in rpt["editor_ranking"] if e["editor_name"] == "阿杰")
    # 阿杰名下《无双龙帅归来》消耗 3850 >= 1000 且 ROI 1.17 >= 0.90，计为 1 条爆款
    assert ajie["hit_count"] == 1
    assert ajie["hit_rate"] > 0

    channels = {c["channel"]: c for c in rpt["channel_comparison"]}
    assert "KWAI" in channels and "OCEAN" in channels
    assert channels["KWAI"]["total_cost"] > 0
    assert channels["OCEAN"]["total_cost"] > 0
