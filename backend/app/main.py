import json
import random
from typing import Dict, Any, Optional
from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

from .database import engine, SessionLocal, Base, get_db
from .models import (
    SystemConfig,
    AdAccount,
    ShortVideo,
    MaterialAsset,
    AdPlan,
    MetricSnapshot,
    AutomationRule,
    AuditLog,
    FeishuApprovalCard,
)
from .schemas import (
    ShortVideoOut,
    SystemConfigUpdate,
    RuleUpdate,
    ManualActionRequest,
    BatchMaterialUploadRequest,
    MaterialUploadItem,
    BatchBuildPlansRequest,
)
from .seed import seed_initial_data
from .gateways.kuaishou_api import SandboxMagneticTaurusGateway
from .engine.simulator import (
    advance_simulation_tick,
    inject_viral_black_horse,
    inject_midnight_runaway,
    reset_all_sandbox_data,
)
from .engine.rule_engine import evaluate_all_rules
from .engine.ai_copilot import diagnose_and_generate_creatives

app = FastAPI(
    title="FluxOps 快手短视频流量池与AI自动化运营中台 API",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        seed_initial_data(db)
    finally:
        db.close()


@app.get("/api/overview")
def get_overview(db: Session = Depends(get_db)):
    config = db.query(SystemConfig).first()
    videos = db.query(ShortVideo).all()
    snapshots = db.query(MetricSnapshot).order_by(MetricSnapshot.id.asc()).all()
    pending_cards = db.query(FeishuApprovalCard).filter(FeishuApprovalCard.status == "PENDING").count()
    active_plans = db.query(AdPlan).filter(AdPlan.status == "ACTIVE").count()

    total_cost = round(sum(v.ad_cost for v in videos), 2)
    total_gmv = round(sum(v.ad_gmv for v in videos), 2)
    total_orders = sum(v.ad_orders for v in videos)
    overall_roi = round(total_gmv / total_cost, 2) if total_cost > 0 else 0.0

    m_cost = sum(v.marginal_cost_30m for v in videos)
    m_gmv = sum(v.marginal_gmv_30m for v in videos)
    marginal_roi_30m = round(m_gmv / m_cost, 2) if m_cost > 0 else 0.0

    stage_counts = {"OBSERVING": 0, "TESTING": 0, "SCALING": 0, "ELIMINATED": 0}
    for v in videos:
        stage_counts[v.pool_stage] = stage_counts.get(v.pool_stage, 0) + 1

    return {
        "config": {
            "virtual_time": config.virtual_time,
            "gateway_mode": config.gateway_mode,
            "break_even_roi": config.break_even_roi,
            "max_plan_daily_budget": config.max_plan_daily_budget,
            "max_hourly_auto_budget_add": config.max_hourly_auto_budget_add,
            "current_hour_budget_added": config.current_hour_budget_added,
            "kill_switch_active": config.kill_switch_active,
            "estimated_saved_loss": config.estimated_saved_loss,
            "llm_configured": bool(config.llm_api_key),
            "llm_api_base": config.llm_api_base,
            "llm_model": config.llm_model,
        },
        "kpis": {
            "total_cost": total_cost,
            "total_gmv": total_gmv,
            "total_orders": total_orders,
            "overall_roi": overall_roi,
            "marginal_roi_30m": marginal_roi_30m,
            "active_plans": active_plans,
            "total_videos": len(videos),
            "estimated_saved_loss": config.estimated_saved_loss,
            "pending_feishu_cards": pending_cards,
        },
        "stage_counts": stage_counts,
        "snapshots": [
            {
                "time": s.time_label,
                "total_cost": s.total_cost,
                "total_gmv": s.total_gmv,
                "delta_cost_5m": s.delta_cost_5m,
                "delta_gmv_5m": s.delta_gmv_5m,
                "cumulative_roi": s.cumulative_roi,
                "marginal_roi_30m": s.marginal_roi_30m,
                "organic_views_delta": s.organic_views_delta,
                "active_plans": s.active_plans,
            }
            for s in snapshots[-18:]
        ],
    }


@app.get("/api/videos", response_model=list[ShortVideoOut])
def list_videos(db: Session = Depends(get_db)):
    return db.query(ShortVideo).order_by(ShortVideo.id.desc()).all()


@app.post("/api/videos/{video_id}/action")
def manual_video_action(video_id: int, req: ManualActionRequest, db: Session = Depends(get_db)):
    video = db.query(ShortVideo).filter(ShortVideo.id == video_id).first()
    if not video:
        raise HTTPException(status_code=404, detail="短视频作品不存在")

    config = db.query(SystemConfig).first()
    gateway = SandboxMagneticTaurusGateway()

    if config.kill_switch_active and req.action in ("BOOST_TEST", "SCALE_UP", "RESUME_PLANS"):
        raise HTTPException(status_code=400, detail="账户级紧急熔断处于开启状态，请先解除全局熔断后再新建、恢复或加仓计划！")

    if req.action == "BOOST_TEST":
        plan = gateway.create_test_unit(db, video, budget=req.budget or 100.0, bid_roi=config.break_even_roi, created_by="MANUAL")
        video.pool_stage = "TESTING"
        video.status_note = f"人工手动追投：已建测试计划 {plan.unit_id} (¥{plan.daily_budget:.0f})"
        db.add(
            AuditLog(
                timestamp_label=config.virtual_time,
                level="INFO",
                rule_name="投手手动干预",
                video_title=video.title[:28],
                action_taken=f"手动新建磁力金牛测试计划 {plan.unit_id}，预算 ¥{plan.daily_budget:.0f}",
                metrics_snapshot=f"双列CTR: {video.cover_ctr:.1f}% | 自然播放: {video.organic_views}",
                impact_badge="人工追投",
            )
        )
    elif req.action == "SCALE_UP":
        clones = gateway.scale_and_clone_units(
            db,
            video,
            add_budget=req.budget or 600.0,
            clone_count=req.clone_count or 2,
            max_plan_cap=config.max_plan_daily_budget,
        )
        video.pool_stage = "SCALING"
        video.status_note = f"人工手动放量：新增 {len(clones)} 条裂变计划，总日预算 ¥{video.total_daily_budget:.0f}"
        db.add(
            AuditLog(
                timestamp_label=config.virtual_time,
                level="SUCCESS",
                rule_name="投手手动干预",
                video_title=video.title[:28],
                action_taken=f"手动加仓并克隆 {len(clones)} 条计划，进入【放量池】",
                metrics_snapshot=f"当前ROI: {video.total_roi:.2f} | 总预算: ¥{video.total_daily_budget:.0f}",
                impact_badge="人工放量",
            )
        )
    elif req.action == "RESUME_PLANS":
        resumed = 0
        for p in video.plans:
            if p.status == "PAUSED":
                p.status = "ACTIVE"
                resumed += 1
        video.active_plan_count = len([p for p in video.plans if p.status == "ACTIVE"])
        video.total_daily_budget = round(sum(p.daily_budget for p in video.plans if p.status == "ACTIVE"), 2)
        if video.pool_stage == "ELIMINATED":
            video.pool_stage = "TESTING"
        video.status_note = f"已恢复 {resumed} 条历史暂停计划继续投放（总日预算 ¥{video.total_daily_budget:.0f}）"
        db.add(
            AuditLog(
                timestamp_label=config.virtual_time,
                level="INFO",
                rule_name="投手手动恢复投放",
                video_title=video.title[:28],
                action_taken=f"一键恢复 {resumed} 条已暂停计划重新开启竞价",
                metrics_snapshot=f"当前池状态: {video.pool_stage} | 日预算: ¥{video.total_daily_budget:.0f}",
                impact_badge="计划恢复",
            )
        )
    elif req.action == "PAUSE_ALL":
        paused = gateway.pause_all_units(db, video, reason="人工紧急关停全部关联计划")
        video.pool_stage = "ELIMINATED"
        db.add(
            AuditLog(
                timestamp_label=config.virtual_time,
                level="DANGER",
                rule_name="投手手动急停",
                video_title=video.title[:28],
                action_taken=f"手动暂停全部 {paused} 条计划并移入【淘汰池】",
                metrics_snapshot=f"关停时消耗: ¥{video.ad_cost:.1f} | ROI: {video.total_roi:.2f}",
                impact_badge="人工止损",
            )
        )
    else:
        raise HTTPException(status_code=400, detail="未知操作类型")

    db.commit()
    return {"ok": True, "pool_stage": video.pool_stage}


@app.post("/api/videos/{video_id}/apply-cover")
def apply_ai_cover(video_id: int, payload: Dict[str, Any], db: Session = Depends(get_db)):
    video = db.query(ShortVideo).filter(ShortVideo.id == video_id).first()
    if not video:
        raise HTTPException(status_code=404, detail="短视频作品不存在")
    config = db.query(SystemConfig).first()

    video.cover_slogan = payload.get("main_title", video.cover_slogan)
    video.cover_sub_slogan = payload.get("sub_title", video.cover_sub_slogan)
    video.cover_badge = payload.get("badge", "AI裂变封面")
    video.cover_theme = payload.get("theme", video.cover_theme)
    predicted_ctr = float(payload.get("predicted_ctr", 8.8))
    video.cover_ctr = predicted_ctr

    # 如果原先在淘汰池，换高点击双列封面后重新投入自然流观察池测流
    if video.pool_stage == "ELIMINATED":
        video.pool_stage = "OBSERVING"
        video.organic_views = 650
        video.organic_views_slope_15m = 290
        video.completion_3s_rate = max(video.completion_3s_rate, 61.5)
        video.status_note = f"已应用 AI 高点击双列封面重回【观察池】赛马（预估CTR {predicted_ctr}%）"
    else:
        video.status_note = f"已热更新双列封面《{video.cover_slogan[:12]}...》"

    db.add(
        AuditLog(
            timestamp_label=config.virtual_time,
            level="SUCCESS",
            rule_name="AI 双列封面裂变引擎",
            video_title=video.title[:28],
            action_taken=f"应用新双列封面「{video.cover_slogan}」，作品重入赛马队列",
            metrics_snapshot=f"预估双列CTR提升至: {predicted_ctr:.1f}%",
            impact_badge="AI素材复活",
        )
    )
    db.commit()
    return {"ok": True}


@app.post("/api/videos/{video_id}/ai-diagnose")
async def ai_diagnose_video(video_id: int, db: Session = Depends(get_db)):
    video = db.query(ShortVideo).filter(ShortVideo.id == video_id).first()
    if not video:
        raise HTTPException(status_code=404, detail="短视频作品不存在")
    return await diagnose_and_generate_creatives(db, video)


@app.get("/api/rules")
def list_rules(db: Session = Depends(get_db)):
    rules = db.query(AutomationRule).order_by(AutomationRule.id.asc()).all()
    return [
        {
            "id": r.id,
            "rule_code": r.rule_code,
            "name": r.name,
            "stage_scope": r.stage_scope,
            "description": r.description,
            "action_type": r.action_type,
            "params": json.loads(r.params_json),
            "enabled": r.enabled,
            "hit_count": r.hit_count,
        }
        for r in rules
    ]


@app.patch("/api/rules/{rule_id}")
def update_rule(rule_id: int, req: RuleUpdate, db: Session = Depends(get_db)):
    rule = db.query(AutomationRule).filter(AutomationRule.id == rule_id).first()
    if not rule:
        raise HTTPException(status_code=404, detail="规则不存在")
    if req.enabled is not None:
        rule.enabled = req.enabled
    if req.params is not None:
        merged = {**json.loads(rule.params_json), **req.params}
        rule.params_json = json.dumps(merged)
    db.commit()
    return {"ok": True}


@app.patch("/api/config")
def update_system_config(req: SystemConfigUpdate, db: Session = Depends(get_db)):
    config = db.query(SystemConfig).first()
    updates = req.model_dump(exclude_unset=True)

    if "break_even_roi" in updates and updates["break_even_roi"] < 0.5:
        raise HTTPException(status_code=400, detail="保本 ROI 不能低于 0.5")
    if "max_plan_daily_budget" in updates and updates["max_plan_daily_budget"] < 50:
        raise HTTPException(status_code=400, detail="单计划日预算硬顶不能低于 ¥50")
    if "max_hourly_auto_budget_add" in updates and updates["max_hourly_auto_budget_add"] < 100:
        raise HTTPException(status_code=400, detail="单小时自动加仓上限不能低于 ¥100")

    # 避免未重填密码框时误清空已保存的 API Key；传 "__CLEAR__" 时显式清空切回内置引擎
    if "llm_api_key" in updates:
        if updates["llm_api_key"] == "__CLEAR__":
            updates["llm_api_key"] = ""
        elif updates["llm_api_key"] == "":
            del updates["llm_api_key"]

    for field, val in updates.items():
        setattr(config, field, val)
    db.commit()
    if req.kill_switch_active:
        evaluate_all_rules(db)
    return {"ok": True, "kill_switch_active": config.kill_switch_active}


@app.get("/api/audit-logs")
def list_audit_logs(db: Session = Depends(get_db)):
    logs = db.query(AuditLog).order_by(AuditLog.id.desc()).limit(50).all()
    return [
        {
            "id": l.id,
            "timestamp_label": l.timestamp_label,
            "level": l.level,
            "rule_name": l.rule_name,
            "video_title": l.video_title,
            "action_taken": l.action_taken,
            "metrics_snapshot": l.metrics_snapshot,
            "impact_badge": l.impact_badge,
        }
        for l in logs
    ]


@app.get("/api/feishu-cards")
def list_feishu_cards(db: Session = Depends(get_db)):
    cards = db.query(FeishuApprovalCard).order_by(FeishuApprovalCard.id.desc()).all()
    return [
        {
            "id": c.id,
            "timestamp_label": c.timestamp_label,
            "card_type": c.card_type,
            "title": c.title,
            "video_id": c.video_id,
            "video_title": c.video_title,
            "summary_text": c.summary_text,
            "suggested_action": c.suggested_action,
            "status": c.status,
        }
        for c in cards
    ]


@app.post("/api/feishu-cards/{card_id}/decide")
def decide_feishu_card(card_id: int, payload: Dict[str, str], db: Session = Depends(get_db)):
    card = db.query(FeishuApprovalCard).filter(FeishuApprovalCard.id == card_id).first()
    if not card:
        raise HTTPException(status_code=404, detail="审批卡片不存在")

    decision = payload.get("decision", "APPROVE")
    config = db.query(SystemConfig).first()
    video = db.query(ShortVideo).filter(ShortVideo.id == card.video_id).first()
    gateway = SandboxMagneticTaurusGateway()
    act_data = json.loads(card.action_payload_json or "{}")

    if card.status != "PENDING":
        raise HTTPException(status_code=400, detail="该审批单已处理，请勿重复操作")

    if decision == "APPROVE" and video:
        if config.kill_switch_active and act_data.get("action") == "APPROVE_SCALE":
            raise HTTPException(status_code=400, detail="全局紧急熔断处于开启状态，无法执行放量加仓审批！")

        card.status = "APPROVED"
        act_data["decided_tick"] = config.tick_count
        card.action_payload_json = json.dumps(act_data)

        if act_data.get("action") == "CUT_BUDGET_HALF":
            active_plans = [p for p in video.plans if p.status == "ACTIVE"]
            for idx, p in enumerate(active_plans):
                if idx == len(active_plans) - 1 and len(active_plans) > 1:
                    p.status = "PAUSED"
                else:
                    p.daily_budget = round(max(100.0, p.daily_budget * 0.5), 2)
            still_active = [p for p in video.plans if p.status == "ACTIVE"]
            video.active_plan_count = len(still_active)
            video.total_daily_budget = round(sum(p.daily_budget for p in still_active), 2)
            # 同步收敛滑动窗口边际基数，避免下一拍因历史脏窗口数据反复误报
            video.marginal_cost_30m = round(video.marginal_cost_30m * 0.45, 2)
            video.marginal_gmv_30m = round(max(video.marginal_gmv_30m, video.marginal_cost_30m * max(config.break_even_roi + 0.12, 1.02)), 2)
            video.marginal_roi_30m = round(video.marginal_gmv_30m / max(video.marginal_cost_30m, 1.0), 2)
            video.status_note = f"飞书审批已执行：预算减半锁利并关停末尾低效计划，当前总预算 ¥{video.total_daily_budget:.0f}"
            config.estimated_saved_loss = round(config.estimated_saved_loss + 520.0, 1)
            db.add(
                AuditLog(
                    timestamp_label=config.virtual_time,
                    level="SUCCESS",
                    rule_name="飞书卡片人机协同审批",
                    video_title=video.title[:28],
                    action_taken=f"投手在飞书卡片点击【批准降仓】：砍掉末尾亏损计划并将总日预算收紧至 ¥{video.total_daily_budget:.0f}",
                    metrics_snapshot="锁住全天利润，阻断泛流量池空耗",
                    impact_badge="挽回资损 ~¥520",
                )
            )
        elif act_data.get("action") == "APPROVE_SCALE":
            clones = gateway.scale_and_clone_units(
                db,
                video,
                add_budget=float(act_data.get("add_budget", 800.0)),
                clone_count=int(act_data.get("clone_count", 2)),
                max_plan_cap=config.max_plan_daily_budget,
            )
            video.pool_stage = "SCALING"
            video.status_note = f"飞书人工特批放量：已克隆 {len(clones)} 条计划全速抢量"
            db.add(
                AuditLog(
                    timestamp_label=config.virtual_time,
                    level="SUCCESS",
                    rule_name="飞书卡片人机协同审批",
                    video_title=video.title[:28],
                    action_taken=f"投手批准突破单小时加仓上限，新增 {len(clones)} 条裂变计划",
                    metrics_snapshot=f"总日预算提升至 ¥{video.total_daily_budget:.0f}",
                    impact_badge="人工特批放量",
                )
            )
    else:
        card.status = "REJECTED"
        act_data["decided_tick"] = config.tick_count
        card.action_payload_json = json.dumps(act_data)

    db.commit()
    return {"ok": True, "status": card.status}


@app.post("/api/sim/tick")
def sim_tick(db: Session = Depends(get_db)):
    return advance_simulation_tick(db)


@app.post("/api/sim/inject-viral")
def sim_inject_viral(db: Session = Depends(get_db)):
    return inject_viral_black_horse(db)


@app.post("/api/sim/inject-runaway")
def sim_inject_runaway(db: Session = Depends(get_db)):
    return inject_midnight_runaway(db)


@app.post("/api/sim/reset")
def sim_reset(db: Session = Depends(get_db)):
    reset_all_sandbox_data(db)
    return {"ok": True}


def _process_material_upload_batch(db: Session, items: list[MaterialUploadItem]) -> Dict[str, Any]:
    config = db.query(SystemConfig).first()
    created_count = 0
    duplicate_count = 0
    warning_count = 0
    results = []

    for item in items:
        existing = db.query(MaterialAsset).filter(MaterialAsset.md5_hash == item.md5_hash).first()
        if existing:
            duplicate_count += 1
            results.append(
                {
                    "file_name": item.file_name,
                    "outcome": "DUPLICATE",
                    "material_code": existing.material_code,
                    "message": f"MD5 指纹 ({item.md5_hash[:10]}...) 已存在于素材库，直接复用编号 {existing.material_code} 免重复上传",
                }
            )
            continue

        is_vertical_9_16 = item.height > item.width and abs((item.width / max(item.height, 1)) - (9 / 16)) <= 0.12
        duration_ok = 10.0 <= item.duration_sec <= 240.0
        spec_valid = bool(is_vertical_9_16 and duration_ok)

        next_idx = db.query(MaterialAsset).count() + 2001 + random.randint(1, 89)
        code = f"MAT_{next_idx}"
        while db.query(MaterialAsset).filter(MaterialAsset.material_code == code).first() is not None:
            code = f"MAT_{random.randint(3000, 9999)}"

        mat = MaterialAsset(
            material_code=code,
            md5_hash=item.md5_hash,
            file_name=item.file_name,
            drama_name=item.drama_name,
            editor_name=item.editor_name,
            hook_type=item.hook_type,
            resolution=f"{item.width}x{item.height}",
            duration_sec=round(item.duration_sec, 1),
            file_size_mb=round(item.file_size_mb, 2),
            spec_valid=spec_valid,
            audit_status="READY",
            kwai_sync_status="SYNCED",
            ocean_sync_status="SYNCED",
            linked_video_id=None,
            created_time=config.virtual_time if config else "18:00",
        )
        db.add(mat)
        db.flush()
        created_count += 1

        if not spec_valid:
            warning_count += 1
            results.append(
                {
                    "file_name": item.file_name,
                    "outcome": "SPEC_WARNING",
                    "material_code": code,
                    "message": f"已入库 ({code})，但检测到规格告警：分辨率 {item.width}x{item.height} / 时长 {item.duration_sec}s 非标准9:16竖屏，双列流可能被裁切",
                }
            )
        else:
            results.append(
                {
                    "file_name": item.file_name,
                    "outcome": "CREATED",
                    "material_code": code,
                    "message": f"9:16 竖屏规格校验通过，已生成标准资产编号 {code}",
                }
            )

    if created_count > 0 and config:
        db.add(
            AuditLog(
                timestamp_label=config.virtual_time,
                level="INFO",
                rule_name="素材资产库批量入库",
                video_title=f"批次导入 {len(items)} 个文件",
                action_taken=f"成功入库 {created_count} 条新切片，MD5 去重拦截 {duplicate_count} 条，规格告警 {warning_count} 条",
                metrics_snapshot=f"最新编号: {results[-1]['material_code']}",
                impact_badge="素材入库质检",
            )
        )
    db.commit()
    return {
        "created_count": created_count,
        "duplicate_count": duplicate_count,
        "warning_count": warning_count,
        "results": results,
    }


@app.get("/api/materials")
def list_materials(
    drama: Optional[str] = None,
    editor: Optional[str] = None,
    status: Optional[str] = None,
    q: Optional[str] = None,
    db: Session = Depends(get_db),
):
    query = db.query(MaterialAsset).order_by(MaterialAsset.id.desc())
    if drama and drama != "ALL":
        query = query.filter(MaterialAsset.drama_name == drama)
    if editor and editor != "ALL":
        query = query.filter(MaterialAsset.editor_name == editor)
    if q:
        query = query.filter(MaterialAsset.file_name.contains(q) | MaterialAsset.material_code.contains(q))

    items = query.all()
    out = []
    for m in items:
        v = m.linked_video
        if m.audit_status == "REJECTED":
            eff_status = "REJECTED"
        elif v:
            if v.active_plan_count > 0:
                eff_status = "ACTIVE"
            elif v.ad_cost > 0 or v.pool_stage == "ELIMINATED":
                eff_status = "PAUSED"
            else:
                eff_status = "READY"
        else:
            eff_status = "READY"

        if status and status != "ALL" and eff_status != status:
            continue

        out.append(
            {
                "id": m.id,
                "material_code": m.material_code,
                "md5_hash": m.md5_hash,
                "file_name": m.file_name,
                "drama_name": m.drama_name,
                "editor_name": m.editor_name,
                "hook_type": m.hook_type,
                "resolution": m.resolution,
                "duration_sec": m.duration_sec,
                "file_size_mb": m.file_size_mb,
                "spec_valid": m.spec_valid,
                "audit_status": eff_status,
                "reject_reason": m.reject_reason,
                "kwai_sync_status": m.kwai_sync_status,
                "ocean_sync_status": m.ocean_sync_status,
                "linked_video_id": m.linked_video_id,
                "pool_stage": v.pool_stage if v else None,
                "cover_ctr": v.cover_ctr if v else 0.0,
                "ad_cost": round(v.ad_cost, 2) if v else 0.0,
                "ad_gmv": round(v.ad_gmv, 2) if v else 0.0,
                "first_day_roi": round(v.total_roi, 2) if v else 0.0,
                "active_plans": v.active_plan_count if v else 0,
                "created_time": m.created_time,
            }
        )
    return out


@app.post("/api/materials/batch-upload")
def batch_upload_materials(req: BatchMaterialUploadRequest, db: Session = Depends(get_db)):
    if not req.items:
        raise HTTPException(status_code=400, detail="上传文件列表不能为空")
    return _process_material_upload_batch(db, req.items)


@app.post("/api/materials/mock-import")
def mock_import_materials(db: Session = Depends(get_db)):
    rand_hex = f"{random.randint(100000, 999999):06x}"
    sample_items = [
        MaterialUploadItem(
            file_name=f"DJ_除夕夜真千金_11_直升机降落高燃_{rand_hex[:4]}_阿杰.mp4",
            md5_hash=f"new916valid_{rand_hex}",
            drama_name="除夕夜真千金杀疯了",
            editor_name="阿杰",
            hook_type="认亲打脸",
            width=1080,
            height=1920,
            duration_sec=43.5,
            file_size_mb=49.8,
        ),
        MaterialUploadItem(
            file_name="DJ_真千金杀疯了_04_大雪夜认亲_副本重传.mp4",
            md5_hash="a1f09e88c101b234",
            drama_name="除夕夜真千金杀疯了",
            editor_name="阿杰",
            hook_type="认亲打脸",
            width=1080,
            height=1920,
            duration_sec=46.0,
            file_size_mb=54.2,
        ),
        MaterialUploadItem(
            file_name=f"DJ_重生八零嫁糙汉_横屏粗剪未裁切_{rand_hex[:4]}_陈思思.mp4",
            md5_hash=f"warn169land_{rand_hex}",
            drama_name="重生八零嫁糙汉",
            editor_name="陈思思",
            hook_type="年代逆袭",
            width=1920,
            height=1080,
            duration_sec=51.0,
            file_size_mb=63.0,
        ),
    ]
    return _process_material_upload_batch(db, sample_items)


@app.get("/api/accounts")
def list_ad_accounts(channel: Optional[str] = None, db: Session = Depends(get_db)):
    q = db.query(AdAccount)
    if channel and channel != "ALL":
        q = q.filter(AdAccount.channel == channel)
    accs = q.order_by(AdAccount.id.asc()).all()

    plans = db.query(AdPlan).all()
    out = []
    for a in accs:
        acc_plans = [p for p in plans if p.account_code == a.account_code]
        active_cnt = len([p for p in acc_plans if p.status == "ACTIVE"])
        spend = round(sum(p.cost for p in acc_plans), 2)
        out.append(
            {
                "id": a.id,
                "account_code": a.account_code,
                "channel": a.channel,
                "account_name": a.account_name,
                "daily_budget_cap": a.daily_budget_cap,
                "status": a.status,
                "active_plans": active_cnt,
                "total_spend": spend,
            }
        )
    return out


@app.post("/api/materials/batch-build")
def batch_build_plans(req: BatchBuildPlansRequest, db: Session = Depends(get_db)):
    config = db.query(SystemConfig).first()
    if config.kill_switch_active:
        raise HTTPException(status_code=400, detail="账户级紧急熔断开启中，禁止提交批量叉乘新建计划！")

    if not req.material_ids or not req.account_codes or not req.bid_rois:
        raise HTTPException(status_code=400, detail="请至少选择 1 条素材、1 个投放账户与 1 档目标 ROI 出价")

    materials = db.query(MaterialAsset).filter(MaterialAsset.id.in_(req.material_ids)).all()
    if len(materials) != len(set(req.material_ids)):
        raise HTTPException(status_code=404, detail="部分所选素材不存在")

    for m in materials:
        if m.audit_status == "REJECTED":
            raise HTTPException(
                status_code=400,
                detail=f"素材 {m.material_code} ({m.file_name[:16]}...) 处于【审核驳回】状态，禁止参与批量建组！",
            )

    accounts = db.query(AdAccount).filter(AdAccount.account_code.in_(req.account_codes)).all()
    if not accounts:
        raise HTTPException(status_code=400, detail="未找到有效的目标投放账户")

    total_units = len(materials) * len(accounts) * len(req.bid_rois)
    if total_units > 40:
        raise HTTPException(
            status_code=400,
            detail=f"单次叉乘拟生成 {total_units} 组计划，超过单批频控上限 (40组)，请分批提交异步队列！",
        )

    if req.daily_budget < 50 or req.daily_budget > config.max_plan_daily_budget:
        raise HTTPException(
            status_code=400,
            detail=f"单广告组日预算需在 ¥50 ~ ¥{config.max_plan_daily_budget:.0f} 安全硬顶范围内！",
        )

    total_budget_added = round(total_units * req.daily_budget, 2)
    remaining_hourly = round(config.max_hourly_auto_budget_add - config.current_hour_budget_added, 2)
    if total_budget_added > remaining_hourly:
        raise HTTPException(
            status_code=400,
            detail=f"本次叉乘共需新增预算 ¥{total_budget_added:.0f}，超出本小时安全锁剩余额度 (¥{max(0.0, remaining_hourly):.0f})，请调低单组预算或在安全锁上调总额上限！",
        )

    created_plans = 0
    touched_videos = 0

    for mat in materials:
        video = mat.linked_video
        if not video:
            photo_id = f"KS_DJ{random.randint(90000, 99999)}"
            base_ctr = round(random.uniform(8.4, 9.6), 1) if mat.spec_valid else 5.4
            base_3s = round(random.uniform(63.0, 70.5), 1) if mat.spec_valid else 41.0
            video = ShortVideo(
                kwai_photo_id=photo_id,
                title=f"《{mat.drama_name}》{mat.file_name}",
                account_name=accounts[0].account_name.split("-")[1] if "-" in accounts[0].account_name else "矩阵剧场号",
                product_name=f"{mat.drama_name}(卡第10集)",
                product_price=39.9,
                margin_rate=0.92,
                pool_stage="TESTING",
                cover_slogan=f"《{mat.drama_name}》高能{mat.hook_type}片段",
                cover_sub_slogan="点击左下角解锁全集剧情",
                cover_badge=mat.hook_type,
                cover_theme="purple" if mat.spec_valid else "blue",
                hook_3s=f"[{mat.editor_name}剪辑 · {mat.hook_type}] 竖屏{mat.resolution} {mat.duration_sec}s 标准切片",
                publish_minutes_ago=10,
                organic_views=680,
                organic_views_slope_15m=320,
                impressions=7500,
                clicks=680,
                cover_ctr=base_ctr,
                completion_3s_rate=base_3s,
                status_note="",
            )
            db.add(video)
            db.flush()
            mat.linked_video_id = video.id
            mat.linked_video = video
        else:
            if video.pool_stage in ("OBSERVING", "ELIMINATED"):
                video.pool_stage = "TESTING"

        touched_videos += 1
        mat.audit_status = "ACTIVE"

        for acc in accounts:
            prefix = "ZT" if acc.channel == "KWAI" else "JL"
            for bid in req.bid_rois:
                uid = f"{prefix}_{random.randint(100000, 999999)}"
                plan = AdPlan(
                    unit_id=uid,
                    video_id=video.id,
                    channel=acc.channel,
                    account_code=acc.account_code,
                    plan_name=f"叉乘_{mat.material_code}_{acc.account_code[-3:]}_ROI{bid:.2f}",
                    status="ACTIVE",
                    bid_roi=round(float(bid), 2),
                    daily_budget=round(float(req.daily_budget), 2),
                    cost=0.0,
                    gmv=0.0,
                    orders=0,
                    roi=0.0,
                    marginal_roi_30m=0.0,
                    created_by="BATCH_MATRIX",
                )
                db.add(plan)
                created_plans += 1

        db.flush()
        db.refresh(video)
        active_p = [p for p in video.plans if p.status == "ACTIVE"]
        video.active_plan_count = len(active_p)
        video.total_daily_budget = round(sum(p.daily_budget for p in active_p), 2)
        video.status_note = f"素材库批量叉乘建组完成：挂载 {len(active_p)} 组计划进入流量池赛马"

    config.current_hour_budget_added = round(config.current_hour_budget_added + total_budget_added, 2)
    db.add(
        AuditLog(
            timestamp_label=config.virtual_time,
            level="SUCCESS",
            rule_name="素材库笛卡尔积批量建组",
            video_title=f"{len(materials)}条素材 × {len(accounts)}账户 × {len(req.bid_rois)}出价",
            action_taken=f"一键批量创建 {created_plans} 个广告组（总新增日预算 ¥{total_budget_added:.0f}），已同步推入【测试池】自动巡检",
            metrics_snapshot=f"单组预算: ¥{req.daily_budget:.0f} | 出价档位: {req.bid_rois}",
            impact_badge=f"批量建组 +{created_plans}",
        )
    )
    db.commit()
    return {
        "ok": True,
        "created_plans_count": created_plans,
        "touched_videos_count": touched_videos,
        "total_budget_added": total_budget_added,
    }


@app.get("/api/reports/multidim")
def get_multidim_reports(db: Session = Depends(get_db)):
    config = db.query(SystemConfig).first()
    break_even = config.break_even_roi if config else 0.90

    materials = db.query(MaterialAsset).all()
    plans = db.query(AdPlan).all()
    accounts = db.query(AdAccount).all()

    editor_map: Dict[str, Dict[str, Any]] = {}
    for m in materials:
        ed = editor_map.setdefault(
            m.editor_name,
            {
                "editor_name": m.editor_name,
                "uploaded_count": 0,
                "delivered_count": 0,
                "hit_count": 0,
                "total_cost": 0.0,
                "total_gmv": 0.0,
            },
        )
        ed["uploaded_count"] += 1
        v = m.linked_video
        if v and (v.ad_cost > 0 or v.active_plan_count > 0):
            ed["delivered_count"] += 1
            ed["total_cost"] += v.ad_cost
            ed["total_gmv"] += v.ad_gmv
            if v.ad_cost >= 1000.0 and v.total_roi >= break_even:
                ed["hit_count"] += 1

    editor_ranking = []
    for ed in editor_map.values():
        denom = max(ed["delivered_count"], 1)
        hit_rate = round((ed["hit_count"] / denom) * 100.0, 1) if ed["delivered_count"] > 0 else 0.0
        roi = round(ed["total_gmv"] / ed["total_cost"], 2) if ed["total_cost"] > 0 else 0.0
        editor_ranking.append(
            {
                **ed,
                "total_cost": round(ed["total_cost"], 2),
                "total_gmv": round(ed["total_gmv"], 2),
                "hit_rate": hit_rate,
                "first_day_roi": roi,
            }
        )
    editor_ranking.sort(key=lambda x: x["total_gmv"], reverse=True)

    drama_map: Dict[str, Dict[str, Any]] = {}
    seen_video_ids = set()
    for m in materials:
        dr = drama_map.setdefault(
            m.drama_name,
            {
                "drama_name": m.drama_name,
                "slice_count": 0,
                "active_plans": 0,
                "total_cost": 0.0,
                "total_gmv": 0.0,
                "orders": 0,
            },
        )
        dr["slice_count"] += 1
        v = m.linked_video
        if v and v.id not in seen_video_ids:
            seen_video_ids.add(v.id)
            dr["active_plans"] += v.active_plan_count
            dr["total_cost"] += v.ad_cost
            dr["total_gmv"] += v.ad_gmv
            dr["orders"] += v.ad_orders

    drama_summary = []
    for dr in drama_map.values():
        f_roi = round(dr["total_gmv"] / dr["total_cost"], 2) if dr["total_cost"] > 0 else 0.0
        drama_summary.append(
            {
                **dr,
                "total_cost": round(dr["total_cost"], 2),
                "total_gmv": round(dr["total_gmv"], 2),
                "first_day_roi": f_roi,
                "est_7d_roi": round(f_roi * 1.42, 2) if f_roi > 0 else 0.0,
            }
        )
    drama_summary.sort(key=lambda x: x["total_cost"], reverse=True)

    channel_meta = {
        "KWAI": "快手磁力智投 (短剧主力)",
        "OCEAN": "抖音巨量广告 (同步扩量)",
    }
    channel_comparison = []
    for ch_code, ch_label in channel_meta.items():
        ch_plans = [p for p in plans if p.channel == ch_code]
        ch_accs = [a for a in accounts if a.channel == ch_code]
        c_cost = round(sum(p.cost for p in ch_plans), 2)
        c_gmv = round(sum(p.gmv for p in ch_plans), 2)
        c_orders = sum(p.orders for p in ch_plans)
        c_active = len([p for p in ch_plans if p.status == "ACTIVE"])
        channel_comparison.append(
            {
                "channel": ch_code,
                "channel_label": ch_label,
                "account_count": len(ch_accs),
                "active_plans": c_active,
                "total_plans": len(ch_plans),
                "total_cost": c_cost,
                "total_gmv": c_gmv,
                "orders": c_orders,
                "first_day_roi": round(c_gmv / c_cost, 2) if c_cost > 0 else 0.0,
            }
        )

    return {
        "break_even_roi": break_even,
        "editor_ranking": editor_ranking,
        "drama_summary": drama_summary,
        "channel_comparison": channel_comparison,
    }
