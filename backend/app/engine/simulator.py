import random
from typing import Dict, Any
from sqlalchemy.orm import Session
from ..models import (
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
from ..seed import seed_initial_data
from .rule_engine import evaluate_all_rules


def _advance_clock(time_str: str, minutes: int = 5) -> str:
    parts = time_str.split(":")
    h, m = int(parts[0]), int(parts[1])
    total_m = (h * 60 + m + minutes) % (24 * 60)
    return f"{total_m // 60:02d}:{total_m % 60:02d}"


def advance_simulation_tick(db: Session) -> Dict[str, Any]:
    """推进 5 分钟快手短剧流量池物理仿真，计算滑动窗口增量并触发规则引擎"""
    config = db.query(SystemConfig).first()
    config.virtual_time = _advance_clock(config.virtual_time, 5)
    config.tick_count += 1
    if config.tick_count % 12 == 0:
        config.current_hour_budget_added = 0.0

    videos = db.query(ShortVideo).all()
    delta_cost_all = 0.0
    delta_gmv_all = 0.0
    organic_delta_all = 0

    for v in videos:
        v.publish_minutes_ago += 5

        if v.pool_stage == "OBSERVING":
            if v.cover_ctr >= 8.5:
                inc_views = random.randint(150, 260)
            elif v.cover_ctr >= 7.0:
                inc_views = random.randint(60, 125)
            else:
                inc_views = random.randint(8, 25)

            v.organic_views += inc_views
            v.organic_views_slope_15m = int(v.organic_views_slope_15m * 0.66 + inc_views)
            inc_imp = int(inc_views / max(v.cover_ctr / 100.0, 0.03))
            v.impressions += inc_imp
            v.clicks += inc_views
            organic_delta_all += inc_views

        elif v.pool_stage in ("TESTING", "SCALING"):
            active_plans = [p for p in v.plans if p.status == "ACTIVE"]
            inc_views = random.randint(80, 350) if v.pool_stage == "TESTING" else random.randint(450, 1100)
            v.organic_views += inc_views
            v.organic_views_slope_15m = int(v.organic_views_slope_15m * 0.66 + inc_views)
            organic_delta_all += inc_views

            video_d_cost = 0.0
            video_d_gmv = 0.0
            video_d_orders = 0

            for plan in active_plans:
                if v.completion_3s_rate >= 62.0 and v.cover_ctr >= 8.5:
                    step_cost = round(random.uniform(16.0, 26.0) if v.pool_stage == "TESTING" else random.uniform(32.0, 58.0), 2)
                    target_roi_factor = random.uniform(1.08, 1.38)
                    raw_gmv = step_cost * target_roi_factor
                    orders = max(1, round(raw_gmv / max(v.product_price, 19.9))) if raw_gmv >= v.product_price * 0.52 else 0
                    step_gmv = round(orders * v.product_price, 2)
                elif v.completion_3s_rate < 45.0:
                    step_cost = round(random.uniform(15.0, 23.0), 2)
                    orders = 0
                    step_gmv = 0.0
                else:
                    step_cost = round(random.uniform(24.0, 42.0), 2)
                    orders = 1 if random.random() < 0.34 else 0
                    step_gmv = round(orders * v.product_price, 2)

                plan.cost = round(plan.cost + step_cost, 2)
                plan.gmv = round(plan.gmv + step_gmv, 2)
                plan.orders += orders
                plan.roi = round(plan.gmv / plan.cost, 2) if plan.cost > 0 else 0.0
                plan.marginal_roi_30m = round(
                    0.7 * plan.marginal_roi_30m + 0.3 * ((step_gmv / step_cost) if step_cost > 0 else 0.0),
                    2,
                )

                video_d_cost += step_cost
                video_d_gmv += step_gmv
                video_d_orders += orders

            if video_d_cost > 0:
                v.ad_cost = round(v.ad_cost + video_d_cost, 2)
                v.ad_gmv = round(v.ad_gmv + video_d_gmv, 2)
                v.ad_orders += video_d_orders
                v.total_roi = round(v.ad_gmv / v.ad_cost, 2) if v.ad_cost > 0 else 0.0

                v.marginal_cost_30m = round(v.marginal_cost_30m * 0.82 + video_d_cost, 2)
                v.marginal_gmv_30m = round(v.marginal_gmv_30m * 0.82 + video_d_gmv, 2)
                v.marginal_roi_30m = round(v.marginal_gmv_30m / v.marginal_cost_30m, 2) if v.marginal_cost_30m > 0 else 0.0

                delta_cost_all += video_d_cost
                delta_gmv_all += video_d_gmv

    db.flush()

    events = evaluate_all_rules(db)

    all_videos = db.query(ShortVideo).all()
    tot_cost = round(sum(x.ad_cost for x in all_videos), 2)
    tot_gmv = round(sum(x.ad_gmv for x in all_videos), 2)
    tot_m_cost = sum(x.marginal_cost_30m for x in all_videos)
    tot_m_gmv = sum(x.marginal_gmv_30m for x in all_videos)
    active_plans_cnt = db.query(AdPlan).filter(AdPlan.status == "ACTIVE").count()

    snap = MetricSnapshot(
        time_label=config.virtual_time,
        total_cost=tot_cost,
        total_gmv=tot_gmv,
        delta_cost_5m=round(delta_cost_all, 2),
        delta_gmv_5m=round(delta_gmv_all, 2),
        cumulative_roi=round(tot_gmv / tot_cost, 2) if tot_cost > 0 else 0.0,
        marginal_roi_30m=round(tot_m_gmv / tot_m_cost, 2) if tot_m_cost > 0 else 0.0,
        organic_views_delta=organic_delta_all,
        active_plans=active_plans_cnt,
    )
    db.add(snap)
    db.commit()

    return {
        "virtual_time": config.virtual_time,
        "delta_cost_5m": round(delta_cost_all, 2),
        "delta_gmv_5m": round(delta_gmv_all, 2),
        "triggered_events": events,
    }


def inject_viral_black_horse(db: Session) -> Dict[str, Any]:
    """一键注入突发自然流爆款短剧切片，演示系统自动捕获追投"""
    config = db.query(SystemConfig).first()
    config.virtual_time = _advance_clock(config.virtual_time, 2)

    suffix = random.randint(1000, 9999)
    templates = [
        {
            "title": "《保安老爹竟是百亿首富》切片06：儿子婚礼被亲家母百般羞辱，老爹一个电话全城大佬齐到场",
            "account_name": "热血战神剧场",
            "product_name": "保安老爹竟是首富(卡第10集)",
            "product_price": 39.9,
            "cover_slogan": "婚礼被亲家母羞辱？老爹亮出真实身份！",
            "cover_sub_slogan": "第10集高燃打脸 · 爽剧热播榜第1",
            "hook_3s": "酒店门口势利丈母娘把礼金扔在地上踩，下一秒百辆黑色红旗车队封路",
            "cover_theme": "orange",
        },
        {
            "title": "《离婚当天我怀了帝国总裁的崽》切片03：渣夫逼她净身出户，出门撞上渣夫小叔直接闪婚",
            "account_name": "蜜糖短剧社",
            "product_name": "怀了帝国总裁的崽(卡第11集)",
            "product_price": 39.9,
            "cover_slogan": "被渣男净身出户，转头嫁给渣男亲小叔！",
            "cover_sub_slogan": "前夫叫我小婶婶 · 连夜追完90集",
            "hook_3s": "民政局门口女主甩手撕碎B超单，迈巴赫后座伸出一只戴名表的手递上结婚证",
            "cover_theme": "purple",
        },
    ]
    tpl = random.choice(templates)
    video = ShortVideo(
        kwai_photo_id=f"KS_DJ9{suffix}",
        title=tpl["title"],
        account_name=tpl["account_name"],
        product_name=tpl["product_name"],
        product_price=tpl["product_price"],
        margin_rate=0.92,
        pool_stage="OBSERVING",
        cover_slogan=tpl["cover_slogan"],
        cover_sub_slogan=tpl["cover_sub_slogan"],
        cover_badge="高潜爆款切片",
        cover_theme=tpl["cover_theme"],
        hook_3s=tpl["hook_3s"],
        publish_minutes_ago=35,
        organic_views=1680,
        organic_views_slope_15m=940,
        impressions=16150,
        clicks=1680,
        cover_ctr=10.4,
        completion_3s_rate=69.5,
    )
    db.add(video)
    db.flush()

    events = evaluate_all_rules(db)
    return {
        "virtual_time": config.virtual_time,
        "video_title": video.title,
        "triggered_events": events,
    }


def inject_midnight_runaway(db: Session) -> Dict[str, Any]:
    """一键模拟凌晨 2:00 短剧广告组突发空耗跑飞，验证 R3 毫秒级自动止损"""
    config = db.query(SystemConfig).first()
    config.virtual_time = _advance_clock(config.virtual_time, 3)

    suffix = random.randint(1000, 9999)
    runaway_data = {
        "kwai_photo_id": f"KS_DJ4{suffix}",
        "title": "《慢节奏文艺爱情日记》切片05：男女主海边散步长镜头无反转",
        "account_name": "星辰剧场·每日热播",
        "product_name": "文艺爱情日记(卡第15集)",
        "product_price": 39.9,
        "margin_rate": 0.90,
        "pool_stage": "TESTING",
        "cover_slogan": "唯美海边爱情故事 温暖治愈",
        "cover_sub_slogan": "点击进入剧场观看",
        "cover_badge": "异常空耗模拟",
        "cover_theme": "blue",
        "hook_3s": "长达6秒海浪空镜配舒缓音乐，缺乏情绪钩子与付费卡点悬念",
        "publish_minutes_ago": 65,
        "organic_views": 1050,
        "organic_views_slope_15m": 40,
        "impressions": 24000,
        "clicks": 1120,
        "cover_ctr": 4.7,
        "completion_3s_rate": 33.8,
        "ad_cost": 146.0,
        "ad_gmv": 0.0,
        "ad_orders": 0,
        "total_roi": 0.0,
        "marginal_cost_30m": 146.0,
        "marginal_gmv_30m": 0.0,
        "marginal_roi_30m": 0.0,
        "active_plan_count": 2,
        "total_daily_budget": 1000.0,
        "status_note": "半夜突发异常空耗中...",
    }
    video = ShortVideo(**runaway_data)
    db.add(video)
    db.flush()

    p1 = AdPlan(unit_id=f"ZT_ERR{suffix}A", video_id=video.id, plan_name=f"异常空耗组A_{suffix}", status="ACTIVE", bid_roi=0.88, daily_budget=500.0, cost=89.0, gmv=0.0, orders=0, roi=0.0, marginal_roi_30m=0.0, created_by="MANUAL")
    p2 = AdPlan(unit_id=f"ZT_ERR{suffix}B", video_id=video.id, plan_name=f"异常空耗组B_{suffix}", status="ACTIVE", bid_roi=0.88, daily_budget=500.0, cost=57.0, gmv=0.0, orders=0, roi=0.0, marginal_roi_30m=0.0, created_by="MANUAL")
    db.add_all([p1, p2])
    db.flush()

    events = evaluate_all_rules(db)
    return {
        "virtual_time": config.virtual_time,
        "video_title": video.title,
        "triggered_events": events,
    }


def reset_all_sandbox_data(db: Session):
    db.query(FeishuApprovalCard).delete()
    db.query(AuditLog).delete()
    db.query(AutomationRule).delete()
    db.query(MetricSnapshot).delete()
    db.query(MaterialAsset).delete()
    db.query(AdPlan).delete()
    db.query(AdAccount).delete()
    db.query(ShortVideo).delete()
    db.query(SystemConfig).delete()
    db.commit()
    seed_initial_data(db)
