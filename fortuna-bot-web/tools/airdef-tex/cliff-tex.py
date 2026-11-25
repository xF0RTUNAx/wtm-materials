# Текстуры обрывов (games/airdef/cliffs.js): глина - свои плитки «Текстуры земли и дорог» (глина_1, склон_макро_1), скала - Poly Haven cliff_side (CC0), обесцвечена.
#   python3 tools/airdef-tex/cliff-tex.py   → games/airdef/tex/cl_*.ktx2 (нужны ffmpeg и basisu)
import os, subprocess, tempfile
B = os.path.expanduser('~/Downloads/Воздушное превосходство'); O = f'{B}/Модели/Свои/Текстуры земли и дорог/плитки'; R = f'{B}/Текстуры/cliff_side_2k/textures/cliff_side'
OUT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '../../games/airdef/tex')); T = tempfile.mkdtemp()
def ff(*a): subprocess.run(['ffmpeg', '-y', '-v', 'error', *a], check=True)
def u(src, out, *k): subprocess.run(['basisu', '-ktx2', '-uastc', '-uastc_level', '2', '-uastc_rdo_l', '1.2', '-ktx2_zstandard_level', '18', '-mipmap', '-linear', *k, src, '-output_file', f'{OUT}/{out}.ktx2'], check=True, stdout=subprocess.DEVNULL)
S = 'scale=1024:1024:flags=lanczos'
# цвет в rgb, высота в альфе; нормали (rg)
ff('-i', f'{O}/глина_1/цвет.png', '-i', f'{O}/глина_1/высота.png', '-filter_complex', f'[0:v]{S},format=rgb24[a];[1:v]{S},format=gray[b];[a][b]alphamerge,format=rgba', '-frames:v', '1', f'{T}/cc.png'); u(f'{T}/cc.png', 'cl_clay_c')
ff('-i', f'{O}/глина_1/нормали.png', '-vf', f'{S},format=rgb24', '-frames:v', '1', f'{T}/cn.png'); u(f'{T}/cn.png', 'cl_clay_n', '-normal_map')
ff('-i', f'{O}/склон_макро_1/нормали.png', '-i', f'{O}/склон_макро_1/высота.png', '-filter_complex', f'[0:v]{S},format=rgb24[a];[1:v]{S},format=gray[b];[a][b]alphamerge,format=rgba', '-frames:v', '1', f'{T}/mn.png'); u(f'{T}/mn.png', 'cl_macro_n')
ff('-i', f'{R}_diff_2k.jpg', '-vf', f'{S},hue=s=0.22,format=rgb24', '-frames:v', '1', f'{T}/rc.png'); u(f'{T}/rc.png', 'cl_rock_c')
ff('-i', f'{R}_nor_gl_2k.jpg', '-vf', f'{S},format=rgb24', '-frames:v', '1', f'{T}/rn.png'); u(f'{T}/rn.png', 'cl_rock_n', '-normal_map')
