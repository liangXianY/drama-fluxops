import json
from typing import List, Dict, Any
from sqlalchemy.orm import Session
from ..models import (
    SystemConfig,
    ShortVideo,
    AutomationRule,
    AuditLog,
    FeishuApprovalCard,
)
from ..gateways.kuaishou_api import SandboxMagneticTaurusGateway


def evaluate_all_rules(db: Session) -> List[Dict[str, Any]]:
    """执行 L1 确定性赛马晋级与止损引擎（含全局资金安全锁校验）"""
    config = db.query(SystemConfig).first()
    gateway = SandboxMagneticTaurusGateway()
    triggered_events: List[Dict[str, Any]] = []

    if not config:
        return triggered_events

    # 全局一键熔断开关校验
    if config.kill_switch_active:
        active_videos = db.query(ShortVideo).filter(ShortVideo.active_plan_count > 0).all()
        for v in active_videos:
            paused = gateway.pause_all_units(db, v, reason="全局熔断开关激活，计划已紧急暂停")
            if paused > 0:
                log = AuditLog(
                    timestamp_label=config.virtual_time,
                    level="DANGER",
                    rule_name="GLOBAL_KILL_SWITCH 全局紧急熔断",
                    video_title=v.title[:26],
                    action_taken=f"紧急冻结关停 {paused} 条在跑计划",
                    metrics_snapshot=f"冻结前消耗: ¥{v.ad_cost:.1f}",
                    impact_badge="账户级熔断保护",
                )
                db.add(log)
                triggered_events.append({"level": "DANGER", "title": "全局熔断已生效", "detail": f"已暂停《{v.product_name}》全部计划"})
        db.commit()
        return triggered_events

    rules = {r.rule_code: r for r in db.query(AutomationRule).all() if r.enabled}
    videos = db.query(ShortVideo).all()

    for video in videos:
        # --- R1: 自然流观察池 -> 测试池 (含冷启动超时淘汰兜底) ---
        if video.pool_stage == "OBSERVING":
            if "R1_ORGANIC_TO_TEST" in rules:
                r1 = rules["R1_ORGANIC_TO_TEST"]
                p = json.loads(r1.params_json)
                if video.organic_views >= p.get("min_organic_views", 1000) and video.cover_ctr >= p.get("min_cover_ctr", 8.0):
                    budget = float(p.get("test_budget", 100.0))
                    bid_roi = float(p.get("bid_roi", config.break_even_roi))
                    plan = gateway.create_test_unit(db, video, budget=budget, bid_roi=bid_roi)
                    video.pool_stage = "TESTING"
                    video.status_note = f"命中R1：自然流破{video.organic_views}，已建计划 {plan.unit_id} 小额测款"
                    r1.hit_count += 1
                    config.current_hour_budget_added = round(config.current_hour_budget_added + budget, 2)

                    db.add(
                        AuditLog(
                            timestamp_label=config.virtual_time,
                            level="SUCCESS",
                            rule_name=r1.name,
                            video_title=video.title[:28],
                            action_taken=f"晋级【测试池】，自动创建磁力金牛计划 {plan.unit_id}（日预算 ¥{budget:.0f}，ROI出价 {bid_roi}）",
                            metrics_snapshot=f"自然播放: {video.organic_views} | 双列CTR: {video.cover_ctr:.1f}% | 15m增速: +{video.organic_views_slope_15m}",
                            impact_badge="自动追投测款",
                        )
                    )
                    triggered_events.append(
                        {
                            "level": "SUCCESS",
                            "title": "自然流黑马自动追投",
                            "detail": f"《{video.product_name}》自然播放达 {video.organic_views} (CTR {video.cover_ctr}%)，已建 ¥{budget:.0f} 测试计划",
                        }
                    )
                    continue

            # 冷启动超时未起量自动淘汰闭环（满6小时且自然播放<500）
            if video.publish_minutes_ago >= 360 and video.organic_views < 500:
                video.pool_stage = "ELIMINATED"
                video.status_note = "冷启动满6h播放不足500，自动归档淘汰池（建议AI重写双列封面复活）"
                db.add(
                    AuditLog(
                        timestamp_label=config.virtual_time,
                        level="INFO",
                        rule_name="冷启动超时清理机制",
                        video_title=video.title[:28],
                        action_taken="发布满6小时未突破初级流量池，自动移入【淘汰池】等待AI封面重塑",
                        metrics_snapshot=f"时长: {video.publish_minutes_ago}m | 自然播放: {video.organic_views} | CTR: {video.cover_ctr:.1f}%",
                        impact_badge="僵尸素材归档",
                    )
                )
                triggered_events.append(
                    {
                        "level": "INFO",
                        "title": "冷启动超时自动归档",
                        "detail": f"《{video.product_name}》满6h未起量，已移入淘汰池待AI换封面重测",
                    }
                )

        # --- R2 & R3: 测试池 -> 放量池 或 淘汰池 ---
        elif video.pool_stage == "TESTING":
            # 先判止损 R3 (优先级最高)
            if "R3_TEST_STOP_LOSS" in rules:
                r3 = rules["R3_TEST_STOP_LOSS"]
                p3 = json.loads(r3.params_json)
                zero_max = float(p3.get("zero_order_max_cost", 80.0))
                low_roi_min_cost = float(p3.get("low_roi_min_cost", 100.0))
                low_roi_val = float(p3.get("low_roi_threshold", 1.0))

                is_zero_burn = video.ad_cost >= zero_max and video.ad_orders == 0
                is_low_roi = video.ad_cost >= low_roi_min_cost and video.total_roi < low_roi_val

                if is_zero_burn or is_low_roi:
                    paused_cnt = gateway.pause_all_units(
                        db,
                        video,
                        reason=f"触发R3熔断止损：消耗 ¥{video.ad_cost:.1f} / {video.ad_orders}单 (ROI {video.total_roi:.2f})，计划已全部关停",
                    )
                    video.pool_stage = "ELIMINATED"
                    r3.hit_count += 1
                    saved_est = round(max(180.0, video.ad_cost * 3.5), 1)
                    config.estimated_saved_loss = round(config.estimated_saved_loss + saved_est, 1)

                    db.add(
                        AuditLog(
                            timestamp_label=config.virtual_time,
                            level="DANGER",
                            rule_name=r3.name,
                            video_title=video.title[:28],
                            action_taken=f"打入【淘汰池】，毫秒级暂停 {paused_cnt} 条空耗计划，阻断后续无效烧钱",
                            metrics_snapshot=f"消耗: ¥{video.ad_cost:.1f} | 成交订单: {video.ad_orders} | ROI: {video.total_roi:.2f}",
                            impact_badge=f"挽回资损 ~¥{saved_est:.0f}",
                        )
                    )
                    triggered_events.append(
                        {
                            "level": "DANGER",
                            "title": "触发空耗熔断止损",
                            "detail": f"《{video.product_name}》消耗 ¥{video.ad_cost:.1f} 转化不达标，已自动关停计划！",
                        }
                    )
                    continue

            # 再判晋级放量 R2
            if "R2_TEST_TO_SCALE" in rules:
                r2 = rules["R2_TEST_TO_SCALE"]
                p2 = json.loads(r2.params_json)
                min_cost = float(p2.get("min_test_cost", 65.0))
                min_m_roi = float(p2.get("min_marginal_roi", 1.6))
                add_budget = float(p2.get("add_budget", 800.0))
                clone_count = int(p2.get("clone_count", 2))

                if video.ad_cost >= min_cost and video.marginal_roi_30m >= min_m_roi:
                    est_total_add = add_budget + clone_count * (add_budget * 0.75)
                    # 校验单小时自动加仓安全上限
                    if config.current_hour_budget_added + est_total_add > config.max_hourly_auto_budget_add:
                        existing_card = (
                            db.query(FeishuApprovalCard)
                            .filter(FeishuApprovalCard.video_id == video.id, FeishuApprovalCard.status == "PENDING")
                            .first()
                        )
                        if not existing_card:
                            db.add(
                                FeishuApprovalCard(
                                    timestamp_label=config.virtual_time,
                                    card_type="SCALE_CONFIRM",
                                    title="🚀 爆款晋级大额加仓审批（触发单小时安全锁上限）",
                                    video_id=video.id,
                                    video_title=video.title,
                                    summary_text=f"《{video.product_name}》测试池边际 ROI 高达 {video.marginal_roi_30m:.2f}，拟加仓并克隆 {clone_count} 条计划（共需新增预算 ¥{est_total_add:.0f}），因超出单小时自动加仓安全锁余量，请人工确认。",
                                    suggested_action=f"批准晋级放量池：提预算 ¥{add_budget:.0f} + 克隆 {clone_count} 条裂变计划",
                                    action_payload_json=json.dumps({"action": "APPROVE_SCALE", "add_budget": add_budget, "clone_count": clone_count}),
                                    status="PENDING",
                                )
                            )
                            triggered_events.append(
                                {
                                    "level": "WARNING",
                                    "title": "触发资金锁·已发飞书审批",
                                    "detail": f"《{video.product_name}》达放量标准，大额加仓已推送飞书审批卡片",
                                }
                            )
                    else:
                        clones = gateway.scale_and_clone_units(
                            db,
                            video,
                            add_budget=add_budget,
                            clone_count=clone_count,
                            max_plan_cap=config.max_plan_daily_budget,
                        )
                        video.pool_stage = "SCALING"
                        video.status_note = f"命中R2晋级放量！边际ROI {video.marginal_roi_30m:.2f}，共 {video.active_plan_count} 条计划抢量中"
                        r2.hit_count += 1
                        config.current_hour_budget_added = round(config.current_hour_budget_added + est_total_add, 2)

                        db.add(
                            AuditLog(
                                timestamp_label=config.virtual_time,
                                level="SUCCESS",
                                rule_name=r2.name,
                                video_title=video.title[:28],
                                action_taken=f"晋级【放量池】！主计划提预算 + 自动克隆 {len(clones)} 条阶梯出价计划（总日预算 ¥{video.total_daily_budget:.0f}）",
                                metrics_snapshot=f"测试消耗: ¥{video.ad_cost:.1f} | 边际ROI: {video.marginal_roi_30m:.2f} | 3秒完播: {video.completion_3s_rate:.1f}%",
                                impact_badge="爆款矩阵放量",
                            )
                        )
                        triggered_events.append(
                            {
                                "level": "SUCCESS",
                                "title": "高ROI爆款自动放量克隆",
                                "detail": f"《{video.product_name}》边际ROI达 {video.marginal_roi_30m:.2f}，已晋级放量池并克隆 {len(clones)} 条计划！",
                            }
                        )

        # --- R4: 放量池边际 ROI 跳水监控 (含30分钟冷却防告警风暴) ---
        elif video.pool_stage == "SCALING" and "R4_SCALE_MARGINAL_GUARD" in rules:
            r4 = rules["R4_SCALE_MARGINAL_GUARD"]
            p4 = json.loads(r4.params_json)
            min_w_cost = float(p4.get("min_window_cost", 300.0))
            min_m_roi = float(p4.get("min_marginal_roi", 1.1))

            if video.marginal_cost_30m >= min_w_cost and video.marginal_roi_30m < min_m_roi and video.active_plan_count > 0:
                recent_cards = (
                    db.query(FeishuApprovalCard)
                    .filter(FeishuApprovalCard.video_id == video.id, FeishuApprovalCard.card_type == "MARGINAL_DROP_WARN")
                    .order_by(FeishuApprovalCard.id.desc())
                    .all()
                )
                in_cooldown = False
                for rc in recent_cards:
                    if rc.status == "PENDING":
                        in_cooldown = True
                        break
                    rc_payload = json.loads(rc.action_payload_json or "{}")
                    if config.tick_count - int(rc_payload.get("decided_tick", -99)) < 6:
                        in_cooldown = True
                        break

                if not in_cooldown:
                    r4.hit_count += 1
                    db.add(
                        FeishuApprovalCard(
                            timestamp_label=config.virtual_time,
                            card_type="MARGINAL_DROP_WARN",
                            title="⚠️ 放量池边际ROI跳水告警（人群泛化预警）",
                            video_id=video.id,
                            video_title=video.title,
                            summary_text=f"《{video.product_name}》全天累计 ROI 仍有 {video.total_roi:.2f}，但近 30 分钟消耗 ¥{video.marginal_cost_30m:.0f} 边际 ROI 跌至 {video.marginal_roi_30m:.2f}（低于警戒线 {min_m_roi}），疑似大流量池人群泛化。",
                            suggested_action="一键下调在跑计划预算 50% 并暂停末尾低效计划",
                            action_payload_json=json.dumps({"action": "CUT_BUDGET_HALF", "created_tick": config.tick_count}),
                            status="PENDING",
                        )
                    )
                    db.add(
                        AuditLog(
                            timestamp_label=config.virtual_time,
                            level="WARNING",
                            rule_name=r4.name,
                            video_title=video.title[:28],
                            action_taken="检测到边际ROI背离跳水，已推送飞书交互卡片等待投手一键确认降仓",
                            metrics_snapshot=f"累计ROI: {video.total_roi:.2f} | 近30m消耗: ¥{video.marginal_cost_30m:.0f} | 近30m边际ROI: {video.marginal_roi_30m:.2f}",
                            impact_badge="防温水煮青蛙",
                        )
                    )
                    triggered_events.append(
                        {
                            "level": "WARNING",
                            "title": "放量池边际ROI跳水预警",
                            "detail": f"《{video.product_name}》近30m边际ROI跌至 {video.marginal_roi_30m:.2f}，已生成飞书降仓审批卡",
                        }
                    )

    db.commit()
    return triggered_events
