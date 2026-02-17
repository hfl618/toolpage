# tools/support/sponsors.py
import random

# 赞助商配置列表
SPONSORS_CONFIG = [
    {
        "id": "jlc-pcb",
        "type": "text",
        "placements": ["footer_grid", "sidebar", "floating"], 
        "pages": ["index", "serial", "all"],
        "title_zh": "嘉立创 PCB 打样",
        "title_en": "JLCPCB Prototype",
        "desc_zh": "全球领先的 PCB 制造，24 小时极速发货。",
        "desc_en": "World's leading PCB service, 24h turnaround.",
        "image": "https://img.icons8.com/color/96/circuit.png",
        "link": "https://jlcpcb.com/",
        "color": "bg-gray-50"
    },
    {
        "id": "banner-ad",
        "type": "image", 
        "placements": ["footer_grid"], 
        "pages": ["all"],
        "image": "https://api.dicebear.com/7.x/identicon/svg?seed=ad1", 
        "link": "https://example.com/promo",
        "color": "bg-gray-50"
    },
    {
        "id": "deepseek-api",
        "type": "text",
        "placements": ["footer_grid"], 
        "pages": ["index", "ai", "all"],
        "title_zh": "DeepSeek AI 赋能",
        "title_en": "Powered by DeepSeek",
        "desc_zh": "国产最强 AI 大模型，极速推理体验。",
        "desc_en": "Most powerful AI model for fast inference.",
        "image": "https://img.icons8.com/fluency/96/artificial-intelligence.png",
        "link": "https://deepseek.com/",
        "color": "bg-gray-50"
    },
    {
        "id": "logic-analyzer",
        "type": "text",
        "placements": ["footer_grid"], 
        "pages": ["serial"], # <--- 关键：只在串口页显示
        "title_zh": "专业逻辑分析仪",
        "title_en": "Logic Analyzer Pro",
        "desc_zh": "配合串口调试，精准抓取硬件协议波形。",
        "desc_en": "Capture hardware protocols with precision.",
        "image": "https://img.icons8.com/fluency/96/oscilloscope.png",
        "link": "https://example.com/logic",
        "color": "bg-gray-50"
    },
    {
        "id": "cloudflare-r2",
        "placements": ["footer_grid", "sidebar"], 
        "pages": ["index", "inventory", "all"],
        "title_zh": "R2 云端静态存储",
        "title_en": "Cloudflare R2",
        "desc_zh": "0 访问费用，极速 CDN 全球分发。",
        "desc_en": "Zero egress fees, global CDN distribution.",
        "image": "https://img.icons8.com/color/96/cloudflare.png",
        "link": "https://www.cloudflare.com/",
        "color": "bg-gray-50"
    }
]

def get_sponsors_logic(placement, page_id, limit=None):
    """
    模块化获取赞助商函数
    """
    matched = [
        s for s in SPONSORS_CONFIG 
        if placement in s['placements'] and (page_id in s['pages'] or 'all' in s['pages'])
    ]
    
    # 随机打乱以确保公平展示
    random.shuffle(matched)
    
    if limit:
        return matched[:limit]
    return matched
