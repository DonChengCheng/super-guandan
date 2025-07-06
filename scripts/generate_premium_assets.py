#!/usr/bin/env python3
"""
专业级掼蛋游戏素材生成器
生成高质量、视觉效果丰富的游戏资源
"""

import os
import sys
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import math

def ensure_dir(path):
    os.makedirs(path, exist_ok=True)

# 专业级配色方案
COLORS = {
    # 卡牌颜色
    'red': (220, 20, 60),           # 鲜艳红色 (红心/方块)
    'black': (28, 28, 30),          # 深黑色 (黑桃/草花)
    'white': (255, 255, 255),       # 纯白
    'off_white': (250, 250, 250),   # 微灰白
    
    # 背景渐变
    'card_bg_start': (248, 248, 248),
    'card_bg_end': (238, 238, 238),
    'card_border': (200, 200, 200),
    'card_shadow': (0, 0, 0, 40),   # 带透明度的阴影
    
    # 王牌特殊配色
    'joker_bg': (25, 25, 35),
    'joker_gold': (255, 215, 0),
    'joker_silver': (192, 192, 192),
    
    # 卡背配色
    'back_primary': (30, 60, 120),
    'back_secondary': (50, 80, 140),
    'back_accent': (220, 180, 50),
    'back_pattern': (40, 70, 130),
    
    # UI元素
    'ui_green': (76, 175, 80),
    'ui_red': (244, 67, 54),
    'ui_blue': (33, 150, 243),
    'ui_shadow': (0, 0, 0, 80),
}

# 花色符号和Unicode字符
SUITS = {
    'spades': '♠',      # 黑桃
    'hearts': '♥',      # 红心  
    'diamonds': '♦',    # 方块
    'clubs': '♣'        # 梅花
}

# 更完整的rank映射
RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A']
RANK_NAMES = {
    'J': 'JACK',
    'Q': 'QUEEN', 
    'K': 'KING',
    'A': 'ACE'
}

# 高分辨率尺寸
CARD_WIDTH = 420    # 6x原始尺寸，超高清
CARD_HEIGHT = 570
CORNER_RADIUS = 60
BORDER_WIDTH = 8

