# tools/support/tools_config.py

TOOLS_LIST = [
    {
        "id": "stock",
        "cat": "dev",
        "icon": "ri-cpu-fill",
        "color": "bg-gradient-to-br from-blue-500 to-indigo-600",
        "url": "/inventory/",
        "title_zh": "元器件管理",
        "title_en": "Inventory",
        "desc_zh": "库存、BOM、扫码一体化",
        "desc_en": "Stock, BOM, QR integrated",
        "lDesc_zh": "全方位数字化仓储解决方案。支持解析 Yageo、XFCN 等供应商 BOM 表单，一键生成二维码。",
        "lDesc_en": "Full digital warehouse solution. Supports Yageo, XFCN BOM parsing and QR-based tracking.",
        "comments": [
            {"zh": "BOM解析准确", "en": "Accurate BOM Parsing"},
            {"zh": "效率很高", "en": "Very Efficient"}
        ]
    },
    {
        "id": "serial",
        "cat": "dev",
        "icon": "ri-terminal-line",
        "color": "bg-gradient-to-br from-indigo-500 to-purple-600",
        "url": "/serial/",
        "title_zh": "云端串口调试",
        "title_en": "Serial Studio",
        "desc_zh": "Web Serial API 直连",
        "desc_en": "Hardware debug via web",
        "lDesc_zh": "基于 Web Serial API 的专业串口调试工具。支持 2M 高速波特率、HEX 收发及指令宏，免安装驱动。",
        "lDesc_en": "Professional web-based serial terminal. Supports up to 2M baud, HEX, and macros.",
        "comments": [
            {"zh": "无需安装驱动", "en": "Driverless"},
            {"zh": "高速稳定", "en": "Fast & Stable"}
        ]
    },
    {
        "id": "ble",
        "cat": "dev",
        "icon": "ri-bluetooth-connect-line",
        "color": "bg-gradient-to-br from-blue-500 to-cyan-500",
        "url": "/ble_config/",
        "title_zh": "设备蓝牙配网",
        "title_en": "BLE Config",
        "desc_zh": "Web Bluetooth API 配网",
        "desc_en": "Provision IoT via BLE",
        "lDesc_zh": "基于 Web Bluetooth API 的极简配网工具。支持多组 Wi-Fi 下发、硬件指令控制，适配移动端。",
        "lDesc_en": "Minimalist provisioning tool via Web Bluetooth. Supports Wi-Fi settings and hardware control.",
        "comments": [
            {"zh": "配网很快", "en": "Very fast"},
            {"zh": "界面简洁", "en": "Minimalist UI"}
        ]
    },
    {
        "id": "lvgl",
        "cat": "dev",
        "icon": "ri-image-edit-fill",
        "color": "bg-gradient-to-br from-emerald-500 to-teal-600",
        "url": "/lvgl_image/",
        "title_zh": "LVGL 图像处理",
        "title_en": "LVGL Image",
        "desc_zh": "嵌入式素材转换",
        "desc_en": "Embedded Asset Converter",
        "lDesc_zh": "专为 LVGL 嵌入式图形库设计的图像处理工具。在线转换图片为 C 数组，优化内存占用。",
        "lDesc_en": "Professional image converter for LVGL. Optimize your embedded UI assets online.",
        "comments": [
            {"zh": "RGB565很好用", "en": "Great RGB565"},
            {"zh": "转换速度快", "en": "Speedy"}
        ]
    },
    {
        "id": "ai",
        "cat": "ai",
        "icon": "ri-eye-fill",
        "color": "bg-gradient-to-br from-purple-500 to-pink-600",
        "url": "#",
        "title_zh": "AI 识别中心",
        "title_en": "AI Analysis",
        "desc_zh": "视觉模型物料分析",
        "desc_en": "Visual Model Analysis",
        "lDesc_zh": "基于最先进的视觉大语言模型，提供 OCR 识别与物料自动分类建议。",
        "lDesc_en": "Advanced AI visual analysis for components and OCR recognition.",
        "comments": [
            {"zh": "OCR识别极快", "en": "Fast OCR"},
            {"zh": "识别率高", "en": "High accuracy"}
        ]
    }
]

def get_tools_logic():
    return TOOLS_LIST
