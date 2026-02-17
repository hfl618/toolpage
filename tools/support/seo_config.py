# tools/support/seo_config.py

SEO_DB = {
    "index": {
        "title_zh": "全能在线工具集 - 极速数字化工程 Hub | 618002.xyz",
        "title_en": "Online Engineer Toolbox - High-Efficiency Digital Hub",
        "desc_zh": "面向开发者与创客的全能在线工具集，涵盖串口调试、元器件管理、LVGL转换及蓝牙配置。",
        "desc_en": "A versatile online toolset for developers and makers, covering serial debugging, inventory management, and more.",
        "key_zh": "在线工具集, 工程师助手, 数字化工作流, 618002",
        "key_en": "Online Tools, Engineer Assistant, Digital Workflow, 618002",
        "hidden_zh": "618002.xyz 提供全能在线工具集，包括串口调试、元器件管理、LVGL 转换及 BLE 配置，致力于免安装、跨平台体验。",
        "hidden_en": "618002.xyz provides a versatile online toolset including serial port debugging, inventory management, LVGL conversion, and BLE configuration."
    },
    "serial": {
        "title_zh": "Web Serial API 串口调试工具 - 免安装浏览器串口助手",
        "title_en": "Web Serial API Debugger - Driverless Browser Serial Assistant",
        "desc_zh": "基于现代 Web Serial API 的免驱动串口助手，支持 Chrome/Edge 浏览器直连硬件。",
        "desc_en": "Driverless serial assistant based on Web Serial API, supporting hardware connection via Chrome/Edge.",
        "key_zh": "Web Serial API, 串口调试工具, 浏览器串口助手, 单片机调试",
        "key_en": "Web Serial API, Serial Debug Tool, Online Serial Terminal, MCU Debugging",
        "hidden_zh": "这款 Web Serial API 串口调试工具是免安装浏览器串口助手，支持单片机免驱动调试，适配多种嵌入式设备。",
        "hidden_en": "This Web Serial API Tool is a driverless online terminal enabling cross-platform hardware connection."
    },
    "inventory": {
        "title_zh": "元器件智能管理系统 - 在线BOM解析与扫码入库",
        "title_en": "Smart Component Manager - Online BOM Parser & QR Inventory",
        "desc_zh": "数字化电子元器件管理方案，支持智能BOM解析、二维码仓储、多文档关联。",
        "desc_en": "Digital electronic component management, supporting intelligent BOM parsing and QR-based inventory.",
        "key_zh": "元器件管理, BOM解析, 电子零件库存, 扫码入库",
        "key_en": "Component Management, BOM Parser, Electronic Stock, QR Scanner",
        "hidden_zh": "元器件智能管理系统支持 BOM 自动解析与二维码仓储管理，助力电子工程师高效管理物料清单。",
        "hidden_en": "Smart component management system with BOM parsing and QR scanning for efficient inventory tracking."
    }
}

def get_seo_data(page_id):
    return SEO_DB.get(page_id, SEO_DB["index"])
