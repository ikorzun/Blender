#!/usr/bin/env python3
# ===== tools/lodgen.py — pile-scale LOD for the sport pack (the owner's variant 3, 2026-08-29) =====
# ⛔ DORMANT SINCE 2026-08-30: the six sport models left the pool (the owner judged the machine
# LODs not good enough; the artist remakes them under docs/MODEL-BUDGET.md), and 39-sport.js is
# dynamite-only — this tool's regexes will not find the M_SPORT*_ arrays until the full pack is
# regenerated. Under the MODEL-BUDGET contract (<=800 tris) the remakes should not need a LOD at
# all; run this again only if a remake ships heavy AND the owner asks for variant 3 again.
#
# «delai 3 variant» — two versions of each model: the detailed one for the big views (collection
# card, the new-object showcase, spins), the simplified one for the pile, where an item is a
# fingernail and there are ~15 of one type on screen.
#
# WHY THIS IS SAFE FOR THE COLOURS, and the whole reason the algorithm can be this simple:
# these models are PALETTE-textured — every triangle maps to one flat colour cell of the pack
# atlas. A surviving corner KEEPS ITS ORIGINAL UV AND NORMAL VERBATIM (string tokens from the
# source, zero precision drift), so a surviving face samples exactly the colour it always did;
# stretching a face over a collapsed neighbour stretches a FLAT colour, which is invisible.
# Colour boundaries move by at most one collapsed edge. Nothing is ever interpolated or invented.
#
# THE ALGORITHM: weld vertices by exact position (the meshes are UV-seam-split: 46–72% unique
# positions), then quadric-error edge collapse with SUBSET placement — the survivor keeps its
# original position, so the LOD's vertex set is a strict subset of the original and the
# enclosing radius can only shrink (asserted >= 0.97). Collapses that flip a face normal or
# would collapse a boundary vertex into the interior are rejected.
#
# RERUNNABLE: output lives between the LOD BLOCK markers in 39-sport.js and is stripped and
# re-appended on every run.
# ⚠️⚠️ PAIRING: tools/glb2module.py REGENERATES 39-sport.js and silently drops the LOD block —
# after any regen, run this tool again. The failure is loud (sport*LodGeo missing -> boot
# throws -> the suite is red), but do not rely on the crash: rerun the pair together.
import re, io, sys, heapq, math

SRC = 'src/app/39-sport.js'
MARK_A = '// === LOD BLOCK (tools/lodgen.py) — pile-scale geometry, stripped and rebuilt on every run ==='
MARK_B = '// === END LOD BLOCK ==='
TARGETS = { 'SPORTSOCCERBALL': 640, 'SPORTGOLFBALL': 640, 'SPORTFRIES': 600,
            'SPORTTENNISBALL': 560, 'SPORTBASKETBALL': 560, 'SPORTVOLLEYBALL': 520 }

def tokens(s, name, kind, cast):
    m = re.search(r'M_%s_%s\s*=\s*new \w+Array\(\[([^\]]*)\]' % (name, kind), s)
    return [cast(x.strip()) for x in m.group(1).split(',') if x.strip()]

