#!/usr/bin/env python3
"""
高质量掼蛋游戏素材生成器
生成108张扑克牌精灵表、卡背和UI素材
"""

import os
import sys
from PIL import Image, ImageDraw, ImageFont
import math

# 确保目录存在
def ensure_dir(path):
    os.makedirs(path, exist_ok=True)

# 颜色配置
COLORS = {
    'red': (220, 20, 60),      # 红心/方块
    'black': (40, 40, 40),     # 黑桃/草花
    'white': (255, 255, 255),  # 白色
    'cream': (255, 248, 220),  # 奶白色背景
    'gold': (255, 215, 0),     # 金色边框
    'blue': (25, 25, 112),     # 深蓝色背景
    'green': (0, 100, 0),      # 绿色背景
}

# 花色符号
SUITS = {
    'spades': '♠',    # 黑桃
    'hearts': '♥',    # 红心
    'diamonds': '♦',  # 方块
    'clubs': '♣'      # 梅花
}

# 牌面值
RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A']

# 卡牌尺寸 - 4x原始尺寸用于超高清渲染
CARD_WIDTH = 280  # 4x原始尺寸用于超高清渲染
CARD_HEIGHT = 380
CORNER_RADIUS = 40  # 4x缩放

class CardGenerator:
    def __init__(self):
        self.card_width = CARD_WIDTH
        self.card_height = CARD_HEIGHT
        
    def create_card_background(self, is_joker=False):
        """创建卡牌背景"""
        img = Image.new('RGBA', (self.card_width, self.card_height), (0, 0, 0, 0))
        draw = ImageDraw.Draw(img)
        
        # 绘制圆角矩形背景
        if is_joker:
            # 王牌特殊背景
            draw.rounded_rectangle(
                [2, 2, self.card_width-2, self.card_height-2],
                radius=CORNER_RADIUS,
                fill=(50, 50, 50),
                outline=COLORS['gold'],
                width=4
            )
        else:
            # 普通卡牌背景
            draw.rounded_rectangle(
                [2, 2, self.card_width-2, self.card_height-2],
                radius=CORNER_RADIUS,
                fill=COLORS['cream'],
                outline=COLORS['black'],
                width=3
            )
        
        return img, draw
    
    def get_font(self, size):
        """获取字体，使用系统默认字体"""
        try:
            # 尝试加载系统字体
            font = ImageFont.truetype("Arial.ttf", size)
        except:
            try:
                font = ImageFont.truetype("/System/Library/Fonts/Arial.ttf", size)
            except:
                try:
                    font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", size)
                except:
                    font = ImageFont.load_default()
        return font
    
    def draw_suit_symbol(self, draw, x, y, suit, size=30, color=COLORS['black']):
        """绘制花色符号"""
        font = self.get_font(size)
        symbol = SUITS[suit]
        
        # 获取文本边界框
        bbox = draw.textbbox((0, 0), symbol, font=font)
        text_width = bbox[2] - bbox[0]
        text_height = bbox[3] - bbox[1]
        
        # 居中绘制
        draw.text((x - text_width//2, y - text_height//2), symbol, 
                 fill=color, font=font)
    
    def draw_rank_text(self, draw, x, y, rank, size=24, color=COLORS['black']):
        """绘制牌面值"""
        font = self.get_font(size)
        
        # 获取文本边界框
        bbox = draw.textbbox((0, 0), rank, font=font)
        text_width = bbox[2] - bbox[0]
        text_height = bbox[3] - bbox[1]
        
        # 居中绘制
        draw.text((x - text_width//2, y - text_height//2), rank, 
                 fill=color, font=font)
    
    def create_number_card(self, rank, suit):
        """创建数字/字母牌"""
        img, draw = self.create_card_background()
        
        # 确定颜色
        color = COLORS['red'] if suit in ['hearts', 'diamonds'] else COLORS['black']
        
        # 绘制左上角 (4x缩放)
        self.draw_rank_text(draw, 40, 50, rank, 40, color)
        self.draw_suit_symbol(draw, 40, 90, suit, 32, color)
        
        # 绘制右下角（旋转180度）(4x缩放)
        temp_img = Image.new('RGBA', (80, 80), (0, 0, 0, 0))
        temp_draw = ImageDraw.Draw(temp_img)
        self.draw_rank_text(temp_draw, 40, 30, rank, 40, color)
        self.draw_suit_symbol(temp_draw, 40, 50, suit, 32, color)
        temp_img = temp_img.rotate(180)
        img.paste(temp_img, (self.card_width-80, self.card_height-80), temp_img)
        
        # 绘制中心图案
        self.draw_center_pattern(draw, rank, suit, color)
        
        return img
    
    def draw_center_pattern(self, draw, rank, suit, color):
        """绘制中心图案"""
        center_x = self.card_width // 2
        center_y = self.card_height // 2
        
        if rank in ['J', 'Q', 'K']:
            # 人头牌：绘制大花色符号 (4x缩放)
            self.draw_suit_symbol(draw, center_x, center_y, suit, 100, color)
            self.draw_rank_text(draw, center_x, center_y + 60, rank, 64, color)
        elif rank == 'A':
            # A：绘制大花色符号 (4x缩放)
            self.draw_suit_symbol(draw, center_x, center_y, suit, 120, color)
        else:
            # 数字牌：根据数字绘制对应数量的花色符号
            num = int(rank)
            self.draw_number_pattern(draw, num, suit, color)
    
    def draw_number_pattern(self, draw, num, suit, color):
        """绘制数字牌的花色图案"""
        center_x = self.card_width // 2
        center_y = self.card_height // 2
        symbol_size = 40  # 4x缩放
        
        # 定义不同数字的图案位置
        patterns = {
            2: [(center_x, center_y-60), (center_x, center_y+60)],
            3: [(center_x, center_y-60), (center_x, center_y), (center_x, center_y+60)],
            4: [(center_x-40, center_y-60), (center_x+40, center_y-60), 
                (center_x-40, center_y+60), (center_x+40, center_y+60)],
            5: [(center_x-40, center_y-60), (center_x+40, center_y-60), (center_x, center_y),
                (center_x-40, center_y+60), (center_x+40, center_y+60)],
            6: [(center_x-40, center_y-60), (center_x+40, center_y-60), 
                (center_x-40, center_y), (center_x+40, center_y),
                (center_x-40, center_y+60), (center_x+40, center_y+60)],
            7: [(center_x-40, center_y-60), (center_x+40, center_y-60), 
                (center_x, center_y-30), (center_x-40, center_y), (center_x+40, center_y),
                (center_x-40, center_y+60), (center_x+40, center_y+60)],
            8: [(center_x-40, center_y-60), (center_x+40, center_y-60), 
                (center_x-40, center_y-20), (center_x+40, center_y-20),
                (center_x-40, center_y+20), (center_x+40, center_y+20),
                (center_x-40, center_y+60), (center_x+40, center_y+60)],
            9: [(center_x-40, center_y-60), (center_x+40, center_y-60), 
                (center_x-40, center_y-30), (center_x+40, center_y-30),
                (center_x, center_y), (center_x-40, center_y+30), (center_x+40, center_y+30),
                (center_x-40, center_y+60), (center_x+40, center_y+60)],
            10: [(center_x-40, center_y-60), (center_x+40, center_y-60), 
                 (center_x-40, center_y-30), (center_x+40, center_y-30),
                 (center_x-40, center_y), (center_x+40, center_y),
                 (center_x-40, center_y+30), (center_x+40, center_y+30),
                 (center_x-40, center_y+60), (center_x+40, center_y+60)]
        }
        
        if num in patterns:
            for x, y in patterns[num]:
                self.draw_suit_symbol(draw, x, y, suit, symbol_size, color)
    
    def create_joker_card(self, is_red=False):
        """创建王牌"""
        img, draw = self.create_card_background(is_joker=True)
        
        center_x = self.card_width // 2
        center_y = self.card_height // 2
        
        if is_red:
            # 大王
            color = COLORS['red']
            text = "大王"
            symbol = "★"
        else:
            # 小王
            color = COLORS['black']
            text = "小王"
            symbol = "☆"
        
        # 绘制星星符号 (4x缩放)
        font = self.get_font(120)
        bbox = draw.textbbox((0, 0), symbol, font=font)
        text_width = bbox[2] - bbox[0]
        text_height = bbox[3] - bbox[1]
        draw.text((center_x - text_width//2, center_y - text_height//2 - 40), 
                 symbol, fill=color, font=font)
        
        # 绘制文字 (4x缩放)
        font = self.get_font(48)
        bbox = draw.textbbox((0, 0), text, font=font)
        text_width = bbox[2] - bbox[0]
        text_height = bbox[3] - bbox[1]
        draw.text((center_x - text_width//2, center_y - text_height//2 + 60), 
                 text, fill=color, font=font)
        
        return img
    
    def create_card_back(self):
        """创建卡背"""
        img = Image.new('RGBA', (self.card_width, self.card_height), (0, 0, 0, 0))
        draw = ImageDraw.Draw(img)
        
        # 绘制圆角矩形背景
        draw.rounded_rectangle(
            [2, 2, self.card_width-2, self.card_height-2],
            radius=CORNER_RADIUS,
            fill=COLORS['blue'],
            outline=COLORS['gold'],
            width=4
        )
        
        # 绘制装饰图案 (4x缩放)
        center_x = self.card_width // 2
        center_y = self.card_height // 2
        
        # 绘制钻石图案 (4x缩放)
        for i in range(5):
            for j in range(7):
                x = 40 + i * 40
                y = 40 + j * 40
                if (i + j) % 2 == 0:
                    draw.ellipse([x-10, y-10, x+10, y+10], fill=COLORS['gold'])
        
        # 中心logo (4x缩放)
        font = self.get_font(40)
        text = "掼蛋"
        bbox = draw.textbbox((0, 0), text, font=font)
        text_width = bbox[2] - bbox[0]
        text_height = bbox[3] - bbox[1]
        draw.text((center_x - text_width//2, center_y - text_height//2), 
                 text, fill=COLORS['gold'], font=font)
        
        return img

def generate_cards():
    """生成所有卡牌"""
    generator = CardGenerator()
    cards = []
    
    # 生成两副普通牌（52张 × 2 = 104张）
    for _ in range(2):
        for suit in ['spades', 'hearts', 'diamonds', 'clubs']:
            for rank in RANKS:
                card = generator.create_number_card(rank, suit)
                cards.append(card)
    
    # 生成王牌（4张）
    for _ in range(2):
        cards.append(generator.create_joker_card(is_red=False))  # 小王
        cards.append(generator.create_joker_card(is_red=True))   # 大王
    
    return cards

def create_spritesheet(cards, output_path):
    """创建精灵表"""
    # 计算精灵表尺寸：108张牌排成 12×9 网格
    cols = 12
    rows = 9
    
    # 最终输出尺寸（缩放到原始尺寸）
    final_card_width = 70
    final_card_height = 95
    
    sheet_width = cols * final_card_width
    sheet_height = rows * final_card_height
    
    # 创建精灵表
    spritesheet = Image.new('RGBA', (sheet_width, sheet_height), (0, 0, 0, 0))
    
    for i, card in enumerate(cards):
        row = i // cols
        col = i % cols
        
        # 缩放卡牌到最终尺寸
        scaled_card = card.resize((final_card_width, final_card_height), Image.LANCZOS)
        
        # 粘贴到精灵表
        x = col * final_card_width
        y = row * final_card_height
        spritesheet.paste(scaled_card, (x, y), scaled_card)
    
    # 保存精灵表
    spritesheet.save(output_path, 'PNG', optimize=True)
    print(f"精灵表已保存到: {output_path}")

def create_card_back_texture(output_path):
    """创建卡背纹理"""
    generator = CardGenerator()
    card_back = generator.create_card_back()
    
    # 缩放到最终尺寸
    final_card_back = card_back.resize((70, 95), Image.LANCZOS)
    
    # 保存
    final_card_back.save(output_path, 'PNG', optimize=True)
    print(f"卡背纹理已保存到: {output_path}")

def create_ui_assets(assets_dir):
    """创建UI素材"""
    # 创建按钮背景
    button_width = 120
    button_height = 40
    
    # 出牌按钮
    play_button = Image.new('RGBA', (button_width, button_height), (0, 0, 0, 0))
    draw = ImageDraw.Draw(play_button)
    draw.rounded_rectangle([0, 0, button_width, button_height], 
                          radius=10, fill=(0, 150, 0), outline=(255, 255, 255), width=2)
    play_button.save(f"{assets_dir}/play_button.png", 'PNG')
    
    # 过牌按钮
    pass_button = Image.new('RGBA', (button_width, button_height), (0, 0, 0, 0))
    draw = ImageDraw.Draw(pass_button)
    draw.rounded_rectangle([0, 0, button_width, button_height], 
                          radius=10, fill=(150, 0, 0), outline=(255, 255, 255), width=2)
    pass_button.save(f"{assets_dir}/pass_button.png", 'PNG')
    
    # 进贡按钮
    tribute_button = Image.new('RGBA', (button_width, button_height), (0, 0, 0, 0))
    draw = ImageDraw.Draw(tribute_button)
    draw.rounded_rectangle([0, 0, button_width, button_height], 
                          radius=10, fill=(0, 0, 150), outline=(255, 255, 255), width=2)
    tribute_button.save(f"{assets_dir}/tribute_button.png", 'PNG')
    
    print("UI素材已生成")

def main():
    """主函数"""
    # 设置路径
    base_dir = "/Users/dongchengcheng/Project/super-guandan"
    assets_dir = f"{base_dir}/client/assets"
    
    # 确保目录存在
    ensure_dir(assets_dir)
    
    print("开始生成高质量游戏素材...")
    
    # 生成卡牌
    print("生成卡牌...")
    cards = generate_cards()
    
    # 创建精灵表
    print("创建精灵表...")
    create_spritesheet(cards, f"{assets_dir}/cards.png")
    
    # 创建卡背
    print("创建卡背...")
    create_card_back_texture(f"{assets_dir}/card_back.png")
    
    # 创建UI素材
    print("创建UI素材...")
    create_ui_assets(assets_dir)
    
    print("所有素材生成完成！")
    print(f"素材位置: {assets_dir}")
    print("包含文件:")
    print("- cards.png (108帧卡牌精灵表)")
    print("- card_back.png (卡背纹理)")
    print("- play_button.png (出牌按钮)")
    print("- pass_button.png (过牌按钮)")
    print("- tribute_button.png (进贡按钮)")

if __name__ == "__main__":
    main()