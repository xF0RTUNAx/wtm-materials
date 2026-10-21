import json
cm = json.load(open('cm.json'))
names = {'e_su25':'Су-25','e_su27':'Су-27СМ','su30':'Су-30СМ','e_su33':'Су-33','e_su35':'Су-35С','e_su34':'Су-34','e_su24':'Су-24М','mig29':'МиГ-29','e_mig29k':'МиГ-29К','e_mig31':'МиГ-31БМ','e_su57':'Су-57','e_mig23':'МиГ-23БН','e_mig27':'МиГ-27К','e_su17':'Су-17М4','e_mig25':'МиГ-25БМ','e_yak38':'Як-38М','e_t4':'Т-4',
 'e_f4':'F-4E (у пилонов)','e_f5':'F-5E','f16':'F-16D','f18':'F/A-18E','e_f18c':'F/A-18C','e_ea18g':'EA-18G','e_f15e':'F-15E','e_tornado':'Tornado','e_a10':'A-10A (шасси-гондолы и концы)','e_jaguar':'Jaguar','e_buccaneer':'Buccaneer','e_mirage':'Mirage 2000D','e_mirage_f1':'Mirage F1','e_etendard':'Super Étendard','e_rafale':'Rafale','e_gripen':'Gripen','e_typhoon':'Typhoon','e_viggen':'Viggen','e_harrier':'Harrier','e_f111':'F-111F','e_f117':'F-117A','e_f22':'F-22A','e_f35':'F-35A',
 'e_tu22':'Ту-22','e_tu22m2':'Ту-22М2','e_tu22m3':'Ту-22М3','e_tu95':'Ту-95МС','e_tu160':'Ту-160','e_b52':'B-52H','e_b1b':'B-1B (сверху)','e_b2':'B-2A',
 'h_mi24':'Ми-24В','h_mi8':'Ми-8МТВ','h_uh1':'UH-1H','h_uh60':'UH-60','h_ah1':'AH-1W','h_ah64':'AH-64D','h_ka50':'Ка-50','h_ka52':'Ка-52','h_mi28':'Ми-28Н','h_rah66':'RAH-66',
 'e_mig17':'МиГ-17Ф','e_mig19':'МиГ-19С','e_mig21n':'МиГ-21бис','e_su7b':'Су-7БМК','e_il28':'Ил-28','e_tu16':'Ту-16','e_m4':'М-4','e_hunter':'Hunter','e_f100':'F-100F','e_draken':'Draken','e_vulcan':'Vulcan'}
groups = [
 ('Восток: сверху хвостовой части, вверх и в стороны', ['e_su25','e_su27','su30','e_su33','e_su35','e_su34','e_su24','mig29','e_mig29k','e_mig31','e_su57','e_mig23','e_mig27','e_su17','e_mig25','e_yak38','e_t4']),
 ('Запад: снизу задней части, вниз (F-4E — у пилонов, A-10A — гондолы шасси и концы крыла)', ['e_f4','e_f5','f16','f18','e_f18c','e_ea18g','e_f15e','e_tornado','e_a10','e_jaguar','e_buccaneer','e_mirage','e_mirage_f1','e_etendard','e_rafale','e_gripen','e_typhoon','e_viggen','e_harrier','e_f111','e_f117','e_f22','e_f35']),
 ('Бомбардировщики: хвост / задняя часть, в стороны и вниз (B-1B — сверху)', ['e_tu22','e_tu22m2','e_tu22m3','e_tu95','e_tu160','e_b52','e_b1b','e_b2']),
 ('Вертолёты: хвостовая балка (Ми-24, Ми-8, UH-1, UH-60, AH-1, AH-64), концы крыльев (Ка-50, Ка-52, Ми-28), низ хвоста (RAH-66)', ['h_mi24','h_mi8','h_uh1','h_uh60','h_ah1','h_ah64','h_ka50','h_ka52','h_mi28','h_rah66']),
 ('Только диполи (flare: false): из хвостовой части снизу', ['e_mig17','e_mig19','e_mig21n','e_su7b','e_il28','e_tu16','e_m4','e_hunter','e_f100','e_draken','e_vulcan']),
]
def arr(a): return '[' + ', '.join('[' + ', '.join(('%g' % v) for v in p) + ']' for p in a) + ']'
out = []
for title, ks in groups:
    out.append('  // ── %s ──' % title)
    for k in ks:
        c = cm[k]; assert c['at'], k
        out.append("  %s: { flare: %s, salvo: %d, at: %s,\n    dir: %s }, // %s" % (k, 'true' if c['flare'] else 'false', c['salvo'], arr(c['at']), arr(c['dir']), names[k]))
tpl = open('cm.tpl.js').read()
open('../../../games/airdef/sim/cm.js','w').write(tpl.replace('@@TABLE@@', '\n'.join(out)))
print(len(cm))