class PremiumCardGenerator:
    def __init__(self):
        self.card_width = CARD_WIDTH
        self.card_height = CARD_HEIGHT
        
    def get_font(self, size, bold=False):
        """获取高质量字体"""
        font_paths = [
            # macOS系统字体
            "/System/Library/Fonts/Helvetica.ttc",
            "/System/Library/Fonts/Arial.ttf", 
            "/Library/Fonts/Arial.ttf",
            # Linux字体
            "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
            "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
        ]
        
        for font_path in font_paths:
            try:
                return ImageFont.truetype(font_path, size)
            except:
                continue
                
        # 回退到默认字体
        return ImageFont.load_default()
    
    def create_gradient_background(self, start_color, end_color):
        """创建渐变背景"""
        img = Image.new('RGBA', (self.card_width, self.card_height), (0, 0, 0, 0))
        
        # 创建垂直渐变
        for y in range(self.card_height):
            # 计算渐变比例
            ratio = y / self.card_height
            
            # 插值计算颜色
            r = int(start_color[0] * (1 - ratio) + end_color[0] * ratio)
            g = int(start_color[1] * (1 - ratio) + end_color[1] * ratio)
            b = int(start_color[2] * (1 - ratio) + end_color[2] * ratio)
            
            # 绘制一行像素
            for x in range(self.card_width):
                img.putpixel((x, y), (r, g, b, 255))
                
        return img
    
    def add_card_shadow(self, img):
        """添加卡牌阴影效果"""
        # 创建阴影图层
        shadow = Image.new('RGBA', (self.card_width + 20, self.card_height + 20), (0, 0, 0, 0))
        shadow_draw = ImageDraw.Draw(shadow)
        
        # 绘制阴影
        shadow_draw.rounded_rectangle(
            [15, 15, self.card_width + 15, self.card_height + 15],
            radius=CORNER_RADIUS,
            fill=COLORS['card_shadow']
        )
        
        # 应用模糊效果
        shadow = shadow.filter(ImageFilter.GaussianBlur(radius=8))
        
        # 合并阴影和卡牌
        result = Image.new('RGBA', (self.card_width + 20, self.card_height + 20), (0, 0, 0, 0))
        result.paste(shadow, (0, 0), shadow)
        result.paste(img, (10, 10), img)
        
        return result
    
    def create_card_base(self, is_joker=False):
        """创建高质量卡牌基础"""
        if is_joker:
            # 王牌使用深色渐变背景
            img = self.create_gradient_background(COLORS['joker_bg'], (35, 35, 45))
        else:
            # 普通卡牌使用浅色渐变背景
            img = self.create_gradient_background(COLORS['card_bg_start'], COLORS['card_bg_end'])
        
        draw = ImageDraw.Draw(img)
        
        # 绘制圆角矩形边框
        if is_joker:
            border_color = COLORS['joker_gold']
        else:
            border_color = COLORS['card_border']
            
        # 外边框
        draw.rounded_rectangle(
            [BORDER_WIDTH//2, BORDER_WIDTH//2, 
             self.card_width - BORDER_WIDTH//2, self.card_height - BORDER_WIDTH//2],
            radius=CORNER_RADIUS,
            outline=border_color,
            width=BORDER_WIDTH
        )
        
        # 内边框（添加层次感）
        draw.rounded_rectangle(
            [BORDER_WIDTH + 4, BORDER_WIDTH + 4, 
             self.card_width - BORDER_WIDTH - 4, self.card_height - BORDER_WIDTH - 4],
            radius=CORNER_RADIUS - 8,
            outline=border_color,
            width=2
        )
        
        return img, draw
    
    def draw_suit_symbol(self, draw, x, y, suit, size=60, color=COLORS['black']):
        """绘制精美的花色符号"""
        font = self.get_font(size, bold=True)
        symbol = SUITS[suit]
        
        # 获取文本尺寸
        bbox = draw.textbbox((0, 0), symbol, font=font)
        text_width = bbox[2] - bbox[0]
        text_height = bbox[3] - bbox[1]
        
        # 添加阴影效果
        shadow_offset = max(2, size // 30)
        draw.text((x - text_width//2 + shadow_offset, y - text_height//2 + shadow_offset), 
                 symbol, fill=(0, 0, 0, 60), font=font)
        
        # 绘制主符号
        draw.text((x - text_width//2, y - text_height//2), 
                 symbol, fill=color, font=font)
    
    def draw_rank_text(self, draw, x, y, rank, size=48, color=COLORS['black'], bold=True):
        """绘制精美的牌面值"""
        font = self.get_font(size, bold=bold)
        
        # 获取文本尺寸
        bbox = draw.textbbox((0, 0), rank, font=font)
        text_width = bbox[2] - bbox[0]
        text_height = bbox[3] - bbox[1]
        
        # 添加阴影效果
        shadow_offset = max(1, size // 40)
        draw.text((x - text_width//2 + shadow_offset, y - text_height//2 + shadow_offset), 
                 rank, fill=(0, 0, 0, 60), font=font)
        
        # 绘制主文字
        draw.text((x - text_width//2, y - text_height//2), 
                 rank, fill=color, font=font)
    
    def create_suit_pattern_for_number(self, draw, rank, suit, color):
        """为数字牌创建精美的花色图案"""
        center_x = self.card_width // 2
        center_y = self.card_height // 2
        symbol_size = 36
        
        try:
            num = int(rank)
        except:
            return
        
        # 定义每种数字的图案布局
        patterns = {
            2: [(center_x, center_y - 80), (center_x, center_y + 80)],
            3: [(center_x, center_y - 80), (center_x, center_y), (center_x, center_y + 80)],
            4: [(center_x - 40, center_y - 60), (center_x + 40, center_y - 60),
                (center_x - 40, center_y + 60), (center_x + 40, center_y + 60)],
            5: [(center_x - 40, center_y - 60), (center_x + 40, center_y - 60), (center_x, center_y),
                (center_x - 40, center_y + 60), (center_x + 40, center_y + 60)],
            6: [(center_x - 40, center_y - 60), (center_x + 40, center_y - 60),
                (center_x - 40, center_y), (center_x + 40, center_y),
                (center_x - 40, center_y + 60), (center_x + 40, center_y + 60)],
            7: [(center_x - 40, center_y - 60), (center_x + 40, center_y - 60),
                (center_x, center_y - 30), (center_x - 40, center_y), (center_x + 40, center_y),
                (center_x - 40, center_y + 60), (center_x + 40, center_y + 60)],
            8: [(center_x - 40, center_y - 80), (center_x + 40, center_y - 80),
                (center_x - 40, center_y - 25), (center_x + 40, center_y - 25),
                (center_x - 40, center_y + 25), (center_x + 40, center_y + 25),
                (center_x - 40, center_y + 80), (center_x + 40, center_y + 80)],
            9: [(center_x - 40, center_y - 80), (center_x + 40, center_y - 80),
                (center_x - 40, center_y - 40), (center_x + 40, center_y - 40),
                (center_x, center_y), (center_x - 40, center_y + 40), (center_x + 40, center_y + 40),
                (center_x - 40, center_y + 80), (center_x + 40, center_y + 80)],
            10: [(center_x - 40, center_y - 80), (center_x + 40, center_y - 80),
                 (center_x - 40, center_y - 40), (center_x + 40, center_y - 40),
                 (center_x - 40, center_y), (center_x + 40, center_y),
                 (center_x - 40, center_y + 40), (center_x + 40, center_y + 40),
                 (center_x - 40, center_y + 80), (center_x + 40, center_y + 80)]
        }
        
        if num in patterns:
            for x, y in patterns[num]:
                self.draw_suit_symbol(draw, x, y, suit, symbol_size, color)
    
    def create_number_card(self, rank, suit):
        """创建高质量数字/字母牌"""
        img, draw = self.create_card_base()
        
        # 确定颜色
        color = COLORS['red'] if suit in ['hearts', 'diamonds'] else COLORS['black']
        
        # 绘制四个角的标识
        margin = 30
        small_rank_size = 36
        small_suit_size = 24
        
        # 左上角
        self.draw_rank_text(draw, margin + 20, margin + 25, rank, small_rank_size, color)
        self.draw_suit_symbol(draw, margin + 20, margin + 60, suit, small_suit_size, color)
        
        # 右下角（旋转180度的效果）
        right_x = self.card_width - margin - 20
        bottom_y = self.card_height - margin - 25
        self.draw_rank_text(draw, right_x, bottom_y, rank, small_rank_size, color)
        self.draw_suit_symbol(draw, right_x, self.card_height - margin - 60, suit, small_suit_size, color)
        
        # 绘制中心图案
        if rank in ['J', 'Q', 'K', 'A']:
            # 人头牌和A的特殊处理
            center_x = self.card_width // 2
            center_y = self.card_height // 2
            
            if rank == 'A':
                # A牌：大花色符号
                self.draw_suit_symbol(draw, center_x, center_y, suit, 120, color)
            else:
                # 人头牌：大花色符号 + 标识
                self.draw_suit_symbol(draw, center_x, center_y - 20, suit, 80, color)
                self.draw_rank_text(draw, center_x, center_y + 60, rank, 64, color)
                
                # 添加人头牌标识
                if rank in RANK_NAMES:
                    name_font = self.get_font(16)
                    name = RANK_NAMES[rank]
                    bbox = draw.textbbox((0, 0), name, font=name_font)
                    name_width = bbox[2] - bbox[0]
                    draw.text((center_x - name_width//2, center_y + 100), 
                             name, fill=color, font=name_font)
        else:
            # 数字牌：绘制对应数量的花色符号
            self.create_suit_pattern_for_number(draw, rank, suit, color)
        
        return img
    
    def create_joker_card(self, is_red=False):
        """创建高质量王牌"""
        img, draw = self.create_card_base(is_joker=True)
        
        center_x = self.card_width // 2
        center_y = self.card_height // 2
        
        if is_red:
            # 大王
            primary_color = COLORS['joker_gold']
            secondary_color = COLORS['red']
            text = "大王"
            symbol = "★"
            english = "BIG JOKER"
        else:
            # 小王
            primary_color = COLORS['joker_silver']
            secondary_color = COLORS['white']
            text = "小王"
            symbol = "☆"
            english = "SMALL JOKER"
        
        # 绘制装饰圆环
        draw.ellipse([center_x - 80, center_y - 80, center_x + 80, center_y + 80],
                    outline=primary_color, width=6)
        draw.ellipse([center_x - 70, center_y - 70, center_x + 70, center_y + 70],
                    outline=secondary_color, width=3)
        
        # 绘制大星星符号
        star_font = self.get_font(100, bold=True)
        bbox = draw.textbbox((0, 0), symbol, font=star_font)
        star_width = bbox[2] - bbox[0]
        star_height = bbox[3] - bbox[1]
        
        # 星星阴影
        draw.text((center_x - star_width//2 + 3, center_y - star_height//2 - 15 + 3), 
                 symbol, fill=(0, 0, 0, 100), font=star_font)
        # 星星主体
        draw.text((center_x - star_width//2, center_y - star_height//2 - 15), 
                 symbol, fill=primary_color, font=star_font)
        
        # 绘制中文字
        chinese_font = self.get_font(36, bold=True)
        bbox = draw.textbbox((0, 0), text, font=chinese_font)
        text_width = bbox[2] - bbox[0]
        draw.text((center_x - text_width//2, center_y + 40), 
                 text, fill=primary_color, font=chinese_font)
        
        # 绘制英文字
        english_font = self.get_font(18)
        bbox = draw.textbbox((0, 0), english, font=english_font)
        english_width = bbox[2] - bbox[0]
        draw.text((center_x - english_width//2, center_y + 80), 
                 english, fill=secondary_color, font=english_font)
        
        return img
    
    def create_premium_card_back(self):
        """创建高质量卡背"""
        img = self.create_gradient_background(COLORS['back_primary'], COLORS['back_secondary'])
        draw = ImageDraw.Draw(img)
        
        # 绘制边框
        draw.rounded_rectangle(
            [BORDER_WIDTH//2, BORDER_WIDTH//2, 
             self.card_width - BORDER_WIDTH//2, self.card_height - BORDER_WIDTH//2],
            radius=CORNER_RADIUS,
            outline=COLORS['back_accent'],
            width=BORDER_WIDTH
        )
        
        center_x = self.card_width // 2
        center_y = self.card_height // 2
        
        # 创建复杂的几何图案
        # 绘制多层同心圆
        for i in range(5):
            radius = 40 + i * 25
            alpha = 100 - i * 15
            color = (*COLORS['back_accent'][:3], alpha)
            draw.ellipse([center_x - radius, center_y - radius, 
                         center_x + radius, center_y + radius],
                        outline=color, width=3)
        
        # 绘制钻石图案网格
        diamond_size = 20
        spacing = 50
        
        for row in range(-4, 5):
            for col in range(-3, 4):
                if (row + col) % 2 == 0:
                    x = center_x + col * spacing
                    y = center_y + row * spacing * 0.8
                    
                    # 绘制钻石
                    diamond_points = [
                        (x, y - diamond_size//2),
                        (x + diamond_size//2, y),
                        (x, y + diamond_size//2),
                        (x - diamond_size//2, y)
                    ]
                    draw.polygon(diamond_points, fill=COLORS['back_pattern'], 
                               outline=COLORS['back_accent'], width=1)
        
        # 中心logo区域
        logo_bg = Image.new('RGBA', (160, 80), COLORS['back_accent'] + (180,))
        logo_draw = ImageDraw.Draw(logo_bg)
        logo_draw.rounded_rectangle([0, 0, 160, 80], radius=15, 
                                   fill=COLORS['back_accent'] + (180,))
        
        # 绘制"掼蛋"文字
        logo_font = self.get_font(32, bold=True)
        logo_text = "掼蛋"
        bbox = logo_draw.textbbox((0, 0), logo_text, font=logo_font)
        logo_width = bbox[2] - bbox[0]
        logo_height = bbox[3] - bbox[1]
        
        logo_draw.text((80 - logo_width//2, 40 - logo_height//2), 
                      logo_text, fill=COLORS['white'], font=logo_font)
        
        # 合并logo到主图像
        img.paste(logo_bg, (center_x - 80, center_y - 40), logo_bg)
        
        return img

def generate_premium_cards():
    """生成所有高质量卡牌"""
    generator = PremiumCardGenerator()
    cards = []
    
    print("生成高质量卡牌...")
    
    # 生成两副普通牌（52张 × 2 = 104张）
    for deck in range(2):
        print(f"生成第{deck + 1}副牌...")
        for suit in ['spades', 'hearts', 'diamonds', 'clubs']:
            for rank in RANKS:
                card = generator.create_number_card(rank, suit)
                cards.append(card)
                
    # 生成王牌（4张）
    print("生成王牌...")
    for _ in range(2):
        cards.append(generator.create_joker_card(is_red=False))  # 小王
        cards.append(generator.create_joker_card(is_red=True))   # 大王
    
    return cards, generator

def create_premium_spritesheet(cards, output_path):
    """创建高质量精灵表"""
    print("创建精灵表...")
    
    # 计算精灵表尺寸：108张牌排成 12×9 网格
    cols = 12
    rows = 9
    
    # 最终输出尺寸（缩放到游戏尺寸）
    final_card_width = 70
    final_card_height = 95
    
    sheet_width = cols * final_card_width
    sheet_height = rows * final_card_height
    
    # 创建精灵表
    spritesheet = Image.new('RGBA', (sheet_width, sheet_height), (0, 0, 0, 0))
    
    for i, card in enumerate(cards):
        if i >= 108:  # 确保不超过108张
            break
            
        row = i // cols
        col = i % cols
        
        # 高质量缩放到最终尺寸
        scaled_card = card.resize((final_card_width, final_card_height), Image.LANCZOS)
        
        # 粘贴到精灵表
        x = col * final_card_width
        y = row * final_card_height
        spritesheet.paste(scaled_card, (x, y), scaled_card)
    
    # 保存精灵表
    spritesheet.save(output_path, 'PNG', optimize=True, quality=95)
    print(f"✅ 精灵表已保存: {output_path}")

def create_premium_card_back(generator, output_path):
    """创建高质量卡背"""
    print("创建卡背...")
    card_back = generator.create_premium_card_back()
    
    # 缩放到最终尺寸
    final_card_back = card_back.resize((70, 95), Image.LANCZOS)
    
    # 保存
    final_card_back.save(output_path, 'PNG', optimize=True, quality=95)
    print(f"✅ 卡背已保存: {output_path}")

def create_premium_ui_assets(assets_dir):
    """创建高质量UI素材"""
    print("创建UI素材...")
    
    button_width = 120
    button_height = 40
    corner_radius = 12
    
    def create_button(color, text_color=COLORS['white']):
        """创建带渐变和阴影的按钮"""
        # 创建更大的画布用于阴影
        canvas = Image.new('RGBA', (button_width + 10, button_height + 10), (0, 0, 0, 0))
        
        # 绘制阴影
        shadow = Image.new('RGBA', (button_width, button_height), (0, 0, 0, 0))
        shadow_draw = ImageDraw.Draw(shadow)
        shadow_draw.rounded_rectangle([0, 0, button_width, button_height], 
                                     radius=corner_radius, 
                                     fill=(0, 0, 0, 80))
        
        # 应用模糊
        shadow = shadow.filter(ImageFilter.GaussianBlur(radius=2))
        canvas.paste(shadow, (3, 3), shadow)
        
        # 创建按钮渐变
        button = Image.new('RGBA', (button_width, button_height), (0, 0, 0, 0))
        button_draw = ImageDraw.Draw(button)
        
        # 渐变背景
        for y in range(button_height):
            ratio = y / button_height
            r = int(color[0] * (1 - ratio * 0.3))
            g = int(color[1] * (1 - ratio * 0.3))
            b = int(color[2] * (1 - ratio * 0.3))
            
            button_draw.rectangle([0, y, button_width, y + 1], fill=(r, g, b))
        
        # 绘制边框
        button_draw.rounded_rectangle([0, 0, button_width, button_height], 
                                     radius=corner_radius, 
                                     outline=text_color, width=2)
        
        # 高光效果
        highlight = Image.new('RGBA', (button_width, button_height), (0, 0, 0, 0))
        highlight_draw = ImageDraw.Draw(highlight)
        highlight_draw.rounded_rectangle([2, 2, button_width - 2, button_height // 2], 
                                        radius=corner_radius - 2, 
                                        fill=(255, 255, 255, 30))
        
        # 合并所有层
        button = Image.alpha_composite(button, highlight)
        canvas.paste(button, (0, 0), button)
        
        return canvas
    
    # 创建各种按钮
    play_button = create_button(COLORS['ui_green'])
    play_button.save(f"{assets_dir}/play_button.png", 'PNG')
    
    pass_button = create_button(COLORS['ui_red'])
    pass_button.save(f"{assets_dir}/pass_button.png", 'PNG')
    
    tribute_button = create_button(COLORS['ui_blue'])
    tribute_button.save(f"{assets_dir}/tribute_button.png", 'PNG')
    
    print("✅ UI素材已生成")

def main():
    """主函数"""
    print("🎨 开始生成专业级掼蛋游戏素材...\n")
    
    # 设置路径
    base_dir = "/Users/dongchengcheng/Project/super-guandan"
    assets_dir = f"{base_dir}/client/assets"
    
    # 确保目录存在
    ensure_dir(assets_dir)
    
    try:
        # 生成卡牌
        cards, generator = generate_premium_cards()
        
        # 创建精灵表
        create_premium_spritesheet(cards, f"{assets_dir}/cards.png")
        
        # 创建卡背
        create_premium_card_back(generator, f"{assets_dir}/card_back.png")
        
        # 创建UI素材
        create_premium_ui_assets(assets_dir)
        
        print("\n🎉 所有专业级素材生成完成！")
        print(f"📁 素材位置: {assets_dir}")
        print("📊 文件列表:")
        print("  - cards.png (108帧高质量卡牌精灵表)")
        print("  - card_back.png (专业级卡背纹理)")
        print("  - play_button.png (渐变出牌按钮)")
        print("  - pass_button.png (渐变过牌按钮)")
        print("  - tribute_button.png (渐变进贡按钮)")
        
    except Exception as e:
        print(f"❌ 生成过程中出现错误: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    main()