def decimate(name, src, target):
    P = tokens(src, name, 'POS', str); U = tokens(src, name, 'UV', str)
    N = tokens(src, name, 'NRM', str); I = tokens(src, name, 'IDX', int)
    nv = len(P)//3
    pf = [float(x) for x in P]
    # --- weld by exact position token triple ---
    topo_of = {}; topo = []            # topo id -> representative original index
    v2t = [0]*nv
    for k in range(nv):
        key = (P[3*k], P[3*k+1], P[3*k+2])
        t = topo_of.get(key)
        if t is None: t = len(topo); topo_of[key] = t; topo.append(k)
        v2t[k] = t
    nt = len(topo)
    pos = [ (pf[3*topo[t]], pf[3*topo[t]+1], pf[3*topo[t]+2]) for t in range(nt) ]
    # faces: (topoA, topoB, topoC, origA, origB, origC); drop degenerate after weld
    faces = []
    def fnormal(pa, pb, pc):
        ux,uy,uz = pb[0]-pa[0], pb[1]-pa[1], pb[2]-pa[2]
        vx,vy,vz = pc[0]-pa[0], pc[1]-pa[1], pc[2]-pa[2]
        return (uy*vz-uz*vy, uz*vx-ux*vz, ux*vy-uy*vx)   # length = 2*area
    dropped_sliver = 0
    for f in range(len(I)//3):
        a, b, c = I[3*f], I[3*f+1], I[3*f+2]
        ta, tb, tc = v2t[a], v2t[b], v2t[c]
        if ta == tb or tb == tc or ta == tc: continue
        # ⚠️ GEOMETRIC slivers are dropped here too, not only topological ones. A zero-area
        # face is cost-invisible to the quadrics (skipped at l<1e-12 below) yet was VETO-ACTIVE
        # in the flip test: its 'before' normal is the zero vector, dot<=0 fired on any collapse
        # of a vertex it touched, so sliver neighbourhoods kept original density while the rest
        # over-decimated to hit the budget (soccer: 100 of 188 source slivers survived, 15.6%
        # of the 640 budget rasterized nothing). Found by the adversarial verify, 2026-08-29.
        nx, ny, nz = fnormal(pos[ta], pos[tb], pos[tc])
        if nx*nx + ny*ny + nz*nz < 1e-24: dropped_sliver += 1; continue
        faces.append([ta, tb, tc, a, b, c, True])
    # --- quadrics (area-weighted plane quadrics) + adjacency ---
    Q = [ [0.0]*10 for _ in range(nt) ]                  # symmetric 4x4 packed
    vfaces = [ set() for _ in range(nt) ]
    ecount = {}
    for fi, F in enumerate(faces):
        ta, tb, tc = F[0], F[1], F[2]
        for t in (ta, tb, tc): vfaces[t].add(fi)
        for e in ((ta,tb),(tb,tc),(ta,tc)):
            e = (min(e), max(e)); ecount[e] = ecount.get(e, 0) + 1
        nx,ny,nz = fnormal(pos[ta], pos[tb], pos[tc])
        l = math.sqrt(nx*nx+ny*ny+nz*nz)
        if l < 1e-12: continue
        area = l/2; nx,ny,nz = nx/l, ny/l, nz/l
        d = -(nx*pos[ta][0] + ny*pos[ta][1] + nz*pos[ta][2])
        w = area
        q = (nx*nx*w, nx*ny*w, nx*nz*w, nx*d*w, ny*ny*w, ny*nz*w, ny*d*w, nz*nz*w, nz*d*w, d*d*w)
        for t in (ta, tb, tc):
            for j in range(10): Q[t][j] += q[j]
    boundary = set()
    for e, ccount in ecount.items():
        if ccount == 1: boundary.add(e[0]); boundary.add(e[1])
    def qerr(q, p):
        x, y, z = p
        return (q[0]*x*x + 2*q[1]*x*y + 2*q[2]*x*z + 2*q[3]*x
              + q[4]*y*y + 2*q[5]*y*z + 2*q[6]*y
              + q[7]*z*z + 2*q[8]*z + q[9])
    alive_t = [True]*nt
    merged = list(range(nt))
    def find(t):
        while merged[t] != t: merged[t] = merged[merged[t]]; t = merged[t]
        return t
    ver = [0]*nt
    heap = []
    def push_edge(u, v):
        # directed: collapse u INTO v (v survives at its own position)
        if u in boundary and v not in boundary: return
        if u in boundary and v in boundary and (min(u,v),max(u,v)) not in ecount: return
        qsum = [Q[u][j] + Q[v][j] for j in range(10)]
        heapq.heappush(heap, (qerr(qsum, pos[v]), u, v, ver[u], ver[v]))
    for (u, v) in ecount: push_edge(u, v); push_edge(v, u)
    ntri = sum(1 for F in faces if F[6])
    while ntri > target and heap:
        cost, u, v, vu, vv = heapq.heappop(heap)
        if not (alive_t[u] and alive_t[v]) or ver[u] != vu or ver[v] != vv: continue
        u, v = find(u), find(v)
        if u == v or not (alive_t[u] and alive_t[v]): continue
        # normal-flip / degenerate rejection for u's surviving faces
        ok = True
        for fi in vfaces[u]:
            F = faces[fi]
            if not F[6] or v in (F[0], F[1], F[2]): continue
            tri = [F[0], F[1], F[2]]
            before = fnormal(pos[tri[0]], pos[tri[1]], pos[tri[2]])
            after_pos = [pos[v] if t == u else pos[t] for t in tri]
            after = fnormal(*after_pos)
            dot = before[0]*after[0] + before[1]*after[1] + before[2]*after[2]
            a2 = after[0]**2 + after[1]**2 + after[2]**2
            if dot <= 0 or a2 < 1e-14: ok = False; break
        if not ok: continue
        # commit: u -> v
        alive_t[u] = False; merged[u] = v
        for j in range(10): Q[v][j] += Q[u][j]
        touched = set()
        for fi in list(vfaces[u]):
            F = faces[fi]
            if not F[6]: continue
            if v in (F[0], F[1], F[2]):
                F[6] = False; ntri -= 1
                for t in (F[0], F[1], F[2]):
                    if t != u: vfaces[t].discard(fi)
            else:
                for k in range(3):
                    if F[k] == u:
                        F[k] = v
                        F[k+3] = F[k+3]      # corner keeps its ORIGINAL attribute index
                vfaces[v].add(fi)
                touched.update((F[0], F[1], F[2]))
        vfaces[u].clear()
        ver[v] += 1
        if u in boundary: boundary.add(v)
        for t in touched:
            t = find(t)
            if t != v and alive_t[t]: push_edge(t, v); push_edge(v, t)
    # --- emit: corners deduped by (topo vertex, original attribute tokens) ---
    corner_id = {}; oP = []; oU = []; oN = []; oI = []
    for F in faces:
        if not F[6]: continue
        for k in range(3):
            t, orig = find(F[k]), F[k+3]
            key = (t, U[2*orig], U[2*orig+1], N[3*orig], N[3*orig+1], N[3*orig+2])
            c = corner_id.get(key)
            if c is None:
                c = len(oP)//3; corner_id[key] = c
                rep = topo[t]
                oP += [P[3*rep], P[3*rep+1], P[3*rep+2]]
                oU += [U[2*orig], U[2*orig+1]]
                oN += [N[3*orig], N[3*orig+1], N[3*orig+2]]
            oI.append(c)
    # --- integrity ---
    r_old = max(math.sqrt(pf[3*k]**2 + pf[3*k+1]**2 + pf[3*k+2]**2) for k in range(nv))
    r_new = max(math.sqrt(float(oP[3*k])**2 + float(oP[3*k+1])**2 + float(oP[3*k+2])**2) for k in range(len(oP)//3))
    assert r_new >= 0.97 * r_old, (name, r_old, r_new)
    assert len(oP)//3 < 65536 and not any(x != x for x in map(float, oP))
    print('  %-16s %5d -> %4d tris  (%d verts -> %d)  radius %.3f -> %.3f  slivers dropped %d'
          % (name, len(I)//3, len(oI)//3, nv, len(oP)//3, r_old, r_new, dropped_sliver))
    return oP, oN, oU, oI

def main():
    s = io.open(SRC, encoding='utf-8').read()
    if MARK_A in s:                                  # idempotent: strip ONLY the marked block
        a = s.index(MARK_A)
        assert MARK_B in s[a:], 'LOD block start marker without the END marker — refusing to guess'
        b = s.index(MARK_B, a) + len(MARK_B)
        # ⚠️ splice, never truncate to EOF: content after the END marker must survive a rerun
        tail = s[b:].lstrip('\n')
        s = s[:a].rstrip() + '\n' + (('\n' + tail) if tail else '')
        s = s.rstrip() + '\n'
    print('LOD targets (the owner\'s variant 3):')
    block = ['', MARK_A,
      '// The owner\'s word 2026-08-29: «delai 3 variant» — HI for the big views, LOD for the pile.',
      '// Corners carry their ORIGINAL UV and normal tokens; colours are exact by construction.',
      '// ⚠️ Regenerating this file with glb2module.py DROPS this block — rerun tools/lodgen.py.']
    for name in ('SPORTBASKETBALL','SPORTFRIES','SPORTGOLFBALL','SPORTSOCCERBALL','SPORTTENNISBALL','SPORTVOLLEYBALL'):
        oP, oN, oU, oI = decimate(name, s, TARGETS[name])
        block.append('const M_%s_LOD_POS = new Float32Array([%s]);' % (name, ','.join(oP)))
        block.append('const M_%s_LOD_NRM = new Float32Array([%s]);' % (name, ','.join(oN)))
        block.append('const M_%s_LOD_UV = new Float32Array([%s]);' % (name, ','.join(oU)))
        block.append('const M_%s_LOD_IDX = new Uint16Array([%s]);' % (name, ','.join(map(str, oI))))
        low = name.lower()
        block.append('function %sLodGeo(){ return modelGeo(M_%s_LOD_POS, M_%s_LOD_NRM, M_%s_LOD_UV, M_%s_LOD_IDX); }'
                     % (low, name, name, name, name))
    block.append(MARK_B)
    io.open(SRC, 'w', encoding='utf-8').write(s.rstrip() + '\n' + '\n'.join(block) + '\n')
    print('written into', SRC)

if __name__ == '__main__':
    main()
