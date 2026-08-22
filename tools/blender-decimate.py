"""Preparing heavy GLB files: simplification by QUADRIC EDGE COLLAPSE (Blender).

Why: our own decimation by collapsing vertices onto a grid (it used to be in
glb2module.py) ruined thin and hollow geometry — the crown fell apart into
shards, the skate and the booth turned into mush. Decimate/COLLAPSE computes
the error quadric and preserves the silhouette, so all heavy geometry is now
prepared here, and the converter no longer distorts ANYTHING.

Models lighter than KEEP_UNDER are not touched at all — they are copied as is.

Run:
  /Applications/Blender.app/Contents/MacOS/Blender --background \
      --python tools/blender-decimate.py -- "<input>" "<output>"
"""
import os
import shutil
import sys

import bpy

KEEP_UNDER = 3200   # this many triangles and fewer — we don't touch them
# ⚠️ THRESHOLD RAISED 1500 → 3200 (the owner's decision 2026-07-28 by measurement).
# Reason: the owner ALREADY supplies low-poly models, and under the old threshold the
# script touched exactly one pack — the CARS (1952-3124 tri), cutting 39-62% off them
# and turning the wheels into polyhedra. The rest (animals/food/pirates) passed through
# untouched anyway. Measurement of the price of giving up car compression: weight
# +0.85 MB (7.49→8.39), frames under CPU×4 20.3→18.5, physics step WITHOUT changes
# (the load is from the number of bodies, not from detail). The threshold 3200 lets all
# current models through whole, remaining insurance against really heavy ones (15-20K tri).
# ⚠️ Overridden by the DECIMATE_TARGET environment variable: cars are brought down to
# 1200, and previously this required EDITING THIS LINE BY HAND and then remembering to
# revert it — a forgotten edit would silently ruin the next batch.
TARGET = int(os.environ.get('DECIMATE_TARGET', 15000))  # what we bring everything heavier down to
MIN_FACES = 40      # we don't decimate small details — they would collapse into nothing


def clear():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def collapse(obj):
    """Quadric edge collapse down to TARGET faces."""
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
    # ⚠️ RECURSIVE WALK (2026-07-28): the models are laid out by TYPE into subfolders
    # ("Food/Fruits-berries", "Car/Cars", …) at the owner's request. The former
    # os.listdir saw only the root of the batch and after the re-layout would not have
    # found A SINGLE model — the pipeline would silently have built an empty output.
    # We skip the service directories: .lowpoly is the OUTPUT (otherwise we would be
    # decimating what has already been decimated), .pick is historical staging.
    names = []
    for root, dirs, files in os.walk(src_dir):
        dirs[:] = [d for d in dirs if d not in ('.lowpoly', '.pick')]
        for fn in files:
            if fn.lower().endswith('.glb'):
                names.append(os.path.relpath(os.path.join(root, fn), src_dir))
    for f in sorted(names):
        # the output stays FLAT: glb2module reads .lowpoly as a single list,
        # and model names are unique within a batch
        src, dst = os.path.join(src_dir, f), os.path.join(out_dir, os.path.basename(f))
        clear()
        try:
            bpy.ops.import_scene.gltf(filepath=src)
        except Exception as e:
            rows.append((f, 0, 0, 'import failed: %s' % e))
            continue
        ms = meshes()
        if not ms:
            rows.append((f, 0, 0, 'no geometry — empty export'))
            continue

        total = sum(len(o.data.polygons) for o in ms)
        if total <= KEEP_UNDER:
            shutil.copyfile(src, dst)
            rows.append((f, total, total, 'unchanged'))
            continue

        # ⚠️ FIRST WE JOIN INTO A SINGLE OBJECT. Otherwise the ratio is computed for
        # each object separately, and the MIN_FACES lower cutoff keeps small details
        # from disappearing — and a model made of hundreds of parts (Ice Skate)
        # overshot the target ninefold: 1200 asked for, 10561 received.
        bpy.ops.object.select_all(action='DESELECT')
        for o in ms:
            o.select_set(True)
        bpy.context.view_layer.objects.active = ms[0]
        if len(ms) > 1:
            bpy.ops.object.join()
        obj = bpy.context.view_layer.objects.active
        collapse(obj)
        got = len(obj.data.polygons)
        note = 'collapsed'

        # ⚠️ COLLAPSE cannot merge DISCONNECTED shells: in models
        # assembled from thousands of intersecting pieces (Ice Skate, Concrete
        # Mixer) each shell holds its own minimum of faces, and the simplification
        # hit a floor of ~10000 instead of the requested 1200.
        # Vertex welding does NOT help here — tested, the counter GROWS: it
        # breeds non-manifold edges, and those are exactly what COLLAPSE preserves.
        # Voxel remesh works: it builds ONE closed surface over the volume,
        # after which the collapse does its job as intended.
        if got > TARGET * 1.6:
            rm = obj.modifiers.new('rm', 'REMESH')
            rm.mode = 'VOXEL'
            rm.voxel_size = max(obj.dimensions) / 150.0
            bpy.context.view_layer.objects.active = obj
            bpy.ops.object.modifier_apply(modifier=rm.name)
            collapse(obj)
            got = len(obj.data.polygons)
            note = 'remesh + collapse'
        try:
            bpy.ops.export_scene.gltf(filepath=dst, export_format='GLB',
                                      export_materials='NONE')
        except TypeError:            # old/new builds differ in their arguments
            bpy.ops.export_scene.gltf(filepath=dst, export_format='GLB')
        rows.append((f, total, got, note))

    print('\n===== BLENDER DECIMATE =====')
    print('%-34s %10s %8s   %s' % ('file', 'was', 'became', 'what was done'))
    for f, a, b, why in rows:
        print('%-34s %10s %8s   %s' % (f[:34], a, b, why))
    print('===== END =====')


if __name__ == '__main__':
    argv = sys.argv[sys.argv.index('--') + 1:]
    main(argv[0], argv[1])
