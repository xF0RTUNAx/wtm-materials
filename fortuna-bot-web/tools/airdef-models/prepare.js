// Подготовка скачанных моделей (Sketchfab, glb) для «Воздушного превосходства»:
//   deno run -A tools/airdef-models/prepare.js su30 [--views]      (или: all)
// Что делает: собирает все меши в общих осях (с поворотами узлов), убирает лишние части по правилу (шасси, створки,
// подвеска модели — по связным частям меша, координаты как в parts.js), переводит в метры, разворачивает носом в −Z
// (как модели игры), ставит центр, оставляет POSITION / NORMAL / TEXCOORD_0, склеивает примитивы по материалам,
// текстуры цвета ужимает в JPEG (sips); остальные карты выбрасывает — в игре материалы Phong.
// Пишет games/airdef/models/<имя>.glb, печатает размеры. --views — виды готовой модели (PPM во временной папке).
import { readGlb, flatten, components, bbox } from './glb.js';
import { render, writePpm } from './raster.js';
import { MeshoptSimplifier } from 'npm:meshoptimizer@0.21.0';

const HOME = Deno.env.get('HOME'), DL = `${HOME}/Downloads`;
const LS = (c) => { if (Deno.env.get('LS') && Math.max(...c.size) > 0.4) console.log('  часть', c.mat, 'ц', c.ctr.map((v) => v.toFixed(2)).join(' '), 'р', c.size.map((v) => v.toFixed(2)).join(' ')); return 'body'; }; // LS=1 … --groups: список частей
const FAB_TOP = Number(Deno.env.get('FAB_TOP') ?? 99); // верх корпуса ФАБ-500 в осях игры без центровки (см. --groups)
// nose — куда смотрит нос модели в её осях; center — [y оси фюзеляжа] в её единицах (иначе середина габаритов)
// remove(c, i) — c: часть меша { min, max, ctr, size, tris, mat }, i — номер по размеру в своём примитиве
const CONFIG = {
  su30: { src: `${DL}/pbr_sukhoi_su-30.glb`, raw: true, scale: 0.01, nose: '+x', centerY: 240, tex: () => 1024,
    remove: (c, i) => c.mat === 0 && i > 0 && c.min[1] < 130 && c.max[0] > -380 }, // шасси, створки и кронштейны ниш (брюшные гребни — оставить)
  f18: { src: `${DL}/boeing_fa-18ef_super_hornet.glb`, scale: 1, nose: '+x', tex: () => 512,
    remove: (c) => c.max[1] < 0.12 && Math.abs(c.ctr[2]) > 2.5 }, // ракеты под крыльями и спарка (на концах крыльев — оставить)
  f16: { src: `${DL}/general_dynamics_f-16d_block_60.glb`, scale: 1, nose: '-z', tex: (m) => (/^cock|^ins/.test(m.name) ? 128 : 512),
    // подвеска (баки, бомбы, ракеты под крылом; AIM-120 на законцовках — оставить), шасси и мелкие детали кабины под фонарём
    // (из-за них 15 текстур и ~17 тыс. треугольников)
    remove: (c) => (c.mat === 10 && Math.abs(c.ctr[0]) < 4.5) || [17, 6, 7, 8, 9, 12, 13, 14, 15].includes(c.mat) || ((c.mat === 5 || c.mat === 1) && c.max[1] < 1.3) },
  // оружие из моделей самолётов: pick — коробка [x0,y0,z0, x1,y1,z1] в осях модели, берутся части с центром внутри;
  // модель ставится центром габаритов в начало координат
  w_umpk: { src: `${DL}/fab-500_m62.glb`, scale: 17.6, nose: '+x', tex: () => 512, target: 8000, simpErr: 0.15, minPart: 0.15, pickMesh: /./, rulesIn: 'game', groups: () => 'body' }, // ФАБ-500 с УМПК
  w_fab500: { src: `${DL}/fab-500_m62.glb`, scale: 17.6, nose: '+x', tex: () => 512, target: 8000, simpErr: 0.15, minPart: 0.15, pickMesh: /./, rulesIn: 'game', perTri: true, groups: (c) => (c.min[1] > FAB_TOP ? null : 'body') }, // без УМПК: всё выше корпуса долой
  w_kh29t: { src: `${DL}/russian_weapon_pack.glb`, scale: 1, nose: '+x', tex: () => 512, pickMesh: /ru_kh-29/ }, // Х-29 из набора
  w_kh31p: { src: `${DL}/russian_weapon_pack.glb`, scale: 1, nose: '+x', tex: () => 512, pickMesh: /w_lasm/ }, // Х-31 из набора
  w_kh25ml: { src: `${DL}/kh-38mt_air-to-ground_missile.glb`, scale: 3.7 / 4.17, nose: '+x', tex: () => 512, target: 7000, pickMesh: /./ }, // Х-38МТ — вместо Х-25МЛ (та же компоновка)
  w_agm65b: { src: `${DL}/300_followers_-_free_aircraft_missile_set.glb`, scale: 1, nose: '-x', tex: () => 256, pickMesh: /AGM65 Maverick/ },
  w_mk82: { src: `${DL}/300_followers_-_free_aircraft_missile_set.glb`, scale: 2.22 / 2.9, nose: '-x', tex: () => 256, pickMesh: /Mk83 bomb/ }, // Mk 83 → размер Mk 82
  // ── ещё оружие (2026-10-08)
  w_jassm: { src: `${DL}/agm-158_-_wings_extended.glb`, scale: 4.27 / 173, nose: '-x', tex: () => 256, target: 7000, pickMesh: /./ },
  w_agm88: { src: `${DL}/agm-88_harm_transport_cart.glb`, scale: 1, nose: '+x', tex: () => 512, target: 7000, pick: [-2, 0.95, 0, 2.5, 1.7, 1] }, // одна HARM с тележки (и для AARGM)
  w_agm65b: { src: `${DL}/agm_65_maverick.glb`, scale: 2.49 / 1.31, axes: (x, y, z) => [x, z, -y], tex: () => 256, target: 7000, minPart: 0.03, pick: [-0.08, -1, -0.73, 0.23, 2, -0.42] }, // одна из трёх, стояла вертикально
  w_mald: { src: `${DL}/aim-160a_screamer.glb`, scale: 2.84 / 2, nose: '-x', tex: () => 256, target: 7000, pickMesh: /./ },
  w_decoy_e: { src: `${DL}/harpy_drone.glb`, scale: 0.1, nose: '+z', tex: () => 256, target: 7000, pickMesh: /./ }, // Harpy — ложная цель
  w_pod: { src: `${DL}/anaaq-28v_lightning_fbx.glb`, scale: 1, nose: '+z', tex: () => 256, target: 9000, simpErr: 0.3, cluster: true, minPart: 0.03, pickMesh: /./ }, // LITENING — прицельный контейнер
  w_gbu39: { src: `${DL}/gbu-39b_small_diameter_bomb_weapon_system.glb`, scale: 0.0496, nose: '+z', tex: () => 256, pickMesh: /./ },
  w_gbu31: { src: `${DL}/f-111f_aardvark_with_gbu-24_mk.84.glb`, scale: 1, nose: '+z', tex: () => 256, target: 7000, pick: [-3.4, -1.2, -3, -2.6, -0.02, 1.75] }, // GBU-24 с F-111 без головки и рулей → Mk 84 с хвостом (как JDAM)
  mp_stinger: { src: `${DL}/fim-92_stinger.glb`, scale: 7.6, nose: '+x', tex: () => 256, pickMesh: /./, remove: (c) => c.ctr[0] < -0.05 }, // труба Stinger (ракета — отдельно)
  mp_verba: { src: `${DL}/manpads_model_9k333_verba.glb`, scale: 0.0774, nose: '+x', tex: () => 256, target: 7000, pickMesh: /PZRC|battery|pen_|trigger|nab_|button|switch/ }, // труба «Вербы»
  msl_manpads: { src: `${DL}/manpads_model_9k333_verba.glb`, scale: 0.0774, nose: '-x', tex: () => 256, pickMesh: /Rocket_low|_stab/ }, // ракета «Вербы» — для всех ПЗРК и Avenger
  // ракеты «воздух–воздух» для «Симулятора Летки» (на пилонах самолётов и в полёте вместо процедурных)
  aam_r73: { src: `${DL}/russian_weapon_pack.glb`, scale: 1, nose: '+x', tex: () => 512, pickMesh: /ru_r-73/ }, // Р-73
  aam_r77: { src: `${DL}/russian_weapon_pack.glb`, scale: 1, nose: '+x', tex: () => 512, pickMesh: /ru_r-77\// }, // Р-77 (не Р-77М)
  aam_r27: { src: `${DL}/russian_weapon_pack.glb`, scale: 1, nose: '+x', tex: () => 512, pickMesh: /ru_r-27r/ }, // Р-27Р (и для Т/ЭР)
  aam_r33: { src: `${DL}/russian_weapon_pack.glb`, scale: 1, nose: '+x', tex: () => 512, pickMesh: /ru_r-33/ }, // Р-33
  aam_aim9: { src: `${DL}/300_followers_-_free_aircraft_missile_set.glb`, scale: 1, nose: '-x', tex: () => 256, pickMesh: /AIM-9 Sidewinder/ }, // AIM-9 (B/L/X, Р-3С)
  aam_aim54: { src: `${DL}/300_followers_-_free_aircraft_missile_set.glb`, scale: 1, nose: '-x', tex: () => 256, pickMesh: /AIM-54 Phoenix/ }, // AIM-54
  // ── машины (generic passenger car pack — 10 штук на круглом подиуме): каждая — своим куском, повёрнута вдоль оси, нос в −Z
  c_compact: { src: `${DL}/generic_passenger_car_pack.glb`, scale: 1, unit: true, tex: () => 256, pick: [-5.8, -0.5, 3.9, -2.5, 3, 7.5], axes: (x, y, z) => [x * 0.8084 - z * -0.5886, y, x * -0.5886 + z * 0.8084] },
  c_coupe: { src: `${DL}/generic_passenger_car_pack.glb`, scale: 1, unit: true, tex: () => 256, pick: [-8.5, -0.5, 0.4, -3.7, 3, 3.5], axes: (x, y, z) => [x * 0.3045 - z * -0.9525, y, x * -0.9525 + z * 0.3045] },
  c_hatch: { src: `${DL}/generic_passenger_car_pack.glb`, scale: 1, unit: true, tex: () => 256, pick: [-5.8, -0.5, -7.6, -2.1, 3, -3.3], axes: (x, y, z) => [x * -0.8097 - z * -0.5868, y, x * -0.5868 + z * -0.8097] },
  c_van: { src: `${DL}/generic_passenger_car_pack.glb`, scale: 1, unit: true, tex: () => 256, pick: [-8.9, -0.5, -3.8, -3.7, 3, -0.4], axes: (x, y, z) => [x * -0.3162 - z * -0.9487, y, x * -0.9487 + z * -0.3162] },
  c_offroad: { src: `${DL}/generic_passenger_car_pack.glb`, scale: 1, unit: true, tex: () => 256, pick: [3.8, -0.5, 0.3, 8.4, 3, 3.6], axes: (x, y, z) => [x * 0.3045 - z * 0.9525, y, x * 0.9525 + z * 0.3045] },
  c_pickup: { src: `${DL}/generic_passenger_car_pack.glb`, scale: 1, unit: true, tex: () => 256, pick: [-1.3, -0.5, -9.4, 1.3, 3, -3.6], axes: (x, y, z) => [x * -1.0000 - z * 0.0000, y, x * 0.0000 + z * -1.0000] },
  c_sedan: { src: `${DL}/generic_passenger_car_pack.glb`, scale: 1, unit: true, tex: () => 256, pick: [-1.3, -0.5, 4.2, 1.3, 3, 9.2], axes: (x, y, z) => [x * 1.0000 - z * 0.0000, y, x * 0.0000 + z * 1.0000] },
  c_sport: { src: `${DL}/generic_passenger_car_pack.glb`, scale: 1, unit: true, tex: () => 256, pick: [2.1, -0.5, -7.7, 6.0, 3, -3.3], axes: (x, y, z) => [x * -0.8052 - z * 0.5929, y, x * 0.5929 + z * -0.8052] },
  c_suv: { src: `${DL}/generic_passenger_car_pack.glb`, scale: 1, unit: true, tex: () => 256, pick: [3.3, -0.5, -3.7, 8.5, 3, -0.2], axes: (x, y, z) => [x * -0.3138 - z * 0.9495, y, x * 0.9495 + z * -0.3138] },
  c_wagon: { src: `${DL}/generic_passenger_car_pack.glb`, scale: 1, unit: true, tex: () => 256, pick: [1.8, -0.5, 2.8, 5.8, 3, 7.5], axes: (x, y, z) => [x * 0.8047 - z * 0.5937, y, x * 0.5937 + z * 0.8047] },
  c_police: { src: `${DL}/low_poly_car.glb`, scale: 1, nose: '-x', unit: true, tex: () => 512, pickMesh: /./ }, // полицейская
  // ── Gripen, F-22, F-35A (2026-10-12): нос в −Z, метры; без своих ракет, шасси и открытых створок
  e_gripen: { src: `${DL}/saab_jas-39_gripen_fighter_jet.glb`, scale: 1, nose: '+x', rulesIn: 'game', tex: () => 512, opaque: /^(Camo|material|White|Jet_m)$/, opaque: /^(Camo|material|White|Jet_m)$/, groups: (c) => (Math.abs(c.ctr[0]) > 1.5 && [1, 4, 5].includes(c.mat) ? null : 'body') }, // свои ракеты и баки — долой, пилоны и направляющие — оставить
  e_f22: { src: `${DL}/lockheed_martin_f-22_raptor.glb`, scale: 18.92 / 12.11, nose: '-x', rulesIn: 'game', tex: () => 512, groups: (c) => ([16, 17].includes(c.mat) ? null : 'body') }, // без встроенного выхлопа (plumes): пламя рисует игра
  e_f35: { src: `${DL}/f-35a_lightning_ii.glb`, scale: 0.56, nose: '+z', rulesIn: 'game', tex: () => 512, groups: (c) => (Math.abs(c.ctr[0]) > 5.9 ? null : LS(c)) }, // модель ×1,8 — к 15,7 м; летающие створки — долой
  // ── противник «Летки» (2026-10-11): нос в −Z, метры; без шасси и подставки
  e_mig21: { src: `${DL}/mig-21_chibi.glb`, scale: 0.07, rulesIn: 'game', tex: () => 512, opaque: /mig21/, // «чиби»: стоял на подставке с креном ~10° — выравниваем
    axes: (x, y, z) => { const c = Math.cos(-0.174), s = Math.sin(-0.174); return [-x * c - y * s, -x * s + y * c, -z]; },
    groups: (c) => (c.size[2] > 14 || c.mat !== 2 ? null : c.ctr[1] < 0.98 && Math.max(...c.size) < 4.9 ? null : LS(c)) }, // длина 14,5 м // подставка, шасси и бак
  e_mig31: { src: `${DL}/b168fbca1f6c4ad0ad4e45b7a22f52bc.glb`, scale: 9.95, nose: '+x', rulesIn: 'game', tex: () => 512, groups: (c) => (c.min[1] < -1.25 && Math.max(...c.size) < 2.5 ? null : 'body') }, // без шасси
  e_su57: { src: `${DL}/sukhoi_su-57_felon.glb`, scale: 7.42, nose: '-x', rulesIn: 'game', tex: () => 512, glass: /^Darkness\.001$/, groups: () => 'body' },
  e_tu22m3: { src: `${DL}/tupolev_tu-22m3.glb`, scale: 1, nose: '+z', rulesIn: 'game', tex: () => 512, groups: () => 'body' }, // вблизи — без упрощения: тонкие крылья и закрылки от него рвутся (дальняя копия _lo — упрощённая)
  // ── карта «Летки»: ЛЭП, ветряк, порт, маяк, поезда; танкеры (2026-10-11)
  m_pylon: { src: `${DL}/high_voltage_transmission_line_tower_tileable.glb`, scale: 3.2, nose: '-z', rulesIn: 'game', unit: true, tex: () => 512, groups: (c) => (c.size[2] > 20 || c.ctr[2] < -60 ? null : 'body') }, // только опора: провода (крепления — 3 фазы x −7 / 0 / +7, y 23,1) рисует игра, изоляторы соседней опоры — долой // опора с пролётом проводов (стыкуются через 144 м)
  m_wind: { src: `${DL}/wind_turbine_demo.glb`, scale: 18, nose: '-z', rulesIn: 'game', unit: true, tex: () => 512, groups: (c) => (c.ctr[2] < 0.3 ? 'rotor' : 'body') }, // ротор — своя группа (крутится) // ветряк ~100 м
  m_ship: { src: `${DL}/low_poly_cargo_ship.glb`, scale: 150 / 4200, nose: '+z', rulesIn: 'game', unit: true, tex: () => 1024, groups: () => 'body' }, // сухогруз 150 м
  m_cont: { src: `${DL}/sea_container_-_low_poly.glb`, scale: 6.06 / 2.83, nose: '-z', rulesIn: 'game', unit: true, tex: () => 256, target: 400, groups: () => 'body' }, // 20-футовый контейнер (для палуб и порта)
  m_crane: { src: `${DL}/port_crane_sokol.glb`, scale: 1, nose: '-z', rulesIn: 'game', unit: true, tex: () => 512, target: 9000, groups: (c) => (c.mat === 2 ? null : 'body') }, // портальный кран «Сокол» (без площадки)
  m_light: { src: `${DL}/lighthouse-2.glb`, scale: 0.75, nose: '-z', rulesIn: 'game', unit: true, tex: () => 512, groups: () => 'body' }, // маяк ~42 м
  m_loco: { src: `${DL}/train__locomotive_low-poly_locomotive.glb`, scale: 1, nose: '+z', rulesIn: 'game', unit: true, tex: () => 256, target: 6000, groups: () => 'body' }, // тепловоз
  m_loco2: { src: `${DL}/train__locomotive_sd40-2.glb`, scale: 1, nose: '-z', rulesIn: 'game', unit: true, tex: () => 256, target: 6000, groups: () => 'body' }, // тепловоз SD40-2
  t_il78: { src: `${DL}/il78.glb`, scale: 1, nose: '-z', rulesIn: 'game', glass: /^Sphere01/, tex: () => 1024, target: 14000, groups: (c) => (Math.abs(c.ctr[0]) < 6 && c.max[1] < -1 && Math.max(...c.size) < 3 ? null : 'body') }, // без шасси // Ил-78 — танкер «Летки» (восток)
  t_kc135: { src: `${DL}/boeing_kc-135r_stratotanker.glb`, scale: 1, nose: '+z', rulesIn: 'game', tex: () => 1024, target: 14000, groups: (c) => (Math.abs(c.ctr[0]) < 5 && c.max[1] < 2.3 ? null : 'body') }, // без шасси // KC-135R — танкер (запад)
  // ── ракеты «воздух–воздух» из новых наборов (2026-10-11)
  aam_aim7: { src: `${DL}/us_weapon_pack.glb`, scale: 1, nose: '-z', tex: () => 256, pickMesh: /us_aim-7\// }, // AIM-7 (E и M)
  aam_aim9x: { src: `${DL}/us_weapon_pack.glb`, scale: 1, nose: '-z', tex: () => 256, pickMesh: /us_aim-9x/ }, // AIM-9X
  aam_r60: { src: `${DL}/simple_gameready_weapons_for_fighter_jet_games.glb`, scale: 2.09 / 4.53, nose: '+z', tex: () => 256, pickMesh: /R-60_6/ }, // Р-60М (в наборе ×2,2)
  aam_iris: { src: `${DL}/low_poly_german_iris-t_aam.glb`, scale: 2.936 / 924.74, nose: '-x', tex: () => 256, pickMesh: /./ }, // IRIS-T
  aam_mica: { src: `${DL}/low_poly_missiles_and_torpedos.glb`, scale: 1, nose: '+z', tex: () => 256, pickMesh: /VL MICA/ }, // MICA (EM и IR — один корпус)
  msl_aim120: { src: `${DL}/boeing_fa-18ef_super_hornet.glb`, scale: 1, nose: '+x', tex: () => 256, pick: [-6, -0.5, 4.5, -1, -0.02, 4.9] }, // AIM-120 с F/A-18 — для NASAMS
  w_gbu12: { src: `${DL}/general_dynamics_f-16d_block_60.glb`, scale: 1, nose: '-z', tex: () => 512, pick: [-3.0, 0.7, -1.5, -2.75, 1.1, 3] }, // GBU-12 Paveway II с F-16
  mig29: { src: `${DL}/mig_29.glb`, scale: 17.32 / 947.3, nose: '+z', tex: () => 1024 },
  // правила частей — в осях игры (без центровки): along/across — положение центра части вдоль и поперёк оси пакета
  tor: { src: `${DL}/9k331_tor-m1.glb`, scale: 1, fwd: [0.767, 0.641], rulesIn: 'game', unit: true, perTri: true, tex: () => 512, target: 55000,
    groups: (c) => (c.min[1] > -0.13 && c.ctr[2] > 5.8 && c.ctr[2] < 12.8 ? 'turret' : 'body') }, // башня сшита с корпусом одной сеткой — по треугольникам
  pantsir: { src: `${DL}/96k6_pantsir-s2.glb`, scale: 1, nose: '+z', rulesIn: 'game', unit: true, tex: () => 512, target: 55000, minPart: 0.04, hinge: [0, 3.35, -0.6], tube: [0.12, 0.35],
    groups: (c) => {
      if (c.min[1] < 2.4 || c.ctr[2] < -3.2 || c.ctr[2] > 2.4) return 'body';
      return c.min[1] > 2.7 && c.max[1] < 3.95 && c.ctr[2] < 0.6 && (c.size[2] > 0.8 || Math.abs(c.ctr[0]) > 0.75) ? 'cradle' : 'turret';
    } },
  s400: { src: `${DL}/s-400_triumf_missile_launcher_truck.glb`, scale: 13.5 / 1.9, nose: '+z', rulesIn: 'game', unit: true, perTri: true, tex: () => 1024, target: 120000, hinge: [0, -1.53, 5.44], tube: [0.6, 1.4], // скан: весь тягач — одна сетка, делим по треугольникам
    groups: (c) => (c.ctr[1] > -1.45 && axis(c, [5.44, -1.53], [-0.604, 0.797], 1.75, -1.8, 9.5) ? 'cradle' : 'body') },
  // «Стрела-1» (БРДМ-2): пусковая в модели развёрнута на ~43° влево — turretYaw; одна ракета «летит» отдельно — долой
  strela1: { src: `${DL}/9k31_strela-1_sam.glb`, scale: 0.295, nose: '+z', rulesIn: 'game', unit: true, tex: () => 512, target: 55000, turretYaw: -0.75, hinge: [0.55, 2.87, 0.24], absorb: 0,
    groups: (c) => {
      if (c.mat === 1) return c.ctr[0] < -1.4 ? null : 'missile'; // ракеты 9М31 на направляющих (и одна «в полёте»)
      if (c.min[1] > 2.75) return 'cradle';
      return c.min[1] > 1.88 ? 'turret' : 'body';
    } },
  osa: { src: `${DL}/osa-akm_sam_system.glb`, scale: 1, nose: '+z', rulesIn: 'game', unit: true, tex: () => 512, target: 110000, minPart: 0.06, absorb: 0, tplNear: [0.91, 0.14], hinge: [0, 3.06, 1.32], tube: [0.15, 0.5],
    groups: (c) => {
      if (c.min[1] < 2.05 || c.ctr[2] < -2.2 || c.ctr[2] > 3.4) return 'body';
      if (Math.abs(c.ctr[0]) > 0.75 && Math.abs(c.size[0] - 0.21) < 0.05 && c.size[2] > 2.4) return 'missile'; // 9М33 в решётчатых контейнерах
      return Math.abs(c.ctr[0]) > 0.75 && axis(c, [1.32, 3.06], [-0.906, 0.423], 0.55, -2.4, 2.8) ? 'cradle' : 'turret';
    } },
  patriot: { src: `${DL}/mim-104_patriot_surface-to-air_missile_sam.glb`, scale: 1, nose: '+x', rulesIn: 'game', unit: true, tex: () => 1024, hinge: [0, 3.95, 12.81], tube: [0.5, 1.2],
    groups: (c) => {
      if (c.size[1] > 3 && c.size[2] < 0.6 && c.size[0] < 0.6) return null; // мачта антенны: в модели стоит на поднятом пакете — у нас висела в воздухе
      if (axis(c, [12.81, 3.95], [-0.781, 0.625], 1.25, -0.3, 10.8)) return 'cradle';
      return c.min[1] > 2.4 && c.ctr[2] > 6.5 && c.ctr[2] < 13.6 && Math.abs(c.ctr[0]) < 1.6 ? 'turret' : 'body';
    } },
  // ── комплексы с ракетами на направляющих: ракета модели — образец для слотов и полёта (missile), stage — доля маршевой ступени
  s75: { src: `${DL}/sam_s-75_dvina.glb`, scale: 2.83, nose: '+x', rulesIn: 'game', unit: true, tex: () => 256, hinge: [0, 1.65, 4.06], stage: 0.64,
    groups: (c) => {
      if (axis(c, [5.61, 1.85], [-0.926, 0.376], 0.45, -0.6, 10)) return 'missile';
      if (c.min[1] > 0.5 && axis(c, [4.06, 1.65], [-0.926, 0.376], 0.7, -1.2, 9)) return 'cradle';
      return c.min[1] > 0.25 && c.ctr[2] > 0.3 && c.ctr[2] < 4.7 ? 'turret' : 'body';
    } },
  s125: { src: `${DL}/-125___sam_s-125_neva.glb`, scale: 1.26, nose: '+x', rulesIn: 'game', unit: true, tex: () => 512, target: 110000, hinge: [0, 1.13, -0.95], stage: 0.66,
    groups: (c) => {
      if (axis(c, [-1.05, 1.34], [-0.931, 0.366], 0.22, -0.4, 6.2) && c.size[0] < 0.9) return 'missile';
      if (c.ctr[2] < -0.6 && c.min[1] > 0.6 && axis(c, [-0.95, 1.13], [-0.931, 0.366], 1.0, -0.6, 6)) return 'cradle';
      return c.min[1] > 0.25 ? 'turret' : 'body';
    } },
  kub: { src: `${DL}/2k12_kub.glb`, scale: 0.00236, axes: (x, y, z) => [-x, z, y], rulesIn: 'game', unit: true, tex: () => 512, hinge: [0, 2.41, 1.05], // модель лежит «Z вверх»
    // без текстуры у модели только корпус: остальное светло-серое — ракеты и пусковая (оливковые), гусеницы, катки, люки
    colors: { '^Material__25$': [0.17, 0.17, 0.1], '^Material__30$': [0.03, 0.028, 0.025], '^Material__36$': [0.07, 0.08, 0.045], '^Material__29$': [0.09, 0.09, 0.055],
      '^Material__3[1-4]$': [0.1, 0.095, 0.06] },
    groups: (c) => {
      if (axis(c, [1.68, 2.58], [-0.844, 0.536], 0.2, -0.3, 6) && c.size[0] < 0.7 && c.max[1] - c.min[1] < 4 && !(c.size[0] < 0.12 && Math.hypot(c.size[1], c.size[2]) > 1)) return 'missile'; // прутья рамок — не ракета
      if (c.min[1] > 2.0 && axis(c, [1.05, 2.41], [-0.844, 0.536], 1.0, -0.6, 6)) return 'cradle';
      return c.min[1] > 1.8 && c.ctr[2] > -0.9 && c.ctr[2] < 2.0 && c.max[1] < 3 ? 'turret' : 'body';
    } },
  hawk: { src: `${DL}/mim-23_hawk_sam_air_defence_system_game-ready.glb`, scale: 0.012, nose: '+z', rulesIn: 'game', unit: true, tex: () => 512, target: 55000, hinge: [0, 1.77, -0.19],
    groups: (c) => {
      if (c.size[2] > 3.8 && axis(c, [-0.19, 1.77], [-0.985, 0.175], 1.2, -3.2, 3.6)) return 'missile';
      if (c.min[1] > 1.55 && axis(c, [-0.19, 1.77], [-0.985, 0.175], 1.3, -3.2, 3.6)) return 'cradle';
      return c.min[1] > 1.15 && c.ctr[2] > -0.7 && c.ctr[2] < 0.5 ? 'turret' : 'body';
    } },
  m163: { src: `${DL}/m163_vads.glb`, scale: 0.393, nose: '-z', rulesIn: 'game', unit: true, tex: () => 512, hinge: [0, 3.44, -1.29],
    groups: (c) => {
      if (c.min[1] < 2.85 || c.ctr[2] > 0.15 || c.ctr[2] < -3.3) return 'body';
      return c.min[1] > 3.25 && c.ctr[2] < -1.35 ? 'cradle' : 'turret';
    } },
  gepard: { src: `${DL}/flakpanzer_gepard__high-quality_model.glb`, scale: 0.024, nose: '+z', rulesIn: 'game', unit: true, tex: () => 512, target: 142000, hinge: [0, 2.31, 0.06], // без кластеризации: она рвала сетку
    // у модели нет текстур, цвета материалов — розовые и фиолетовые: красим в оливковый Бундесвера (RAL 6031), гусеницы и стволы — тёмные
    colors: { body: [0.065, 0.08, 0.042], turret: [0.065, 0.08, 0.042], gun: [0.04, 0.042, 0.04], net: [0.08, 0.09, 0.06], track: [0.06, 0.06, 0.055], glass: [0.35, 0.38, 0.4] },
    groups: (c) => {
      if (c.min[1] < 1.5 || c.ctr[2] < -3.9 || c.ctr[2] > 2.2 || Math.abs(c.ctr[0]) > 1.45 || (c.ctr[2] > 1.4 && Math.abs(c.ctr[0]) > 1.0)) return 'body'; // ящики на бортах корпуса — не башня
      // пушки (корпуса и стволы) по бортам башни качаются
      const gunX = Math.abs(c.ctr[0]) > 0.7 && Math.abs(c.ctr[0]) < 1.45 && c.ctr[1] > 1.95 && c.ctr[1] < 2.7;
      // пушка целиком (и мелкие детали ствола впереди цапф — дульные тормоза, кожухи) качается вместе
      return gunX && (c.size[2] > 1.0 || c.ctr[2] < -0.3) ? 'cradle' : 'turret';
    } },
  nasams: { src: `${DL}/nasams_1_surface-to-air_missile_system.glb`, scale: 0.4, fwd: [0.174, 0.985], rulesIn: 'game', unit: true, perTri: true, tex: () => 512, hinge: [0, 1.16, 1.42], tube: [0.3, 0.9],
    groups: (c) => {
      if (axis(c, [1.42, 1.16], [-0.903, 0.43], 2.0, -1.6, 6) && c.min[1] > 0.55 && !(c.size[1] > 2 && c.size[2] < 0.3)) return 'cradle';
      return c.min[1] > -0.1 && c.ctr[2] > -1.1 && c.ctr[2] < 1.2 && Math.abs(c.ctr[0]) < 1.0 && c.max[1] < 1.7 ? 'turret' : 'body';
    } },
  ew_w: { src: `${DL}/renault_trm_radar_truck.glb`, scale: 0.0097, nose: '+z', rulesIn: 'game', unit: true, tex: () => 256, groups: () => 'body' }, // станция РЭБ (запад)
  ew_e: { src: `${DL}/ibis150_air_defense_radar.glb`, scale: 10, nose: '-z', rulesIn: 'game', unit: true, tex: () => 512, target: 120000, minPart: 0.05, groups: () => 'body' }, // станция РЭБ (восток)
  // ── постройки для военных объектов (целей): земля y = 0, центр по габаритам
  obj_tanks: { src: `${DL}/large_industrial_storage_tanks.glb`, scale: 1, nose: '-z', rulesIn: 'game', unit: true, tex: () => 512, groups: () => 'body' }, // резервуар и газгольдеры
  obj_tank4: { src: `${DL}/low_poly_fuel_tank_4-x__pipe.glb`, scale: 4.4, nose: '-z', rulesIn: 'game', unit: true, tex: () => 512, target: 40000, groups: () => 'body' },
  obj_rtank: { src: `${DL}/rusty_airbase_fuel_tank.glb`, scale: 5, nose: '-z', rulesIn: 'game', unit: true, tex: () => 512, groups: () => 'body' },
  obj_hangar: { src: `${DL}/hangar.glb`, scale: 1.4, nose: '-z', rulesIn: 'game', unit: true, tex: () => 512, groups: () => 'body' },
  obj_jhangar: { src: `${DL}/j_type_hanger.glb`, scale: 1, nose: '-z', rulesIn: 'game', unit: true, tex: () => 512, groups: () => 'body' },
  obj_cont: { src: `${DL}/modular_containers_and_barrells_pack_game_ready.glb`, scale: 1.18, nose: '-z', rulesIn: 'game', unit: true, tex: () => 512, groups: () => 'body' },
  obj_milbase: { src: `${DL}/small_military_base.glb`, scale: 1.5, nose: '-z', rulesIn: 'game', unit: true, tex: () => 256, target: 40000, minPart: 0.15, groups: () => 'body' },
  obj_oldind: { src: `${DL}/old_industrial_building.glb`, scale: 0.01, nose: '-z', rulesIn: 'game', unit: true, tex: () => 512, target: 40000, groups: () => 'body' },
  obj_factory: { src: `${DL}/factory_low-poly.glb`, scale: 0.01, nose: '-z', rulesIn: 'game', unit: true, tex: () => 512, groups: () => 'body' },
  // дома города вблизи (вместо коробок): длинной стороной вдоль Z, основание y = 0
  bld_p5: { src: `${DL}/soviet_panelki__voxel_style_apartment_buildings.glb`, scale: 1.24, nose: '-z', rulesIn: 'game', unit: true, tex: () => 128, pickMesh: /Apartment\/Apartment_(?!Just)/, groups: () => 'body' }, // пятиэтажка
  bld_p9: { src: `${DL}/soviet_panel_house_built_in_the_1970s.glb`, scale: 1, nose: '-z', rulesIn: 'game', unit: true, tex: () => 512, groups: () => 'body' }, // длинная девятиэтажка
  bld_b12: { src: `${DL}/low_poly_-_soviet__apartment_building_8k.glb`, scale: 26, nose: '-z', rulesIn: 'game', unit: true, tex: () => 1024, groups: () => 'body' }, // многоэтажка
  bld_st: { src: `${DL}/old_soviet_apartment_building.glb`, scale: 13, nose: '-x', rulesIn: 'game', unit: true, tex: () => 1024, groups: () => 'body' }, // сталинка (фотоскан: упрощение рвёт развёртку)
  // частный сектор (вместо коробок со скатной крышей) и офис средней высоты
  h_brick: { src: `${DL}/low-poly_brick_house.glb`, scale: 2.4, nose: '-z', rulesIn: 'game', unit: true, tex: () => 512, groups: () => 'body' }, // кирпичный дом
  h_house: { src: `${DL}/house.glb`, scale: 0.08, nose: '-z', rulesIn: 'game', unit: true, tex: () => 512, groups: (c) => (c.size[0] > 16 || c.size[2] > 16 ? null : 'body') }, // одноэтажный дом (без участка земли)
  h_log: { src: `${DL}/cottage.glb`, scale: 0.12, nose: '-z', rulesIn: 'game', unit: true, tex: () => 256, simplify: 0.35, groups: () => 'body' }, // бревенчатый дом
  h_khata: { src: `${DL}/thatched_rural_houses.glb`, scale: 6, nose: '-z', rulesIn: 'game', unit: true, tex: () => 512, simplify: 0.3, pick: [-13.5, -0.5, -9, -3.2, 7, 6], groups: () => 'body' }, // хата под соломой (левая из двух; правая — амбар)
  o_block: { src: `${DL}/large_low_poly_building.glb`, scale: 0.01, nose: '-z', rulesIn: 'game', unit: true, tex: () => 512, groups: () => 'body' }, // офисный корпус
  h_shanty: { src: `${DL}/shanty__mansion__wooden.glb`, scale: 1, nose: '-z', rulesIn: 'game', unit: true, tex: () => 512, groups: () => 'body' }, // деревянный дом с верандой
  h_mobile: { src: `${DL}/lp_americans_house_mobile.glb`, scale: 1.25, nose: '-z', rulesIn: 'game', unit: true, tex: () => 512, target: 3000, groups: () => 'body' }, // дом-фургон
  // деревья вблизи (листья — вырезка по альфе) и фонарь
  tr_oak: { src: `${DL}/trees_low_poly.glb`, scale: 0.01, nose: '-z', rulesIn: 'game', unit: true, cutout: true, tex: () => 512, target: 1500, pickMesh: /tree4/, groups: () => 'body' },
  tr_lime: { src: `${DL}/trees_low_poly.glb`, scale: 0.012, nose: '-z', rulesIn: 'game', unit: true, cutout: true, tex: () => 512, target: 1200, pickMesh: /tree6/, groups: () => 'body' },
  tr_pine: { src: `${DL}/low_poly_forest_tree_pack.glb`, scale: 0.5, nose: '-z', rulesIn: 'game', unit: true, cutout: true, tex: () => 512, pickMesh: /(^|\/)(Tree_Branches_01|Tree_Trunk_01\.001)\//, groups: () => 'body' },
  tr_bush: { src: `${DL}/low_poly_forest_tree_pack.glb`, scale: 0.6, nose: '-z', rulesIn: 'game', unit: true, cutout: true, tex: () => 512, pickMesh: /(^|\/)(Tree_Branches_02|Tree_Trunk_02)\//, groups: () => 'body' },
  p_lamp: { src: `${DL}/abandoned_street_lights_pack.glb`, scale: 1, nose: '-z', rulesIn: 'game', unit: true, tex: () => 256, target: 600, pickMesh: /(^|\/)pillar_01\//, groups: () => 'body' }, // фонарь с консолью
  // уличные мелочи (набор S1lMoon, автомат Kasugay, баки Glen Ortiz)
  pr_vend: { src: `${DL}/low-poly_urban_street_props_pack_ps1_style.glb`, scale: 1, nose: '-z', rulesIn: 'game', unit: true, tex: () => 256, pickMesh: /(^|\/)(SodaMachine|Glass)\//, groups: () => 'body' }, // автомат с газировкой
  pr_booth: { src: `${DL}/low-poly_urban_street_props_pack_ps1_style.glb`, scale: 1.1, nose: '-z', rulesIn: 'game', unit: true, tex: () => 256, pickMesh: /(^|\/)(Body|Door|Glass\.001|Glass_Side)\//, groups: () => 'body' }, // телефонная будка
  pr_bin: { src: `${DL}/low-poly_urban_street_props_pack_ps1_style.glb`, scale: 1, nose: '-z', rulesIn: 'game', unit: true, tex: () => 256, pickMesh: /(^|\/)(Tank\.002|Cap\.002)\//, groups: () => 'body' }, // урна
  pr_vend2: { src: `${DL}/psx_-_vending_machine.glb`, scale: 14, nose: '-z', rulesIn: 'game', unit: true, tex: () => 256, groups: () => 'body' }, // автомат
  pr_wbins: { src: `${DL}/garbage_bin.glb`, scale: 0.01, nose: '-z', rulesIn: 'game', unit: true, tex: () => 512, target: 3000, groups: () => 'body' }, // баки у дома
  // ── зенитные комплексы: unit — земля в y = 0, центр по корпусу; groups — корпус / башня (азимут) / пакет (угол места);
  // hinge — ось качания пакета в осях модели; simplify — доля треугольников после упрощения (meshoptimizer)
  bukm3: { src: `${DL}/buk-m3_9k317_sam.glb`, scale: 1, nose: '+z', unit: true, tex: () => 512, target: 110000, minPart: 0.06, absorb: 0, hinge: [0, 2.6, -3.85],
    groups: (c) => {
      if (c.min[1] < 1.9) return 'body';
      if (c.size[0] > 0.27 && c.size[0] < 0.34 && c.size[1] > 3) return 'missile'; // 9М317 внутри контейнеров (сечение тоньше ТПК)
      const H = [-3.85, 2.6], A = [0.66, 0.75], dz = c.ctr[2] - H[0], dy = c.ctr[1] - H[1], along = dz * A[0] + dy * A[1], across = Math.abs(dz * A[1] - dy * A[0]);
      return across < 0.95 && along > 0.3 && along < 6.6 ? 'cradle' : 'turret';
    } },
};
// ПВО: дальние копии (_lo) — main.js рисует их дальше 400 м (THREE.LOD по частям: корпус, башня, пакет)
const SAM_LO = ['osa', 'bukm3', 's125', 'gepard', 'ew_e', 's400', 'tor', 'pantsir'];
for (const k of SAM_LO) CONFIG[k + '_lo'] = { ...CONFIG[k], target: k === 'tor' || k === 'pantsir' ? 15000 : 20000, simpErr: 0.05, tex: () => 256 };
// машины: дальние копии (_lo, ~1000 треуг.) — для движения на дорогах дальше 250 м
for (const k of ['compact', 'coupe', 'hatch', 'van', 'offroad', 'pickup', 'sedan', 'sport', 'suv', 'wagon', 'police']) CONFIG[`c_${k}_lo`] = { ...CONFIG[`c_${k}`], target: 1000, simpErr: 0.05, tex: () => 128 };
// дальние копии противника «Летки» (_lo): вдали тонкие крылья можно упрощать сильнее — дефектов не видно, а треугольников в разы меньше
for (const [k, t] of [['e_mig21', 3000], ['e_mig31', 9000], ['e_su57', 7000], ['e_tu22m3', 14000], ['e_gripen', 3000], ['e_f22', 4000], ['e_f35', 9000]]) CONFIG[k + '_lo'] = { ...CONFIG[k], target: t, simpErr: 0.05, tex: () => 256 };
// часть лежит вдоль оси пакета: H — петля (z, y), A — направление оси (z, y), across — полутолщина, along — от и до
function axis(c, H, A, across, a0, a1) { const dz = c.ctr[2] - H[0], dy = c.ctr[1] - H[1], al = dz * A[0] + dy * A[1]; return Math.abs(dz * A[1] - dy * A[0]) < across && al > a0 && al < a1; }
// оси модели → оси игры (x вправо, y вверх, нос в −Z)
const AX = { '+x': (x, y, z) => [z, y, -x], '+z': (x, y, z) => [-x, y, -z], '-z': (x, y, z) => [x, y, z], '-x': (x, y, z) => [-z, y, x] };

// нос задан вектором [fx, fz] в осях модели (модель лежит повёрнутой): вперёд → −Z, вправо → +X
const axFwd = ([fx, fz]) => { const l = Math.hypot(fx, fz); fx /= l; fz /= l; const rx = -fz, rz = fx; return (x, y, z) => [x * rx + z * rz, y, -(x * fx + z * fz)]; };
async function prepare(name, views) {
  const cfg = CONFIG[name], g = readGlb(Deno.readFileSync(cfg.src)), J = g.json, prims = flatten(g, { raw: !!cfg.raw }).filter((p) => !cfg.pickMesh || cfg.pickMesh.test(p.path)), ax = cfg.axes || (cfg.fwd ? axFwd(cfg.fwd) : AX[cfg.nose]);
  // rulesIn: 'game' — правила частей (groups / remove), hinge и просмотр — в осях игры (метры, нос в −Z, без центровки)
  if (cfg.rulesIn === 'game') for (const p of prims) {
    for (let i = 0; i < p.P.length; i += 3) { const v = ax(p.P[i], p.P[i + 1], p.P[i + 2]); p.P[i] = v[0] * cfg.scale; p.P[i + 1] = v[1] * cfg.scale; p.P[i + 2] = v[2] * cfg.scale; }
    if (p.N) for (let i = 0; i < p.N.length; i += 3) { const v = ax(p.N[i], p.N[i + 1], p.N[i + 2]); p.N[i] = v[0]; p.N[i + 1] = v[1]; p.N[i + 2] = v[2]; }
  }
  const tx = cfg.rulesIn === 'game' ? (x, y, z) => [x, y, z] : ax, tsc = cfg.rulesIn === 'game' ? 1 : cfg.scale;
  // --groups: только осмотр разбивки (в осях модели): корпус серый, башня красная, пакет синий, убранное не рисуется
  if (Deno.args.includes('--groups')) {
    const P = [], I = [], C = []; let b = 0, cnt = {};
    for (const p of prims) {
      const { comp, list } = components(p.P, p.I, 0.001), gid = new Map();
      for (const c of list) { c.ctr = c.max.map((v, k) => (v + c.min[k]) / 2); c.size = c.max.map((v, k) => v - c.min[k]); c.mat = p.material; gid.set(c.id, Math.max(...c.size) * tsc < (cfg.minPart || 0) ? null : cfg.groups ? cfg.groups(c) : 'body'); }
      for (const x of p.P) P.push(x);
      const triG = (t) => { if (!cfg.perTri) return gid.get(comp[t]); const c = { min: [1e9, 1e9, 1e9], max: [-1e9, -1e9, -1e9] }; for (let k = 0; k < 3; k++) { const v = p.I[t * 3 + k] * 3; for (let d = 0; d < 3; d++) { c.min[d] = Math.min(c.min[d], p.P[v + d]); c.max[d] = Math.max(c.max[d], p.P[v + d]); } } c.ctr = c.max.map((v, k) => (v + c.min[k]) / 2); c.size = c.max.map((v, k) => v - c.min[k]); return cfg.groups(c); };
      for (let t = 0; t < p.I.length / 3; t++) { const gname = triG(t); if (!gname) continue; cnt[gname] = (cnt[gname] || 0) + 1; I.push(p.I[t * 3] + b, p.I[t * 3 + 1] + b, p.I[t * 3 + 2] + b); C.push({ body: [175, 175, 180], turret: [215, 95, 85], cradle: [80, 105, 220], missile: [60, 190, 90] }[gname]); }
      b += p.P.length / 3;
    }
    const dir = Deno.args[Deno.args.indexOf('--groups') + 1], mk = cfg.hinge ? [cfg.hinge] : [];
    const bb = bbox(Float32Array.from(P)); console.log(name, 'треугольников по группам', JSON.stringify(cnt), 'габариты', bb.mn.map((v) => v.toFixed(2)).join(' '), '…', bb.mx.map((v) => v.toFixed(2)).join(' '));
    for (const v of ['front', 'side', 'top']) writePpm(`${dir}/g_${name}_${v}.ppm`, render(Float32Array.from(P), Uint32Array.from(I), (t) => C[t], { view: v, w: 900, h: 520, marks: mk }));
    return;
  }
  const byMat = new Map(); let removed = 0;
  for (const p of prims) {
    let keep = null;
    if (cfg.pick) {
      const { comp, list } = components(p.P, p.I, 0.001), B = cfg.pick, sel = new Set();
      for (const c of list) { const ctr = c.max.map((v, k) => (v + c.min[k]) / 2); if (ctr.every((v, k) => v >= B[k] && v <= B[k + 3])) sel.add(c.id); }
      keep = (t) => sel.has(comp[t]);
    } else if (cfg.groups && cfg.perTri) {
      const gs = [], small = new Set();
      if (cfg.minPart) { const { comp, list } = components(p.P, p.I, 0.001); for (const c of list) if (Math.max(...c.max.map((v, k) => v - c.min[k])) * tsc < cfg.minPart) small.add(c.id); for (let t = 0; t < comp.length; t++) if (small.has(comp[t])) small.add(-1 - t); }
      for (let t = 0; t < p.I.length / 3; t++) {
        const c = { min: [1e9, 1e9, 1e9], max: [-1e9, -1e9, -1e9] };
        for (let k = 0; k < 3; k++) { const v = p.I[t * 3 + k] * 3; for (let d = 0; d < 3; d++) { c.min[d] = Math.min(c.min[d], p.P[v + d]); c.max[d] = Math.max(c.max[d], p.P[v + d]); } }
        c.ctr = c.max.map((v, k) => (v + c.min[k]) / 2); c.size = c.max.map((v, k) => v - c.min[k]); c.mat = p.material; gs.push(small.has(-1 - t) ? null : cfg.groups(c));
      }
      p.group = (t) => gs[t]; p.comp = Int32Array.from(gs, (g2) => (g2 === 'cradle' ? 1 : 0)); keep = (t) => !!gs[t];
    } else if (cfg.groups) {
      const { comp, list } = components(p.P, p.I, 0.001), gid = new Map();
      // мелочь (болты, заклёпки, ручки) меньше minPart — долой: на упрощение она почти не поддаётся
      for (const c of list) { c.ctr = c.max.map((v, k) => (v + c.min[k]) / 2); c.size = c.max.map((v, k) => v - c.min[k]); c.mat = p.material; gid.set(c.id, Math.max(...c.size) * tsc < (cfg.minPart || 0) ? null : cfg.groups(c)); }
      p.group = (t) => gid.get(comp[t]); p.comp = comp; keep = (t) => !!gid.get(comp[t]);
    } else if (cfg.remove) {
      const { comp, list } = components(p.P, p.I, cfg.scale < 0.1 ? 0.5 : 0.001), drop = new Set();
      list.forEach((c, i) => { c.size = c.max.map((v, k) => v - c.min[k]); c.ctr = c.max.map((v, k) => (v + c.min[k]) / 2); c.mat = p.material; if (cfg.remove(c, i)) drop.add(c.id); });
      keep = (t) => !drop.has(comp[t]);
    }
    const remaps = new Map();
    for (let t = 0; t < p.I.length / 3; t++) {
      if (keep && !keep(t)) { removed++; continue; }
      const grp = p.group ? p.group(t) : 'body', key = `${grp}|${p.material}`;
      let M = byMat.get(key); if (!M) byMat.set(key, M = { group: grp, mat: p.material, pos: [], nor: [], uv: [], idx: [], tc: [], hasUv: !!p.UV });
      let remap = remaps.get(key); if (!remap) remaps.set(key, remap = new Int32Array(p.P.length / 3).fill(-1));
      if (p.comp) M.tc.push(`${p.node}.${p.prim}:${p.comp[t]}`);
      for (let k = 0; k < 3; k++) {
        const v = p.I[t * 3 + k];
        if (remap[v] < 0) {
          remap[v] = M.pos.length / 3;
          const [x, y, z] = tx(p.P[v * 3], p.P[v * 3 + 1] - (cfg.centerY || 0), p.P[v * 3 + 2]);
          M.pos.push(x * tsc, y * tsc, z * tsc);
          const n = p.N ? tx(p.N[v * 3], p.N[v * 3 + 1], p.N[v * 3 + 2]) : [0, 1, 0]; M.nor.push(...n);
          if (M.hasUv) M.uv.push(p.UV ? p.UV[v * 2] : 0, p.UV ? p.UV[v * 2 + 1] : 0);
        }
        M.idx.push(remap[v]);
      }
    }
  }
  // центр: по длине — середина, по высоте — ось фюзеляжа (centerY) или середина габаритов; у комплексов — земля y = 0,
  // центр по корпусу
  const all = bbox(Float32Array.from([...byMat.values()].flatMap((m) => m.pos)));
  const bodyB = cfg.unit ? bbox(Float32Array.from([...byMat.values()].filter((m) => m.group === 'body').flatMap((m) => m.pos))) : all;
  const dz = (bodyB.mn[2] + bodyB.mx[2]) / 2, dy = cfg.unit ? all.mn[1] : cfg.centerY !== undefined ? 0 : (all.mn[1] + all.mx[1]) / 2, dx = cfg.pick || cfg.pickMesh || cfg.unit ? (bodyB.mn[0] + bodyB.mx[0]) / 2 : 0;
  for (const m of byMat.values()) for (let i = 0; i < m.pos.length; i += 3) { m.pos[i] -= dx; m.pos[i + 1] -= dy; m.pos[i + 2] -= dz; }
  if (cfg.groups && cfg.unit) articulate(cfg, byMat, [dx, dy, dz], cfg.rulesIn === 'game' ? (x, y, z) => [x / cfg.scale, y / cfg.scale, z / cfg.scale] : ax);
  SIMP_ERR = cfg.simpErr || 0.05; WELD = cfg.weld || 1e-4; CLUSTER = !!cfg.cluster;
  // target — бюджет треугольников (упрощение до него, но не дальше допустимой ошибки SIMP_ERR — форма не мнётся); simplify — доля
  if (cfg.target || cfg.simplify) {
    let total = 0; for (const m of byMat.values()) total += m.idx.length / 3;
    const ratio = cfg.target ? Math.min(1, cfg.target / total) : cfg.simplify;
    if (ratio < 0.98) await simplifyAll(byMat, ratio);
  }
  console.log(`${name}: убрано треугольников ${removed}; длина ${(all.mx[2] - all.mn[2]).toFixed(2)} м, размах ${(all.mx[0] - all.mn[0]).toFixed(2)} м, высота ${(all.mx[1] - all.mn[1]).toFixed(2)} м`);

  // материалы и текстуры
  const tmp = await Deno.makeTempDir(), chunks = [], views_ = [], accs = [], images = [], textures = [], materials = [], meshes = [], nodes = [];
  let off = 0;
  const add = (arr, target) => { const b = arr instanceof Uint8Array ? arr : new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength); chunks.push(b); const pad = (4 - (b.length % 4)) % 4; if (pad) chunks.push(new Uint8Array(pad)); views_.push({ buffer: 0, byteOffset: off, byteLength: b.length, ...(target ? { target } : {}) }); off += b.length + pad; return views_.length - 1; };
  const texCache = new Map(); let texBytes = 0;
  async function texture(ti, size, png = false) { // png — с прозрачностью (листья, вырезка по альфе)
    const key = `${ti}:${size}:${png}`; if (texCache.has(key)) return texCache.get(key);
    const im = J.images[J.textures[ti].source], bv = J.bufferViews[im.bufferView];
    const ext = im.mimeType === 'image/jpeg' ? 'jpg' : 'png';
    Deno.writeFileSync(`${tmp}/t.${ext}`, g.bin.subarray(bv.byteOffset || 0, (bv.byteOffset || 0) + bv.byteLength));
    const of = png ? 'o.png' : 'o.jpg';
    await new Deno.Command('sips', { args: png ? ['-s', 'format', 'png', '-Z', String(size), `${tmp}/t.${ext}`, '--out', `${tmp}/${of}`] : ['-s', 'format', 'jpeg', '-s', 'formatOptions', '80', '-Z', String(size), `${tmp}/t.${ext}`, '--out', `${tmp}/${of}`], stdout: 'null', stderr: 'null' }).output();
    const jpg = Deno.readFileSync(`${tmp}/${of}`); texBytes += jpg.length;
    images.push({ bufferView: add(jpg), mimeType: png ? 'image/png' : 'image/jpeg' }); textures.push({ sampler: 0, source: images.length - 1 });
    texCache.set(key, textures.length - 1); return textures.length - 1;
  }
  let tris = 0;
  for (const m of byMat.values()) {
    const mi = m.mat;
    if (!m.idx.length) continue;
    const src = (J.materials || [])[mi] || { name: 'default', pbrMetallicRoughness: {} }, sg = src.extensions && src.extensions.KHR_materials_pbrSpecularGlossiness;
    // spec/gloss (как у F/A-18): diffuse → baseColor
    const pbr = sg ? { baseColorFactor: sg.diffuseFactor, baseColorTexture: sg.diffuseTexture } : src.pbrMetallicRoughness || {};
    // cutout — полупрозрачное (листья на картах) рисуем вырезкой по альфе, с текстурой PNG; без него BLEND — стекло
    // стекло — только полупрозрачное с «стеклянным» именем (фонарь, окна, линзы): многие авторы ставят BLEND на всё подряд (гусеницы «Тора»,
    // корпус «Вербы», крыша хаты) — без этого правила такие части выходили белыми «стёклами» без текстуры. cfg.glass — свои имена стёкол
    const GLASS = /glass|стекл|canopy|window|visor|lens|fonar|фонар/i, nm = src.name || '';
    const blend = src.alphaMode === 'BLEND', solid = !!(cfg.opaque && cfg.opaque.test(nm));
    const glass = blend && !solid && !cfg.cutout && (GLASS.test(nm) || !!(cfg.glass && cfg.glass.test(nm)));
    const cut = blend && !solid && !glass; // остальное полупрозрачное — вырезкой по альфе: заборы и наклейки сохраняют дыры, корпуса — текстуру
    // colors — свои цвета материалов по имени (у модели без текстур цвета бывают «служебные»)
    const own = cfg.colors && Object.entries(cfg.colors).find(([re]) => new RegExp(re).test(src.name || ''));
    const mat = { name: src.name, doubleSided: true, pbrMetallicRoughness: { baseColorFactor: own ? [...own[1], 1] : pbr.baseColorFactor || [1, 1, 1, 1], metallicFactor: 0.3, roughnessFactor: 0.6 } };
    if (glass) mat.alphaMode = 'BLEND';
    if (src.alphaMode === 'MASK' || cut) { mat.alphaMode = 'MASK'; mat.alphaCutoff = src.alphaCutoff ?? 0.5; }
    if (pbr.baseColorTexture && m.hasUv && !glass) mat.pbrMetallicRoughness.baseColorTexture = { index: await texture(pbr.baseColorTexture.index, cfg.tex(src), mat.alphaMode === 'MASK') };
    materials.push(mat);
    const pos = new Float32Array(m.pos), b = bbox(pos), n = pos.length / 3, attrs = {};
    accs.push({ bufferView: add(pos, 34962), componentType: 5126, count: n, type: 'VEC3', min: b.mn, max: b.mx }); attrs.POSITION = accs.length - 1;
    accs.push({ bufferView: add(new Float32Array(m.nor), 34962), componentType: 5126, count: n, type: 'VEC3' }); attrs.NORMAL = accs.length - 1;
    if (mat.pbrMetallicRoughness.baseColorTexture) { accs.push({ bufferView: add(new Float32Array(m.uv), 34962), componentType: 5126, count: n, type: 'VEC2' }); attrs.TEXCOORD_0 = accs.length - 1; }
    const ix = n < 65536 ? Uint16Array.from(m.idx) : Uint32Array.from(m.idx);
    accs.push({ bufferView: add(ix, 34963), componentType: n < 65536 ? 5123 : 5125, count: m.idx.length, type: 'SCALAR' });
    meshes.push({ name: `${m.group || 'body'}|${glass ? 'glass' : src.name}`, primitives: [{ attributes: attrs, indices: accs.length - 1, material: materials.length - 1 }] });
    nodes.push({ name: meshes[meshes.length - 1].name, mesh: meshes.length - 1 });
    tris += m.idx.length / 3;
  }
  const json = { asset: { version: '2.0', generator: 'fortuna airdef prepare.js' }, scene: 0, scenes: [{ nodes: nodes.map((_, i) => i) }], nodes, meshes, accessors: accs, bufferViews: views_,
    buffers: [{ byteLength: off }], images, samplers: [{ magFilter: 9729, minFilter: 9987 }], textures, materials };
  let js = new TextEncoder().encode(JSON.stringify(json)); const jp = (4 - (js.length % 4)) % 4; if (jp) js = new Uint8Array([...js, ...new Array(jp).fill(32)]);
  const total = 28 + js.length + off, glb = new Uint8Array(total), dv = new DataView(glb.buffer);
  dv.setUint32(0, 0x46546c67, true); dv.setUint32(4, 2, true); dv.setUint32(8, total, true);
  dv.setUint32(12, js.length, true); dv.setUint32(16, 0x4e4f534a, true); glb.set(js, 20);
  let o = 20 + js.length; dv.setUint32(o, off, true); dv.setUint32(o + 4, 0x004e4942, true); o += 8;
  for (const c of chunks) { glb.set(c, o); o += c.length; }
  const dir = new URL('../../games/airdef/models/', import.meta.url).pathname; await Deno.mkdir(dir, { recursive: true });
  Deno.writeFileSync(`${dir}${name}.glb`, glb);
  console.log(`→ models/${name}.glb: ${(total / 1024).toFixed(0)} КБ (текстуры ${(texBytes / 1024).toFixed(0)} КБ, ${textures.length} шт.), материалов ${materials.length}, треугольников ${tris}`);
  if (views) {
    const P = [], I = []; let base = 0;
    for (const m of byMat.values()) { for (const x of m.pos) P.push(x); for (const k of m.idx) I.push(k + base); base += m.pos.length / 3; }
    for (const v of ['side', 'top', 'bottom', 'front', 'iso']) writePpm(`${tmp}/${name}_${v}.ppm`, render(Float32Array.from(P), Uint32Array.from(I), () => [190, 190, 196], { view: v, w: 900, h: 500 }));
    console.log('  виды:', tmp);
  }
}
// ── шарниры комплекса: башня — вокруг вертикали через центр её основания, пакет — вокруг оси hinge; пакет поворачивается
// так, чтобы его ось смотрела в −Z (угол места 0), — в игре его поднимает u.lel. Печатает данные для launchers.js.
function articulate(cfg, byMat, shift, ax) {
  const sub = (p) => [p[0] - shift[0], p[1] - shift[1], p[2] - shift[2]];
  const hinge = cfg.hinge ? sub(ax(...cfg.hinge).map((v) => v * cfg.scale)) : null;
  // ракеты на направляющих (группа missile) качаются вместе с пакетом
  const T = [...byMat.values()].filter((m) => m.group === 'turret'), K = [...byMat.values()].filter((m) => m.group === 'cradle' || m.group === 'missile');
  if (!T.length && !K.length) return; // машина целиком (станция РЭБ)
  // основание башни: нижние 0,5 м её вершин
  let y0 = 1e9; for (const m of T) for (let i = 1; i < m.pos.length; i += 3) y0 = Math.min(y0, m.pos[i]);
  let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
  for (const m of T) for (let i = 0; i < m.pos.length; i += 3) if (m.pos[i + 1] < y0 + 0.5) { x0 = Math.min(x0, m.pos[i]); x1 = Math.max(x1, m.pos[i]); z0 = Math.min(z0, m.pos[i + 2]); z1 = Math.max(z1, m.pos[i + 2]); }
  // башни нет (С-400) — ось поворота в петле пакета
  const tp = T.length ? [(x0 + x1) / 2, y0, (z0 + z1) / 2] : hinge.slice();
  // turretYaw — башня в модели развёрнута (пусковая смотрит вбок): поворачиваем башню, пакет и петлю вокруг вертикали
  // через центр основания башни в нулевое положение (как у three.js: x' = x·cos + z·sin, z' = −x·sin + z·cos)
  if (cfg.turretYaw) {
    const c = Math.cos(cfg.turretYaw), s = Math.sin(cfg.turretYaw);
    const ry = (a, i, o) => { const x = a[i] - o[0], z = a[i + 2] - o[2]; a[i] = o[0] + x * c + z * s; a[i + 2] = o[2] - x * s + z * c; };
    for (const m of [...T, ...K]) { for (let i = 0; i < m.pos.length; i += 3) ry(m.pos, i, tp); for (let i = 0; i < m.nor.length; i += 3) ry(m.nor, i, [0, 0, 0]); }
    if (hinge) ry(hinge, 0, tp);
  }
  if (!K.length) { for (const m of T) for (let i = 0; i < m.pos.length; i += 3) { m.pos[i] -= tp[0]; m.pos[i + 1] -= tp[1]; m.pos[i + 2] -= tp[2]; } let top = -1e9; for (const m of T) for (let i = 1; i < m.pos.length; i += 3) top = Math.max(top, m.pos[i]); console.log(`  шарниры: башня tp [${tp.map((v) => +v.toFixed(2))}], пакета нет, верх башни +${top.toFixed(2)} м`); return; }
  // ось пакета — главная компонента вершин в плоскости (z, y)
  let n = 0, mz = 0, my = 0; for (const m of K) for (let i = 0; i < m.pos.length; i += 3) { n++; my += m.pos[i + 1]; mz += m.pos[i + 2]; } my /= n; mz /= n;
  let szz = 0, syy = 0, syz = 0; for (const m of K) for (let i = 0; i < m.pos.length; i += 3) { const a = m.pos[i + 2] - mz, b = m.pos[i + 1] - my; szz += a * a; syy += b * b; syz += a * b; }
  const th = 0.5 * Math.atan2(2 * syz, szz - syy); let ez = Math.cos(th), ey = Math.sin(th); if (ez > 0) { ez = -ez; ey = -ey; } // ось — вперёд (−Z)
  const el0 = Math.atan2(ey, -ez), ce = Math.cos(el0), se = Math.sin(el0);
  for (const m of T) for (let i = 0; i < m.pos.length; i += 3) { m.pos[i] -= tp[0]; m.pos[i + 1] -= tp[1]; m.pos[i + 2] -= tp[2]; }
  const rot = (a, i, o) => { const y = a[i + 1] - o[1], z = a[i + 2] - o[2]; a[i] -= o[0]; a[i + 1] = y * ce + z * se; a[i + 2] = -y * se + z * ce; };
  for (const m of K) { for (let i = 0; i < m.pos.length; i += 3) rot(m.pos, i, hinge); for (let i = 0; i < m.nor.length; i += 3) rot(m.nor, i, [0, 0, 0]); }
  if (K.some((m) => m.group === 'missile')) { const f2 = (v) => +v.toFixed(2), cp2 = [hinge[0] - tp[0], hinge[1] - tp[1], hinge[2] - tp[2]].map(f2); console.log(`  шарниры: башня tp [${tp.map(f2)}], пакет cp [${cp2}] (от башни), угол пакета в модели ${(el0 * 57.3).toFixed(1)}°`); extractMissile(cfg, byMat); return; }
  // контейнеры: длинные цилиндры вдоль оси пакета (по частям меша) → центры слотов
  const parts = new Map();
  for (const m of K) for (let t = 0; t < m.idx.length / 3; t++) { const id = m.tc[t]; let b = parts.get(id); if (!b) parts.set(id, b = { mn: [1e9, 1e9, 1e9], mx: [-1e9, -1e9, -1e9] }); for (let k = 0; k < 3; k++) { const v = m.idx[t * 3 + k] * 3; for (let d = 0; d < 3; d++) { b.mn[d] = Math.min(b.mn[d], m.pos[v + d]); b.mx[d] = Math.max(b.mx[d], m.pos[v + d]); } } }
  if (Deno.args.includes('--debug')) for (const b of parts.values()) { const s2 = b.mx.map((v, d) => v - b.mn[d]); if (s2[2] > 2) console.log('   длинная часть', b.mn.map((v, d) => ((v + b.mx[d]) / 2).toFixed(2)).join(' '), 'размер', s2.map((v) => v.toFixed(2)).join(' ')); }
  const tubes = [];
  // контейнер — длинная часть с сечением 0,25–0,6 м; из перекрывающихся берётся самая «толстая» (корпус ТПК, а не ракета в нём)
  const [t0, t1] = cfg.tube || [0.25, 0.6];
  for (const b of parts.values()) { const s = b.mx.map((v, d) => v - b.mn[d]); if (s[2] > 1.2 && s[0] > t0 && s[0] < t1 && s[1] > t0 && s[1] < t1) tubes.push({ x: (b.mn[0] + b.mx[0]) / 2, y: (b.mn[1] + b.mx[1]) / 2, z: (b.mn[2] + b.mx[2]) / 2, len: s[2], r: Math.min(s[0], s[1]) / 2, a: s[0] * s[1] }); }
  const slots = []; for (const t of tubes.sort((a, b) => b.a - a.a)) if (!slots.some((q) => Math.hypot(q.x - t.x, q.y - t.y) < 0.25)) slots.push(t);
  slots.sort((a, b) => a.y - b.y || a.x - b.x);
  const f = (v) => +v.toFixed(2), cp = [hinge[0] - tp[0], hinge[1] - tp[1], hinge[2] - tp[2]].map(f);
  console.log(`  шарниры: башня tp [${tp.map(f)}], пакет cp [${cp}] (от башни), угол пакета в модели ${(el0 * 57.3).toFixed(1)}°`);
  console.log(`  контейнеры (${slots.length}): ${slots.map((t) => `[${f(t.x)}, ${f(t.y)}, ${f(t.z)}]`).join(', ')}; длина ${slots[0] ? f(slots[0].len) : '?'} м, радиус ${slots[0] ? f(slots[0].r) : '?'} м`);
}
// ракеты модели на направляющих: экземпляры — группы частей, перекрывающихся в сечении (x, y); первый — образец (центр в 0,
// нос в −Z), остальные выбрасываются, их центры — слоты. stage — доля маршевой ступени: хвост образца — отдельный ускоритель
function extractMissile(cfg, byMat) {
  const Ms = [...byMat.values()].filter((m) => m.group === 'missile'), parts = new Map();
  for (const m of Ms) for (let t = 0; t < m.idx.length / 3; t++) { const id = m.tc[t]; let b = parts.get(id); if (!b) parts.set(id, b = { id, mn: [1e9, 1e9, 1e9], mx: [-1e9, -1e9, -1e9] }); for (let k = 0; k < 3; k++) { const v = m.idx[t * 3 + k] * 3; for (let d = 0; d < 3; d++) { b.mn[d] = Math.min(b.mn[d], m.pos[v + d]); b.mx[d] = Math.max(b.mx[d], m.pos[v + d]); } } }
  // слияние частей в экземпляры по перекрытию сечений
  const L = [...parts.values()], par = L.map((_, i) => i), f = (i) => (par[i] === i ? i : (par[i] = f(par[i])));
  // экземпляры — по оси: центры сечений ближе 0,35 м; короткие куски (рули, крылья) потом — к ближайшей длинной ракете
  const ctr = (b) => [(b.mn[0] + b.mx[0]) / 2, (b.mn[1] + b.mx[1]) / 2];
  for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++) { const a = ctr(L[i]), b = ctr(L[j]); if (Math.hypot(a[0] - b[0], a[1] - b[1]) < 0.35) par[f(i)] = f(j); }
  const inst = new Map(); L.forEach((b, i) => { const r = f(i); let q = inst.get(r); if (!q) inst.set(r, q = { ids: new Set(), mn: [1e9, 1e9, 1e9], mx: [-1e9, -1e9, -1e9] }); q.ids.add(b.id); for (let d = 0; d < 3; d++) { q.mn[d] = Math.min(q.mn[d], b.mn[d]); q.mx[d] = Math.max(q.mx[d], b.mx[d]); } });
  let list = [...inst.values()].map((q) => ({ ...q, c: q.mn.map((v, d) => (v + q.mx[d]) / 2), len: q.mx[2] - q.mn[2] }));
  const maxLen = Math.max(...list.map((q) => q.len)), big = list.filter((q) => q.len > maxLen * 0.6);
  for (const q of list) if (!big.includes(q)) { let best = null, bd = 0.9; for (const b of big) { const d = Math.hypot(q.c[0] - b.c[0], q.c[1] - b.c[1]); if (d < bd) { bd = d; best = b; } } if (best) for (const id of q.ids) best.ids.add(id); }
  list = big.sort((a, b) => a.c[1] - b.c[1] || a.c[0] - b.c[0]);
  // образец — ближайший к tplNear [x, y] (если задан), иначе первый
  if (cfg.tplNear) list.sort((a, b) => Math.hypot(a.c[0] - cfg.tplNear[0], a.c[1] - cfg.tplNear[1]) - Math.hypot(b.c[0] - cfg.tplNear[0], b.c[1] - cfg.tplNear[1]));
  const tpl = list[0], zs = cfg.stage ? -tpl.len / 2 + tpl.len * cfg.stage : 1e9;
  // крылья и рули — отдельные детали пакета внутри габарита ракеты (короче половины её длины, ближе 0,9 м к оси) — к ракете;
  // у остальных экземпляров — долой вместе с ними
  const Ks = [...byMat.values()].filter((m) => m.group === 'cradle'), cb = new Map();
  for (const m of Ks) for (let t = 0; t < m.idx.length / 3; t++) { const id = m.tc[t]; let b = cb.get(id); if (!b) cb.set(id, b = { mn: [1e9, 1e9, 1e9], mx: [-1e9, -1e9, -1e9] }); for (let k = 0; k < 3; k++) { const v = m.idx[t * 3 + k] * 3; for (let d = 0; d < 3; d++) { b.mn[d] = Math.min(b.mn[d], m.pos[v + d]); b.mx[d] = Math.max(b.mx[d], m.pos[v + d]); } } }
  const owner = new Map();
  for (const [id, b] of cb) {
    const c = b.mn.map((v, d) => (v + b.mx[d]) / 2), len = b.mx[2] - b.mn[2];
    const R = cfg.absorb ?? 0.9; // радиус «прилипания» к ракете (0 — не присоединять: вокруг ракеты стенки контейнера)
    for (const q of list) if (b.mn[2] >= q.mn[2] - 0.05 && b.mx[2] <= q.mx[2] + 0.05 && len < q.len * 0.5 && Math.hypot(c[0] - q.c[0], c[1] - q.c[1]) < R) { owner.set(id, q); break; }
  }
  for (const m of Ks) { const I2 = [], T2 = []; for (let t = 0; t < m.idx.length / 3; t++) { const q = owner.get(m.tc[t]); if (q === tpl) { tpl.ids.add(m.tc[t]); } if (q) continue; I2.push(m.idx[t * 3], m.idx[t * 3 + 1], m.idx[t * 3 + 2]); T2.push(m.tc[t]); } m.wing = m.idx.filter((_, k) => owner.get(m.tc[Math.floor(k / 3)]) === tpl); m.wingTc = m.tc.filter((id) => owner.get(id) === tpl); m.idx = I2; m.tc = T2; }
  // крылья образца — как ещё одна «ракетная» часть того же материала
  for (const m of Ks) if (m.wing.length) Ms.push({ ...m, idx: m.wing, tc: m.wingTc });
  console.log(`  к ракетам присоединено деталей пакета: ${owner.size}`);
  const out = [];
  for (const m of Ms) {
    const keepT = [], boost = [];
    for (let t = 0; t < m.idx.length / 3; t++) {
      if (!tpl.ids.has(m.tc[t])) continue;
      const zc = (m.pos[m.idx[t * 3] * 3 + 2] + m.pos[m.idx[t * 3 + 1] * 3 + 2] + m.pos[m.idx[t * 3 + 2] * 3 + 2]) / 3 - tpl.c[2];
      (zc > zs ? boost : keepT).push(t);
    }
    for (const [grp, tris] of [['missile', keepT], ['booster', boost]]) {
      if (!tris.length) continue;
      const M = { group: grp, mat: m.mat, pos: [], nor: [], uv: [], idx: [], tc: [], hasUv: m.hasUv }, map = new Map();
      for (const t of tris) for (let k = 0; k < 3; k++) { const v = m.idx[t * 3 + k]; if (!map.has(v)) { map.set(v, M.pos.length / 3); M.pos.push(m.pos[v * 3] - tpl.c[0], m.pos[v * 3 + 1] - tpl.c[1], m.pos[v * 3 + 2] - tpl.c[2]); M.nor.push(m.nor[v * 3], m.nor[v * 3 + 1], m.nor[v * 3 + 2]); if (m.hasUv) M.uv.push(m.uv[v * 2], m.uv[v * 2 + 1]); } M.idx.push(map.get(v)); M.tc.push(m.tc[t]); }
      out.push(M);
    }
  }
  for (const [k, m] of byMat) if (m.group === 'missile') byMat.delete(k);
  out.forEach((m, i) => byMat.set(`${m.group}|${m.mat}|${i}`, m));
  const f2 = (v) => +v.toFixed(2), r = Math.max(tpl.mx[0] - tpl.mn[0], tpl.mx[1] - tpl.mn[1]) / 2;
  console.log(`  ракеты на направляющих (${list.length}): ${list.map((q) => `[${q.c.map(f2)}]`).join(', ')}; образец: длина ${f2(tpl.len)} м, размах ${f2(r * 2)} м${cfg.stage ? `, ускоритель — хвост ${f2(tpl.len * (1 - cfg.stage))} м` : ''}`);
}
// упрощение сетки: вершины свариваются по положению (швы UV не держат сетку), упрощается сваренная сетка, потом каждому
// углу треугольника возвращается исходная вершина — из той «островной» группы UV, где три угла ближе всего друг к другу
let SIMP_ERR = 0.05, WELD = 1e-4, CLUSTER = false;
async function simplifyAll(byMat, ratio) {
  await MeshoptSimplifier.ready;
  let before = 0, after = 0;
  for (const m of byMat.values()) {
    if (m.idx.length < 30) continue; // крошки не упрощаем
    const nv = m.pos.length / 3, wid = new Uint32Array(nv), key = new Map(), wpos = [], cand = [];
    for (let v = 0; v < nv; v++) {
      const k = `${Math.round(m.pos[v * 3] / WELD)},${Math.round(m.pos[v * 3 + 1] / WELD)},${Math.round(m.pos[v * 3 + 2] / WELD)}`;
      let w = key.get(k); if (w === undefined) { key.set(k, w = wpos.length / 3); wpos.push(m.pos[v * 3], m.pos[v * 3 + 1], m.pos[v * 3 + 2]); cand.push([]); }
      wid[v] = w; cand[w].push(v);
    }
    const widx = Uint32Array.from(m.idx, (v) => wid[v]); before += widx.length / 3;
    const target = Math.max(3, Math.floor(widx.length * ratio / 3) * 3);
    let [out] = MeshoptSimplifier.simplify(widx, Float32Array.from(wpos), 3, target, SIMP_ERR);
    // топология не дала упростить — кластеризация по сетке: вершины одной ячейки сливаются, вырожденные треугольники долой
    if (CLUSTER && out.length > target * 1.6) {
      let lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9]; for (let i = 0; i < wpos.length; i += 3) for (let d = 0; d < 3; d++) { lo[d] = Math.min(lo[d], wpos[i + d]); hi[d] = Math.max(hi[d], wpos[i + d]); }
      const ext = Math.max(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]) || 1;
      for (let cell = ext * 0.004; cell < ext * 0.2 && out.length > target * 1.6; cell *= 1.35) {
        const rep2 = new Map(), map = new Uint32Array(wpos.length / 3);
        for (let v = 0; v < map.length; v++) { const k = `${Math.floor(wpos[v * 3] / cell)},${Math.floor(wpos[v * 3 + 1] / cell)},${Math.floor(wpos[v * 3 + 2] / cell)}`; let r = rep2.get(k); if (r === undefined) rep2.set(k, r = v); map[v] = r; }
        const seen = new Set(), next = [];
        for (let t = 0; t < out.length; t += 3) { const a = map[out[t]], b = map[out[t + 1]], c = map[out[t + 2]]; if (a === b || b === c || a === c) continue; const k = [a, b, c].sort((x, y) => x - y).join(','); if (seen.has(k)) continue; seen.add(k); next.push(a, b, c); }
        out = Uint32Array.from(next);
      }
    }
    const uvd = (a, b) => (m.hasUv ? Math.abs(m.uv[a * 2] - m.uv[b * 2]) + Math.abs(m.uv[a * 2 + 1] - m.uv[b * 2 + 1]) : 0);
    const map = new Int32Array(nv).fill(-1), P = [], N = [], U = [], I = [];
    for (let t = 0; t < out.length; t += 3) {
      const A = cand[out[t]], B = cand[out[t + 1]], Cc = cand[out[t + 2]];
      let best = [A[0], B[0], Cc[0]], bd = 1e9;
      if (A.length * B.length * Cc.length > 1) for (const a of A) for (const b of B) for (const c of Cc) { const d = uvd(a, b) + uvd(b, c) + uvd(a, c); if (d < bd) { bd = d; best = [a, b, c]; } }
      for (const v of best) { if (map[v] < 0) { map[v] = P.length / 3; P.push(m.pos[v * 3], m.pos[v * 3 + 1], m.pos[v * 3 + 2]); N.push(m.nor[v * 3], m.nor[v * 3 + 1], m.nor[v * 3 + 2]); if (m.hasUv) U.push(m.uv[v * 2], m.uv[v * 2 + 1]); } I.push(map[v]); }
    }
    if (Deno.args.includes('--debug')) console.log(`   ${m.group}|${m.mat}: ${widx.length / 3} → ${I.length / 3}`);
    m.pos = P; m.nor = N; m.uv = U; m.idx = I; after += I.length / 3;
  }
  console.log(`  упрощение: ${before} → ${after} треугольников`);
}
// --credits: авторы и лицензии всех исходников (из asset.extras Sketchfab) → games/airdef/models/credits.js и CREDITS.md
if (Deno.args[0] === '--credits') {
  const bySrc = new Map(), dir = new URL('../../games/airdef/models/', import.meta.url).pathname;
  for (const [name, cfg] of Object.entries(CONFIG)) {
    try { Deno.statSync(`${dir}${name}.glb`); } catch { continue; } // в игре только собранные
    let e = bySrc.get(cfg.src);
    if (!e) { const J = readGlb(Deno.readFileSync(cfg.src)).json, x = (J.asset && J.asset.extras) || {}; bySrc.set(cfg.src, e = { title: x.title || '', author: (x.author || '').replace(/ \(.*$/, ''), url: x.source || '', license: (x.license || '').replace(/ \(.*$/, ''), files: [] }); }
    e.files.push(name);
  }
  const list = [...bySrc.values()];
  Deno.writeTextFileSync(`${dir}credits.js`, `// Создано tools/airdef-models/prepare.js --credits — не править руками\nexport const CREDITS = ${JSON.stringify(list, null, 1)};\n`);
  Deno.writeTextFileSync(`${dir}CREDITS.md`, `# 3D-модели «Воздушного превосходства»\n\nВсе — с Sketchfab, лицензии указаны. Для игры изменены (tools/airdef-models/prepare.js): убраны лишние части, упрощены\nсетки, переведены в метры и развёрнуты, разделены на корпус / башню / пакет, текстуры уменьшены и пересжаты в JPEG.\n\n` +
    list.map((c) => `- "${c.title}" (${c.url}) by ${c.author} — ${c.license} — ${c.files.map((f) => '`' + f + '.glb`').join(', ')}`).join('\n') + '\n');
  console.log(`авторов ${list.length}, файлов ${list.reduce((n, c) => n + c.files.length, 0)}`);
  Deno.exit(0);
}
const names = Deno.args[0] === 'all' ? Object.keys(CONFIG) : [Deno.args[0]];
if (!CONFIG[names[0]]) { console.log('модели:', Object.keys(CONFIG).join(', '), '| all'); Deno.exit(1); }
for (const n of names) await prepare(n, Deno.args.includes('--views'));
