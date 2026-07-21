"""Подготовка тяжёлых GLB: упрощение КВАДРИЧНЫМ СХЛОПЫВАНИЕМ РЁБЕР (Blender).

Зачем: собственное прореживание схлопыванием вершин в сетку (было в
glb2module.py) губило тонкую и полую геометрию — корона рассыпалась на
осколки, конёк и будка превращались в кашу. Decimate/COLLAPSE считает
квадрику ошибки и сохраняет силуэт, поэтому вся тяжёлая геометрия теперь
готовится здесь, а конвертер больше НИЧЕГО не искажает.

Модели легче KEEP_UNDER не трогаются вообще — копируются как есть.

Запуск:
  /Applications/Blender.app/Contents/MacOS/Blender --background \
      --python tools/blender-decimate.py -- "<вход>" "<выход>"
"""
import os
import shutil
import sys

import bpy

KEEP_UNDER = 1500   # столько треугольников и меньше — не трогаем
TARGET = 15000     # к скольким сводим всё, что тяжелее
MIN_FACES = 40      # мелкие детали не прореживаем — схлопнутся в ничто


def clear():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def collapse(obj):
    """Квадричное схлопывание рёбер до TARGET граней."""
    n = len(obj.data.polygons)
    if n <= TARGET:
        return
    bpy.context.view_layer.objects.active = obj
    m = obj.modifiers.new('dec', 'DECIMATE')
    m.decimate_type = 'COLLAPSE'
    m.ratio = max(TARGET / float(n), MIN_FACES / float(n))
    bpy.ops.object.modifier_apply(modifier=m.name)


def meshes():
    return [o for o in bpy.data.objects if o.type == 'MESH' and o.data.polygons]


def main(src_dir, out_dir):
    os.makedirs(out_dir, exist_ok=True)
    rows = []
    for f in sorted(os.listdir(src_dir)):
        if not f.lower().endswith('.glb'):
            continue
        src, dst = os.path.join(src_dir, f), os.path.join(out_dir, f)
        clear()
        try:
            bpy.ops.import_scene.gltf(filepath=src)
        except Exception as e:
            rows.append((f, 0, 0, 'импорт не удался: %s' % e))
            continue
        ms = meshes()
        if not ms:
            rows.append((f, 0, 0, 'геометрии нет — пустой экспорт'))
            continue

        total = sum(len(o.data.polygons) for o in ms)
        if total <= KEEP_UNDER:
            shutil.copyfile(src, dst)
            rows.append((f, total, total, 'без изменений'))
            continue

        # ⚠️ СНАЧАЛА СЛИВАЕМ В ОДИН ОБЪЕКТ. Иначе доля считается на каждый
        # объект отдельно, а нижняя отсечка MIN_FACES не даёт мелким деталям
        # исчезнуть — и модель из сотен частей (Ice Skate) вылетала за цель
        # в девять раз: 1200 просили, 10561 получали.
        bpy.ops.object.select_all(action='DESELECT')
        for o in ms:
            o.select_set(True)
        bpy.context.view_layer.objects.active = ms[0]
        if len(ms) > 1:
            bpy.ops.object.join()
        obj = bpy.context.view_layer.objects.active
        collapse(obj)
        got = len(obj.data.polygons)
        note = 'схлопнуто'

        # ⚠️ COLLAPSE не умеет сливать НЕСВЯЗНЫЕ оболочки: у моделей,
        # собранных из тысяч пересекающихся кусков (Ice Skate, Concrete
        # Mixer), каждая оболочка держит свой минимум граней, и упрощение
        # упиралось в пол ~10000 вместо запрошенных 1200.
        # Сварка вершин тут НЕ помогает — проверено, счётчик РАСТЁТ: она
        # плодит немногообразные рёбра, а их COLLAPSE как раз сохраняет.
        # Работает воксельный ремеш: он строит по объёму ОДНУ замкнутую
        # поверхность, после чего схлопывание отрабатывает как задумано.
        if got > TARGET * 1.6:
            rm = obj.modifiers.new('rm', 'REMESH')
            rm.mode = 'VOXEL'
            rm.voxel_size = max(obj.dimensions) / 150.0
            bpy.context.view_layer.objects.active = obj
            bpy.ops.object.modifier_apply(modifier=rm.name)
            collapse(obj)
            got = len(obj.data.polygons)
            note = 'ремеш + схлопывание'
        try:
            bpy.ops.export_scene.gltf(filepath=dst, export_format='GLB',
                                      export_materials='NONE')
        except TypeError:            # старые/новые сборки расходятся в аргументах
            bpy.ops.export_scene.gltf(filepath=dst, export_format='GLB')
        rows.append((f, total, got, note))

    print('\n===== BLENDER DECIMATE =====')
    print('%-34s %10s %8s   %s' % ('файл', 'было', 'стало', 'что сделано'))
    for f, a, b, why in rows:
        print('%-34s %10s %8s   %s' % (f[:34], a, b, why))
    print('===== END =====')


if __name__ == '__main__':
    argv = sys.argv[sys.argv.index('--') + 1:]
    main(argv[0], argv[1])
