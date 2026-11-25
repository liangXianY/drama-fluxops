import json
from typing import Dict, Any
import httpx
from sqlalchemy.orm import Session
from ..models import SystemConfig, ShortVideo


async def diagnose_and_generate_creatives(db: Session, video: ShortVideo) -> Dict[str, Any]:
    """
    L2 AI 短剧投手异动归因与双列封面/黄金前3秒高燃钩子裂变引擎
    """
    config = db.query(SystemConfig).first()

    if config and config.llm_api_key and config.llm_api_base:
        try:
            prompt = (
                f"你是资深快手磁力智投【短剧商业化投手】与爆款剪辑师。请诊断以下快手短剧切片数据并输出纯JSON（不要包含markdown代码块标记）：\n"
                f"关联短剧与卡点：{video.product_name} (单笔充值均价 ¥{video.product_price})\n"
                f"当前切片标题：{video.title}\n"
                f"当前双列封面文案：{video.cover_slogan} / {video.cover_sub_slogan}\n"
                f"前3秒画面钩子：{video.hook_3s}\n"
                f"核心指标：CTR(双列封面点击率)={video.cover_ctr}%, 3秒完播率={video.completion_3s_rate}%, "
                f"累计消耗=¥{video.ad_cost}, 首日ROI(充值回本率)={video.total_roi} (首日回本线{config.break_even_roi}), 近30m边际ROI={video.marginal_roi_30m}。\n"
                f"请严格返回包含 bottleneck_tag(字符串), health_score(0-100整数), diagnosis_points(字符串数组3条), "
                f"cover_variants(数组3个对象: badge, main_title, sub_title, visual_guide, predicted_ctr数字, theme取orange/red/emerald之一), "
                f"script_hooks(数组2个对象: hook_type, visual_action, audio_line) 的 JSON。"
            )
            async with httpx.AsyncClient(timeout=25.0) as client:
                resp = await client.post(
                    f"{config.llm_api_base.rstrip('/')}/chat/completions",
                    headers={
                        "Authorization": f"Bearer {config.llm_api_key}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "model": config.llm_model or "deepseek-chat",
                        "messages": [{"role": "user", "content": prompt}],
                        "temperature": 0.7,
                    },
                )
                resp.raise_for_status()
                content = resp.json()["choices"][0]["message"]["content"].strip()
                if content.startswith("```"):
                    content = content.split("\n", 1)[-1].rsplit("```", 1)[0].strip()
                parsed = json.loads(content)
                parsed["engine_source"] = f"外部大模型 ({config.llm_model})"
                return parsed
        except Exception:
            pass

    drama_name = video.product_name.split("(")[0]

    if video.cover_ctr < 6.0:
        bottleneck = "CTR (双列封面点击率) 偏低 · 缺乏身份反差与悬念钩子"
        score = 39
        points = [
            f"当前 CTR (双列封面点击率) 仅 {video.cover_ctr:.1f}%（快手短剧跑量基准线 ≥ 8.0%），原封面《{video.cover_slogan}》像传统宣传海报，缺少快手用户偏好的『身份反差/打脸反转』冲突感。",
            f"前 3 秒完播率 {video.completion_3s_rate:.1f}% 偏低，开场空镜拖沓，未在黄金 1.5 秒内抛出核心人物矛盾。",
            "优化方案：暂停原切片盲目消耗，采用下方 AI 生成的【强悬念冲突封面】替换后重新进入自然流观察池测流。",
        ]
    elif video.completion_3s_rate < 45.0:
        bottleneck = "前 3 秒流失率高 · 进小程序跳转与付费解锁断层"
        score = 52
        points = [
            f"CTR (双列点击率) 达 {video.cover_ctr:.1f}% 合格，说明受众对《{drama_name}》题材有兴趣，但点进来 3 秒内流失了 {(100 - video.completion_3s_rate):.0f}%。",
            f"根因分析：当前开头『{video.hook_3s}』铺垫过慢，观众没等到高潮卡点就划走了，导致只扣广告曝光点击费、进剧充值率为 0。",
            "剪辑建议：采用『高潮前置倒叙法』——把付费卡点集前最激烈的一幕冲突画面直接剪到第 0 秒，再切回故事起因。",
        ]
    elif video.pool_stage == "SCALING" and video.marginal_roi_30m < 0.75:
        bottleneck = "放量池人群泛化 · 近30m边际 ROI (实时回本率) 跳水"
        score = 65
        points = [
            f"全天首日 ROI (总充值回本率) 为 {video.total_roi:.2f} 仍高于首日回本线 ({config.break_even_roi:.2f})，但近 30 分钟边际 ROI 已跌至 {video.marginal_roi_30m:.2f}，说明泛流量人群只看免费集、到付费墙直接退出。",
            f"当前单切片同时挂靠 {video.active_plan_count} 个广告组竞争，核心高付费意愿人群已被洗完一轮，ECPM (千次展现竞价力) 开始衰退。",
            "策略建议：先通过飞书审批将原计划预算下调 50% 锁住今日利润，同时用下方 3 套不同情绪切角封面裂变新素材去触达增量人群。",
        ]
    else:
        bottleneck = "S级高回本短剧切片 · 建议多封面叉乘基建抢量"
        score = 91
        points = [
            f"CTR (双列点击率) 高达 {video.cover_ctr:.1f}%，3 秒完播率 {video.completion_3s_rate:.1f}%，进剧跳转与卡点集付费漏斗表现优异。",
            f"首日实时回本 ROI 达 {video.marginal_roi_30m or 1.16:.2f}（叠加后续 7 日用户自然复充预计累计 ROI 可达 1.60+），正处黄金抢量期。",
            "短剧单素材衰退周期短（约 3~5 天），建议立即使用下方 3 套衍生封面批量叉乘新建磁力智投广告组放大规模。",
        ]

    cover_variants = [
        {
            "badge": "身份反差切角",
            "main_title": "嫌他穷当众退婚？全城首富齐迎驾！",
            "sub_title": f"《{drama_name}》第10集高能反转",
            "visual_guide": "上下分屏对比：上半屏受冷落特写，下半屏豪车列队亮出身份画面，中下部压白底黑边醒目字幕",
            "predicted_ctr": round(max(video.cover_ctr + 2.3, 9.3), 1),
            "theme": "orange",
        },
        {
            "badge": "情绪痛点切角",
            "main_title": "偏心家人把她赶出门，悔哭也没用",
            "sub_title": f"《{drama_name}》连看50集停不下来",
            "visual_guide": "主角决绝转身特写抓拍，强化委屈与逆袭反差情绪，吸引下沉市场高粘性受众点击",
            "predicted_ctr": round(max(video.cover_ctr + 1.8, 8.9), 1),
            "theme": "red",
        },
        {
            "badge": "悬念卡点切角",
            "main_title": "直到打开那份遗嘱，所有人都慌了…",
            "sub_title": f"《{drama_name}》左下角解锁完整大结局",
            "visual_guide": "定格关键道具（协议/信物/鉴定书）揭晓前一秒，制造强悬念提升进小程序组件点击率",
            "predicted_ctr": round(max(video.cover_ctr + 1.5, 8.6), 1),
            "theme": "emerald",
        },
    ]

    script_hooks = [
        {
            "hook_type": "黄金前3秒 · 强冲突倒叙钩子（拉升3秒完播率）",
            "visual_action": "第0.5秒直接切入摔合同/亮身份核心冲突镜头（去掉片头空镜），第2.5秒悬念定格切回正片",
            "audio_line": "“睁大眼睛看清楚！你刚刚撕毁的不是普通协议，而是整个集团百亿继承人的任命书！”",
        },
        {
            "hook_type": "结尾卡点钩子 · 引导跳转小程序解锁（拉升付费转化率）",
            "visual_action": "切片结尾最后2秒停在主角推门见到真相的震惊特写，底部弹出常驻剧集跳转提示条",
            "audio_line": "“她做梦也没想到，日夜陪伴在身边的枕边人，竟然就是当年那场大火的真正主谋……点击左下角立即看第10集真相！”",
        },
    ]

    return {
        "engine_source": "FluxOps 短剧磁力智投策略引擎",
        "bottleneck_tag": bottleneck,
        "health_score": score,
        "diagnosis_points": points,
        "cover_variants": cover_variants,
        "script_hooks": script_hooks,
    }
